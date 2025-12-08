// =====================
// CONFIGURACIÓN BASE
// =====================
const EQ = {
  Emultex: 1.01,
  Famecorte: 1.3514,
  ANFO: 1.0
};

const PESO_CARTUCHO = {
  Emultex: 0.1865, // kg/cartucho 1¼" x 8"
  Famecorte: 0.139,
  ANFO: null
};

const STORAGE_KEY = "xtreme_explosivos_registros";

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
function calcularBurdenEspaciamientoDesdeDiametro(diametroMm, modelo, tipoRoca) {
  const d = diametroMm / 1000; // pasar a metros
  if (!d || d <= 0) return null;

  let k;

  if (modelo === "simple") {
    // Modelo recomendado: coeficiente típico para roca dura subterránea
    k = 25; // B ≈ 25·d
  } else if (modelo === "roca") {
    // Coeficientes según tipo de roca
    switch (tipoRoca) {
      case "muy-dura":
        k = 27;
        break;
      case "dura":
        k = 24;
        break;
      case "media":
        k = 20;
        break;
      case "blanda":
        k = 17;
        break;
      default:
        k = 22;
    }
  } else {
    // modelo manual no calcula
    return null;
  }

  const burden = k * d; // B = k·d
  const espaciamiento = 1.2 * burden; // S ≈ 1,2·B

  return { burden, espaciamiento };
}

// =====================
// CÁLCULO NUMERO PERFORACIONES
// =====================
function calcularNumeroPerforaciones(ancho, alto, burden, espaciamiento) {
  if (!burden || !espaciamiento || burden <= 0 || espaciamiento <= 0) {
    return null;
  }
  const nCols = Math.round(ancho / espaciamiento);
  const nFilas = Math.round(alto / burden);
  const nPerf = nCols * nFilas;
  return nPerf > 0 ? nPerf : null;
}

// =====================
// CÁLCULO PRINCIPAL
// =====================
function calcularDisparo(params) {
  const {
    ancho,
    alto,
    largo,
    nPerf,
    densidad,
    propEm,
    propFa,
    propAn
  } = params;

  const area = ancho * alto;
  const volumen = area * largo;
  const totalEq = densidad * volumen;

  const proporciones = {
    Emultex: propEm,
    Famecorte: propFa,
    ANFO: propAn
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
    detalles
  };
}

// =====================
// RENDER TABLA
// =====================
const tbody = document.querySelector("#tabla-registros tbody");
let registros = cargarRegistros();

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
      tbody.appendChild(tr);
    });

  actualizarGraficos(filtrados);
}

// =====================
// GRÁFICOS (Chart.js)
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
// MANEJO FORMULARIO
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
  const propEm = parseFloat(document.getElementById("prop-emultex").value);
  const propFa = parseFloat(document.getElementById("prop-famecorte").value);
  const propAn = parseFloat(document.getElementById("prop-anfo").value);
  const obs = document.getElementById("obs").value.trim();

  const sumaProps = propEm + propFa + propAn;
  if (Math.abs(sumaProps - 1) > 0.01) {
    alert("Las proporciones de explosivo deben sumar aproximadamente 1,0");
    return;
  }

  // 1) Calcular B y S según modelo
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

    // Mostrar en los campos para que el operador vea los valores usados
    document.getElementById("burden").value = burden.toFixed(2);
    document.getElementById("espaciamiento").value = espaciamiento.toFixed(2);
  }

  // 2) Calcular N° de perforaciones si viene en 0
  if (!nPerf || nPerf <= 0) {
    const nCalc = calcularNumeroPerforaciones(ancho, alto, burden, espaciamiento);
    if (!nCalc) {
      alert("No se pudo calcular el número de perforaciones. Revisa B y S.");
      return;
    }
    nPerf = nCalc;
    document.getElementById("nperf").value = nPerf;
  }

  // 3) Cálculo de explosivos
  const calc = calcularDisparo({
    ancho,
    alto,
    largo,
    nPerf,
    densidad,
    propEm,
    propFa,
    propAn
  });

  const fecha = new Date().toISOString();

  const registro = {
    id: fecha + "_" + Math.random().toString(36).slice(2),
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
    detalles: calc.detalles
  };

  registros.push(registro);
  guardarRegistros(registros);
  renderTabla();
  mostrarResultado(registro);

  // Mantener algunos valores tras reset
  e.target.reset();
  document.getElementById("densidad").value = densidad.toFixed(2);
  document.getElementById("prop-emultex").value = propEm;
  document.getElementById("prop-famecorte").value = propFa;
  document.getElementById("prop-anfo").value = propAn;
  document.getElementById("diametro").value = diametro;
  document.getElementById("modelo-burden").value = modeloBurden;
  document.getElementById("tipo-roca").value = tipoRoca;
  document.getElementById("burden").value = burden.toFixed(2);
  document.getElementById("espaciamiento").value = espaciamiento.toFixed(2);
  document.getElementById("nperf").value = nPerf;
}

);

function mostrarResultado(reg) {
  const resDiv = document.getElementById("resultado");
  const d = reg.detalles;
  resDiv.innerHTML = `
    <strong>Último disparo registrado</strong><br/>
    Mina: <strong>${reg.mina}</strong> · Contrato: <strong>${reg.contrato}</strong><br/>
    Diámetro: <strong>${reg.diametro} mm</strong> · Modelo: <strong>${reg.modeloBurden}</strong> · Roca: <strong>${reg.tipoRoca}</strong><br/>
    N° perforaciones: <strong>${reg.nPerf}</strong> 
    (B=${reg.burden.toFixed(2)} m, S=${reg.espaciamiento.toFixed(2)} m)<br/>
    Volumen: <strong>${reg.volumen.toFixed(2)} m³</strong><br/>
    Factor de carga: <strong>${reg.factor_carga.toFixed(2)} kg eq/m³</strong><br/>
    Total equivalente: <strong>${reg.totalEq.toFixed(1)} kg eq</strong><br/>
    Emultex: <strong>${d.Emultex.kg_real.toFixed(1)} kg</strong> (≈ ${d.Emultex.cartuchos ? d.Emultex.cartuchos.toFixed(0) : "-"} cartuchos)<br/>
    Famecorte: <strong>${d.Famecorte.kg_real.toFixed(1)} kg</strong> (≈ ${d.Famecorte.cartuchos ? d.Famecorte.cartuchos.toFixed(0) : "-"} cartuchos)<br/>
    ANFO: <strong>${d.ANFO.kg_real.toFixed(1)} kg</strong>
  `;
}

// =====================
// FILTROS
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

// =====================
// INICIO
// =====================
document.getElementById("year").textContent = new Date().getFullYear();
renderTabla();
