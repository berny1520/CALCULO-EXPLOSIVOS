// ======================================================================
// XTREME MINING · SISTEMA PROFESIONAL DE DISEÑO DE DISPAROS
// APP.JS — PARTE 1/4
// ======================================================================
// Contiene:
// ✔ Configuración base
// ✔ Definición de TIPOS DE TIRO (Escariado, Zapateras, Coronas…)
// ✔ Esquema de carga EDITABLE (cartuchos/tiro y kg ANFO/tiro)
// ✔ Utilidades generales
// ✔ Almacenamiento en localStorage
// ======================================================================

"use strict";

// ===========================================================
// 1) CONFIGURACIÓN BASE (KG/CART & FACTORES EQUIVALENCIA)
// ===========================================================

const EQ = {
  Emultex: 1.01,       // kg eq/kg real
  E20: 1.3514,         // Famecorte E-20
  ANFO: 1.0
};

const PESO_CARTUCHO = {
  Emultex: 0.1866,     // kg por cartucho
  E20: 0.139,          // kg por cartucho
  ANFO: null           // ANFO va en kg
};

const FACTOR_ESPONJAMIENTO = 1.18;
const STORAGE_KEY = "xtreme_registros";
const STORAGE_TIPOTIRO = "xtreme_tipo_tiro_config";

let registros = cargarRegistros();
let registroSeleccionadoId = null;
let edicionId = null;

// ===========================================================
// 2) DEFINICIÓN DE TIPOS DE TIRO (Fijos, como acordamos)
// ===========================================================
// El sistema *clasifica* los tiros automáticamente para cumplir estos totales
// exactamente igual que tu Excel.

const TIPOS_DE_TIRO = [
  "Escariado",     // (antes "Sueco")
  "Zapateras",
  "Coronas",
  "Cajas",
  "Rainura",
  "AuxCaja",
  "AuxCorona",
  "Destroza"
];

// ===========================================================
// 3) ESQUEMA DE CARGA EDITABLE POR TIPO DE TIRO
// (cartuchos Emultex / cartuchos E20 / kg ANFO por tiro)
// ===========================================================

// Valores por defecto (ideales para partir o iguales a tu Excel)
const esquemaCargaDefault = {
  Escariado:   { emultex: 0,    e20: 0,    anfo: 0     },
  Zapateras:   { emultex: 17,   e20: 0,    anfo: 0     },
  Coronas:     { emultex: 1,    e20: 1,    anfo: 6     },
  Cajas:       { emultex: 1,    e20: 1,    anfo: 5     },
  Rainura:     { emultex: 0.8,  e20: 0,    anfo: 3.5   },
  AuxCaja:     { emultex: 1,    e20: 0,    anfo: 4.06  },
  AuxCorona:   { emultex: 0,    e20: 1,    anfo: 4.06  },
  Destroza:    { emultex: 0,    e20: 1,    anfo: 4.06  }
};

// Cargar desde localStorage o usar por defecto
function cargarEsquemaTipoTiro() {
  const raw = localStorage.getItem(STORAGE_TIPOTIRO);
  if (!raw) return JSON.parse(JSON.stringify(esquemaCargaDefault));
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(JSON.stringify(esquemaCargaDefault));
  }
}

let esquemaTipoTiro = cargarEsquemaTipoTiro();

// Guardar cambios del operador
function guardarEsquemaTipoTiro() {
  localStorage.setItem(STORAGE_TIPOTIRO, JSON.stringify(esquemaTipoTiro));
}

// ===========================================================
// 4) UTILIDADES DE SISTEMA
// ===========================================================

function cargarRegistros() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function guardarRegistros(lista) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
}

function formatearFecha(fechaIso) {
  const f = new Date(fechaIso);
  return f.toLocaleString("es-CL", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ===========================================================
// 5) CALCULAR SECCIÓN HERRADURA (Opción C real)
// ===========================================================

function calcularSeccionHerradura(ancho, alto) {
  const r = ancho / 2;                // radio de arco
  const hRect = Math.max(alto - r, 0);
  const areaRect = ancho * hRect;
  const areaSemi = Math.PI * r * r / 2;
  return areaRect + areaSemi;
}

// ===========================================================
// 6) MODELO B–S (0.60 / 0.80 AUTOMÁTICOS SI NO ES MANUAL)
// ===========================================================

function factorRoca(tipoRoca) {
  switch (tipoRoca) {
    case "muy-dura": return 0.95;
    case "dura":     return 1.0;
    case "media":    return 1.05;
    case "blanda":   return 1.1;
    default:         return 1.0;
  }
}

function calcularBurdenEspaciamiento(diametro, modelo, roca) {
  if (modelo === "manual") return null;

  const baseB = 0.60;
  const baseS = 0.80;
  const f = (modelo === "roca") ? factorRoca(roca) : 1.0;

  return {
    burden: baseB * f,
    espaciamiento: baseS * f
  };
}
// ======================================================================
// 7) GENERACIÓN DE MALLA (RECTANGULAR BASE ~84 TIROS)
// ======================================================================
// Usamos una malla rectangular interna como base, que luego
// se “mapea” a la herradura al momento de dibujar.

function generarMallaRectangular(ancho, alto, burden, espaciamiento) {
  if (!ancho || !alto || !burden || !espaciamiento) return [];

  // Con B=0,6 y S=0,8 en 5,2 x 6,1 → ~7 x 12 = 84 tiros
  let nCols = Math.max(5, Math.round(ancho / espaciamiento)); // columnas
  let nFilas = Math.max(5, Math.round(alto / burden) + 2);     // filas extra

  const holes = [];
  const stepX = ancho / (nCols + 1);
  const stepY = alto / (nFilas + 1);

  for (let j = 1; j <= nFilas; j++) {
    const y = j * stepY;
    for (let i = 1; i <= nCols; i++) {
      const x = i * stepX;

      let tipo = "interior";

      if (i === 1 || i === nCols || j === 1 || j === nFilas) {
        tipo = "perimetro";
      } else if (
        i === 2 || i === nCols - 1 ||
        j === 2 || j === nFilas - 1
      ) {
        tipo = "subperimetro";
      }

      holes.push({ x, y, tipo });
    }
  }

  // Marcar algunos interiores como realce/alivio (centro inferior)
  const centerX = ancho / 2;
  const interior = holes.filter((h) => h.tipo === "interior");

  interior.sort((a, b) => {
    const score = (p) =>
      Math.abs(p.x - centerX) + (alto - p.y); // prioridad abajo y al centro
    return score(a) - score(b);
  });

  // Realce: 3
  const nRealce = Math.min(3, interior.length);
  for (let i = 0; i < nRealce; i++) {
    interior[i].tipo = "realce";
  }

  // Alivio: 8 siguientes
  const nAlivio = Math.min(8, interior.length - nRealce);
  for (let i = nRealce; i < nRealce + nAlivio; i++) {
    interior[i].tipo = "alivio";
  }

  return holes;
}

// ======================================================================
// 8) CLASIFICAR TIROS EN TIPOS DE TIRO (Escariado, Zapateras…)
// ======================================================================
// Asigna a cada perforación un tipoTiro para cumplir aprox:
//  Escariado: 3
//  Zapateras: 8
//  Coronas:   10
//  Cajas:     12
//  Rainura:   14
//  AuxCaja:   10
//  AuxCorona: 7
//  Destroza:  20 (lo que quede)
// ======================================================================

const objetivoTirosPorTipo = {
  Escariado: 3,
  Zapateras: 8,
  Coronas: 10,
  Cajas: 12,
  Rainura: 14,
  AuxCaja: 10,
  AuxCorona: 7
  // Destroza: el resto
};

function asignarTiposDeTiro(malla, ancho, alto) {
  const centerX = ancho / 2;
  let restantes = [...malla];

  // Helper: score genérico
  function tomarN(nombreTipoTiro, n, scoreFn) {
    if (n <= 0 || restantes.length === 0) return;
    restantes.sort((a, b) => scoreFn(a) - scoreFn(b));
    const seleccionados = restantes.splice(0, Math.min(n, restantes.length));
    seleccionados.forEach((h) => (h.tipoTiro = nombreTipoTiro));
  }

  // 1) Escariado = realce (3)
  restantes.forEach((h) => {
    if (h.tipo === "realce") h.tipoTiro = "Escariado";
  });
  restantes = restantes.filter((h) => h.tipo !== "realce");

  // 2) Zapateras = alivio (8)
  restantes.forEach((h) => {
    if (h.tipo === "alivio") h.tipoTiro = "Zapateras";
  });
  restantes = restantes.filter((h) => h.tipo !== "alivio");

  // 3) Cajas (zona baja cerca del centro)
  tomarN("Cajas", objetivoTirosPorTipo.Cajas, (h) => {
    return h.y + Math.abs(h.x - centerX) * 0.2;
  });

  // 4) AuxCaja (zona baja, más hacia los lados)
  tomarN("AuxCaja", objetivoTirosPorTipo.AuxCaja, (h) => {
    return h.y + (ancho / 2 - Math.abs(h.x - centerX));
  });

  // 5) Rainura (columna central)
  tomarN("Rainura", objetivoTirosPorTipo.Rainura, (h) => {
    return Math.abs(h.x - centerX) * 2 + Math.abs(h.y - alto / 2);
  });

  // 6) Coronas (zona alta, centro)
  tomarN("Coronas", objetivoTirosPorTipo.Coronas, (h) => {
    return (alto - h.y) + Math.abs(h.x - centerX) * 0.2;
  });

  // 7) AuxCorona (zona alta, más hacia los lados)
  tomarN("AuxCorona", objetivoTirosPorTipo.AuxCorona, (h) => {
    return (alto - h.y) + (ancho / 2 - Math.abs(h.x - centerX));
  });

  // 8) Lo que quede → Destroza
  restantes.forEach((h) => (h.tipoTiro = "Destroza"));

  return malla;
}

function contarTirosPorTipo(malla) {
  const conteo = {};
  TIPOS_DE_TIRO.forEach((t) => (conteo[t] = 0));
  malla.forEach((h) => {
    if (conteo[h.tipoTiro] != null) conteo[h.tipoTiro]++;
  });
  return conteo;
}

// ======================================================================
// 9) CÁLCULO DE EXPLOSIVOS POR TIPO DE TIRO
// ======================================================================
// Usa el esquema editable (cart/tiro, kg/tiro) y lo multiplica
// por el número real de tiros de cada grupo.
// Luego pasa a kg reales y a kg equivalentes.
// ======================================================================

function calcularExplosivosPorTipoTiro(malla) {
  const conteo = contarTirosPorTipo(malla);

  let totalEmultexCart = 0;
  let totalE20Cart = 0;
  let totalANFOKg = 0;

  TIPOS_DE_TIRO.forEach((tipo) => {
    const n = conteo[tipo] || 0;
    const esquema = esquemaTipoTiro[tipo] || { emultex: 0, e20: 0, anfo: 0 };

    totalEmultexCart += n * (esquema.emultex || 0);
    totalE20Cart += n * (esquema.e20 || 0);
    totalANFOKg += n * (esquema.anfo || 0);
  });

  const kgEmultex = totalEmultexCart * PESO_CARTUCHO.Emultex;
  const kgE20 = totalE20Cart * PESO_CARTUCHO.E20;
  const kgANFO = totalANFOKg; // ya viene en kg

  const eqEmultex = kgEmultex * EQ.Emultex;
  const eqE20 = kgE20 * EQ.E20;
  const eqANFO = kgANFO * EQ.ANFO;

  const totalEq = eqEmultex + eqE20 + eqANFO;

  return {
    conteo,
    totalEmultexCart,
    totalE20Cart,
    totalANFOKg,
    kgEmultex,
    kgE20,
    kgANFO,
    eqEmultex,
    eqE20,
    eqANFO,
    totalEq
  };
}

// ======================================================================
// 10) TABLA EDITABLE DE ESQUEMA POR TIPO DE TIRO
// ======================================================================

const tbodyTipoTiro = document.getElementById("tablaTipoTiro");

function renderTablaTipoTiro(conteoActual) {
  tbodyTipoTiro.innerHTML = "";

  TIPOS_DE_TIRO.forEach((tipo) => {
    const cfg = esquemaTipoTiro[tipo] || { emultex: 0, e20: 0, anfo: 0 };
    const nTiros = conteoActual ? conteoActual[tipo] || 0 : "-";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tipo === "AuxCaja" ? "Aux. Caja" :
             tipo === "AuxCorona" ? "Aux. Corona" : tipo}</td>
      <td>${nTiros}</td>
      <td>
        <input type="number" step="0.01" min="0"
          data-tipo="${tipo}" data-campo="emultex"
          value="${cfg.emultex}">
      </td>
      <td>
        <input type="number" step="0.01" min="0"
          data-tipo="${tipo}" data-campo="e20"
          value="${cfg.e20}">
      </td>
      <td>
        <input type="number" step="0.01" min="0"
          data-tipo="${tipo}" data-campo="anfo"
          value="${cfg.anfo}">
      </td>
    `;
    tbodyTipoTiro.appendChild(tr);
  });

  // Listeners para cambios
  tbodyTipoTiro.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("change", () => {
      const tipo = inp.getAttribute("data-tipo");
      const campo = inp.getAttribute("data-campo");
      const val = parseFloat(inp.value) || 0;
      if (!esquemaTipoTiro[tipo]) esquemaTipoTiro[tipo] = { emultex: 0, e20: 0, anfo: 0 };
      esquemaTipoTiro[tipo][campo] = val;
      guardarEsquemaTipoTiro();
    });
  });
}
// ======================================================================
// 11) SECUENCIA DE DISPARO TEÓRICA (orden y delays)
// ======================================================================
// Orden de salida por tipo de tiro:
//  1) Escariado (realce)
//  2) Zapateras (alivio)
//  3) Rainura
//  4) Cajas
//  5) AuxCaja
//  6) AuxCorona
//  7) Coronas
//  8) Destroza (por último)

const ordenSecuencia = [
  "Escariado",
  "Zapateras",
  "Rainura",
  "Cajas",
  "AuxCaja",
  "AuxCorona",
  "Coronas",
  "Destroza"
];

function generarSecuenciaDisparo(malla, ancho, alto) {
  const centerX = ancho / 2;
  let ordenGlobal = 1;
  const secuencia = [];

  ordenSecuencia.forEach((tipoTiro) => {
    const holes = malla.filter((h) => h.tipoTiro === tipoTiro);

    holes.sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y; // abajo → arriba
      return Math.abs(a.x - centerX) - Math.abs(b.x - centerX);
    });

    const baseDelay = {
      Escariado: 0,
      Zapateras: 25,
      Rainura: 50,
      Cajas: 80,
      AuxCaja: 110,
      AuxCorona: 140,
      Coronas: 170,
      Destroza: 200
    };

    holes.forEach((h, idx) => {
      const delay = (baseDelay[tipoTiro] || 0) + idx * 5;
      secuencia.push({
        ...h,
        orden: ordenGlobal++,
        delay
      });
    });
  });

  return secuencia;
}

// ======================================================================
// 12) DIBUJO CANVAS: GRID + HERRADURA + PUNTOS
// ======================================================================

function toCanvasCoords(x, y, ancho, alto, canvas) {
  const padding = 30;
  const W = canvas.width - padding * 2;
  const H = canvas.height - padding * 2;

  const scale = Math.min(W / ancho, H / alto);
  const dx = (canvas.width - ancho * scale) / 2;
  const dy = (canvas.height - alto * scale) / 2;

  return {
    x: dx + x * scale,
    y: dy + (alto - y) * scale  // invertir eje Y para dibujo
  };
}

function dibujarGrid(ctx, ancho, alto, canvas) {
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 0.5;

  for (let x = 0; x <= ancho; x += 1) {
    const p1 = toCanvasCoords(x, 0, ancho, alto, canvas);
    const p2 = toCanvasCoords(x, alto, ancho, alto, canvas);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  for (let y = 0; y <= alto; y += 1) {
    const p1 = toCanvasCoords(0, y, ancho, alto, canvas);
    const p2 = toCanvasCoords(ancho, y, ancho, alto, canvas);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px system-ui";
  ctx.fillText("Cuadrícula 1 m", 10, canvas.height - 10);
}

function dibujarHerradura(ctx, ancho, alto, canvas) {
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;

  const r = ancho / 2;
  const hRect = Math.max(alto - r, 0);

  ctx.beginPath();

  // Piso
  let p = toCanvasCoords(0, 0, ancho, alto, canvas);
  ctx.moveTo(p.x, p.y);
  p = toCanvasCoords(ancho, 0, ancho, alto, canvas);
  ctx.lineTo(p.x, p.y);

  // Hastial derecho
  p = toCanvasCoords(ancho, hRect, ancho, alto, canvas);
  ctx.lineTo(p.x, p.y);

  // Arco superior (semicírculo)
  const steps = 48;
  for (let i = 1; i <= steps; i++) {
    const ang = Math.PI - (Math.PI * i) / steps;
    const x = r + r * Math.cos(ang);
    const y = hRect + r * Math.sin(ang);
    const c = toCanvasCoords(x, y, ancho, alto, canvas);
    ctx.lineTo(c.x, c.y);
  }

  // Hastial izquierdo
  p = toCanvasCoords(0, hRect, ancho, alto, canvas);
  ctx.lineTo(p.x, p.y);

  ctx.closePath();
  ctx.stroke();
}

function dibujarMallaCanvas(reg) {
  const canvas = document.getElementById("canvasMalla");
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const ancho = reg.ancho;
  const alto = reg.alto;
  const malla = reg.malla || [];

  dibujarGrid(ctx, ancho, alto, canvas);
  dibujarHerradura(ctx, ancho, alto, canvas);

  const colores = {
    Escariado: "#f87171",
    Zapateras: "#fb923c",
    Coronas: "#fbbf24",
    Cajas: "#34d399",
    Rainura: "#38bdf8",
    AuxCaja: "#818cf8",
    AuxCorona: "#c084fc",
    Destroza: "#f472b6"
  };

  for (const h of malla) {
    const p = toCanvasCoords(h.x, h.y, ancho, alto, canvas);

    ctx.fillStyle = colores[h.tipoTiro] || "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Flecha hacia la cara (vertical hacia arriba)
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y - 10);
    ctx.stroke();
  }
}

// ======================================================================
// 13) TABLA DE REGISTROS + GRAFICOS
// ======================================================================

const tbodyReg = document.querySelector("#tabla-registros tbody");

function aplicarFiltros() {
  const mina = document.getElementById("filtro-mina").value.trim();
  const contrato = document
    .getElementById("filtro-contrato")
    .value.trim()
    .toLowerCase();

  return registros.filter((r) => {
    let ok = true;
    if (mina && r.mina !== mina) ok = false;
    if (contrato && !r.contrato.toLowerCase().includes(contrato)) ok = false;
    return ok;
  });
}

function renderTabla() {
  const lista = aplicarFiltros();
  tbodyReg.innerHTML = "";

  lista.slice().reverse().forEach((r) => {
    const tr = document.createElement("tr");
    tr.dataset.id = r.id;
    tr.innerHTML = `
      <td>${formatearFecha(r.fecha)}</td>
      <td>${r.contrato}</td>
      <td>${r.mina}</td>
      <td>${r.ancho.toFixed(2)} x ${r.alto.toFixed(2)}</td>
      <td>${r.largo.toFixed(2)}</td>
      <td>${r.nPerf}</td>
      <td>${r.volumen.toFixed(2)}</td>
      <td>${r.factor_carga.toFixed(2)}</td>
      <td>${r.kgEmultex.toFixed(1)}</td>
      <td>${r.kgE20.toFixed(1)}</td>
      <td>${r.kgANFO.toFixed(1)}</td>
    `;
    tr.addEventListener("click", () => seleccionarRegistro(r.id));
    if (r.id === registroSeleccionadoId) tr.classList.add("row-selected");
    tbodyReg.appendChild(tr);
  });

  actualizarGraficos(lista);
}

// ----------------------------------------------------------
// GRAFICOS
// ----------------------------------------------------------

let chartExplosivos = null;
let chartFc = null;

function actualizarGraficos(lista) {
  const orden = lista.slice().sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  const labels = orden.map((_, i) => i + 1);
  const emultexKg = orden.map((r) => r.kgEmultex);
  const e20Kg = orden.map((r) => r.kgE20);
  const anfoKg = orden.map((r) => r.kgANFO);
  const fcVals = orden.map((r) => r.factor_carga);

  if (chartExplosivos) chartExplosivos.destroy();
  if (chartFc) chartFc.destroy();

  chartExplosivos = new Chart(document.getElementById("chartExplosivos"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Emultex (kg)", data: emultexKg },
        { label: "E-20 (kg)", data: e20Kg },
        { label: "ANFO (kg)", data: anfoKg }
      ]
    },
    options: { responsive: true }
  });

  chartFc = new Chart(document.getElementById("chartFc"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Factor carga (kg eq/m³)", data: fcVals, tension: 0.25 }
      ]
    },
    options: { responsive: true }
  });
}
// ======================================================================
// 14) MOSTRAR RESULTADO COMPLETO DEL DISPARO
// ======================================================================

function mostrarResultado(reg) {
  const resDiv = document.getElementById("resultado");

  const seq = generarSecuenciaDisparo(reg.malla, reg.ancho, reg.alto);

  // Tabla de secuencia
  let tablaSec = "";
  if (seq.length) {
    tablaSec += `
      <details style="margin-top:8px;">
        <summary style="cursor:pointer;">Secuencia teórica de salida (${seq.length} tiros)</summary>
        <table style="width:100%; font-size:11px; border-collapse:collapse; margin-top:6px;">
          <thead>
            <tr>
              <th style="border-bottom:1px solid #334155; text-align:left;">N°</th>
              <th style="border-bottom:1px solid #334155; text-align:left;">Tipo</th>
              <th style="border-bottom:1px solid #334155; text-align:left;">Delay (ms)</th>
              <th style="border-bottom:1px solid #334155; text-align:left;">X</th>
              <th style="border-bottom:1px solid #334155; text-align:left;">Y</th>
            </tr>
          </thead>
          <tbody>
    `;

    seq.forEach((h) => {
      tablaSec += `
        <tr>
          <td>${h.orden}</td>
          <td>${h.tipoTiro}</td>
          <td>${h.delay}</td>
          <td>${h.x.toFixed(2)}</td>
          <td>${h.y.toFixed(2)}</td>
        </tr>
      `;
    });

    tablaSec += `
          </tbody></table>
      </details>
    `;
  }

  resDiv.innerHTML = `
    <strong>Último disparo registrado</strong><br>
    Mina: <strong>${reg.mina}</strong> · Contrato: <strong>${reg.contrato}</strong><br>
    Sección: <strong>${reg.ancho.toFixed(2)} x ${reg.alto.toFixed(2)}</strong> m · Avance: <strong>${reg.largo.toFixed(2)} m</strong><br>
    <br>
    N° perforaciones: <strong>${reg.nPerf}</strong><br>
    Volumen real con esponjamiento: <strong>${reg.volumen.toFixed(2)} m³</strong><br>
    Factor de carga: <strong>${reg.factor_carga.toFixed(3)} kg eq/m³</strong><br>
    <br>
    <strong>Explosivos totales:</strong><br>
    - Emultex: <strong>${reg.kgEmultex.toFixed(2)} kg</strong> (${reg.totalEmultexCart.toFixed(0)} cartuchos)<br>
    - E-20: <strong>${reg.kgE20.toFixed(2)} kg</strong> (${reg.totalE20Cart.toFixed(0)} cartuchos)<br>
    - ANFO: <strong>${reg.kgANFO.toFixed(2)} kg</strong><br>
    - Total equivalente: <strong>${reg.totalEq.toFixed(2)} kg eq</strong><br>
    ${tablaSec}
  `;
}

// ======================================================================
// 15) EXPORTAR A EXCEL (CSV) Y PDF
// ======================================================================

function exportarExcel() {
  if (!registros.length) {
    alert("No hay registros para exportar.");
    return;
  }

  const encabezados = [
    "Fecha",
    "Contrato",
    "Mina",
    "Ancho",
    "Alto",
    "Avance",
    "N°Tiros",
    "Volumen",
    "Fc",
    "Emultex_kg",
    "E20_kg",
    "ANFO_kg",
    "TotalEq"
  ];

  const lineas = [encabezados.join(";")];

  registros.forEach((r) => {
    const fila = [
      formatearFecha(r.fecha),
      r.contrato,
      r.mina,
      r.ancho.toFixed(2),
      r.alto.toFixed(2),
      r.largo.toFixed(2),
      r.nPerf,
      r.volumen.toFixed(2),
      r.factor_carga.toFixed(3),
      r.kgEmultex.toFixed(2),
      r.kgE20.toFixed(2),
      r.kgANFO.toFixed(2),
      r.totalEq.toFixed(2)
    ];
    lineas.push(fila.join(";"));
  });

  const contenido = lineas.join("\n");
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "Disparos_Xtreme.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportarPDF() {
  window.print();
}

// ======================================================================
// 16) SELECCIONAR, EDITAR, ELIMINAR REGISTRO
// ======================================================================

function seleccionarRegistro(id) {
  registroSeleccionadoId = id;
  edicionId = id;
  document.getElementById("btn-cancelar-edicion").style.display = "inline-block";

  const reg = registros.find((r) => r.id === id);

  // Cargar al formulario
  document.getElementById("contrato").value = reg.contrato;
  document.getElementById("mina").value = reg.mina;
  document.getElementById("ancho").value = reg.ancho;
  document.getElementById("alto").value = reg.alto;
  document.getElementById("largo").value = reg.largo;

  document.getElementById("diametro").value = reg.diametro;
  document.getElementById("modelo-burden").value = reg.modeloBurden;
  document.getElementById("tipo-roca").value = reg.tipoRoca;
  document.getElementById("burden").value = reg.burden;
  document.getElementById("espaciamiento").value = reg.espaciamiento;
  document.getElementById("nperf").value = reg.nPerf;

  document.getElementById("obs").value = reg.obs || "";

  // Mostrar
  mostrarResultado(reg);
  dibujarMallaCanvas(reg);
  renderTabla();
}

function cancelarEdicion() {
  edicionId = null;
  registroSeleccionadoId = null;
  document.getElementById("btn-cancelar-edicion").style.display = "none";
  renderTabla();
}

function eliminarSeleccionado() {
  if (!registroSeleccionadoId) {
    alert("Selecciona un registro primero.");
    return;
  }
  if (!confirm("¿Eliminar registro seleccionado?")) return;

  registros = registros.filter((r) => r.id !== registroSeleccionadoId);
  guardarRegistros(registros);
  registroSeleccionadoId = null;
  edicionId = null;
  renderTabla();
  document.getElementById("resultado").innerHTML = "";
}

// ======================================================================
// 17) FORMULARIO PRINCIPAL: CALCULAR + GUARDAR
// ======================================================================

document.getElementById("form-disparo").addEventListener("submit", (e) => {
  e.preventDefault();

  const contrato = document.getElementById("contrato").value.trim();
  const mina = document.getElementById("mina").value;
  const ancho = parseFloat(document.getElementById("ancho").value);
  const alto = parseFloat(document.getElementById("alto").value);
  const largo = parseFloat(document.getElementById("largo").value);
  const diametro = parseFloat(document.getElementById("diametro").value);
  const modeloBurden = document.getElementById("modelo-burden").value;
  const tipoRoca = document.getElementById("tipo-roca").value;

  let burden = parseFloat(document.getElementById("burden").value);
  let espaciamiento = parseFloat(document.getElementById("espaciamiento").value);
  const obs = document.getElementById("obs").value.trim();

  // Burden / Espaciamiento automáticos
  if (modeloBurden !== "manual") {
    const bs = calcularBurdenEspaciamiento(diametro, modeloBurden, tipoRoca);
    burden = bs.burden;
    espaciamiento = bs.espaciamiento;
    document.getElementById("burden").value = burden.toFixed(2);
    document.getElementById("espaciamiento").value = espaciamiento.toFixed(2);
  }

  // Malla + clasificación
  let malla = generarMallaRectangular(ancho, alto, burden, espaciamiento);
  malla = asignarTiposDeTiro(malla, ancho, alto);
  const nPerf = malla.length;
  document.getElementById("nperf").value = nPerf;

  // Cálculo explosivos
  const expl = calcularExplosivosPorTipoTiro(malla);

  // Cálculo volumen
  const area = calcularSeccionHerradura(ancho, alto);
  const volumen = area * FACTOR_ESPONJAMIENTO * largo;
  const factorCarga = expl.totalEq / volumen;

  // Crear registro
  const fecha = edicionId
    ? registros.find((r) => r.id === edicionId)?.fecha
    : new Date().toISOString();

  const id = edicionId || fecha + "_" + Math.random().toString(36).slice(2);

  const registro = {
    id,
    fecha,
    contrato,
    mina,
    ancho,
    alto,
    largo,
    diametro,
    modeloBurden,
    tipoRoca,
    burden,
    espaciamiento,
    nPerf,
    obs,
    malla,
    totalEmultexCart: expl.totalEmultexCart,
    totalE20Cart: expl.totalE20Cart,
    totalANFOKg: expl.totalANFOKg,
    kgEmultex: expl.kgEmultex,
    kgE20: expl.kgE20,
    kgANFO: expl.kgANFO,
    eqEmultex: expl.eqEmultex,
    eqE20: expl.eqE20,
    eqANFO: expl.eqANFO,
    totalEq: expl.totalEq,
    volumen,
    area,
    factor_carga: factorCarga
  };

  // Guardar o actualizar
  if (edicionId) {
    registros = registros.map((r) => (r.id === edicionId ? registro : r));
  } else {
    registros.push(registro);
  }

  guardarRegistros(registros);
  edicionId = registro.id;
  registroSeleccionadoId = registro.id;

  mostrarResultado(registro);
  dibujarMallaCanvas(registro);
  renderTabla();

  document.getElementById("btn-cancelar-edicion").style.display = "inline-block";
});

// ======================================================================
// 18) FILTROS + BOTONES
// ======================================================================

document.getElementById("filtro-mina").addEventListener("change", renderTabla);
document.getElementById("filtro-contrato").addEventListener("input", renderTabla);

document.getElementById("btn-limpiar-filtros").addEventListener("click", () => {
  document.getElementById("filtro-mina").value = "";
  document.getElementById("filtro-contrato").value = "";
  renderTabla();
});

document.getElementById("btn-export-excel").addEventListener("click", exportarExcel);
document.getElementById("btn-export-pdf").addEventListener("click", exportarPDF);
document.getElementById("btn-eliminar").addEventListener("click", eliminarSeleccionado);
document.getElementById("btn-cancelar-edicion").addEventListener("click", cancelarEdicion);

// ======================================================================
// 19) INICIALIZACIÓN DEL SISTEMA
// ======================================================================

document.getElementById("year").textContent = new Date().getFullYear();
renderTablaTipoTiro();     // mostrar tabla editable
renderTabla();             // mostrar registros previos

if (registros.length > 0) {
  const r = registros[registros.length - 1];
  mostrarResultado(r);
  dibujarMallaCanvas(r);
}
