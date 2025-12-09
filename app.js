"use strict";

/* =====================================================================
   XTREME MINING · SISTEMA PROFESIONAL DE DISEÑO DE DISPAROS
   - Diseño por TIPO DE TIRO (Escariado, Zapateras, etc.)
   - Malla herradura inteligente
   - Carga editable por grupo
   - Cálculo de explosivos (kg reales + kg equivalentes)
   - Factor de carga
   - Secuencia de disparo teórica
   - Gráficos
   - Exportar Excel
   - Informe PDF profesional (jsPDF)
   - Exportar PNG de malla
   - QR del disparo
===================================================================== */

/* ---------------------------------------------------------------------
   1) CONSTANTES BÁSICAS
--------------------------------------------------------------------- */

const EQ = {
  Emultex: 1.01,   // kg eq / kg real
  E20: 1.3514,     // Famecorte E-20
  ANFO: 1.0
};

const PESO_CARTUCHO = {
  Emultex: 0.1866, // kg/cartucho Emultex
  E20: 0.139,      // kg/cartucho Famecorte E-20
  ANFO: null       // ANFO va directo en kg
};

const FACTOR_ESPONJAMIENTO = 1.18;
const STORAGE_KEY = "xtreme_registros";
const STORAGE_TIPOTIRO = "xtreme_tipo_tiro_config";

// Parámetro “inteligente”: FC objetivo orientativo (no obligatorio)
const FC_OBJETIVO = 1.2; // kg eq/m³ (puedes ajustar)

/* ---------------------------------------------------------------------
   2) ESTADO GLOBAL
--------------------------------------------------------------------- */

let registros = cargarRegistros();
let registroSeleccionadoId = null;
let edicionId = null;

/* ---------------------------------------------------------------------
   3) TIPOS DE TIRO / ESQUEMA DE CARGA
--------------------------------------------------------------------- */

const TIPOS_DE_TIRO = [
  "Escariado",
  "Zapateras",
  "Coronas",
  "Cajas",
  "Rainura",
  "AuxCaja",
  "AuxCorona",
  "Destroza"
];

// Totales objetivo (aprox) de tiros por grupo
const objetivoTirosPorTipo = {
  Escariado: 3,
  Zapateras: 8,
  Coronas: 10,
  Cajas: 12,
  Rainura: 14,
  AuxCaja: 10,
  AuxCorona: 7
  // Destroza = resto
};

// Esquema default (ajustable en la UI)
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

function guardarEsquemaTipoTiro() {
  localStorage.setItem(STORAGE_TIPOTIRO, JSON.stringify(esquemaTipoTiro));
}

/* ---------------------------------------------------------------------
   4) UTILIDADES
--------------------------------------------------------------------- */

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
  return { burden: baseB * f, espaciamiento: baseS * f };
}

// Sección herradura (opción C)
function calcularSeccionHerradura(ancho, alto) {
  const r = ancho / 2;
  const hRect = Math.max(alto - r, 0);
  const areaRect = ancho * hRect;
  const areaSemi = (Math.PI * r * r) / 2;
  return areaRect + areaSemi;
}

/* ---------------------------------------------------------------------
   5) GENERACIÓN DE MALLA RECTANGULAR BASE
--------------------------------------------------------------------- */

function generarMallaRectangular(ancho, alto, burden, espaciamiento) {
  if (!ancho || !alto || !burden || !espaciamiento) return [];

  let nCols = Math.max(5, Math.round(ancho / espaciamiento));
  let nFilas = Math.max(5, Math.round(alto / burden) + 2);

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

  // Transformar algunos interiores en realce / alivio (centro inferior)
  const centerX = ancho / 2;
  const interior = holes.filter((h) => h.tipo === "interior");

  interior.sort((a, b) => {
    const score = (p) =>
      Math.abs(p.x - centerX) + (alto - p.y); // abajo y centro
    return score(a) - score(b);
  });

  const nRealce = Math.min(3, interior.length);
  for (let i = 0; i < nRealce; i++) interior[i].tipo = "realce";

  const nAlivio = Math.min(8, interior.length - nRealce);
  for (let i = nRealce; i < nRealce + nAlivio; i++) interior[i].tipo = "alivio";

  return holes;
}

/* ---------------------------------------------------------------------
   6) CLASIFICAR TIROS EN TIPOS DE TIRO (inteligente)
--------------------------------------------------------------------- */

function asignarTiposDeTiro(malla, ancho, alto) {
  const centerX = ancho / 2;
  let restantes = [...malla];

  function tomarN(nombreTipoTiro, n, scoreFn) {
    if (n <= 0 || restantes.length === 0) return;
    restantes.sort((a, b) => scoreFn(a) - scoreFn(b));
    const seleccionados = restantes.splice(0, Math.min(n, restantes.length));
    seleccionados.forEach((h) => (h.tipoTiro = nombreTipoTiro));
  }

  // Escariado = realce
  restantes.forEach((h) => {
    if (h.tipo === "realce") h.tipoTiro = "Escariado";
  });
  restantes = restantes.filter((h) => h.tipo !== "realce");

  // Zapateras = alivio
  restantes.forEach((h) => {
    if (h.tipo === "alivio") h.tipoTiro = "Zapateras";
  });
  restantes = restantes.filter((h) => h.tipo !== "alivio");

  // Cajas (zona baja, centro)
  tomarN("Cajas", objetivoTirosPorTipo.Cajas, (h) =>
    h.y + Math.abs(h.x - centerX) * 0.2
  );

  // AuxCaja (baja, más hacia los lados)
  tomarN("AuxCaja", objetivoTirosPorTipo.AuxCaja, (h) =>
    h.y + (ancho / 2 - Math.abs(h.x - centerX))
  );

  // Rainura (columna central)
  tomarN("Rainura", objetivoTirosPorTipo.Rainura, (h) =>
    Math.abs(h.x - centerX) * 2 + Math.abs(h.y - alto / 2)
  );

  // Coronas (zona alta, centro)
  tomarN("Coronas", objetivoTirosPorTipo.Coronas, (h) =>
    (alto - h.y) + Math.abs(h.x - centerX) * 0.2
  );

  // AuxCorona (alta, hacia los lados)
  tomarN("AuxCorona", objetivoTirosPorTipo.AuxCorona, (h) =>
    (alto - h.y) + (ancho / 2 - Math.abs(h.x - centerX))
  );

  // Lo que queda = Destroza
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

/* ---------------------------------------------------------------------
   7) CÁLCULO DE EXPLOSIVOS POR TIPO DE TIRO
--------------------------------------------------------------------- */

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
  const kgANFO = totalANFOKg;

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

/* ---------------------------------------------------------------------
   8) TABLA EDITABLE DE ESQUEMA POR TIPO DE TIRO
--------------------------------------------------------------------- */

const tbodyTipoTiro = document.getElementById("tablaTipoTiro");

function renderTablaTipoTiro(conteoActual) {
  tbodyTipoTiro.innerHTML = "";

  TIPOS_DE_TIRO.forEach((tipo) => {
    const cfg = esquemaTipoTiro[tipo] || { emultex: 0, e20: 0, anfo: 0 };
    const nTiros = conteoActual ? conteoActual[tipo] || 0 : "-";

    const nombreMostrar =
      tipo === "AuxCaja" ? "Aux. Caja" :
      tipo === "AuxCorona" ? "Aux. Corona" : tipo;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${nombreMostrar}</td>
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

  tbodyTipoTiro.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("change", () => {
      const tipo = inp.getAttribute("data-tipo");
      const campo = inp.getAttribute("data-campo");
      const val = parseFloat(inp.value) || 0;
      if (!esquemaTipoTiro[tipo]) {
        esquemaTipoTiro[tipo] = { emultex: 0, e20: 0, anfo: 0 };
      }
      esquemaTipoTiro[tipo][campo] = val;
      guardarEsquemaTipoTiro();
    });
  });
}

/* ---------------------------------------------------------------------
   9) SECUENCIA DE DISPARO TEÓRICA
--------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------
   10) DIBUJO CANVAS: GRID + HERRADURA + MALLA
--------------------------------------------------------------------- */

function toCanvasCoords(x, y, ancho, alto, canvas) {
  const padding = 30;
  const W = canvas.width - padding * 2;
  const H = canvas.height - padding * 2;
  const scale = Math.min(W / ancho, H / alto);
  const dx = (canvas.width - ancho * scale) / 2;
  const dy = (canvas.height - alto * scale) / 2;
  return {
    x: dx + x * scale,
    y: dy + (alto - y) * scale
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

  // Arco superior
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
  if (!canvas) return;
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

    // Flecha hacia la cara
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y - 10);
    ctx.stroke();
  }
}

/* ---------------------------------------------------------------------
   11) TABLA REGISTROS + GRAFICOS
--------------------------------------------------------------------- */

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

// Gráficos
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

/* ---------------------------------------------------------------------
   12) MOSTRAR RESULTADO DETALLADO
--------------------------------------------------------------------- */

function mostrarResultado(reg) {
  const resDiv = document.getElementById("resultado");
  const seq = generarSecuenciaDisparo(reg.malla, reg.ancho, reg.alto);

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
    tablaSec += `</tbody></table></details>`;
  }

  const difFc = (reg.factor_carga - FC_OBJETIVO).toFixed(2);
  const comentarioFc =
    Math.abs(reg.factor_carga - FC_OBJETIVO) < 0.15
      ? "Fc cercano al objetivo."
      : reg.factor_carga > FC_OBJETIVO
      ? "Fc por sobre el objetivo (carga algo alta)."
      : "Fc por debajo del objetivo (algo liviano).";

  resDiv.innerHTML = `
    <strong>Último disparo registrado</strong><br>
    Mina: <strong>${reg.mina}</strong> · Contrato: <strong>${reg.contrato}</strong><br>
    Sección: <strong>${reg.ancho.toFixed(2)} x ${reg.alto.toFixed(2)}</strong> m · Avance: <strong>${reg.largo.toFixed(2)} m</strong><br><br>
    N° perforaciones: <strong>${reg.nPerf}</strong><br>
    Volumen (con esponjamiento): <strong>${reg.volumen.toFixed(2)} m³</strong><br>
    Factor de carga: <strong>${reg.factor_carga.toFixed(3)} kg eq/m³</strong> (objetivo ${FC_OBJETIVO.toFixed(
      2
    )}; Δ = ${difFc})<br>
    <span style="font-size:11px;color:#9ca3af;">${comentarioFc}</span><br><br>
    <strong>Explosivos totales:</strong><br>
    - Emultex: <strong>${reg.kgEmultex.toFixed(2)} kg</strong> (${reg.totalEmultexCart.toFixed(
      0
    )} cartuchos)<br>
    - E-20: <strong>${reg.kgE20.toFixed(2)} kg</strong> (${reg.totalE20Cart.toFixed(
      0
    )} cartuchos)<br>
    - ANFO: <strong>${reg.kgANFO.toFixed(2)} kg</strong><br>
    - Total equivalente: <strong>${reg.totalEq.toFixed(2)} kg eq</strong><br>
    ${reg.obs && reg.obs.trim() ? `<br><strong>Observaciones:</strong> ${reg.obs}` : "" }
    ${tablaSec}
  `;
}

/* ---------------------------------------------------------------------
   13) EXPORTAR EXCEL, PDF, PNG, QR
--------------------------------------------------------------------- */

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
  if (!registros.length) {
    alert("No hay disparos registrados.");
    return;
  }
  if (!window.jspdf) {
    alert("No se encontró jsPDF. Revisa el script en index.html.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const reg =
    registros.find((r) => r.id === registroSeleccionadoId) ||
    registros[registros.length - 1];

  const fechaTexto = formatearFecha(reg.fecha);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("XTREME MINING - Informe de Disparo", 14, 18);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha: ${fechaTexto}`, 14, 26);
  doc.text(`Mina: ${reg.mina}`, 14, 32);
  doc.text(`Contrato: ${reg.contrato}`, 14, 38);

  let y = 48;
  doc.setFont("helvetica", "bold");
  doc.text("Geometría y parámetros", 14, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.text(
    `Sección herradura: ${reg.ancho.toFixed(2)} x ${reg.alto.toFixed(
      2
    )} m · Avance: ${reg.largo.toFixed(2)} m`,
    14,
    y
  );
  y += 5;
  doc.text(
    `Burden: ${reg.burden.toFixed(2)} m · Espaciamiento: ${reg.espaciamiento.toFixed(
      2
    )} m · N° perforaciones: ${reg.nPerf}`,
    14,
    y
  );
  y += 5;
  doc.text(
    `Volumen (esp.): ${reg.volumen.toFixed(
      2
    )} m³ · Fc: ${reg.factor_carga.toFixed(3)} kg eq/m³`,
    14,
    y
  );

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Explosivos", 14, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.text(
    `Emultex: ${reg.kgEmultex.toFixed(2)} kg  (${reg.totalEmultexCart.toFixed(
      0
    )} cartuchos)`,
    14,
    y
  );
  y += 5;
  doc.text(
    `E-20: ${reg.kgE20.toFixed(2)} kg  (${reg.totalE20Cart.toFixed(
      0
    )} cartuchos)`,
    14,
    y
  );
  y += 5;
  doc.text(`ANFO: ${reg.kgANFO.toFixed(2)} kg`, 14, y);
  y += 5;
  doc.text(`Total equivalente: ${reg.totalEq.toFixed(2)} kg eq`, 14, y);

  if (reg.obs && reg.obs.trim()) {
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("Observaciones", 14, y);
    doc.setFont("helvetica", "normal");
    y += 5;
    const obsLines = doc.splitTextToSize(reg.obs, 180);
    doc.text(obsLines, 14, y);
    y += obsLines.length * 5;
  }

  const canvas = document.getElementById("canvasMalla");
  if (canvas) {
    const imgData = canvas.toDataURL("image/png");
    const imgWidth = 160;
    const aspect = canvas.height > 0 ? canvas.width / canvas.height : 1;
    const imgHeight = imgWidth / aspect;
    const imgX = (210 - imgWidth) / 2;

    if (y + imgHeight + 10 > 287) {
      doc.addPage();
      y = 20;
    } else {
      y += 8;
    }

    doc.setFont("helvetica", "bold");
    doc.text("Malla de perforación (vista herradura)", 14, y);
    y += 4;
    doc.addImage(imgData, "PNG", imgX, y, imgWidth, imgHeight);
  }

  doc.save(`Informe_Disparo_${reg.contrato || "sin_contrato"}.pdf`);
}

function descargarMallaPNG() {
  const canvas = document.getElementById("canvasMalla");
  if (!canvas) {
    alert("No se encontró la malla.");
    return;
  }
  const dataUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "Malla_Disparo.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function generarQRDisparo() {
  if (!registros.length) {
    alert("No hay disparos registrados.");
    return;
  }

  const reg =
    registros.find((r) => r.id === registroSeleccionadoId) ||
    registros[registros.length - 1];

  const payload = {
    id: reg.id,
    fecha: reg.fecha,
    mina: reg.mina,
    contrato: reg.contrato,
    nPerf: reg.nPerf,
    volumen: reg.volumen,
    fc: reg.factor_carga,
    kgEmultex: reg.kgEmultex,
    kgE20: reg.kgE20,
    kgANFO: reg.kgANFO
  };

  const textoQR = JSON.stringify(payload);

  if (!window.QRCode || !QRCode.toDataURL) {
    alert("Librería de QR no disponible (revisa script en index.html).");
    return;
  }

  QRCode.toDataURL(
    textoQR,
    { width: 256, margin: 1 },
    (err, url) => {
      if (err) {
        console.error(err);
        alert("No se pudo generar el QR.");
        return;
      }
      const w = window.open("");
      if (!w) {
        alert("Permite ventanas emergentes para ver el QR.");
        return;
      }
      w.document.write(
        "<html><head><title>QR Disparo</title></head>" +
          "<body style='display:flex;align-items:center;justify-content:center;height:100%;background:#0f172a;'>" +
          `<img src="${url}" style="width:256px;height:256px;border-radius:12px;box-shadow:0 0 10px #000;" />` +
          "</body></html>"
      );
    }
  );
}

/* ---------------------------------------------------------------------
   14) SELECCIONAR, EDITAR, ELIMINAR REGISTRO
--------------------------------------------------------------------- */

function seleccionarRegistro(id) {
  registroSeleccionadoId = id;
  edicionId = id;
  document.getElementById("btn-cancelar-edicion").style.display = "inline-block";

  const reg = registros.find((r) => r.id === id);
  if (!reg) return;

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

  mostrarResultado(reg);
  dibujarMallaCanvas(reg);
  renderTabla();
}

function cancelarEdicion() {
  edicionId = null;
  registroSeleccionadoId = null;
  document.getElementById("btn-cancelar-edicion").style.display = "none";
  renderTabla();
  document.getElementById("resultado").innerHTML = "";
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

/* ---------------------------------------------------------------------
   15) FORMULARIO PRINCIPAL
--------------------------------------------------------------------- */

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

  if (!contrato || !mina) {
    alert("Debes indicar contrato y mina.");
    return;
  }

  if (modeloBurden !== "manual") {
    const bs = calcularBurdenEspaciamiento(diametro, modeloBurden, tipoRoca);
    burden = bs.burden;
    espaciamiento = bs.espaciamiento;
    document.getElementById("burden").value = burden.toFixed(2);
    document.getElementById("espaciamiento").value = espaciamiento.toFixed(2);
  } else {
    if (!burden || !espaciamiento || burden <= 0 || espaciamiento <= 0) {
      alert("En modo MANUAL debes ingresar Burden y Espaciamiento válidos.");
      return;
    }
  }

  let malla = generarMallaRectangular(ancho, alto, burden, espaciamiento);
  malla = asignarTiposDeTiro(malla, ancho, alto);
  const nPerf = malla.length;
  document.getElementById("nperf").value = nPerf;

  const expl = calcularExplosivosPorTipoTiro(malla);
  const area = calcularSeccionHerradura(ancho, alto);
  const volumen = area * FACTOR_ESPONJAMIENTO * largo;
  const factorCarga = expl.totalEq / volumen;

  const fecha = edicionId
    ? registros.find((r) => r.id === edicionId)?.fecha || new Date().toISOString()
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

  // Actualizar conteo en tabla de tipos de tiro
  const conteo = contarTirosPorTipo(malla);
  renderTablaTipoTiro(conteo);
});

/* ---------------------------------------------------------------------
   16) FILTROS Y BOTONES
--------------------------------------------------------------------- */

document.getElementById("filtro-mina").addEventListener("change", renderTabla);
document.getElementById("filtro-contrato").addEventListener("input", renderTabla);

document.getElementById("btn-limpiar-filtros").addEventListener("click", () => {
  document.getElementById("filtro-mina").value = "";
  document.getElementById("filtro-contrato").value = "";
  renderTabla();
});

document.getElementById("btn-export-excel").addEventListener("click", exportarExcel);
document.getElementById("btn-export-pdf").addEventListener("click", exportarPDF);
document.getElementById("btn-malla-png").addEventListener("click", descargarMallaPNG);
document.getElementById("btn-qr").addEventListener("click", generarQRDisparo);
document.getElementById("btn-eliminar").addEventListener("click", eliminarSeleccionado);
document.getElementById("btn-cancelar-edicion").addEventListener("click", cancelarEdicion);

/* ---------------------------------------------------------------------
   17) INICIALIZACIÓN
--------------------------------------------------------------------- */

document.getElementById("year").textContent = new Date().getFullYear();

// Tabla de esquema de carga (sin conteo al inicio)
renderTablaTipoTiro();

// Tabla de registros
renderTabla();

// Si hay disparos previos, mostrar último
if (registros.length > 0) {
  const r = registros[registros.length - 1];
  mostrarResultado(r);
  dibujarMallaCanvas(r);
  const conteo = contarTirosPorTipo(r.malla || []);
  renderTablaTipoTiro(conteo);
}
