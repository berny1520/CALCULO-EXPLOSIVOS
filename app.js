// =======================================================
// XTREME MINING - APP.JS
// Modo profesional: herradura, ~84 perforaciones,
// Emultex / Famecorte E-20 / ANFO Premium,
// sección herradura + factor de esponjamiento,
// secuencia de salida teórica.
// =======================================================

"use strict";

// ---------------- CONFIGURACIÓN BASE ----------------

const EQ = {
  Emultex: 1.01,     // EQ como en tu Excel
  Famecorte: 1.3514, // Famecorte E-20
  ANFO: 1.0          // ANFO Premium
};

const PESO_CARTUCHO = {
  Emultex: 0.1866, // kg/cartucho Emultex (tu planilla)
  Famecorte: 0.139, // kg/cartucho Famecorte E-20
  ANFO: null        // ANFO se maneja en kg directos
};

const FACTOR_ESPONJAMIENTO = 1.18;
const STORAGE_KEY = "xtreme_explosivos_registros";

let registros = cargarRegistros();
let registroSeleccionadoId = null;
let edicionId = null;

// ---------------- UTILIDADES ----------------

function cargarRegistros() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function guardarRegistros(registros) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));
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

// ---------------- SECCIÓN REAL (HERRADURA) ----------------
// Opción C: herradura tipo túnel minero.
// Aproximación: rectángulo + semicírculo.

function calcularSeccionHerradura(ancho, alto) {
  const r = ancho / 2;                    // radio del arco
  const hRect = Math.max(alto - r, 0);    // altura parte recta
  const areaRect = ancho * hRect;
  const areaSemi = Math.PI * r * r / 2;   // semicírculo
  return areaRect + areaSemi;
}

// ---------------- BURDEN / ESPACIAMIENTO ----------------
// B base = 0,60 m ; S base = 0,80 m
// Modelo "simple": usa siempre esos valores
// Modelo "roca": pequeño ajuste según tipo de roca
// Modelo "manual": usa lo que ingrese el usuario

function factorRoca(tipoRoca) {
  switch (tipoRoca) {
    case "muy-dura":
      return 0.95;   // malla algo más densa
    case "dura":
      return 1.0;
    case "media":
      return 1.05;
    case "blanda":
      return 1.1;
    default:
      return 1.0;
  }
}

function calcularBurdenEspaciamiento(diametroMm, modelo, tipoRoca) {
  if (modelo === "manual") return null;

  const baseB = 0.60;
  const baseS = 0.80;

  let f = 1.0;
  if (modelo === "roca") {
    f = factorRoca(tipoRoca);
  }

  const burden = baseB * f;
  const espaciamiento = baseS * f;

  return { burden, espaciamiento };
}

// ---------------- MALLA (~84 PERFORACIONES) ----------------
// Genera malla rectangular densificada, y clasifica:
//  - perimetro
//  - subperimetro
//  - interior
//  - realce
//  - alivio

function generarMallaRectangular(ancho, alto, burden, espaciamiento) {
  if (!ancho || !alto || !burden || !espaciamiento) return [];

  // Para aprox. 84 perforaciones en 5,2 x 6,1 con B=0,6 S=0,8
  let nCols = Math.max(5, Math.round(ancho / espaciamiento));  // ~7
  let nFilas = Math.max(5, Math.round(alto / burden) + 2);     // ~12

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

  // Realce + alivio en zona central inferior
  const centerX = ancho / 2;
  const interior = holes.filter((h) => h.tipo === "interior");

  interior.sort((a, b) => {
    const score = (p) =>
      Math.abs(p.x - centerX) + (alto - p.y); // abajo centro = menor score
    return score(a) - score(b);
  });

  // Realce: 3 más cercanos al centro inferior
  const nRealce = Math.min(3, interior.length);
  for (let i = 0; i < nRealce; i++) {
    interior[i].tipo = "realce";
  }

  // Alivio: siguientes 8
  const nAlivio = Math.min(8, interior.length - nRealce);
  for (let i = nRealce; i < nRealce + nAlivio; i++) {
    interior[i].tipo = "alivio";
  }

  return holes;
}

// ---------------- SECUENCIA DE DISPARO TEÓRICA ----------------
// Asigna orden y delay a cada perforación por tipo.
// Orden de salida:
//  1) realce
//  2) alivio
//  3) interior
//  4) subperimetro
//  5) perimetro

function generarSecuenciaDisparo(malla, ancho, alto) {
  if (!malla || !malla.length) return [];
  const centerX = ancho / 2;

  const ordenTipos = ["realce", "alivio", "interior", "subperimetro", "perimetro"];
  const baseDelay = {
    realce: 0,
    alivio: 25,
    interior: 50,
    subperimetro: 100,
    perimetro: 150
  };

  let ordenGlobal = 1;
  const secuencia = [];

  for (const tipo of ordenTipos) {
    let holes = malla.filter((h) => h.tipo === tipo);

    // Ordenar de abajo hacia arriba y desde el centro hacia afuera
    holes.sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y; // menor y primero (más abajo)
      return Math.abs(a.x - centerX) - Math.abs(b.x - centerX);
    });

    holes.forEach((h, idx) => {
      const delay = baseDelay[tipo] + idx * 5; // 5 ms entre tiros dentro del mismo grupo
      secuencia.push({
        ...h,
        tipo,
        orden: ordenGlobal++,
        delay
      });
    });
  }

  return secuencia;
}

// ---------------- CÁLCULO PRINCIPAL (MODO XTREME) ----------------
// - Usa sección herradura
// - Usa factor de esponjamiento
// - Distribuye por participación relativa (no necesita sumar 1 ni 100)

function calcularDisparo(params) {
  const {
    ancho,
    alto,
    largo,
    densidad,
    participaEm,
    participaFa,
    participaAn
  } = params;

  const area = calcularSeccionHerradura(ancho, alto);
  const volumen = area * FACTOR_ESPONJAMIENTO * largo;

  const totalEq = densidad * volumen;

  const sumPart = participaEm + participaFa + participaAn;
  if (sumPart <= 0) return null;

  const fracEm = participaEm / sumPart;
  const fracFa = participaFa / sumPart;
  const fracAn = participaAn / sumPart;

  const proporciones = {
    Emultex: fracEm,
    Famecorte: fracFa,
    ANFO: fracAn
  };

  const detalles = {};
  Object.entries(proporciones).forEach(([tipo, frac]) => {
    const kg_eq = totalEq * frac;
    const kg_real = kg_eq / EQ[tipo];
    const cartuchos = PESO_CARTUCHO[tipo]
      ? kg_real / PESO_CARTUCHO[tipo]
      : null;

    detalles[tipo] = { kg_eq, kg_real, cartuchos };
  });

  const factor_carga = totalEq / volumen;

  return {
    area,
    volumen,
    totalEq,
    factor_carga,
    detalles,
    fracEm,
    fracFa,
    fracAn
  };
}
// =======================================================
// PARTE 2/3
// Dibujo Canvas + Gráficos + Tabla
// =======================================================

// ---------------- TABLA + FILTROS ----------------

const tbody = document.querySelector("#tabla-registros tbody");

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
  const filtrados = aplicarFiltros();
  tbody.innerHTML = "";

  filtrados
    .slice()
    .reverse()
    .forEach((r) => {
      const tr = document.createElement("tr");
      tr.dataset.id = r.id;
      tr.innerHTML = `
        <td>${formatearFecha(r.fecha)}</td>
        <td>${r.contrato}</td>
        <td>${r.mina}</td>
        <td>${r.ancho.toFixed(2)} x ${r.alto.toFixed(2)}</td>
        <td>${r.largo.toFixed(2)}</td>
        <td>${r.burden.toFixed(2)}</td>
        <td>${r.espaciamiento.toFixed(2)}</td>
        <td>${r.nPerf}</td>
        <td>${r.volumen.toFixed(2)}</td>
        <td>${r.factor_carga.toFixed(2)}</td>
        <td>${r.detalles.Emultex.kg_real.toFixed(1)}</td>
        <td>${r.detalles.Famecorte.kg_real.toFixed(1)}</td>
        <td>${r.detalles.ANFO.kg_real.toFixed(1)}</td>
      `;
      tr.addEventListener("click", () => seleccionarRegistro(r.id));
      if (r.id === registroSeleccionadoId) tr.classList.add("row-selected");
      tbody.appendChild(tr);
    });

  actualizarGraficos(filtrados);
}

// ---------------- GRAFICOS ----------------

let chartExplosivos = null;
let chartFc = null;

function actualizarGraficos(lista) {
  const orden = lista.slice().sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  const labels = orden.map((r, i) => `${i + 1} (${r.mina.split(" ")[1] || r.mina})`);
  const emultexKg = orden.map((r) => r.detalles.Emultex.kg_real);
  const famecorteKg = orden.map((r) => r.detalles.Famecorte.kg_real);
  const anfoKg = orden.map((r) => r.detalles.ANFO.kg_real);
  const fcVals = orden.map((r) => r.factor_carga);

  const ctxExplosivos = document.getElementById("chartExplosivos");
  const ctxFc = document.getElementById("chartFc");

  if (chartExplosivos) chartExplosivos.destroy();
  if (chartFc) chartFc.destroy();

  chartExplosivos = new Chart(ctxExplosivos, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Emultex (kg)", data: emultexKg },
        { label: "Famecorte (kg)", data: famecorteKg },
        { label: "ANFO (kg)", data: anfoKg }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } }
    }
  });

  chartFc = new Chart(ctxFc, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Factor de carga (kg eq/m³)",
          data: fcVals,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } }
    }
  });
}

// =======================================================
// DIBUJO DEL TÚNEL (HERRADURA)
// =======================================================

// Helper para convertir coords reales (m) a canvas (px)
function toCanvasCoords(x, y, ancho, alto, canvas) {
  const ctx = canvas.getContext("2d");
  const padding = 30;

  const W = canvas.width - padding * 2;
  const H = canvas.height - padding * 2;

  const scale = Math.min(W / ancho, H / alto);
  const drawW = ancho * scale;
  const drawH = alto * scale;

  const offsetX = (canvas.width - drawW) / 2;
  const offsetY = (canvas.height - drawH) / 2;

  const cx = offsetX + x * scale;
  const cy = offsetY + (alto - y) * scale;

  return { x: cx, y: cy };
}

function dibujarHerradura(ctx, ancho, alto, canvas) {
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;

  const r = ancho / 2;
  const hRect = Math.max(alto - r, 0);

  ctx.beginPath();

  // piso
  let p = toCanvasCoords(0, 0, ancho, alto, canvas);
  ctx.moveTo(p.x, p.y);
  p = toCanvasCoords(ancho, 0, ancho, alto, canvas);
  ctx.lineTo(p.x, p.y);

  // hastial derecho
  p = toCanvasCoords(ancho, hRect, ancho, alto, canvas);
  ctx.lineTo(p.x, p.y);

  // arco superior
  const pasos = 32;
  for (let i = 1; i <= pasos; i++) {
    const ang = Math.PI - (Math.PI * i) / pasos;
    const x = r + r * Math.cos(ang);
    const y = hRect + r * Math.sin(ang);
    const c = toCanvasCoords(x, y, ancho, alto, canvas);
    ctx.lineTo(c.x, c.y);
  }

  // hastial izquierdo
  p = toCanvasCoords(0, hRect, ancho, alto, canvas);
  ctx.lineTo(p.x, p.y);

  ctx.closePath();
  ctx.stroke();
}

function dibujarGrid(ctx, ancho, alto, canvas) {
  ctx.strokeStyle = "#1f2937";
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

  ctx.fillStyle = "#9ca3af";
  ctx.font = "11px system-ui";
  ctx.fillText("Cuadrícula 1 m", 10, canvas.height - 8);
}

function dibujarMalla(reg) {
  const canvas = document.getElementById("canvasMalla");
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const ancho = reg.ancho;
  const alto = reg.alto;
  const malla = reg.malla || [];

  dibujarGrid(ctx, ancho, alto, canvas);
  dibujarHerradura(ctx, ancho, alto, canvas);

  const colores = {
    perimetro: "#3b82f6",
    subperimetro: "#22c55e",
    interior: "#f97316",
    alivio: "#0ea5e9",
    realce: "#e879f9"
  };

  for (const h of malla) {
    const p = toCanvasCoords(h.x, h.y, ancho, alto, canvas);
    ctx.fillStyle = colores[h.tipo] || "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Dibujar flecha (dirección simple hacia la cara)
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y - 10); // pequeña flecha hacia arriba
    ctx.stroke();
  }
}
// =======================================================
// PARTE 3/3
// Exportar, selección, formulario, inicio
// =======================================================

// ---------------- EXPORTAR ----------------

function exportarExcel() {
  if (!registros.length) {
    alert("No hay registros para exportar.");
    return;
  }

  const encabezados = [
    "Fecha",
    "Contrato",
    "Mina",
    "Ancho (m)",
    "Alto (m)",
    "Avance (m)",
    "Diametro (mm)",
    "ModeloBurden",
    "TipoRoca",
    "B (m)",
    "S (m)",
    "NPerforaciones",
    "Volumen (m3)",
    "FactorCarga (kg_eq_m3)",
    "Emultex_kg",
    "Famecorte_kg",
    "ANFO_kg",
    "TotalEq_kg",
    "Observaciones"
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
      r.diametro,
      r.modeloBurden,
      r.tipoRoca,
      r.burden.toFixed(2),
      r.espaciamiento.toFixed(2),
      r.nPerf,
      r.volumen.toFixed(2),
      r.factor_carga.toFixed(3),
      r.detalles.Emultex.kg_real.toFixed(2),
      r.detalles.Famecorte.kg_real.toFixed(2),
      r.detalles.ANFO.kg_real.toFixed(2),
      r.totalEq.toFixed(2),
      (r.obs || "").replace(/\r?\n/g, " ")
    ];
    lineas.push(fila.join(";"));
  });

  const contenido = lineas.join("\n");
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  const fechaHoy = new Date().toISOString().slice(0, 10);
  a.download = `Disparos_Xtreme_${fechaHoy}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportarPDF() {
  window.print();
}

// ---------------- SELECCIÓN / EDICIÓN / ELIMINAR ----------------

function seleccionarRegistro(id) {
  registroSeleccionadoId = id;
  edicionId = id;
  document.getElementById("btn-cancelar-edicion").style.display = "inline-block";
  renderTabla();

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
  document.getElementById("burden").value = reg.burden.toFixed(2);
  document.getElementById("espaciamiento").value = reg.espaciamiento.toFixed(2);
  document.getElementById("nperf").value = reg.nPerf;
  document.getElementById("densidad").value = reg.densidad.toFixed(2);
  document.getElementById("prop-emultex").value = reg.participaEm;
  document.getElementById("prop-famecorte").value = reg.participaFa;
  document.getElementById("prop-anfo").value = reg.participaAn;
  document.getElementById("obs").value = reg.obs || "";

  mostrarResultado(reg);
  dibujarMalla(reg);
}

function cancelarEdicion() {
  edicionId = null;
  registroSeleccionadoId = null;
  document.getElementById("btn-cancelar-edicion").style.display = "none";
  tbody.querySelectorAll("tr").forEach((tr) => tr.classList.remove("row-selected"));
}

function eliminarSeleccionado() {
  if (!registroSeleccionadoId) {
    alert("Primero selecciona un registro en la tabla.");
    return;
  }
  if (!confirm("¿Seguro que deseas eliminar el registro seleccionado?")) return;

  registros = registros.filter((r) => r.id !== registroSeleccionadoId);
  guardarRegistros(registros);
  cancelarEdicion();
  renderTabla();
  document.getElementById("resultado").innerHTML = "";
  const canvas = document.getElementById("canvasMalla");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// ---------------- MOSTRAR RESULTADO + SECUENCIA ----------------

function mostrarResultado(reg) {
  const resDiv = document.getElementById("resultado");
  const d = reg.detalles;
  const longitudTotal = reg.nPerf * reg.largo;

  const secuencia = generarSecuenciaDisparo(reg.malla || [], reg.ancho, reg.alto);

  let tablaSec = "";
  if (secuencia.length) {
    tablaSec += `
      <details style="margin-top:8px;">
        <summary style="cursor:pointer;">Secuencia teórica de salida (N=${secuencia.length})</summary>
        <table style="margin-top:6px; width:100%; font-size:11px; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="border-bottom:1px solid #374151; text-align:left;">N°</th>
              <th style="border-bottom:1px solid #374151; text-align:left;">Tipo</th>
              <th style="border-bottom:1px solid #374151; text-align:left;">Delay (ms)</th>
              <th style="border-bottom:1px solid #374151; text-align:left;">X (m)</th>
              <th style="border-bottom:1px solid #374151; text-align:left;">Y (m)</th>
            </tr>
          </thead>
          <tbody>
    `;
    secuencia.forEach((h) => {
      tablaSec += `
        <tr>
          <td>${h.orden}</td>
          <td>${h.tipo}</td>
          <td>${h.delay}</td>
          <td>${h.x.toFixed(2)}</td>
          <td>${h.y.toFixed(2)}</td>
        </tr>
      `;
    });
    tablaSec += `
          </tbody>
        </table>
      </details>
    `;
  }

  resDiv.innerHTML = `
    <strong>Último disparo registrado ${edicionId === reg.id ? "(MODO EDICIÓN)" : ""}</strong><br/>
    Mina: <strong>${reg.mina}</strong> · Contrato: <strong>${reg.contrato}</strong><br/>
    Diámetro: <strong>${reg.diametro} mm</strong> · Modelo: <strong>${reg.modeloBurden}</strong> · Roca: <strong>${reg.tipoRoca}</strong><br/>
    N° perforaciones: <strong>${reg.nPerf}</strong> 
    (B=${reg.burden.toFixed(2)} m, S=${reg.espaciamiento.toFixed(2)} m)<br/>
    Avance: <strong>${reg.largo.toFixed(2)} m</strong> · Longitud total perforada: <strong>${longitudTotal.toFixed(1)} m</strong><br/>
    Sección herradura: <strong>${reg.area.toFixed(2)} m²</strong> · Volumen (con esponjamiento): <strong>${reg.volumen.toFixed(2)} m³</strong><br/>
    Factor de carga: <strong>${reg.factor_carga.toFixed(3)} kg eq/m³</strong><br/>
    Total equivalente: <strong>${reg.totalEq.toFixed(2)} kg eq</strong><br/>
    Emultex: <strong>${d.Emultex.kg_real.toFixed(2)} kg</strong> (≈ ${d.Emultex.cartuchos ? d.Emultex.cartuchos.toFixed(0) : "-"} cartuchos)<br/>
    Famecorte: <strong>${d.Famecorte.kg_real.toFixed(2)} kg</strong> (≈ ${d.Famecorte.cartuchos ? d.Famecorte.cartuchos.toFixed(0) : "-"} cartuchos)<br/>
    ANFO: <strong>${d.ANFO.kg_real.toFixed(2)} kg</strong>
    ${tablaSec}
  `;
}

// ---------------- FORMULARIO ----------------

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

  const densidad = parseFloat(document.getElementById("densidad").value);
  const participaEm = parseFloat(document.getElementById("prop-emultex").value) || 0;
  const participaFa = parseFloat(document.getElementById("prop-famecorte").value) || 0;
  const participaAn = parseFloat(document.getElementById("prop-anfo").value) || 0;
  const obs = document.getElementById("obs").value.trim();

  if (participaEm + participaFa + participaAn <= 0) {
    alert("Debes ingresar participación para al menos un tipo de explosivo.");
    return;
  }

  // 1) Calcular B y S según modelo
  if (modeloBurden === "manual") {
    if (!burden || !espaciamiento || burden <= 0 || espaciamiento <= 0) {
      alert("En modo MANUAL debes ingresar Burden y Espaciamiento válidos.");
      return;
    }
  } else {
    const bs = calcularBurdenEspaciamiento(diametro, modeloBurden, tipoRoca);
    if (!bs) {
      alert("No se pudo calcular Burden/Espaciamiento.");
      return;
    }
    burden = bs.burden;
    espaciamiento = bs.espaciamiento;
    document.getElementById("burden").value = burden.toFixed(2);
    document.getElementById("espaciamiento").value = espaciamiento.toFixed(2);
  }

  // 2) Generar malla y N° perforaciones
  const malla = generarMallaRectangular(ancho, alto, burden, espaciamiento);
  if (!malla.length) {
    alert("No se pudo generar la malla de perforación.");
    return;
  }
  const nPerf = malla.length;
  document.getElementById("nperf").value = nPerf;

  // 3) Cálculo de explosivos
  const calc = calcularDisparo({
    ancho,
    alto,
    largo,
    densidad,
    participaEm,
    participaFa,
    participaAn
  });

  if (!calc) {
    alert("No se pudo calcular la distribución de explosivos.");
    return;
  }

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
    densidad,
    obs,
    area: calc.area,
    volumen: calc.volumen,
    factor_carga: calc.factor_carga,
    totalEq: calc.totalEq,
    detalles: calc.detalles,
    participaEm,
    participaFa,
    participaAn,
    malla
  };

  if (edicionId) {
    registros = registros.map((r) => (r.id === edicionId ? registro : r));
  } else {
    registros.push(registro);
  }

  guardarRegistros(registros);
  renderTabla();
  mostrarResultado(registro);
  dibujarMalla(registro);

  edicionId = registro.id;
  registroSeleccionadoId = registro.id;
  document.getElementById("btn-cancelar-edicion").style.display = "inline-block";
});

// ---------------- FILTROS + BOTONES ----------------

document.getElementById("filtro-mina").addEventListener("change", renderTabla);
document
  .getElementById("filtro-contrato")
  .addEventListener("input", renderTabla);

document
  .getElementById("btn-limpiar-filtros")
  .addEventListener("click", () => {
    document.getElementById("filtro-mina").value = "";
    document.getElementById("filtro-contrato").value = "";
    renderTabla();
  });

document
  .getElementById("btn-export-excel")
  .addEventListener("click", exportarExcel);

document
  .getElementById("btn-export-pdf")
  .addEventListener("click", exportarPDF);

document
  .getElementById("btn-eliminar")
  .addEventListener("click", eliminarSeleccionado);

document
  .getElementById("btn-cancelar-edicion")
  .addEventListener("click", cancelarEdicion);

// ---------------- INICIO ----------------

document.getElementById("year").textContent = new Date().getFullYear();
renderTabla();
if (registros.length > 0) {
  const ultimo = registros[registros.length - 1];
  mostrarResultado(ultimo);
  dibujarMalla(ultimo);
}
