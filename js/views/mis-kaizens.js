// ============================================================================
// mis-kaizens.js — Pantalla "Mis Kaizens" (antes "Solicitudes").
//
// Nov. 2026 (pedido de Javier): la pantalla quedó con 3 cosas —
//   1) Filtro de PERIODO (año + mes, por fecha de creación del SK). Por defecto
//      el mes en curso; "Todos los meses" para ver todo el año.
//   2) 4 KPIs (creados, pendientes, aceptados, rechazados) que al hacer clic
//      abren un popup con el listado de los SK que corresponden a ese KPI.
//   3) UNA gráfica de SK creados con drill-down según el rol:
//        - integrante / líder (un equipo): personas de su equipo.
//        - gerente (o quien ve varios equipos): equipos → clic → personas.
//        - mc / admin: departamentos → clic → equipos → clic → personas.
//      Ya no hay listado de SK ni mosaico de equipos debajo de los KPIs.
//
// La regla de visibilidad de los KPIs/popup NO cambió:
//   - solicitante: solo sus propios Short Kaizen enviados.
//   - lider:       los Short Kaizen de su propio Equipo Lean.
//   - gerente:     TODOS los Short Kaizen de su departamento.
//   - admin/mc:    todo, sin restricción.
// La gráfica usa `api.getKaizensTablero()` (todos los SK en versión ligera)
// porque un integrante/líder necesita ver cuántos SK hizo cada compañero de su
// equipo, y `GET /kaizens` solo le entrega los suyos.
// ============================================================================

import { el, formatDate, shortId } from "../utils.js";
import { api } from "../api.js";
import { state, setState } from "../state.js";
import { claveEquipo } from "../lib/historico-sk.js";
import { crearResolvedorDeptoCreador } from "../lib/depto-creador.js";
import { loadChartJs } from "../lib/chart-loader.js";

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

// Periodo elegido (por defecto, el mes en curso).
let anioSel = new Date().getFullYear();
let mesSel = String(new Date().getMonth() + 1); // "1".."12" | "todos"
let datosGrafica = { tablero: [], equipos: [], departamentos: [] };
let rutaGrafica = []; // [{ tipo: "depto"|"equipo", valor, depto? }]
let chartInstance = null;

// Modelo de 2-o-3 pasos (KaizenZX_Flujo_Definitivo_Aprobacion.md): `status`
// es la fuente de verdad confirmada por Jesús (nunca derivar del estado de
// las firmas — sería lógica duplicada y podría desincronizarse de lo que el
// backend considera el estado real). Valores exactos: pend_aprobacion1,
// pend_aprobacion2, pend_aprobacion3, done, rej_aprobacion1, rej_aprobacion2,
// rej_aprobacion3.
function estadoKaizen(k) {
  const NOMBRES_PASO = { aprobacion1: "Mejora Continua", aprobacion2: k.nombreAprobacion2 || "Aprobación 2", aprobacion3: k.nombreAprobacion3 || "Aprobación 3" };
  if (k.status === "done") return { label: "Aceptado", badge: "badge-done", grupo: "aceptado" };
  const m = /^(pend|rej)_(aprobacion[123])$/.exec(k.status || "");
  if (!m) return { label: k.status || "—", badge: "badge-nuevo", grupo: "pendiente" };
  const [, tipo, paso] = m;
  if (tipo === "rej") return { label: `Rechazado (${NOMBRES_PASO[paso]})`, badge: "badge-rej", grupo: "rechazado" };
  return { label: `Pend. ${NOMBRES_PASO[paso]}`, badge: "badge-pend", grupo: "pendiente" };
}

let departamentosCache = [];

const SIN_EQUIPO = "__sin_equipo__";

export async function render(container, params, isStale) {
  popupRestaurado = false;
  rutaGrafica = [];
  container.appendChild(el("div", { class: "view", id: "historial-view" }, [renderSkeleton()]));

  try {
    const [equipos, kaizens] = await Promise.all([api.getEquipos(), api.getKaizens()]);
    if (isStale && isStale()) return;
    // Sin dejar que una falla aquí tumbe la pantalla: la gráfica cae a los SK
    // que el rol ya puede ver si la vista de todos los SK no está disponible.
    const [deptosRaw, tablero] = await Promise.all([api.getDepartamentos().catch(() => []), api.getKaizensTablero().catch(() => kaizens)]);
    departamentosCache = (deptosRaw || []).map((d) => (typeof d === "string" ? { id: d, nombre: d } : d));
    if (isStale && isStale()) return;
    datosGrafica = { tablero, equipos, departamentos: departamentosCache };
    setState({ equipos, kaizens });
    paint(container);
  } catch (err) {
    if (isStale && isStale()) return;
    paintError(container, err);
  }
}

function renderSkeleton() {
  const rows = [1, 2, 3].map(() => el("div", { class: "skeleton", style: "height:72px;margin-bottom:12px" }));
  return el("div", {}, rows);
}

function paintError(container, err) {
  const view = container.querySelector("#historial-view") || container;
  view.innerHTML = "";
  view.appendChild(
    el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, ["⚠️"]),
      el("h3", {}, ["No se pudo cargar la información"]),
      el("p", {}, [err.message || "Intenta de nuevo en unos segundos."]),
    ])
  );
}

// Visibilidad de equipos (corrección oct. 2026, pendiente reportado por
// Javier: usuarios que deberían ver varios equipos no veían ninguno).
// Dos causas probables, ambas atendidas aquí:
//   1) `GET /equipos` ya no trae el NOMBRE del departamento por equipo (solo
//      `departamentoId`, o nada), así que el filtro viejo de gerente
//      (`eq.departamento === user.departamento`) no hacía match con nadie.
//      Ahora se resuelve el departamento igual que en el mosaico
//      (`departamentoDeEquipoLocal`), comparando sin mayúsculas/espacios, y
//      `user.departamento` puede traer varios departamentos separados por
//      coma (el contrato dice que un gerente puede tener varios).
//   2) Quien figura como Aprobador 2/3 de un equipo debe poder ver ese
//      equipo aunque su rol de sistema no sea "gerente" (p. ej. un
//      Aprobador 3 con rol lider/solicitante). Se agregan a su alcance
//      todos los equipos donde su nómina es `aprobador2Nomina` o
//      `aprobador3Nomina`.
// OJO: esto solo amplía lo que el frontend MUESTRA de lo que el backend ya
// entregó; si `GET /equipos`/`GET /kaizens` filtran por rol en el servidor,
// Jesús debe confirmar que también devuelven estos equipos (ver md de
// Jesús, punto de visibilidad).
const normalizaTexto = (v) => String(v?.nombre ?? v ?? "").trim().toLowerCase();

function departamentosDelUsuario(user) {
  const raw = user.departamento;
  const lista = Array.isArray(raw) ? raw : String(raw || "").split(/[,;|]/);
  return lista.map(normalizaTexto).filter(Boolean);
}

function equiposDondeEsAprobador(user) {
  const nomina = String(user.nomina || "");
  if (!nomina) return [];
  return state.equipos.filter((eq) => String(eq.aprobador2Nomina || "") === nomina || String(eq.aprobador3Nomina || "") === nomina);
}

// Equipos donde la persona figura como LÍDER (`equipos.lider_nomina`, ya
// disponible como `liderNomina` en GET /equipos). Quien es líder de un equipo
// debe ver todos los SK de ese equipo en su perfil, sin depender de que su
// rol de sistema sea "lider" (pedido de Javier, oct. 2026).
function equiposDondeEsLider(user) {
  const nomina = String(user.nomina || "");
  if (!nomina) return [];
  return state.equipos.filter((eq) => String(eq.liderNomina || "") === nomina);
}

function alcanceParaUsuario() {
  const user = state.user || {};
  const rol = user.rol;

  // Unión de equipos sin repetir por nombre.
  const unirEquipos = (...listas) => {
    const vistos = new Set();
    return listas.flat().filter((eq) => (vistos.has(eq.nombre) ? false : (vistos.add(eq.nombre), true)));
  };
  // Equipos extra a los que tiene acceso por ser Aprobador 2/3 o Líder.
  const comoAprobador =
    rol === "admin" || rol === "mc" ? [] : unirEquipos(equiposDondeEsAprobador(user), equiposDondeEsLider(user));
  const kaizensDeEquipos = (equipos, extra = () => false) => {
    const nombres = new Set(equipos.map((eq) => eq.nombre));
    return state.kaizens.filter((k) => nombres.has(k.equipo) || extra(k));
  };

  if (rol === "solicitante") {
    // El equipo propio también entra a `equiposVisibles` (lo usa la gráfica).
    const propio = state.equipos.filter((eq) => eq.nombre === user.equipo);
    if (comoAprobador.length) {
      return {
        mostrarMosaico: true,
        equiposVisibles: unirEquipos(propio, comoAprobador),
        kaizensVisibles: kaizensDeEquipos(comoAprobador, (k) => k.nomina === user.nomina),
        titulo: "Mis Short Kaizen",
        subtitulo: "Selecciona un equipo para ver sus Short Kaizen",
      };
    }
    return {
      mostrarMosaico: false,
      equiposVisibles: propio,
      kaizensVisibles: state.kaizens.filter((k) => k.nomina === user.nomina),
      titulo: "Mis Short Kaizen",
      subtitulo: "Short Kaizen que has enviado",
    };
  }

  if (rol === "lider") {
    const propios = state.equipos.filter((eq) => eq.nombre === user.equipo);
    const equiposVisibles = unirEquipos(propios, comoAprobador);
    const variosEquipos = equiposVisibles.length > 1;
    return {
      mostrarMosaico: variosEquipos,
      equiposVisibles,
      kaizensVisibles: kaizensDeEquipos(equiposVisibles, (k) => k.equipo === user.equipo),
      titulo: variosEquipos ? "Mis Short Kaizen" : `Mis Short Kaizen — ${user.equipo || "tu equipo"}`,
      subtitulo: variosEquipos ? "Selecciona un equipo para ver sus Short Kaizen" : "Short Kaizen de tu equipo",
    };
  }

  if (rol === "gerente") {
    const deptos = departamentosDelUsuario(user);
    const cacheDepto = {};
    state.kaizens.forEach((k) => {
      if (k.equipo && k.departamento) cacheDepto[k.equipo] = k.departamento;
    });
    const porDepartamento = state.equipos.filter((eq) => {
      const d = normalizaTexto(departamentoDeEquipoLocal(eq, cacheDepto));
      return d && deptos.includes(d);
    });
    const equiposVisibles = unirEquipos(porDepartamento, comoAprobador);
    return {
      mostrarMosaico: true,
      equiposVisibles,
      kaizensVisibles: kaizensDeEquipos(equiposVisibles, (k) => deptos.includes(normalizaTexto(k.departamento))),
      titulo: user.departamento ? `Mis Short Kaizen — ${user.departamento}` : "Mis Short Kaizen",
      subtitulo: "Selecciona un equipo para ver sus Short Kaizen",
    };
  }

  return {
    mostrarMosaico: true,
    equiposVisibles: state.equipos,
    kaizensVisibles: state.kaizens,
    titulo: "Mis Short Kaizen",
    subtitulo: null,
  };
}

// ---- Periodo ----------------------------------------------------------------

function fechaCreacion(k) {
  const d = new Date(k.creadoEn || k.fechaId || "");
  return Number.isNaN(d.getTime()) ? null : d;
}

function enPeriodo(k) {
  const d = fechaCreacion(k);
  if (!d || d.getFullYear() !== anioSel) return false;
  return mesSel === "todos" || String(d.getMonth() + 1) === mesSel;
}

function nombrePeriodo() {
  return mesSel === "todos" ? `Todos los meses ${anioSel}` : `${MESES[Number(mesSel) - 1]} ${anioSel}`;
}

function aniosDisponibles() {
  const anios = new Set([new Date().getFullYear()]);
  [...state.kaizens, ...datosGrafica.tablero].forEach((k) => {
    const d = fechaCreacion(k);
    if (d) anios.add(d.getFullYear());
  });
  return [...anios].sort((a, b) => b - a);
}

function buildSelectorPeriodo(container) {
  const repintar = () => paint(container);
  const selectAnio = el(
    "select",
    { class: "select", style: "max-width:120px", onchange: (e) => { anioSel = Number(e.target.value); repintar(); } },
    aniosDisponibles().map((y) => el("option", { value: String(y), selected: y === anioSel || undefined }, [String(y)]))
  );
  const selectMes = el(
    "select",
    { class: "select", style: "max-width:200px", onchange: (e) => { mesSel = e.target.value; repintar(); } },
    [
      ...MESES.map((nombre, i) => el("option", { value: String(i + 1), selected: mesSel === String(i + 1) || undefined }, [nombre])),
      el("option", { value: "todos", selected: mesSel === "todos" || undefined }, ["Todos los meses"]),
    ]
  );
  return el("div", { style: "display:flex;gap:12px;flex-wrap:wrap" }, [
    el("div", { class: "field", style: "margin-bottom:0" }, [el("label", {}, ["Año"]), selectAnio]),
    el("div", { class: "field", style: "margin-bottom:0" }, [el("label", {}, ["Mes"]), selectMes]),
  ]);
}

function paint(container) {
  const view = container.querySelector("#historial-view");
  view.innerHTML = "";
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  const alcance = alcanceParaUsuario();
  const kaizensPeriodo = alcance.kaizensVisibles.filter(enPeriodo);

  view.appendChild(
    el("div", { class: "view-header" }, [
      el("div", {}, [el("h1", {}, [alcance.titulo]), el("p", {}, [`${alcance.subtitulo || "Short Kaizen creados"} — ${nombrePeriodo()}`])]),
      buildSelectorPeriodo(container),
    ])
  );

  view.appendChild(buildStatsRow(kaizensPeriodo));
  view.appendChild(buildGraficaCard(container, alcance));

  // Al volver desde el detalle se reabre el popup con su filtro (y el periodo).
  if (!popupRestaurado) {
    popupRestaurado = true;
    const guardado = leerPopupGuardado();
    if (guardado) {
      anioSel = guardado.anio;
      mesSel = guardado.mes;
      paint(container);
      abrirPopupLista(alcance.kaizensVisibles.filter(enPeriodo), guardado.filtro);
    }
  }
}

// ---- Navegación al detalle y estado del popup ----
const CLAVE_POPUP = "sk_mk_popup";
let popupRestaurado = false;

function leerPopupGuardado() {
  try {
    // Se consume SIEMPRE (para que no quede viejo), pero el popup solo se
    // reabre si se regresó con el botón "Volver" del detalle (sk_mk_restaurar).
    const raw = sessionStorage.getItem(CLAVE_POPUP);
    const restaurar = sessionStorage.getItem("sk_mk_restaurar") === "1";
    sessionStorage.removeItem(CLAVE_POPUP);
    sessionStorage.removeItem("sk_mk_restaurar");
    if (!restaurar) return null;
    const v = raw && JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const mes = v.mes === "todos" || (/^\d+$/.test(String(v.mes)) && Number(v.mes) >= 1 && Number(v.mes) <= 12) ? String(v.mes) : mesSel;
    const anio = Number.isFinite(Number(v.anio)) ? Number(v.anio) : anioSel;
    return { filtro: FILTROS.some((f) => f.id === v.filtro) ? v.filtro : "todos", mes, anio };
  } catch {
    return null;
  }
}

function abrirDetalle(k, popup) {
  if (popup) {
    try { sessionStorage.setItem(CLAVE_POPUP, JSON.stringify({ ...popup, mes: mesSel, anio: anioSel })); } catch { /* sin storage: solo vuelve a la página */ }
  }
  window.location.href = `detalle.html?id=${encodeURIComponent(k.id)}&from=mis-kaizens`;
}

// ---- Popup de SK (al hacer clic en un KPI), con filtro por estatus ----
const FILTROS = [
  { id: "todos", label: "Todos", grupo: null },
  { id: "pendiente", label: "Pendientes", grupo: "pendiente" },
  { id: "aceptado", label: "Aceptados", grupo: "aceptado" },
  { id: "rechazado", label: "Rechazados", grupo: "rechazado" },
];

function abrirPopupLista(kaizens, filtroInicial = "todos") {
  let filtro = filtroInicial;

  const chips = el("div", { class: "filtro-chips", role: "tablist" });
  const lista = el("div", {});
  const cerrarBtn = el("button", { class: "modal-close", type: "button", "aria-label": "Cerrar" }, ["✕"]);

  const overlay = el("div", { class: "modal-overlay" }, [
    el("div", { class: "modal modal-lg", role: "dialog", "aria-modal": "true" }, [
      el("div", { class: "modal-head" }, [el("h3", {}, [`Short Kaizen — ${nombrePeriodo()}`]), cerrarBtn]),
      chips,
      lista,
    ]),
  ]);

  const pintar = () => {
    chips.innerHTML = "";
    FILTROS.forEach((f) => {
      const n = f.grupo ? kaizens.filter((k) => estadoKaizen(k).grupo === f.grupo).length : kaizens.length;
      chips.appendChild(
        el(
          "button",
          { class: `filtro-chip${f.id === filtro ? " is-active" : ""}`, type: "button", role: "tab", "aria-selected": String(f.id === filtro), onclick: () => { filtro = f.id; pintar(); } },
          [`${f.label} (${n})`]
        )
      );
    });
    const grupo = FILTROS.find((f) => f.id === filtro).grupo;
    const visibles = (grupo ? kaizens.filter((k) => estadoKaizen(k).grupo === grupo) : kaizens)
      .slice()
      .sort((a, b) => (fechaCreacion(b)?.getTime() || 0) - (fechaCreacion(a)?.getTime() || 0));
    lista.innerHTML = "";
    lista.appendChild(buildList(visibles, (k) => abrirDetalle(k, { filtro })));
  };

  const cerrar = () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
  const onKey = (ev) => { if (ev.key === "Escape") cerrar(); };
  cerrarBtn.addEventListener("click", cerrar);
  overlay.addEventListener("click", (ev) => { if (ev.target === overlay) cerrar(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  pintar();
}

function buildStatsRow(kaizens) {
  const grupos = kaizens.map((k) => estadoKaizen(k).grupo);
  const counts = {
    total: kaizens.length,
    pendientes: grupos.filter((g) => g === "pendiente").length,
    aceptados: grupos.filter((g) => g === "aceptado").length,
    rechazados: grupos.filter((g) => g === "rechazado").length,
  };
  // [etiqueta, valor, filtro con el que se abre el popup]
  const items = [
    ["Short Kaizen creados", counts.total, "todos"],
    ["Pendientes de aprobación", counts.pendientes, "pendiente"],
    ["Aceptados", counts.aceptados, "aceptado"],
    ["Rechazados", counts.rechazados, "rechazado"],
  ];
  return el(
    "div",
    { class: "stats-row stats-row-4" },
    items.map(([label, value, filtro]) => {
      const abrir = () => abrirPopupLista(kaizens, filtro);
      return el(
        "div",
        {
          class: "kpi-card kpi-card-click",
          role: "button",
          tabindex: "0",
          title: "Ver el listado de estos Short Kaizen",
          onclick: abrir,
          onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrir(); } },
        },
        [el("div", { class: "kpi-label" }, [label]), el("div", { class: "kpi-value" }, [String(value)]), el("div", { class: "kpi-link" }, ["Ver listado ›"])]
      );
    })
  );
}

// Departamento de un equipo, misma lógica de prioridad que
// departamentoDeEquipo() en js/views/admin.js (duplicada aquí a propósito
// — este archivo no comparte módulos con admin.js — pero con el mismo
// orden de prioridad para no dar resultados distintos entre pantallas):
// 1) `departamentoId` directo si el backend ya lo trae (21.1, en camino),
// 2) `departamento` como string si viene así,
// 3) inferido cruzando el historial de Short Kaizen del equipo (los
//    kaizens sí traen `departamento`), marcado como estimado,
// 4) "Departamento sin clasificar" si no hay ninguna pista (equipo sin
//    kaizens todavía y sin `departamentoId`/`departamento`).
function departamentoDeEquipoLocal(eq, equipoDepartamentoCache) {
  if (eq.departamentoId) {
    // String() en ambos lados: el backend manda el id como número y el
    // catálogo puede traerlo como string (mismo bug que en admin.js, 31.1).
    const match = departamentosCache.find((d) => String(d.id) === String(eq.departamentoId));
    return match?.nombre || String(eq.departamentoId);
  }
  if (eq.departamento) return eq.departamento;
  return equipoDepartamentoCache[eq.nombre] || null;
}

// ---- Gráfica de SK creados, con drill-down según el rol ---------------------

const COLORES_DEPTO = [
  [/extru/, "#1e40af"],
  [/prueba/, "#0284c7"],
  [/mantenimiento/, "#0e7490"],
  [/impresi/, "#b91c1c"],
  [/bolseo/, "#15803d"],
];
const COLOR_MARCA = "#0D18A8";
const COLOR_DEPTO_RESTO = ["#4f5fd5", "#227EF6", "#64748b", "#94a3b8", "#0D18A8"];

function colorDepto(nombre, i) {
  const n = String(nombre).toLowerCase();
  const fijo = COLORES_DEPTO.find(([re]) => re.test(n));
  return fijo ? fijo[1] : COLOR_DEPTO_RESTO[i % COLOR_DEPTO_RESTO.length];
}

// Nivel de arranque según el rol: mc/admin → departamentos; gerente o quien ve
// varios equipos → equipos; integrante/líder de un solo equipo → personas.
function inicioGrafica(alcance) {
  const rol = (state.user || {}).rol;
  if (rol === "mc" || rol === "admin") return "deptos";
  if (rol === "gerente" || alcance.equiposVisibles.length > 1) return "equipos";
  return "personas";
}

function barrasDeGrafica(alcance) {
  const user = state.user || {};
  const { tablero, equipos, departamentos } = datosGrafica;
  const sk = tablero.filter(enPeriodo);
  const deptoDe = crearResolvedorDeptoCreador(equipos, departamentos, tablero);
  const cacheDepto = {};
  tablero.forEach((k) => {
    const d = k.departamentoSolicitante || k.departamento;
    if (k.equipo && d) cacheDepto[k.equipo] = d;
  });
  const deptoDeEquipo = (eq) => departamentoDeEquipoLocal(eq, cacheDepto);
  const skDeEquipo = (nombre) => sk.filter((k) => k.equipo && claveEquipo(k.equipo) === claveEquipo(nombre));
  const ultimo = rutaGrafica[rutaGrafica.length - 1];
  const inicio = inicioGrafica(alcance);

  // Personas de un equipo (o de "sin equipo" de un departamento): integrantes
  // del catálogo + quien haya creado SK ahí aunque ya no figure como miembro.
  const personas = (miembros, skPersonas) => {
    const mapa = new Map();
    (miembros || []).forEach((m) => mapa.set(String(m.nomina), { label: m.nombre || String(m.nomina), value: 0 }));
    skPersonas.forEach((k) => {
      const id = String(k.nomina || k.nombre);
      if (!mapa.has(id)) mapa.set(id, { label: k.nombre || id, value: 0 });
      mapa.get(id).value += 1;
    });
    return [...mapa.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es"));
  };

  const barrasEquipos = (listaEquipos, deptoNombre) => {
    const vistos = new Set();
    const bars = listaEquipos
      .filter((eq) => (vistos.has(claveEquipo(eq.nombre)) ? false : (vistos.add(claveEquipo(eq.nombre)), true)))
      .map((eq) => ({ label: eq.nombre, value: skDeEquipo(eq.nombre).length, siguiente: { tipo: "equipo", valor: eq.nombre, depto: deptoNombre } }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es"));
    if (deptoNombre) {
      const sinEquipo = sk.filter((k) => !k.equipo && deptoDe(k) && claveEquipo(deptoDe(k)) === claveEquipo(deptoNombre)).length;
      if (sinEquipo) bars.push({ label: "Sin equipo", value: sinEquipo, siguiente: { tipo: "equipo", valor: SIN_EQUIPO, depto: deptoNombre } });
    }
    return bars;
  };

  // --- Nivel actual ---
  if (ultimo?.tipo === "equipo") {
    if (ultimo.valor === SIN_EQUIPO) {
      const delDepto = sk.filter((k) => !k.equipo && deptoDe(k) && claveEquipo(deptoDe(k)) === claveEquipo(ultimo.depto));
      return { titulo: `Sin equipo — ${ultimo.depto}`, bars: personas([], delDepto), color: COLOR_MARCA, unidad: "persona" };
    }
    const eq = equipos.find((e) => claveEquipo(e.nombre) === claveEquipo(ultimo.valor));
    return { titulo: ultimo.valor, bars: personas(eq?.miembros, skDeEquipo(ultimo.valor)), color: COLOR_MARCA, unidad: "persona" };
  }
  if (ultimo?.tipo === "depto") {
    const delDepto = equipos.filter((eq) => deptoDeEquipo(eq) && claveEquipo(deptoDeEquipo(eq)) === claveEquipo(ultimo.valor));
    return { titulo: ultimo.valor, bars: barrasEquipos(delDepto, ultimo.valor), color: COLOR_MARCA, unidad: "equipo" };
  }
  // Raíz
  if (inicio === "deptos") {
    const porDepto = new Map();
    equipos.forEach((eq) => {
      const nombre = deptoDeEquipo(eq) || "Sin clasificar";
      if (!porDepto.has(claveEquipo(nombre))) porDepto.set(claveEquipo(nombre), nombre);
    });
    const bars = [...porDepto.values()].map((nombre) => ({
      label: nombre,
      value: sk.filter((k) => (deptoDe(k) ? claveEquipo(deptoDe(k)) === claveEquipo(nombre) : claveEquipo(nombre) === claveEquipo("Sin clasificar"))).length,
      siguiente: { tipo: "depto", valor: nombre },
    }));
    const sinClasificar = sk.filter((k) => !deptoDe(k)).length;
    if (sinClasificar && !porDepto.has(claveEquipo("Sin clasificar"))) bars.push({ label: "Sin clasificar", value: sinClasificar, siguiente: null });
    bars.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es"));
    bars.forEach((b, i) => { b.color = colorDepto(b.label, i); });
    return { titulo: "Departamentos", bars, color: null, unidad: "departamento" };
  }
  if (inicio === "equipos") {
    return { titulo: "Equipos", bars: barrasEquipos(alcance.equiposVisibles, null), color: COLOR_MARCA, unidad: "equipo" };
  }
  // Integrante / líder de un solo equipo (o integrante sin equipo)
  const eq = alcance.equiposVisibles[0];
  if (eq) return { titulo: eq.nombre, bars: personas(eq.miembros, skDeEquipo(eq.nombre)), color: COLOR_MARCA, unidad: "persona" };
  const propios = sk.filter((k) => String(k.nomina) === String(user.nomina));
  return { titulo: "Mis Short Kaizen", bars: [{ label: user.nombre || String(user.nomina), value: propios.length }], color: COLOR_MARCA, unidad: "persona" };
}

function buildGraficaCard(container, alcance) {
  const nivel = barrasDeGrafica(alcance);
  const inicio = inicioGrafica(alcance);
  const raizLabel = inicio === "deptos" ? "Departamentos" : inicio === "equipos" ? "Equipos" : null;

  // Migas de pan: Departamentos › Depto › Equipo (o Equipos › Equipo).
  const migas = [];
  if (raizLabel) {
    migas.push({ label: raizLabel, ruta: [] });
    rutaGrafica.forEach((paso, i) => migas.push({ label: paso.valor === SIN_EQUIPO ? "Sin equipo" : paso.valor, ruta: rutaGrafica.slice(0, i + 1) }));
  }
  const migasEl = el(
    "div",
    { class: "grafica-migas" },
    migas.flatMap((m, i) => {
      const esUltima = i === migas.length - 1;
      const parte = esUltima
        ? el("span", { class: "grafica-miga is-actual" }, [m.label])
        : el("button", { class: "grafica-miga", type: "button", onclick: () => { rutaGrafica = m.ruta; paint(container); } }, [m.label]);
      return esUltima ? [parte] : [parte, el("span", { class: "grafica-sep" }, ["›"])];
    })
  );

  const total = nivel.bars.reduce((sum, b) => sum + b.value, 0);
  const hayDrill = nivel.bars.some((b) => b.siguiente);
  const subtitulo = `${total} Short Kaizen creados — ${nombrePeriodo()}` + (hayDrill ? ` · Haz clic en un ${nivel.unidad} para ver el detalle` : "");

  const ancho = Math.max(0, nivel.bars.length * 68);
  const canvas = el("canvas");
  const inner = el("div", { class: "grafica-inner", style: `min-width:${ancho}px` }, [canvas]);
  const wrap = el("div", { class: "grafica-scroll" }, [inner]);

  const card = el("div", { class: "card grafica-card" }, [
    el("div", { class: "grafica-head" }, [
      el("div", {}, [el("h3", {}, [`SK creados — ${nivel.titulo}`]), el("p", { class: "hint" }, [subtitulo])]),
      rutaGrafica.length
        ? el("button", { class: "btn btn-outline btn-sm", type: "button", onclick: () => { rutaGrafica = rutaGrafica.slice(0, -1); paint(container); } }, ["‹ Atrás"])
        : null,
    ]),
    migas.length > 1 ? migasEl : null,
    nivel.bars.length ? wrap : el("p", { class: "hint" }, ["No hay datos para mostrar."]),
  ]);

  if (nivel.bars.length) dibujarGrafica(canvas, nivel, container);
  return card;
}

async function dibujarGrafica(canvas, nivel, container) {
  let Chart;
  try {
    Chart = await loadChartJs();
  } catch (err) {
    console.error("[mis-kaizens] No se pudo cargar Chart.js:", err);
    canvas.replaceWith(el("p", { class: "hint" }, ["No se pudo cargar la librería de gráficas. Recarga la página; si persiste, avisa a soporte."]));
    return;
  }
  if (!canvas.isConnected) return; // la pantalla se repintó mientras cargaba la librería
  const etiquetas = nivel.bars.map((b) => b.label);
  const colores = nivel.bars.map((b) => b.color || nivel.color || COLOR_MARCA);
  // Número encima de cada columna (sin plugin externo).
  const valorEncima = {
    id: "valorEncima",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = "600 12px Poppins, 'Segoe UI', sans-serif";
      ctx.fillStyle = getComputedStyle(document.body).color || "#1f2937";
      ctx.textAlign = "center";
      chart.getDatasetMeta(0).data.forEach((bar, i) => ctx.fillText(String(nivel.bars[i].value), bar.x, bar.y - 6));
      ctx.restore();
    },
  };
  try {
    chartInstance = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels: etiquetas, datasets: [{ data: nivel.bars.map((b) => b.value), backgroundColor: colores, borderRadius: 4, maxBarThickness: 56 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 20 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y} SK creados` } } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "SK creados" } },
          x: {
            ticks: {
              autoSkip: false,
              maxRotation: 50,
              callback(value) {
                const l = this.getLabelForValue(value);
                return l.length > 22 ? `${l.slice(0, 21)}…` : l;
              },
            },
          },
        },
        onClick: (_evt, els) => {
          const b = els.length ? nivel.bars[els[0].index] : null;
          // Se repinta fuera del evento: destruir la gráfica dentro de su propio
          // onClick hace que Chart.js lance "handleEvent of undefined".
          if (b?.siguiente) setTimeout(() => { rutaGrafica = [...rutaGrafica, b.siguiente]; paint(container); }, 0);
        },
        onHover: (evt, els) => {
          const b = els.length ? nivel.bars[els[0].index] : null;
          if (evt.native?.target) evt.native.target.style.cursor = b?.siguiente ? "pointer" : "default";
        },
      },
      plugins: [valorEncima],
    });
  } catch (err) {
    console.error("[mis-kaizens] Error al dibujar la gráfica:", err);
    canvas.replaceWith(el("p", { class: "hint" }, ["No se pudo dibujar la gráfica."]));
  }
}

function buildList(kaizens, onOpen) {
  const filtered = kaizens;
  if (!filtered.length) {
    return el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, ["📭"]),
      el("h3", {}, ["Sin Short Kaizen"]),
      el("p", {}, ["Aún no hay kaizens para mostrar aquí."]),
    ]);
  }
  // Pedido de Javier (sept. 2026): al filtrar por un equipo (clic en su
  // tarjeta), este listado debe dejar ver con claridad 3 datos de cada
  // Short Kaizen — quién lo creó, su descripción breve, y su estatus. Se
  // amplió para todos los usos de buildList() (no solo el filtrado por
  // equipo), ya que es la misma información útil en cualquier contexto
  // donde se muestra esta lista (solicitante/líder sin mosaico también se
  // benefician de ver la descripción breve de un vistazo).
  return el(
    "div",
    { class: "kaizen-list" },
    filtered.map((k) => {
      const meta = estadoKaizen(k);
      return el(
        "div",
        {
          class: "kaizen-row",
          onclick: () => onOpen(k),
        },
        [
          el("div", { class: "kr-main" }, [
            el("div", { class: "kr-title" }, [`SK-${shortId(k.id)} · ${k.areaLinea || k.donde || "—"}`]),
            el("div", { class: "kr-sub" }, [`Creado por ${k.nombre || "—"} (${k.nomina || "—"}) · ${k.equipo || "Sin equipo"} · ${formatDate(k.fechaId)}`]),
            k.breveDescripcion ? el("div", { class: "kr-desc" }, [k.breveDescripcion]) : null,
          ].filter(Boolean)),
          el("span", { class: `badge ${meta.badge}` }, [meta.label]),
        ]
      );
    })
  );
}

export function unmount() {
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
}
