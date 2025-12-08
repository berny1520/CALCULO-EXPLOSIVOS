// =====================
// CONFIGURACIÓN BASE
// =====================
const EQ = {
  Emultex: 1.245,      // factor energético relativo
  Famecorte: 1.3514,
  ANFO: 1.0
};

const PESO_CARTUCHO = {
  Emultex: 0.1865, // kg/cartucho 1¼" x 8"
  Famecorte: 0.139,
  ANFO: null
};

const STORAGE_KEY = "xtreme_explosivos_registros";

let registros = cargarRegistros();
let registroSeleccionadoId = null; // para editar/eliminar
let edicionId = null;

// =====================
// UTILIDADES
// =====================
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

// =====================
// CÁLCULO BURDEN/ESPAC.
// =====================
function obtenerCoeficienteBasePorDiametro(diametroMm) {
  const D = diametroMm / 1000;

  if (D <= 0.051) {
    return 22;
  } else if (D <= 0.064) {
    return 24;
  } else if (D <= 0.076) {
    return 26;
  } else if (D <= 0.089) {
    return 28;
  } else {
    return 30;
  }
}

function factorRoca(tipoRoca) {
  switch (tipoRoca) {
    case "muy-dura":
      return 1.05;
    case "dura":
      return 1.0;
    case "media":
      return 0.9;
    case "blanda":
      return 0.8;
    default:
      return 1.0;
  }
}

function calcularBurdenEspaciamientoDesdeDiametro(diametroMm, modelo, tipoRoca) {
  const D = diametroMm / 1000;
  if (!D || D <= 0) return null;

  let kBase = obtenerCoeficienteBasePorDiametro(diametroMm);
  let k = kBase;

  if (modelo === "simple") {
    k = kBase;
  } else if (modelo === "roca") {
    k = kBase * factorRoca(tipoRoca);
  } else {
    return null;
  }

  const burden = k * D;
  const espaciamiento = 1.15 * burden;

  return { burden, espaciamiento };
}

// =====================
// CÁLCULO NÚMERO PERFORACIONES
// =====================
function calcularNumeroPerforaciones(ancho, alto, burden, espaciamiento) {
  if (!burden || !espaciamiento || burden <= 0 || espaciamiento <= 0) {
    return null;
  }

  let nCols = Math.ceil(ancho / espaciamiento);
  let nFilas = Math.ceil(alto / burden);

  if (nCols < 1) nCols = 1;
  if (nFilas < 1) nFilas = 1;

  const nPerf = nCols * nFilas;
  return nPerf > 0 ? nPerf : null;
}

// =====================
// CÁLCULO PRINCIPAL (MODO XTREME)
// =====================
// participaEm/Fa/An = participación relativa, NO fracción
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

  const area = ancho * alto;
  const volumen = area * largo;

  const totalEq = densidad * volumen;

  const sumPart = participaEm + participaFa + participaAn;
  if (sumPart <= 0) {
    return null;
  }

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

    detalles[tipo] = {
      kg_eq,
      kg_real,
      cartuchos
    };
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

// =====================
// TABLA + FILTROS
// =====================
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
      if (r.id === registroSeleccionadoId) {
        tr.classList.add("row-selected");
      }
      tbody.appendChild(tr);
    });

  actualizarGraficos(filtrados);
}

// =====================
// GRÁFICOS
// =====================
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
        {
          label: "Emultex (kg)",
          data: emultexKg
        },
        {
          label: "Famecorte (kg)",
          data: famecorteKg
        },
        {
          label: "ANFO (kg)",
          data: anfoKg
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true
        }
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            minRotation: 0
          }
        }
      }
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
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true
        }
      }
    }
  });
}

// =====================
// MALLA (CANVAS)
// =====================
function dibujarMalla(reg) {
  const canvas = document.getElementById("canvasMalla");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  const ancho = reg.ancho;
  const alto = reg.alto;
  const B = reg.burden;
  const S = reg.espaciamiento;

  if (!ancho || !alto || !B || !S) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const padding = 30;
  const W = canvas.width - padding * 2;
  const H = canvas.height - padding * 2;

  const ratioSeccion = ancho / alto;
  const ratioCanvas = W / H;

  let drawW, drawH;
  if (ratioSeccion > ratioCanvas) {
    drawW = W;
    drawH = W / ratioSeccion;
  } else {
    drawH = H;
    drawW = H * ratioSeccion;
  }

  const offsetX = (canvas.width - drawW) / 2;
  const offsetY = (canvas.height - drawH) / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX, offsetY, drawW, drawH);

  let nCols = Math.ceil(ancho / S);
  let nFilas = Math.ceil(alto / B);
  if (nCols < 1) nCols = 1;
  if (nFilas < 1) nFilas = 1;

  const stepX = drawW / (nCols + 1);
  const stepY = drawH / (nFilas + 1);

  ctx.fillStyle = "#38bdf8";
  for (let i = 1; i <= nCols; i++) {
    for (let j = 1; j <= nFilas; j++) {
      const x = offsetX + i * stepX;
      const y = offsetY + j * stepY;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "#9ca3af";
  ctx.font = "11px system-ui";
  ctx.fillText(`Ancho: ${ancho.toFixed(2)} m`, padding, canvas.height - 12);
  ctx.fillText(`Alto: ${alto.toFixed(2)} m`, canvas.width - 120, padding - 10);
  ctx.fillText(`B=${B.toFixed(2)} m · S=${S.toFixed(2)} m`, padding, padding - 10);
}

// =====================
// EXPORTAR
// =====================
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
    "Largo (m)",
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

  const líneas = [encabezados.join(";")];

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
      r.factor_carga.toFixed(2),
      r.detalles.Emultex.kg_real.toFixed(1),
      r.detalles.Famecorte.kg_real.toFixed(1),
      r.detalles.ANFO.kg_real.toFixed(1),
      r.totalEq.toFixed(1),
      (r.obs || "").replace(/\r?\n/g, " ")
    ];
    líneas.push(fila.join(";"));
  });

  const contenido = líneas.join("\n");
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
  // Se usa la impresión del navegador (Guardar como PDF)
  window.print();
}

// =====================
// SELECCIÓN / EDICIÓN / ELIMINAR
// =====================
function seleccionarRegistro(id) {
  registroSeleccionadoId = id;
  edicionId = id;
  document.getElementById("btn-cancelar-edicion").style.display = "inline-block";
  renderTabla();

  const reg = registros.find((r) => r.id === id);
  if (!reg) return;

  // Cargar datos en formulario
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
  tbody
    .querySelectorAll("tr")
    .forEach((tr) => tr.classList.remove("row-selected"));
}

function eliminarSeleccionado() {
  if (!registroSeleccionadoId) {
    alert("Primero selecciona un registro en la tabla.");
    return;
  }
  if (!confirm("¿Seguro que deseas eliminar el registro seleccionado?")) {
    return;
  }
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

// =====================
// FORMULARIO
// =====================
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

  let nPerfInput = document.getElementById("nperf").value;
  let nPerf = nPerfInput ? parseInt(nPerfInput, 10) : 0;

  const densidad = parseFloat(document.getElementById("densidad").value);
  const participaEm = parseFloat(document.getElementById("prop-emultex").value) || 0;
  const participaFa = parseFloat(document.getElementById("prop-famecorte").value) || 0;
  const participaAn = parseFloat(document.getElementById("prop-anfo").value) || 0;
  const obs = document.getElementById("obs").value.trim();

  if (participaEm + participaFa + participaAn <= 0) {
    alert("Debes ingresar participación para al menos un tipo de explosivo.");
    return;
  }

  // 1) Calcular B y S
  if (modeloBurden === "manual") {
    if (!burden || !espaciamiento || burden <= 0 || espaciamiento <= 0) {
      alert("En modo MANUAL debes ingresar Burden y Espaciamiento válidos.");
      return;
    }
  } else {
    if (!diametro || diametro <= 0) {
      alert("Debes ingresar un diámetro de perforación válido para calcular B y S.");
      return;
    }
    const bs = calcularBurdenEspaciamientoDesdeDiametro(diametro, modeloBurden, tipoRoca);
    if (!bs) {
      alert("No se pudo calcular Burden/Espaciamiento. Revisa los datos.");
      return;
    }
    burden = bs.burden;
    espaciamiento = bs.espaciamiento;

    document.getElementById("burden").value = burden.toFixed(2);
    document.getElementById("espaciamiento").value = espaciamiento.toFixed(2);
  }

  // 2) N° perforaciones
  if (!nPerf || nPerf <= 0) {
    const nCalc = calcularNumeroPerforaciones(ancho, alto, burden, espaciamiento);
    if (!nCalc) {
      alert("No se pudo calcular el número de perforaciones. Revisa B y S.");
      return;
    }
    nPerf = nCalc;
    document.getElementById("nperf").value = nPerf;
  }

  // 3) Cálculo de explosivos (modo XTREME)
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
    volumen: calc.volumen,
    factor_carga: calc.factor_carga,
    totalEq: calc.totalEq,
    detalles: calc.detalles,
    participaEm,
    participaFa,
    participaAn
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

  // Mantener valores
  edicionId = registro.id;
  registroSeleccionadoId = registro.id;
  document.getElementById("btn-cancelar-edicion").style.display = "inline-block";
});

function mostrarResultado(reg) {
  const resDiv = document.getElementById("resultado");
  const d = reg.detalles;
  const longitudTotal = reg.nPerf * reg.largo;

  resDiv.innerHTML = `
    <strong>Último disparo registrado ${edicionId === reg.id ? "(MODO EDICIÓN)" : ""}</strong><br/>
    Mina: <strong>${reg.mina}</strong> · Contrato: <strong>${reg.contrato}</strong><br/>
    Diámetro: <strong>${reg.diametro} mm</strong> · Modelo: <strong>${reg.modeloBurden}</strong> · Roca: <strong>${reg.tipoRoca}</strong><br/>
    N° perforaciones: <strong>${reg.nPerf}</strong> 
    (B=${reg.burden.toFixed(2)} m, S=${reg.espaciamiento.toFixed(2)} m)<br/>
    Largo taladro: <strong>${reg.largo.toFixed(2)} m</strong> · Longitud total perforada: <strong>${longitudTotal.toFixed(1)} m</strong><br/>
    Volumen: <strong>${reg.volumen.toFixed(2)} m³</strong><br/>
    Factor de carga: <strong>${reg.factor_carga.toFixed(2)} kg eq/m³</strong><br/>
    Total equivalente: <strong>${reg.totalEq.toFixed(1)} kg eq</strong><br/>
    Emultex: <strong>${d.Emultex.kg_real.toFixed(1)} kg</strong> (≈ ${d.Emultex.cartuchos ? d.Emultex.cartuchos.toFixed(0) : "-"} cartuchos)<br/>
    Famecorte: <strong>${d.Famecorte.kg_real.toFixed(1)} kg</strong> (≈ ${d.Famecorte.cartuchos ? d.Famecorte.cartuchos.toFixed(0) : "-"} cartuchos)<br/>
    ANFO: <strong>${d.ANFO.kg_real.toFixed(1)} kg</strong>
  `;
}

// =====================
// FILTROS + BOTONES
// =====================
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

// =====================
// INICIO
// =====================
document.getElementById("year").textContent = new Date().getFullYear();
renderTabla();
if (registros.length > 0) {
  const ultimo = registros[registros.length - 1];
  mostrarResultado(ultimo);
  dibujarMalla(ultimo);
}
