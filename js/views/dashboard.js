import { el, formatDateTime } from "../utils.js";
import { api } from "../api.js";

let chartInstances = [];

const STATUS_LABEL = {
  nuevo: "Nuevo", pend_l: "Pend. Líder", pend_g: "Pend. Gerente",
  done: "Cerrado", rej_l: "Rechazado (Líder)", rej_g: "Rechazado (Gerente)",
};

export async function render(container, params, isStale) {
  const view = el("div", { class: "view", id: "dashboard-view" });
  container.appendChild(view);
  view.appendChild(el("div", { class: "skeleton", style: "height:400px" }));

  try {
    const kaizens = await api.getKaizens();
    if (isStale && isStale()) return; // el usuario ya navegó a otra vista — no tocar el DOM
    view.innerHTML = "";
    await paint(view, kaizens);
  } catch (err) {
    if (isStale && isStale()) return;
    view.innerHTML = "";
    view.appendChild(
      el("div", { class: "empty-state" }, [el("div", { class: "icon" }, ["⚠️"]), el("p", {}, [err.message || "No se pudo cargar el dashboard."])])
    );
  }
}

async function paint(view, kaizens) {
  view.appendChild(el("div", { class: "view-header" }, [el("h1", {}, ["Dashboard"]), el("p", {}, ["Indicadores del programa de mejora continua"])]));
  view.appendChild(buildKpis(kaizens));

  const equipoCanvas = el("canvas");
  const statusCanvas = el("canvas");

  view.appendChild(
    el("div", { class: "dash-grid" }, [
      el("div", { class: "card" }, [el("h3", {}, ["Kaizens por equipo"]), el("div", { class: "chart-wrap" }, [equipoCanvas])]),
      el("div", { class: "card" }, [el("h3", {}, ["Composición por estado"]), el("div", { class: "chart-wrap" }, [statusCanvas])]),
    ])
  );

  view.appendChild(
    el("p", { class: "methodology-note" }, [
      `Incluye la totalidad de los kaizens registrados en el sistema al momento de generar este dashboard. `,
      `Generado: ${formatDateTime(new Date())}.`,
    ])
  );

  try {
    const Chart = await loadChartJs();
    chartInstances.forEach((c) => c.destroy());
    chartInstances = [drawEquipoChart(Chart, equipoCanvas, kaizens), drawStatusChart(Chart, statusCanvas, kaizens)];
  } catch {
    const msg = () => el("p", { class: "hint" }, ["No se pudieron cargar las gráficas (sin conexión al CDN)."]);
    equipoCanvas.replaceWith(msg());
    statusCanvas.replaceWith(msg());
  }
}

function buildKpis(kaizens) {
  const total = kaizens.length;
  const done = kaizens.filter((k) => k.status === "done").length;
  const rechazados = kaizens.filter((k) => k.status === "rej_l" || k.status === "rej_g").length;
  const enProceso = total - done - rechazados;
  const tasaCierre = total ? Math.round((done / total) * 100) : 0;

  const items = [
    ["Total registrados", total, null],
    ["Cerrados", done, "up"],
    ["En proceso", enProceso, null],
    ["Tasa de cierre", `${tasaCierre}%`, tasaCierre >= 50 ? "up" : "down"],
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

/** Genera tonos derivados del azul primario de marca para series categóricas,
 *  siguiendo la regla del manual: extender con tonos derivados antes de usar
 *  colores fuera de la paleta oficial. */
function brandShades(n) {
  const base = [13, 24, 168]; // #0D18A8
  const shades = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const r = Math.round(base[0] + (34 - base[0]) * t);
    const g = Math.round(base[1] + (126 - base[1]) * t);
    const b = Math.round(base[2] + (246 - base[2]) * t);
    shades.push(`rgb(${r},${g},${b})`);
  }
  return shades;
}

function drawEquipoChart(Chart, canvas, kaizens) {
  const byEquipo = {};
  kaizens.forEach((k) => { byEquipo[k.equipo] = (byEquipo[k.equipo] || 0) + 1; });
  const labels = Object.keys(byEquipo);
  const values = Object.values(byEquipo);
  return new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: brandShades(labels.length) }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function drawStatusChart(Chart, canvas, kaizens) {
  const byStatus = {};
  kaizens.forEach((k) => { byStatus[k.status] = (byStatus[k.status] || 0) + 1; });
  const labels = Object.keys(byStatus).map((s) => STATUS_LABEL[s] || s);
  const values = Object.values(byStatus);
  const colorMap = { nuevo: "#227EF6", pend_l: "#94a3b8", pend_g: "#64748b", done: "#166534", rej_l: "#991b1b", rej_g: "#991b1b" };
  const colors = Object.keys(byStatus).map((s) => colorMap[s] || "#0D18A8");
  return new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: colors }] },
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
  chartInstances.forEach((c) => c.destroy());
  chartInstances = [];
}
