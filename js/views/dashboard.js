// ============================================================================
// dashboard.js — Indicadores del programa Short Kaizen.
//
// Referencia de negocio (ver "Tablero SK" compartido por el usuario):
//   - Meta por equipo: 4 Short Kaizen implementados por mes (fija).
//   - Meta mensual global: YA NO es un número fijo (antes 140) — pedido de
//     Javier (sept. 2026): se calcula como (número de equipos activos) × 4,
//     así que crece/baja solo según el catálogo real de equipos.
//   - "Implementado" = status "done" (aprobado por Mejora Continua, Líder y
//     Gerente/Aprobador 2-3) — el texto en pantalla decía "cerrados", pedido
//     de Javier fue cambiarlo a "implementados".
//   - Regla de fecha (pedido de Javier, sept. 2026): un Short Kaizen cuenta
//     en el mes de su FECHA DE IMPLEMENTACIÓN (`fechaImpl`), no de la última
//     vez que se actualizó (`actualizadoEn`, usado antes) — y solo si ya
//     está completamente aprobado (`status === "done"`), sin importar en qué
//     mes se haya terminado de aprobar. Ej.: un SK creado el último día de
//     agosto pero aprobado hasta el 1 de septiembre cuenta para agosto, no
//     para septiembre. `fechaImpl` ya viaja en cada kaizen (ver
//     formulario.js/api.js), no requiere ningún campo nuevo del backend.
//   - Filtro de periodo (pedido de Javier): por default se ve solo el mes en
//     curso, con la opción de ver "Todos los meses" (sin filtro de fecha)
//     para revisar el rendimiento acumulado del año al cierre de este.
//     Cuando se elige "Todos los meses", la meta se escala multiplicando la
//     meta mensual por los meses transcurridos del año en curso (incluye el
//     actual), para que el % de cumplimiento siga siendo una comparación
//     razonable contra un acumulado, no contra una meta de un solo mes.
// ============================================================================

import { el, formatDateTime } from "../utils.js";
import { api } from "../api.js";
import { META_SK_POR_EQUIPO_MES } from "../lib/mock-backend.js";

let chartInstances = [];
let mesFiltro = "actual"; // "actual" | "todos"

export async function render(container, params, isStale) {
  const view = el("div", { class: "view", id: "dashboard-view" });
  container.appendChild(view);
  view.appendChild(el("div", { class: "skeleton", style: "height:400px" }));

  try {
    const [equipos, kaizens, departamentosRaw] = await Promise.all([api.getEquipos(), api.getKaizens(), api.getDepartamentos().catch(() => [])]);
    if (isStale && isStale()) return; // el usuario ya navegó a otra vista — no tocar el DOM
    // Normaliza igual que el resto de la app: el mock puede regresar
    // string[], el backend real { id, nombre, grupo }[].
    const departamentos = (departamentosRaw || []).map((d) => (typeof d === "string" ? { id: d, nombre: d, grupo: null } : d));
    view.innerHTML = "";
    await paint(view, equipos, kaizens, departamentos);
  } catch (err) {
    if (isStale && isStale()) return;
    view.innerHTML = "";
    view.appendChild(
      el("div", { class: "empty-state" }, [el("div", { class: "icon" }, ["⚠️"]), el("p", {}, [err.message || "No se pudo cargar el dashboard."])])
    );
  }
}

function coincideConFiltro(fechaISO) {
  if (!fechaISO) return false;
  if (mesFiltro === "todos") return true;
  const d = new Date(fechaISO);
  const ahora = new Date();
  return d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth();
}

// Meses "transcurridos" del año en curso, para escalar la meta cuando se ve
// el acumulado completo (enero..mes actual, incluyéndolo) — ver nota de
// arquitectura al inicio del archivo.
function mesesEnPeriodo() {
  return mesFiltro === "todos" ? new Date().getMonth() + 1 : 1;
}

function nombreMesActual() {
  return new Date().toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

function nombrePeriodo() {
  return mesFiltro === "todos" ? "Todos los meses (acumulado del año)" : nombreMesActual();
}

async function paint(view, equipos, kaizens, departamentos) {
  view.innerHTML = "";
  chartInstances.forEach((c) => c && c.destroy());
  chartInstances = [];

  const metaMensual = equipos.length * META_SK_POR_EQUIPO_MES;
  const metaPeriodo = metaMensual * mesesEnPeriodo();
  const metaEquipoPeriodo = META_SK_POR_EQUIPO_MES * mesesEnPeriodo();
  const implementadosPeriodo = kaizens.filter((k) => k.status === "done" && coincideConFiltro(k.fechaImpl));

  view.appendChild(
    el("div", { class: "view-header" }, [
      el("div", {}, [el("h1", {}, ["Dashboard"]), el("p", {}, [`Cumplimiento de Short Kaizen — ${nombrePeriodo()}`])]),
      buildSelectorMes(view, equipos, kaizens, departamentos),
    ])
  );

  view.appendChild(buildKpis(implementadosPeriodo.length, metaMensual, metaPeriodo));
  view.appendChild(buildEquiposProgresoPorGrupo(equipos, departamentos, kaizens, implementadosPeriodo, metaEquipoPeriodo));

  const equipoCanvas = el("canvas");
  const empleadoCanvas = el("canvas");

  view.appendChild(
    el("div", { class: "dash-grid" }, [
      el("div", { class: "card" }, [el("h3", {}, ["Top 5 equipos — SK implementados en el periodo"]), el("div", { class: "chart-wrap" }, [equipoCanvas])]),
      el("div", { class: "card" }, [el("h3", {}, ["Top 5 empleados — SK implementados en el periodo"]), el("div", { class: "chart-wrap" }, [empleadoCanvas])]),
    ])
  );

  view.appendChild(
    el("p", { class: "methodology-note" }, [
      `Incluye únicamente Short Kaizen con estatus "Aceptado" (implementados tras la aprobación de Mejora Continua, Líder y Gerente/Aprobador) y cuya fecha de implementación cae dentro de: ${nombrePeriodo()}. Meta: ${META_SK_POR_EQUIPO_MES} por equipo / mes (${metaMensual} mensual global, según ${equipos.length} equipo(s) activo(s)). `,
      `Generado: ${formatDateTime(new Date())}.`,
    ])
  );

  try {
    const Chart = await loadChartJs();
    chartInstances = [
      drawTopChart(Chart, equipoCanvas, topEquipos(equipos, implementadosPeriodo)),
      drawTopChart(Chart, empleadoCanvas, topEmpleados(implementadosPeriodo)),
    ];
  } catch {
    const msg = () => el("p", { class: "hint" }, ["No se pudieron cargar las gráficas (sin conexión al CDN)."]);
    equipoCanvas.replaceWith(msg());
    empleadoCanvas.replaceWith(msg());
  }
}

// Selector "Mes actual" / "Todos los meses" (pedido de Javier, sept. 2026).
// Re-pinta todo el dashboard con los mismos `equipos`/`kaizens` ya cargados
// (el filtro es 100% del lado del cliente, no requiere volver a pedir datos).
function buildSelectorMes(view, equipos, kaizens, departamentos) {
  const select = el(
    "select",
    {
      class: "select",
      style: "max-width:220px",
      onchange: (e) => {
        mesFiltro = e.target.value;
        paint(view, equipos, kaizens, departamentos);
      },
    },
    [
      el("option", { value: "actual", selected: mesFiltro === "actual" || undefined }, ["Mes actual"]),
      el("option", { value: "todos", selected: mesFiltro === "todos" || undefined }, ["Todos los meses"]),
    ]
  );
  return el("div", { class: "field", style: "margin-bottom:0" }, [el("label", {}, ["Periodo"]), select]);
}

function buildKpis(totalImplementadosPeriodo, metaMensual, metaPeriodo) {
  const pct = metaPeriodo > 0 ? Math.round((totalImplementadosPeriodo / metaPeriodo) * 100) : 0;
  const items = [
    ["SK implementados", totalImplementadosPeriodo, null],
    [mesFiltro === "todos" ? "Meta acumulada del año" : "Meta mensual", metaPeriodo, null],
    ["% cumplimiento", `${pct}%`, pct >= 100 ? "up" : "down"],
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

// Los 3 grupos de negocio confirmados con Jesús (KaizenZX_Respuesta_Grupo_
// Departamento_Y_Mc.md, sept. 2026) — mismas claves que usa admin.js al
// asignarlos. El 4to bucket ("sin_grupo") no es un grupo real de negocio:
// agrupa departamentos que un admin todavía no ha clasificado, para que
// esos equipos no desaparezcan del Dashboard mientras eso no pase.
const GRUPOS_DEPARTAMENTO = [
  { value: "proceso_productivo", label: "Proceso Productivo" },
  { value: "areas_servicio", label: "Áreas de Servicio" },
  { value: "administrativo", label: "Administrativos" },
];

// Mismo criterio de prioridad que `departamentoDeEquipo()`/
// `departamentoDeEquipoLocal()` en admin.js/mis-kaizens.js (duplicado a
// propósito, este archivo no comparte módulos con esos): 1) `departamentoId`
// directo si el backend ya lo trae, 2) `departamento` como string si viene
// así, 3) inferido cruzando el historial de Short Kaizen del equipo.
function nombreDepartamentoDeEquipo(eq, departamentos, equipoDepartamentoCache) {
  if (eq.departamentoId) {
    const match = departamentos.find((d) => String(d.id) === String(eq.departamentoId));
    return match?.nombre || null;
  }
  if (eq.departamento) return eq.departamento;
  return equipoDepartamentoCache[eq.nombre] || null;
}

// Cumplimiento por equipo, organizado en una jerarquía de 3 niveles (pedido
// de Javier, sept. 2026, ver KaizenZX_Grupos_Departamento_Dashboard.md):
// Grupo de negocio → Departamento → Equipo, cada nivel colapsable y con su
// propio indicador "implementados / meta" (la meta de un nivel es la suma
// de las metas de sus hijos). Reutiliza las clases de acordeón ya usadas en
// el mosaico de "Mis Short Kaizen" (`.equipos-departamento-grupo*`), que ya
// tienen el estilo de encabezado + chevron + cuerpo colapsable.
function buildEquiposProgresoPorGrupo(equipos, departamentos, kaizensTodos, implementadosPeriodo, metaEquipoPeriodo) {
  if (!equipos.length) return el("div", {});

  const equipoDepartamentoCache = {};
  (kaizensTodos || []).forEach((k) => {
    if (k.equipo && k.departamento) equipoDepartamentoCache[k.equipo] = k.departamento;
  });

  // equipo -> { implementados, meta }
  const datoEquipo = (eq) => ({
    nombre: eq.nombre,
    implementados: implementadosPeriodo.filter((k) => k.equipo === eq.nombre).length,
    meta: metaEquipoPeriodo,
  });

  // Agrupa equipos por nombre de departamento.
  const equiposPorDepto = new Map();
  equipos.forEach((eq) => {
    const nombreDepto = nombreDepartamentoDeEquipo(eq, departamentos, equipoDepartamentoCache) || "Departamento sin clasificar";
    if (!equiposPorDepto.has(nombreDepto)) equiposPorDepto.set(nombreDepto, []);
    equiposPorDepto.get(nombreDepto).push(datoEquipo(eq));
  });

  // Agrupa esos departamentos por grupo de negocio.
  const deptosPorGrupo = new Map(GRUPOS_DEPARTAMENTO.map((g) => [g.value, []]));
  deptosPorGrupo.set("sin_grupo", []);
  [...equiposPorDepto.keys()].sort((a, b) => a.localeCompare(b, "es")).forEach((nombreDepto) => {
    const deptoInfo = departamentos.find((d) => d.nombre === nombreDepto);
    const grupoKey = deptoInfo?.grupo && deptosPorGrupo.has(deptoInfo.grupo) ? deptoInfo.grupo : "sin_grupo";
    const equiposDelDepto = equiposPorDepto.get(nombreDepto);
    deptosPorGrupo.get(grupoKey).push({
      nombre: nombreDepto,
      equipos: equiposDelDepto,
      implementados: equiposDelDepto.reduce((sum, e) => sum + e.implementados, 0),
      meta: equiposDelDepto.reduce((sum, e) => sum + e.meta, 0),
    });
  });

  const gruposParaMostrar = [
    ...GRUPOS_DEPARTAMENTO,
    { value: "sin_grupo", label: "Sin grupo asignado" },
  ].filter((g) => deptosPorGrupo.get(g.value).length); // no mostrar grupos vacíos (0 departamentos asignados)

  return el("div", { class: "card", style: "margin-bottom:20px" }, [
    el("h3", {}, ["Cumplimiento por equipo"]),
    el("p", { class: "hint", style: "margin-bottom:10px" }, ["Agrupado por grupo de negocio → departamento → equipo. Haz clic para desplegar cada nivel."]),
    el(
      "div",
      {},
      gruposParaMostrar.map((g) => {
        const deptos = deptosPorGrupo.get(g.value);
        const implementadosGrupo = deptos.reduce((sum, d) => sum + d.implementados, 0);
        const metaGrupo = deptos.reduce((sum, d) => sum + d.meta, 0);
        return buildNivelColapsable(
          `${g.label}`,
          `${implementadosGrupo} / ${metaGrupo}`,
          [el("div", { style: "padding-left:22px" }, deptos.map((d) => buildNivelDepartamento(d)))]
        );
      })
    ),
  ]);
}

function buildNivelDepartamento(d) {
  return buildNivelColapsable(
    d.nombre,
    `${d.implementados} / ${d.meta}`,
    [
      el(
        "div",
        { class: "equipo-progreso-list", style: "padding-left:22px" },
        d.equipos
          .slice()
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
          .map((eq) => {
            const pct = eq.meta > 0 ? Math.min(100, Math.round((eq.implementados / eq.meta) * 100)) : 0;
            return el("div", { class: "equipo-progreso-row" }, [
              el("div", { class: "ep-nombre" }, [el("div", { style: "font-weight:600" }, [eq.nombre])]),
              el("div", { class: "ep-bar-wrap" }, [
                el("div", { class: "ep-bar" }, [el("div", { class: "ep-bar-fill", style: `width:${pct}%` })]),
              ]),
              el("div", { class: "ep-valor" }, [`${eq.implementados} / ${eq.meta}`]),
              el("div", { class: `ep-pct ${pct >= 100 ? "up" : ""}` }, [`${pct}%`]),
            ]);
          })
      ),
    ]
  );
}

// Encabezado clicable (chevron + título + indicador "x / y") con cuerpo
// colapsable — colapsado por defecto, igual que el mosaico de equipos.
function buildNivelColapsable(titulo, indicador, hijos) {
  const grupoEl = el("div", { class: "equipos-departamento-grupo" });
  const header = el(
    "button",
    { class: "equipos-departamento-grupo-header", type: "button", onclick: () => grupoEl.classList.toggle("is-open") },
    [
      el("span", { class: "equipos-departamento-grupo-chevron" }, ["▶"]),
      el("h3", { style: "flex:1" }, [titulo]),
      el("span", { class: "badge badge-pend" }, [indicador]),
    ]
  );
  const body = el("div", { class: "equipos-departamento-grupo-body" }, hijos);
  grupoEl.appendChild(header);
  grupoEl.appendChild(body);
  return grupoEl;
}

function topEquipos(equipos, implementadosPeriodo) {
  const conteo = {};
  implementadosPeriodo.forEach((k) => { conteo[k.equipo] = (conteo[k.equipo] || 0) + 1; });
  return Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

function topEmpleados(implementadosPeriodo) {
  const conteo = {};
  implementadosPeriodo.forEach((k) => {
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
    canvas.replaceWith(el("p", { class: "hint" }, ["Todavía no hay Short Kaizen implementados en este periodo."]));
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
