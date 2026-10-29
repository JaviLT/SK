// ============================================================================
// todos-sk.js — Pantalla "Todos los SK" (pedido de Javier, oct. 2026).
//
// Lista de TODOS los Short Kaizen creados, para ver rápido todo sin ir equipo
// por equipo en "Mis Kaizens". Solo Mejora Continua (mc) y administrador.
// Filtros: estatus, departamento, mes y año. Mes y año filtran por la FECHA DE
// CREACIÓN del SK (`creadoEn`, o `fechaId` si faltara). Al abrir un SK y
// regresar con "Volver" del detalle, se conservan los filtros.
// ============================================================================

import { el, formatDate, shortId } from "../utils.js";
import { api } from "../api.js";
import { state, setState } from "../state.js";
import { claveEquipo } from "../lib/historico-sk.js";

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const CLAVE_FILTROS = "sk_todos_filtros";
const POR_PAGINA = 50;

// Mismo modelo de estatus que Mis Kaizens (`status` es la fuente de verdad).
function estadoKaizen(k) {
  const nombres = { aprobacion1: "Mejora Continua", aprobacion2: k.nombreAprobacion2 || "Aprobación 2", aprobacion3: k.nombreAprobacion3 || "Aprobación 3" };
  if (k.status === "done") return { label: "Aceptado", badge: "badge-done", grupo: "aceptado", paso: null };
  const m = /^(pend|rej)_(aprobacion[123])$/.exec(k.status || "");
  if (!m) return { label: k.status || "—", badge: "badge-nuevo", grupo: "pendiente", paso: null };
  const [, tipo, paso] = m;
  if (tipo === "rej") return { label: `Rechazado (${nombres[paso]})`, badge: "badge-rej", grupo: "rechazado", paso };
  return { label: `Pend. ${nombres[paso]}`, badge: "badge-pend", grupo: "pendiente", paso };
}

function fechaCreacion(k) {
  const d = new Date(k.creadoEn || k.fechaId || "");
  return Number.isNaN(d.getTime()) ? null : d;
}

const ESTATUS_OPCIONES = [
  ["todos", "Todos"],
  ["pendiente", "Pendientes (todos los pasos)"],
  ["pend_aprobacion1", "Pendiente: Mejora Continua"],
  ["pend_aprobacion2", "Pendiente: Aprobación 2"],
  ["pend_aprobacion3", "Pendiente: Aprobación 3"],
  ["aceptado", "Aceptados"],
  ["rechazado", "Rechazados"],
];

function coincideEstatus(k, filtro) {
  if (filtro === "todos") return true;
  const e = estadoKaizen(k);
  if (filtro === "pendiente" || filtro === "aceptado" || filtro === "rechazado") return e.grupo === filtro;
  return k.status === filtro;
}

let filtros = { estatus: "todos", depto: "todos", mes: "todos", anio: String(new Date().getFullYear()) };
let visibles = POR_PAGINA;

function leerFiltrosGuardados() {
  try {
    const raw = sessionStorage.getItem(CLAVE_FILTROS);
    const restaurar = sessionStorage.getItem("sk_todos_restaurar") === "1";
    sessionStorage.removeItem(CLAVE_FILTROS);
    sessionStorage.removeItem("sk_todos_restaurar");
    return restaurar && raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function render(container, params, isStale) {
  const view = el("div", { class: "view", id: "todos-sk-view" });
  container.appendChild(view);

  const user = state.user || {};
  if (!["mc", "admin"].includes(user.rol)) {
    view.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "icon" }, ["🔒"]),
        el("h3", {}, ["No tienes acceso a esta pantalla"]),
        el("p", {}, ["Todos los SK solo lo ven Mejora Continua y el administrador."]),
      ])
    );
    return;
  }

  view.appendChild(el("div", { class: "skeleton", style: "height:300px" }));
  try {
    const [kaizens, departamentosRaw] = await Promise.all([api.getKaizens(), api.getDepartamentos().catch(() => [])]);
    if (isStale && isStale()) return;
    setState({ kaizens });
    const departamentos = (departamentosRaw || []).map((d) => (typeof d === "string" ? d : d.nombre)).filter(Boolean);
    const guardados = leerFiltrosGuardados();
    filtros = { estatus: "todos", depto: "todos", mes: "todos", anio: String(new Date().getFullYear()), ...(guardados || {}) };
    visibles = POR_PAGINA;
    paint(view, kaizens, departamentos);
  } catch (err) {
    if (isStale && isStale()) return;
    view.innerHTML = "";
    view.appendChild(el("div", { class: "empty-state" }, [el("div", { class: "icon" }, ["⚠️"]), el("p", {}, [err.message || "No se pudo cargar la lista."])]));
  }
}

function paint(view, kaizens, departamentos) {
  view.innerHTML = "";
  const repintar = () => { visibles = POR_PAGINA; paint(view, kaizens, departamentos); };

  // Opciones de departamento: catálogo + los que aparezcan en los SK (sin repetir).
  const deptos = new Map();
  [...departamentos, ...kaizens.map((k) => k.departamento)].filter(Boolean).forEach((d) => {
    if (!deptos.has(claveEquipo(d))) deptos.set(claveEquipo(d), d);
  });
  const opcionesDepto = [...deptos.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));

  const anios = new Set([new Date().getFullYear()]);
  kaizens.forEach((k) => { const d = fechaCreacion(k); if (d) anios.add(d.getFullYear()); });

  const select = (etiqueta, valor, opciones, onChange, ancho) =>
    el("div", { class: "field", style: "margin-bottom:0" }, [
      el("label", {}, [etiqueta]),
      el(
        "select",
        { class: "select", style: `min-width:${ancho}px`, onchange: (e) => onChange(e.target.value) },
        opciones.map(([v, t]) => el("option", { value: v, selected: v === valor || undefined }, [t]))
      ),
    ]);

  // Filtrado
  const filtrados = kaizens
    .filter((k) => {
      if (!coincideEstatus(k, filtros.estatus)) return false;
      if (filtros.depto !== "todos" && claveEquipo(k.departamento) !== filtros.depto) return false;
      const d = fechaCreacion(k);
      if (filtros.anio !== "todos" && (!d || String(d.getFullYear()) !== filtros.anio)) return false;
      if (filtros.mes !== "todos" && (!d || String(d.getMonth() + 1) !== filtros.mes)) return false;
      return true;
    })
    .sort((a, b) => (fechaCreacion(b)?.getTime() || 0) - (fechaCreacion(a)?.getTime() || 0));

  view.appendChild(
    el("div", { class: "view-header" }, [
      el("div", {}, [el("h1", {}, ["Todos los SK"]), el("p", {}, ["Todos los Short Kaizen creados, con filtros por estatus, departamento, mes y año"])]),
    ])
  );

  view.appendChild(
    el("div", { class: "todos-filtros" }, [
      select("Estatus", filtros.estatus, ESTATUS_OPCIONES, (v) => { filtros.estatus = v; repintar(); }, 210),
      select("Departamento", filtros.depto, [["todos", "Todos"], ...opcionesDepto.map(([c, n]) => [c, n])], (v) => { filtros.depto = v; repintar(); }, 200),
      select("Mes", filtros.mes, [["todos", "Todos los meses"], ...MESES.map((m, i) => [String(i + 1), m])], (v) => { filtros.mes = v; repintar(); }, 160),
      select("Año", filtros.anio, [["todos", "Todos los años"], ...[...anios].sort((a, b) => b - a).map((y) => [String(y), String(y)])], (v) => { filtros.anio = v; repintar(); }, 130),
      el(
        "button",
        {
          class: "btn btn-outline btn-sm",
          type: "button",
          onclick: () => { filtros = { estatus: "todos", depto: "todos", mes: "todos", anio: String(new Date().getFullYear()) }; repintar(); },
        },
        ["Limpiar filtros"]
      ),
    ])
  );

  view.appendChild(el("p", { class: "hint", style: "margin:10px 0 8px" }, [`${filtrados.length} Short Kaizen${filtrados.length === 1 ? "" : "s"}`]));

  if (!filtrados.length) {
    view.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "icon" }, ["📭"]),
        el("h3", {}, ["Sin Short Kaizen"]),
        el("p", {}, ["No hay SK con esos filtros."]),
      ])
    );
    return;
  }

  const abrir = (k) => {
    try { sessionStorage.setItem(CLAVE_FILTROS, JSON.stringify(filtros)); } catch { /* sin storage */ }
    window.location.href = `detalle.html?id=${encodeURIComponent(k.id)}&from=todos-sk`;
  };

  const filas = filtrados.slice(0, visibles).map((k) => {
    const e = estadoKaizen(k);
    return el("tr", { class: "todos-fila", tabindex: "0", onclick: () => abrir(k), onkeydown: (ev) => { if (ev.key === "Enter") abrir(k); } }, [
      el("td", { class: "td-folio" }, [`SK-${shortId(k.id)}`]),
      el("td", {}, [formatDate(fechaCreacion(k))]),
      el("td", {}, [k.equipo || "Sin equipo"]),
      el("td", {}, [k.departamento || "—"]),
      el("td", {}, [`${k.nombre || "—"}`, el("div", { class: "hint" }, [k.nomina || ""])]),
      el("td", { class: "td-desc" }, [k.breveDescripcion || "—"]),
      el("td", {}, [el("span", { class: `badge ${e.badge}` }, [e.label])]),
    ]);
  });

  view.appendChild(
    el("div", { class: "todos-tabla-wrap" }, [
      el("table", { class: "todos-tabla" }, [
        el("thead", {}, [el("tr", {}, ["Folio", "Creado", "Equipo", "Departamento", "Creado por", "Descripción", "Estatus"].map((t) => el("th", {}, [t])))]),
        el("tbody", {}, filas),
      ]),
    ])
  );

  if (filtrados.length > visibles) {
    view.appendChild(
      el("div", { style: "text-align:center;margin-top:14px" }, [
        el(
          "button",
          { class: "btn btn-outline", type: "button", onclick: () => { visibles += POR_PAGINA; paint(view, kaizens, departamentos); } },
          [`Mostrar más (${filtrados.length - visibles} restantes)`]
        ),
      ])
    );
  }
}

export function unmount() {}
