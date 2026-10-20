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
//   - Actualización (pedido de Javier): el filtro ya no se limita a "mes
//     actual"/"todos los meses" — ahora se puede elegir CUALQUIER mes del
//     año en curso (enero..diciembre), además de "Todos los meses". El
//     valor del filtro pasó de ser la palabra "actual" a un string
//     "YYYY-MM" (el mes elegido) o "todos"; por default sigue siendo el mes
//     en curso. Solo se listan los meses del año en curso (no años
//     anteriores) — suficiente para el caso de negocio ("ver rendimiento
//     anual a fin de año"), documentado aquí por si en el futuro hace falta
//     navegar años previos.
//   - Oct. 2026: filtro de AÑO (sin "todos los años"; por default el año en
//     curso) y meses en MAYÚSCULAS. El filtro de mes pasó a ser "todos" o
//     "01".."12". Con "Todos los meses" ya NO se muestra la barra de
//     progreso: cada equipo muestra el número de SK de cada mes (ENE..DIC) y
//     el total. La barra solo se queda al elegir un mes específico.
//   - Origen de los conteos: para los meses que traen dato en el histórico de
//     Mejora Continua (lib/historico-sk.js, ene–sep 2026) se usa ESE número;
//     para el resto, los SK implementados reales de la app (`status ===
//     "done"`, por `fechaImpl`). Así un mes nunca se cuenta dos veces.
// ============================================================================

import { el, formatDateTime } from "../utils.js";
import { cargarHistorico, claveEquipo } from "../lib/historico-sk.js";
import { api } from "../api.js";
import { META_SK_POR_EQUIPO_MES } from "../lib/mock-backend.js";

let chartInstances = [];

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const MESES_CORTO = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

let anioFiltro = new Date().getFullYear();
let mesFiltro = String(new Date().getMonth() + 1).padStart(2, "0"); // "01".."12" | "todos"
let historico = {};

export async function render(container, params, isStale) {
  const view = el("div", { class: "view", id: "dashboard-view" });
  container.appendChild(view);
  view.appendChild(el("div", { class: "skeleton", style: "height:400px" }));

  try {
    const [equipos, kaizens, departamentosRaw, hist] = await Promise.all([api.getEquipos(), api.getKaizens(), api.getDepartamentos().catch(() => []), cargarHistorico()]);
    historico = hist || {};
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

function fechaEnPeriodo(fechaISO) {
  if (!fechaISO) return false;
  const d = new Date(fechaISO);
  if (d.getFullYear() !== anioFiltro) return false;
  return mesFiltro === "todos" || d.getMonth() + 1 === Number(mesFiltro);
}

// Meses del año elegido que cuentan para la meta: todos los transcurridos
// (enero..mes actual) si es el año en curso, 12 si ya terminó, 0 si no ha
// empezado; un solo mes si se filtra por mes.
function mesesEnPeriodo() {
  if (mesFiltro !== "todos") return 1;
  const hoy = new Date();
  if (anioFiltro < hoy.getFullYear()) return 12;
  if (anioFiltro > hoy.getFullYear()) return 0;
  return hoy.getMonth() + 1;
}

function nombrePeriodo() {
  return mesFiltro === "todos" ? `Todos los meses ${anioFiltro}` : `${MESES[Number(mesFiltro) - 1]} ${anioFiltro}`;
}

function mesEsFuturo(mes) {
  const hoy = new Date();
  return anioFiltro > hoy.getFullYear() || (anioFiltro === hoy.getFullYear() && mes > hoy.getMonth() + 1);
}

// Años disponibles: el del histórico, los de los SK implementados y el actual.
function aniosDisponibles(kaizens) {
  const anios = new Set([new Date().getFullYear(), ...Object.keys(historico).map(Number)]);
  kaizens.forEach((k) => {
    if (k.status === "done" && k.fechaImpl) {
      const y = new Date(k.fechaImpl).getFullYear();
      if (!Number.isNaN(y)) anios.add(y);
    }
  });
  return [...anios].sort((a, b) => b - a);
}

// Serie de 12 meses de un equipo en el año elegido: número por mes, o null si
// el mes aún no llega. Meses con dato en el histórico → ese; el resto → SK
// reales de la app.
function serieMensual(nombreEquipo, kaizens) {
  const clave = claveEquipo(nombreEquipo);
  const histAnio = historico[String(anioFiltro)] || {};
  const nombreHist = Object.keys(histAnio).find((n) => claveEquipo(n) === clave);
  const serieHist = nombreHist ? histAnio[nombreHist] : null;
  return MESES.map((_, i) => {
    const mes = i + 1;
    if (mesEsFuturo(mes)) return null;
    const h = serieHist ? serieHist[i] : null;
    if (h !== null && h !== undefined) return h;
    return kaizens.filter((k) => {
      if (k.status !== "done" || !k.fechaImpl || claveEquipo(k.equipo) !== clave) return false;
      const d = new Date(k.fechaImpl);
      return d.getFullYear() === anioFiltro && d.getMonth() + 1 === mes;
    }).length;
  });
}

function totalPeriodo(serie) {
  if (mesFiltro === "todos") return serie.reduce((sum, v) => sum + (v || 0), 0);
  return serie[Number(mesFiltro) - 1] || 0;
}

async function paint(view, equipos, kaizens, departamentos) {
  view.innerHTML = "";
  chartInstances.forEach((c) => c && c.destroy());
  chartInstances = [];

  const metaMensual = equipos.length * META_SK_POR_EQUIPO_MES;
  const metaPeriodo = metaMensual * mesesEnPeriodo();
  const metaEquipoPeriodo = META_SK_POR_EQUIPO_MES * mesesEnPeriodo();

  // Datos por equipo del catálogo y equipos que solo existen en el histórico
  // (nombre sin coincidencia en el catálogo): se muestran aparte y NO entran a
  // los KPIs ni a la meta, para no mezclar con equipos que no están en el
  // catálogo.
  const datoDe = (nombre, fueraDeCatalogo) => {
    const serie = serieMensual(nombre, kaizens);
    return { nombre, serie, implementados: totalPeriodo(serie), meta: metaEquipoPeriodo, fueraDeCatalogo };
  };
  const datosCatalogo = equipos.map((eq) => datoDe(eq.nombre, false));
  const clavesCatalogo = new Set(equipos.map((eq) => claveEquipo(eq.nombre)));
  const fueraDeCatalogo = Object.keys(historico[String(anioFiltro)] || {})
    .filter((n) => !clavesCatalogo.has(claveEquipo(n)))
    .map((n) => datoDe(n, true));
  if (fueraDeCatalogo.length) console.warn("[dashboard] Equipos del histórico sin coincidencia en el catálogo:", fueraDeCatalogo.map((d) => d.nombre));

  const totalImplementados = datosCatalogo.reduce((sum, d) => sum + d.implementados, 0);
  // Top 5 empleados: solo SK reales de la app (el histórico no trae detalle).
  const implementadosPeriodo = kaizens.filter((k) => k.status === "done" && fechaEnPeriodo(k.fechaImpl));

  view.appendChild(
    el("div", { class: "view-header" }, [
      el("div", {}, [el("h1", {}, ["Tablero general"]), el("p", {}, [`Cumplimiento de Short Kaizen — ${nombrePeriodo()}`])]),
      buildSelectorPeriodo(view, equipos, kaizens, departamentos),
    ])
  );

  view.appendChild(buildKpis(totalImplementados, metaMensual, metaPeriodo));
  view.appendChild(buildEquiposProgresoPorGrupo(equipos, departamentos, kaizens, datosCatalogo, fueraDeCatalogo, metaEquipoPeriodo));

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
      `Periodo: ${nombrePeriodo()}. Los meses con dato en el histórico de Mejora Continua (enero–septiembre 2026) usan ese número por equipo; el resto de los meses cuenta únicamente Short Kaizen con estatus "Aceptado" (implementados tras la aprobación de Mejora Continua, Líder y Gerente/Aprobador) según su fecha de implementación. El Top 5 de empleados solo considera SK registrados en la app. Meta: ${META_SK_POR_EQUIPO_MES} por equipo / mes (${metaMensual} mensual global, según ${equipos.length} equipo(s) activo(s)). `,
      `Generado: ${formatDateTime(new Date())}.`,
    ])
  );

  let Chart;
  try {
    Chart = await loadChartJs();
  } catch (err) {
    console.error("[dashboard] No se pudo cargar Chart.js (assets/vendor/chart.umd.js):", err);
    const msg = () => el("p", { class: "hint" }, ["No se pudo cargar la librería de gráficas. Recarga la página; si persiste, avisa a soporte."]);
    equipoCanvas.replaceWith(msg());
    empleadoCanvas.replaceWith(msg());
    return;
  }
  try {
    chartInstances = [
      drawTopChart(Chart, equipoCanvas, topEquipos(datosCatalogo)),
      drawTopChart(Chart, empleadoCanvas, topEmpleados(implementadosPeriodo)),
    ];
  } catch (err) {
    console.error("[dashboard] Error al dibujar las gráficas:", err);
    const msg = () => el("p", { class: "hint" }, ["No se pudieron dibujar las gráficas."]);
    equipoCanvas.replaceWith(msg());
    empleadoCanvas.replaceWith(msg());
  }
}

// Selector de periodo: AÑO (sin "todos los años") + MES (en mayúsculas, o
// "Todos los meses"). Re-pinta con los mismos datos ya cargados (filtro 100%
// del lado del cliente).
function buildSelectorPeriodo(view, equipos, kaizens, departamentos) {
  const repintar = () => paint(view, equipos, kaizens, departamentos);

  const selectAnio = el(
    "select",
    { class: "select", style: "max-width:120px", onchange: (e) => { anioFiltro = Number(e.target.value); repintar(); } },
    aniosDisponibles(kaizens).map((y) => el("option", { value: String(y), selected: y === anioFiltro || undefined }, [String(y)]))
  );

  const selectMes = el(
    "select",
    { class: "select", style: "max-width:200px", onchange: (e) => { mesFiltro = e.target.value; repintar(); } },
    [
      ...MESES.map((nombre, i) => {
        const valor = String(i + 1).padStart(2, "0");
        return el("option", { value: valor, selected: mesFiltro === valor || undefined }, [nombre]);
      }),
      el("option", { value: "todos", selected: mesFiltro === "todos" || undefined }, ["Todos los meses"]),
    ]
  );

  return el("div", { style: "display:flex;gap:12px;flex-wrap:wrap" }, [
    el("div", { class: "field", style: "margin-bottom:0" }, [el("label", {}, ["Año"]), selectAnio]),
    el("div", { class: "field", style: "margin-bottom:0" }, [el("label", {}, ["Mes"]), selectMes]),
  ]);
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
function buildEquiposProgresoPorGrupo(equipos, departamentos, kaizensTodos, datosCatalogo, fueraDeCatalogo, metaEquipoPeriodo) {
  if (!equipos.length) return el("div", {});

  const equipoDepartamentoCache = {};
  (kaizensTodos || []).forEach((k) => {
    if (k.equipo && k.departamento) equipoDepartamentoCache[k.equipo] = k.departamento;
  });

  // equipo -> { nombre, serie, implementados, meta }
  const datoEquipo = (eq) => datosCatalogo.find((d) => d.nombre === eq.nombre);

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

  // Con "Todos los meses" el indicador es solo el total (sin meta ni barra).
  const indicador = (impl, meta) => (mesFiltro === "todos" ? `${impl} SK` : `${impl} / ${meta}`);

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
          indicador(implementadosGrupo, metaGrupo),
          [el("div", { style: "padding-left:22px" }, deptos.map((d) => buildNivelDepartamento(d, indicador)))]
        );
      }).concat(
        fueraDeCatalogo.length
          ? [
              buildNivelColapsable(
                "Histórico sin coincidencia en el catálogo",
                `${fueraDeCatalogo.reduce((sum, d) => sum + d.implementados, 0)} SK`,
                [
                  el("p", { class: "hint", style: "padding-left:22px;margin-bottom:6px" }, [
                    "Equipos del archivo de Mejora Continua cuyo nombre no coincide con ningún equipo del catálogo. No suman a los indicadores de arriba.",
                  ]),
                  el("div", { style: "padding-left:22px" }, [buildFilas(fueraDeCatalogo)]),
                ]
              ),
            ]
          : []
      )
    ),
  ]);
}

function buildNivelDepartamento(d, indicador) {
  return buildNivelColapsable(d.nombre, indicador(d.implementados, d.meta), [el("div", { style: "padding-left:22px" }, [buildFilas(d.equipos)])]);
}

// Con "Todos los meses": tabla equipo × mes (ENE..DIC + total), sin barra.
// Con un mes específico: barra de progreso contra la meta, como siempre.
function buildFilas(equipos) {
  const ordenados = equipos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  if (mesFiltro === "todos") {
    const celda = (v) => el("td", { class: `mt-num${v === null ? " mt-vacio" : ""}` }, [v === null ? "—" : String(v)]);
    return el("div", { class: "mes-tabla-wrap" }, [
      el("table", { class: "mes-tabla" }, [
        el("thead", {}, [
          el("tr", {}, [el("th", { class: "mt-equipo" }, ["Equipo"]), ...MESES_CORTO.map((m) => el("th", { class: "mt-num" }, [m])), el("th", { class: "mt-num mt-total" }, ["TOTAL"])]),
        ]),
        el(
          "tbody",
          {},
          ordenados.map((eq) =>
            el("tr", {}, [el("td", { class: "mt-equipo" }, [eq.nombre]), ...eq.serie.map(celda), el("td", { class: "mt-num mt-total" }, [String(eq.implementados)])])
          )
        ),
      ]),
    ]);
  }
  return el(
    "div",
    { class: "equipo-progreso-list" },
    ordenados.map((eq) => {
      const pct = eq.meta > 0 ? Math.min(100, Math.round((eq.implementados / eq.meta) * 100)) : 0;
      return el("div", { class: "equipo-progreso-row" }, [
        el("div", { class: "ep-nombre" }, [el("div", { style: "font-weight:600" }, [eq.nombre])]),
        el("div", { class: "ep-bar-wrap" }, [el("div", { class: "ep-bar" }, [el("div", { class: "ep-bar-fill", style: `width:${pct}%` })])]),
        el("div", { class: "ep-valor" }, [`${eq.implementados} / ${eq.meta}`]),
        el("div", { class: `ep-pct ${pct >= 100 ? "up" : ""}` }, [`${pct}%`]),
      ]);
    })
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

function topEquipos(datosCatalogo) {
  return datosCatalogo
    .filter((d) => d.implementados > 0)
    .map((d) => [d.nombre, d.implementados])
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
    script.src = "assets/vendor/chart.umd.js";
    script.onload = () => resolve(window.Chart);
    script.onerror = () => reject(new Error("No se pudo cargar Chart.js"));
    document.head.appendChild(script);
  });
}

export function unmount() {
  chartInstances.forEach((c) => c && c.destroy());
  chartInstances = [];
}
