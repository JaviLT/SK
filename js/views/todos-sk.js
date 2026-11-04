// ============================================================================
// todos-sk.js — Pantalla "Todos los SK" (pedido de Javier, oct. 2026).
//
// Lista de los Short Kaizen creados, para ver rápido todo sin ir equipo por
// equipo en "Mis Kaizens". Nov. 2026: la ve TODO el mundo, pero cada persona
// solo ve los SK de SU departamento; Mejora Continua (mc) y administrador ven
// todos los departamentos. El departamento de un SK es el de QUIEN LO CREÓ
// (lib/depto-creador.js), con el de aplicación solo como último recurso.
// Filtros: estatus, departamento (solo mc/admin), equipo, mes y año. Mes y año filtran por la FECHA DE
// CREACIÓN del SK (`creadoEn`, o `fechaId` si faltara). Al abrir un SK y
// regresar con "Volver" del detalle, se conservan los filtros.
// ============================================================================

import { el, formatDate, shortId } from "../utils.js";
import { api } from "../api.js";
import { state, setState } from "../state.js";
import { claveEquipo } from "../lib/historico-sk.js";
import { crearResolvedorDeptoCreador, departamentoDeEquipo } from "../lib/depto-creador.js";

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

const SIN_EQUIPO = "__sin_equipo__";
const filtrosIniciales = () => ({ estatus: "todos", depto: "todos", equipo: "todos", mes: "todos", anio: String(new Date().getFullYear()) });
let filtros = filtrosIniciales();
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
  view.appendChild(el("div", { class: "skeleton", style: "height:300px" }));
  try {
    const [kaizensRaw, equipos, departamentosRaw] = await Promise.all([
      api.getKaizensTablero(),
      api.getEquipos().catch(() => []),
      api.getDepartamentos().catch(() => []),
    ]);
    if (isStale && isStale()) return;
    const departamentosObj = (departamentosRaw || []).map((d) => (typeof d === "string" ? { id: d, nombre: d } : d));
    const departamentos = departamentosObj.map((d) => d.nombre).filter(Boolean);

    // Departamento de cada SK = el de quien lo creó (con respaldo al de aplicación).
    const deptoDe = crearResolvedorDeptoCreador(equipos, departamentosObj, kaizensRaw, { fallbackAplicacion: true });
    const todosLosSk = kaizensRaw.map((k) => ({ ...k, _depto: deptoDe(k) }));

    // Mejora Continua y admin ven todo; el resto, solo su departamento.
    const verTodo = ["mc", "admin"].includes(user.rol);
    let kaizens = todosLosSk;
    let deptosPermitidos = null;
    if (!verTodo) {
      const propios = String(user.departamento || "").split(/[,;|]/).map((d) => d.trim()).filter(Boolean);
      const eqUsuario = (equipos || []).find((eq) => eq.nombre === user.equipo);
      const deEquipo = eqUsuario ? departamentoDeEquipo(eqUsuario, departamentosObj, {}) : null;
      deptosPermitidos = new Set([...propios, deEquipo].filter(Boolean).map(claveEquipo));
      kaizens = todosLosSk.filter((k) => k._depto && deptosPermitidos.has(claveEquipo(k._depto)));
    }

    setState({ kaizens });
    const guardados = leerFiltrosGuardados();
    filtros = { ...filtrosIniciales(), ...(guardados || {}) };
    visibles = POR_PAGINA;
    const ctx = { verTodo, deptosPermitidos, nombreDepto: String(user.departamento || user.equipo || "tu departamento") };
    paint(view, kaizens, departamentos, ctx);
  } catch (err) {
    if (isStale && isStale()) return;
    view.innerHTML = "";
    view.appendChild(el("div", { class: "empty-state" }, [el("div", { class: "icon" }, ["⚠️"]), el("p", {}, [err.message || "No se pudo cargar la lista."])]));
  }
}

function paint(view, kaizens, departamentos, ctx) {
  view.innerHTML = "";
  const repintar = () => { visibles = POR_PAGINA; paint(view, kaizens, departamentos, ctx); };

  // Opciones de departamento: catálogo + los que aparezcan en los SK (sin repetir).
  const deptos = new Map();
  [...(ctx.verTodo ? departamentos : []), ...kaizens.map((k) => k._depto)].filter(Boolean).forEach((d) => {
    if (!deptos.has(claveEquipo(d))) deptos.set(claveEquipo(d), d);
  });
  const opcionesDepto = [...deptos.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));

  // Opciones de equipo: los que aparecen en los SK (del departamento elegido, si hay uno).
  const equiposOpc = new Map();
  let haySinEquipo = false;
  kaizens.forEach((k) => {
    if (filtros.depto !== "todos" && claveEquipo(k._depto) !== filtros.depto) return;
    if (!k.equipo) { haySinEquipo = true; return; }
    if (!equiposOpc.has(claveEquipo(k.equipo))) equiposOpc.set(claveEquipo(k.equipo), k.equipo);
  });
  const opcionesEquipo = [...equiposOpc.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  if (filtros.equipo !== "todos" && filtros.equipo !== SIN_EQUIPO && !equiposOpc.has(filtros.equipo)) filtros.equipo = "todos";
  if (filtros.equipo === SIN_EQUIPO && !haySinEquipo) filtros.equipo = "todos";

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
      if (filtros.depto !== "todos" && claveEquipo(k._depto) !== filtros.depto) return false;
      if (filtros.equipo === SIN_EQUIPO ? Boolean(k.equipo) : filtros.equipo !== "todos" && claveEquipo(k.equipo) !== filtros.equipo) return false;
      const d = fechaCreacion(k);
      if (filtros.anio !== "todos" && (!d || String(d.getFullYear()) !== filtros.anio)) return false;
      if (filtros.mes !== "todos" && (!d || String(d.getMonth() + 1) !== filtros.mes)) return false;
      return true;
    })
    .sort((a, b) => (fechaCreacion(b)?.getTime() || 0) - (fechaCreacion(a)?.getTime() || 0));

  view.appendChild(
    el("div", { class: "view-header" }, [
      el("div", {}, [el("h1", {}, ["Todos los SK"]), el("p", {}, [ctx.verTodo ? "Todos los Short Kaizen creados, con filtros por estatus, departamento, equipo, mes y año" : `Short Kaizen de tu departamento (${ctx.nombreDepto}), con filtros por estatus, equipo, mes y año`])]),
    ])
  );

  view.appendChild(
    el("div", { class: "todos-filtros" }, [
      select("Estatus", filtros.estatus, ESTATUS_OPCIONES, (v) => { filtros.estatus = v; repintar(); }, 210),
      ctx.verTodo ? select("Departamento", filtros.depto, [["todos", "Todos"], ...opcionesDepto.map(([c, n]) => [c, n])], (v) => { filtros.depto = v; repintar(); }, 200) : null,
      select("Equipo", filtros.equipo, [["todos", "Todos"], ...opcionesEquipo.map(([c, n]) => [c, n]), ...(haySinEquipo ? [[SIN_EQUIPO, "Sin equipo"]] : [])], (v) => { filtros.equipo = v; repintar(); }, 200),
      select("Mes", filtros.mes, [["todos", "Todos los meses"], ...MESES.map((m, i) => [String(i + 1), m])], (v) => { filtros.mes = v; repintar(); }, 160),
      select("Año", filtros.anio, [["todos", "Todos los años"], ...[...anios].sort((a, b) => b - a).map((y) => [String(y), String(y)])], (v) => { filtros.anio = v; repintar(); }, 130),
      el(
        "button",
        {
          class: "btn btn-outline btn-sm",
          type: "button",
          onclick: () => { filtros = filtrosIniciales(); repintar(); },
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
        el("p", {}, [kaizens.length ? "No hay SK con esos filtros." : ctx.verTodo ? "Todavía no hay Short Kaizen." : "Todavía no hay Short Kaizen de tu departamento."]),
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
      el("td", {}, [k._depto || "—"]),
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
          { class: "btn btn-outline", type: "button", onclick: () => { visibles += POR_PAGINA; paint(view, kaizens, departamentos, ctx); } },
          [`Mostrar más (${filtrados.length - visibles} restantes)`]
        ),
      ])
    );
  }
}

export function unmount() {}
