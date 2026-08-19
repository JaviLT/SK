// ============================================================================
// dashboard.js — Indicadores del programa Short Kaizen, mes en curso.
//
// Referencia de negocio (ver "Tablero SK" compartido por el usuario):
//   - Meta por equipo: 4 Short Kaizen cerrados por mes.
//   - Meta global: 140 Short Kaizen cerrados por mes (suma de todos los equipos).
//   - "Cerrado" = status "done" (aprobado por Mejora Continua, Líder y Gerente).
// ============================================================================

import { el, formatDateTime } from "../utils.js";
import { api } from "../api.js";
import { META_SK_POR_EQUIPO_MES, META_SK_GLOBAL_MES } from "../lib/mock-backend.js";

let chartInstances = [];

export async function render(container, params, isStale) {
  const view = el("div", { class: "view", id: "dashboard-view" });
  container.appendChild(view);
  view.appendChild(el("div", { class: "skeleton", style: "height:400px" }));

  try {
    const [equipos, kaizens] = await Promise.all([api.getEquipos(), api.getKaizens()]);
    if (isStale && isStale()) return; // el usuario ya navegó a otra vista — no tocar el DOM
    view.innerHTML = "";
    await paint(view, equipos, kaizens);
  } catch (err) {
    if (isStale && isStale()) return;
    view.innerHTML = "";
    view.appendChild(
      el("div", { class: "empty-state" }, [el("div", { class: "icon" }, ["⚠️"]), el("p", {}, [err.message || "No se pudo cargar el dashboard."])])
    );
  }
}

function esDelMesActual(fechaISO) {
  if (!fechaISO) return false;
  const d = new Date(fechaISO);
  const ahora = new Date();
  return d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth();
}

function nombreMesActual() {
  return new Date().toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

async function paint(view, equipos, kaizens) {
  const cerradosMes = kaizens.filter((k) => k.status === "done" && esDelMesActual(k.actualizadoEn));

  view.appendChild(
    el("div", { class: "view-header" }, [
      el("div", {}, [el("h1", {}, ["Dashboard"]), el("p", {}, [`Cumplimiento de Short Kaizen — ${nombreMesActual()}`])]),
    ])
  );

  view.appendChild(buildKpis(cerradosMes.length));
  view.appendChild(buildEquiposProgreso(equipos, cerradosMes));

  const equipoCanvas = el("canvas");
  const empleadoCanvas = el("canvas");

  view.appendChild(
    el("div", { class: "dash-grid" }, [
      el("div", { class: "card" }, [el("h3", {}, ["Top 5 equipos — SK cerrados en el mes"]), el("div", { class: "chart-wrap" }, [equipoCanvas])]),
      el("div", { class: "card" }, [el("h3", {}, ["Top 5 empleados — SK cerrados en el mes"]), el("div", { class: "chart-wrap" }, [empleadoCanvas])]),
    ])
  );

  view.appendChild(
    el("p", { class: "methodology-note" }, [
      `Incluye únicamente Short Kaizen con estatus "Aceptado" (cerrados tras la aprobación de Mejora Continua, Líder y Gerente) y cuya fecha de cierre cae dentro del mes en curso. Meta: ${META_SK_POR_EQUIPO_MES} por equipo / ${META_SK_GLOBAL_MES} global al mes. `,
      `Generado: ${formatDateTime(new Date())}.`,
    ])
  );

  try {
    const Chart = await loadChartJs();
    chartInstances.forEach((c) => c.destroy());
    chartInstances = [
      drawTopChart(Chart, equipoCanvas, topEquipos(equipos, cerradosMes)),
      drawTopChart(Chart, empleadoCanvas, topEmpleados(cerradosMes)),
    ];
  } catch {
    const msg = () => el("p", { class: "hint" }, ["No se pudieron cargar las gráficas (sin conexión al CDN)."]);
    equipoCanvas.replaceWith(msg());
    empleadoCanvas.replaceWith(msg());
  }
}

function buildKpis(totalCerradosMes) {
  const pctGlobal = Math.round((totalCerradosMes / META_SK_GLOBAL_MES) * 100);
  const items = [
    ["SK cerrados este mes", totalCerradosMes, null],
    ["Meta global mensual", META_SK_GLOBAL_MES, null],
    ["% cumplimiento global", `${pctGlobal}%`, pctGlobal >= 100 ? "up" : "down"],
    ["Meta por equipo", `${META_SK_POR_EQUIPO_MES} / mes`, null],
  ];

  return el(
    "div",
    { class: "stats-row stats-row-4" },
    items.map(([label, value, delta]) =>
      el("div", { class: "kpi-card" }, [
        el("div", { class: "kpi-label" }, [label]),
        el("div", { class: "kpi-value" }, [String(value)]),
        delta ? el("div", { class: `kpi-delta ${delta}` }, [delta === "up" ? "▲ dentro de meta" : "▼ requiere atención"]) : null,
      ])
    )
  );
}

function buildEquiposProgreso(equipos, cerradosMes) {
  if (!equipos.length) return el("div", {});
  const filas = equipos
    .map((eq) => {
      const cerrados = cerradosMes.filter((k) => k.equipo === eq.nombre).length;
      const pct = Math.min(100, Math.round((cerrados / META_SK_POR_EQUIPO_MES) * 100));
      return { nombre: eq.nombre, departamento: eq.departamento, cerrados, pct };
    })
    .sort((a, b) => b.pct - a.pct);

  return el("div", { class: "card", style: "margin-bottom:20px" }, [
    el("h3", {}, ["Cumplimiento por equipo"]),
    el(
      "div",
      { class: "equipo-progreso-list" },
      filas.map((f) =>
        el("div", { class: "equipo-progreso-row" }, [
          el("div", { class: "ep-nombre" }, [
            el("div", { style: "font-weight:600" }, [f.nombre]),
            f.departamento ? el("div", { class: "hint" }, [f.departamento]) : null,
          ]),
          el("div", { class: "ep-bar-wrap" }, [
            el("div", { class: "ep-bar" }, [el("div", { class: "ep-bar-fill", style: `width:${f.pct}%` })]),
          ]),
          el("div", { class: "ep-valor" }, [`${f.cerrados} / ${META_SK_POR_EQUIPO_MES}`]),
          el("div", { class: `ep-pct ${f.pct >= 100 ? "up" : ""}` }, [`${f.pct}%`]),
        ])
      )
    ),
  ]);
}

function topEquipos(equipos, cerradosMes) {
  const conteo = {};
  cerradosMes.forEach((k) => { conteo[k.equipo] = (conteo[k.equipo] || 0) + 1; });
  return Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

function topEmpleados(cerradosMes) {
  const conteo = {};
  cerradosMes.forEach((k) => {
    const clave = `${k.nombre} (${k.nomina})`;
    conteo[clave] = (conteo[clave] || 0) + 1;
  });
  return Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

/** Genera tonos derivados del azul primario de marca para series categóricas,
 *  siguiendo la regla del manual: extender con tonos derivados antes de usar
 *  colores fuera de la paleta oficial. */
function brandShades(n) {
  const base = [13, 24, 168]; // #0D18A8
  const shades = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / Math.max(n - 1, 1) : 0;
    const r = Math.round(base[0] + (34 - base[0]) * t);
    const g = Math.round(base[1] + (126 - base[1]) * t);
    const b = Math.round(base[2] + (246 - base[2]) * t);
    shades.push(`rgb(${r},${g},${b})`);
  }
  return shades;
}

function drawTopChart(Chart, canvas, entries) {
  const labels = entries.map(([label]) => label);
  const values = entries.map(([, value]) => value);
  if (!labels.length) {
    canvas.replaceWith(el("p", { class: "hint" }, ["Todavía no hay Short Kaizen cerrados este mes."]));
    return null;
  }
  return new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: brandShades(labels.length) }] },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.3/chart.umd.min.js";
    script.onload = () => resolve(window.Chart);
    script.onerror = () => reject(new Error("No se pudo cargar Chart.js"));
    document.head.appendChild(script);
  });
}

export function unmount() {
  chartInstances.forEach((c) => c && c.destroy());
  chartInstances = [];
}
