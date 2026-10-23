// ============================================================================
// gemba4.js — Sección "GEMBA 4" (pedido de Javier, oct. 2026).
//
// Hoja de resultados de Short Kaizen del mes, lista para imprimir en tamaño
// CARTA HORIZONTAL: KPIs (SK implementados, meta, % cumplimiento, persona con
// más SK), avance por departamento contra la meta y pendientes de aprobación
// por departamento. Solo la ven Mejora Continua (mc) y el administrador.
//
// Reglas de negocio (mismas del Tablero general, ver dashboard.js):
//   - Meta por equipo: 4 SK al mes → meta de un departamento = 4 × sus equipos.
//   - SK implementados de un equipo en el mes: histórico de Mejora Continua si
//     trae dato (ene–sep 2026), si no los SK `done` de la app por `fechaImpl`
//     (lib/historico-sk.js → conteoEquipoMes).
//   - Pendientes: SK en `pend_aprobacion1/2/3` a la fecha (no dependen del mes).
//   - Persona con más SK: solo SK registrados en la app (el histórico no trae
//     detalle por persona).
//
// Impresión: el cuerpo es una "hoja" fija de 11 × 8.5 in (carta horizontal) que
// en pantalla se escala al ancho disponible y al imprimir (@page en
// css/views.css) sale a tamaño real, sin menús ni controles.
// ============================================================================

import { el, formatDate } from "../utils.js";
import { api } from "../api.js";
import { state } from "../state.js";
import { META_SK_POR_EQUIPO_MES } from "../lib/mock-backend.js";
import { cargarHistorico, claveEquipo, conteoEquipoMes } from "../lib/historico-sk.js";

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const HOJA_W = 1056; // 11 in a 96 dpi
const HOJA_H = 816; // 8.5 in a 96 dpi

// Colores por departamento: los categóricos del Manual de Estandarización de
// Reportes IA (misma categoría = mismo color siempre); el resto cae en tonos
// de la paleta de marca.
const COLORES_DEPTO = [
  [/extru/, "#1e40af"],
  [/prueba/, "#0284c7"],
  [/mantenimiento/, "#0e7490"],
  [/impresi/, "#b91c1c"],
  [/bolseo/, "#15803d"],
];
const COLORES_RESTO = ["#4f5fd5", "#227EF6", "#64748b", "#94a3b8", "#0D18A8"];

let anioSel = new Date().getFullYear();
let mesSel = new Date().getMonth() + 1;

export async function render(container, params, isStale) {
  const view = el("div", { class: "view gemba-view", id: "gemba4-view" });
  container.appendChild(view);

  const user = state.user || {};
  if (!["mc", "admin"].includes(user.rol)) {
    view.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "icon" }, ["🔒"]),
        el("h3", {}, ["No tienes acceso a esta pantalla"]),
        el("p", {}, ["GEMBA 4 solo la ven Mejora Continua y el administrador."]),
      ])
    );
    return;
  }

  view.appendChild(el("div", { class: "skeleton", style: "height:400px" }));
  try {
    const [equipos, kaizens, departamentosRaw, historico] = await Promise.all([
      api.getEquipos(),
      api.getKaizens(),
      api.getDepartamentos().catch(() => []),
      cargarHistorico(),
    ]);
    if (isStale && isStale()) return;
    const departamentos = (departamentosRaw || []).map((d) => (typeof d === "string" ? { id: d, nombre: d } : d));
    const datos = { equipos, kaizens, departamentos, historico };
    paint(view, datos);
    window.addEventListener("resize", () => ajustarEscala(view));
  } catch (err) {
    if (isStale && isStale()) return;
    view.innerHTML = "";
    view.appendChild(el("div", { class: "empty-state" }, [el("div", { class: "icon" }, ["⚠️"]), el("p", {}, [err.message || "No se pudo cargar GEMBA 4."])]));
  }
}

// ---- Datos del periodo ------------------------------------------------------

function nombreDepartamentoDeEquipo(eq, departamentos, cacheKaizens) {
  if (eq.departamentoId) {
    const match = departamentos.find((d) => String(d.id) === String(eq.departamentoId));
    if (match?.nombre) return match.nombre;
  }
  if (eq.departamento) return eq.departamento;
  return cacheKaizens[eq.nombre] || null;
}

function calcular({ equipos, kaizens, departamentos, historico }) {
  // equipo -> departamento inferido del historial de SK (si el catálogo no lo trae)
  const cacheKaizens = {};
  kaizens.forEach((k) => {
    if (k.equipo && k.departamento) cacheKaizens[k.equipo] = k.departamento;
  });

  const porDepto = new Map(); // clave -> { nombre, equipos[], implementados, meta, pendientes }
  const asegurar = (nombre) => {
    const clave = claveEquipo(nombre);
    if (!porDepto.has(clave)) porDepto.set(clave, { nombre, equipos: [], implementados: 0, meta: 0, pendientes: 0 });
    return porDepto.get(clave);
  };

  equipos.forEach((eq) => {
    const d = asegurar(nombreDepartamentoDeEquipo(eq, departamentos, cacheKaizens) || "Sin clasificar");
    d.equipos.push(eq.nombre);
    d.meta += META_SK_POR_EQUIPO_MES;
    d.implementados += conteoEquipoMes(historico, kaizens, eq.nombre, anioSel, mesSel);
  });

  // Pendientes de aprobación (estado actual), por departamento del SK.
  const equipoADepto = new Map(equipos.map((eq) => [claveEquipo(eq.nombre), claveEquipo(nombreDepartamentoDeEquipo(eq, departamentos, cacheKaizens) || "Sin clasificar")]));
  let pendSinClasificar = 0;
  kaizens
    .filter((k) => /^pend_aprobacion[123]$/.test(k.status || ""))
    .forEach((k) => {
      const claveDepto = k.departamento ? claveEquipo(k.departamento) : equipoADepto.get(claveEquipo(k.equipo));
      const d = claveDepto && porDepto.get(claveDepto);
      if (d) d.pendientes += 1;
      else pendSinClasificar += 1;
    });

  const deptos = [...porDepto.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  // Persona con más SK en el mes (solo app).
  const conteoPersona = new Map();
  kaizens
    .filter((k) => {
      if (k.status !== "done" || !k.fechaImpl) return false;
      const f = new Date(k.fechaImpl);
      return f.getFullYear() === anioSel && f.getMonth() + 1 === mesSel;
    })
    .forEach((k) => {
      const id = k.nomina || k.nombre;
      const cur = conteoPersona.get(id) || { nombre: k.nombre, departamento: k.departamento, n: 0 };
      cur.n += 1;
      conteoPersona.set(id, cur);
    });
  const top = [...conteoPersona.values()].sort((a, b) => b.n - a.n)[0] || null;

  const totalImpl = deptos.reduce((s, d) => s + d.implementados, 0);
  const totalMeta = deptos.reduce((s, d) => s + d.meta, 0);
  const totalPend = deptos.reduce((s, d) => s + d.pendientes, 0) + pendSinClasificar;
  return { deptos, totalImpl, totalMeta, totalPend, pendSinClasificar, top };
}

function colorDepto(nombre, idx) {
  const n = String(nombre).toLowerCase();
  const fijo = COLORES_DEPTO.find(([re]) => re.test(n));
  return fijo ? fijo[1] : COLORES_RESTO[idx % COLORES_RESTO.length];
}

// ---- Pintado ----------------------------------------------------------------

function paint(view, datos) {
  view.innerHTML = "";
  const r = calcular(datos);

  const anios = new Set([new Date().getFullYear(), ...Object.keys(datos.historico).map(Number)]);
  datos.kaizens.forEach((k) => {
    if (k.status === "done" && k.fechaImpl) {
      const y = new Date(k.fechaImpl).getFullYear();
      if (!Number.isNaN(y)) anios.add(y);
    }
  });
  const repintar = () => paint(view, datos);

  // Barra de controles (solo pantalla, no se imprime).
  view.appendChild(
    el("div", { class: "view-header gemba-toolbar" }, [
      el("div", {}, [el("h1", {}, ["GEMBA 4"]), el("p", {}, ["Resultados de Short Kaizen del mes — carta horizontal, lista para imprimir"])]),
      el("div", { style: "display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end" }, [
        el("div", { class: "field", style: "margin-bottom:0" }, [
          el("label", {}, ["Año"]),
          el(
            "select",
            { class: "select", style: "max-width:110px", onchange: (e) => { anioSel = Number(e.target.value); repintar(); } },
            [...anios].sort((a, b) => b - a).map((y) => el("option", { value: String(y), selected: y === anioSel || undefined }, [String(y)]))
          ),
        ]),
        el("div", { class: "field", style: "margin-bottom:0" }, [
          el("label", {}, ["Mes"]),
          el(
            "select",
            { class: "select", style: "max-width:170px", onchange: (e) => { mesSel = Number(e.target.value); repintar(); } },
            MESES.map((m, i) => el("option", { value: String(i + 1), selected: i + 1 === mesSel || undefined }, [m]))
          ),
        ]),
        el("button", { class: "btn btn-accent", type: "button", onclick: () => window.print() }, ["🖨 Imprimir"]),
      ]),
    ])
  );

  view.appendChild(el("div", { class: "gemba-scale" }, [buildHoja(r, datos)]));
  ajustarEscala(view);
}

function buildHoja(r, datos) {
  const pct = r.totalMeta > 0 ? (r.totalImpl / r.totalMeta) * 100 : 0;
  const cumple = pct >= 100;
  const filas = r.deptos.length + (r.pendSinClasificar ? 1 : 0);
  const densidad = filas > 16 ? "gemba-muy-denso" : filas > 10 ? "gemba-denso" : "";

  const kpi = (acento, etiqueta, valor, sub, claseValor = "") =>
    el("div", { class: `gemba-kpi ${acento}` }, [
      el("div", { class: "gemba-kpi-label" }, [etiqueta]),
      el("div", { class: `gemba-kpi-valor ${claseValor}` }, [valor]),
      el("div", { class: "gemba-kpi-sub" }, [sub]),
    ]);

  const maxMeta = Math.max(1, ...r.deptos.map((d) => d.meta));

  return el("div", { class: `gemba-sheet ${densidad}` }, [
    // Encabezado
    el("div", { class: "gemba-header" }, [
      el("div", { class: "gemba-logo" }, [el("img", { src: "assets/logo-mark.png", alt: "Short Kaizen" })]),
      el("div", { class: "gemba-titulos" }, [el("h2", {}, ["GEMBA 4 — Resultados SK"]), el("p", {}, ["Avance por departamento vs. meta"])]),
      el("div", { class: "gemba-periodo" }, [`Periodo: ${MESES[mesSel - 1]} ${anioSel}`]),
    ]),
    // KPIs
    el("div", { class: "gemba-kpis" }, [
      kpi("", "SK Implementados", String(r.totalImpl), "en el mes"),
      kpi("", "Meta", String(r.totalMeta), `SK del mes (${META_SK_POR_EQUIPO_MES} por equipo)`),
      kpi("", "% Cumplimiento", `${pct.toFixed(1)}%`, "Implementados / Meta", cumple ? "gemba-ok" : "gemba-mal"),
      kpi(
        "gemba-kpi-acento",
        "Persona con más SK en el mes",
        r.top ? r.top.nombre : "Sin datos",
        r.top ? `${r.top.departamento || "—"} · ${r.top.n} SK` : "Solo se registra desde la app",
        `gemba-kpi-persona${r.top && r.top.nombre.length > 36 ? " gemba-nombre-muy-largo" : r.top && r.top.nombre.length > 22 ? " gemba-nombre-largo" : ""}`
      ),
    ]),
    // Cuerpo
    el("div", { class: "gemba-body" }, [
      el("div", { class: "gemba-card gemba-card-avance" }, [
        el("h3", {}, ["Avance por departamento"]),
        el("div", { class: "gemba-tabla-head" }, [el("span", {}, ["Departamento"]), el("span", {}, ["Avance"]), el("span", { class: "r" }, ["SK / Meta"])]),
        el(
          "div",
          { class: "gemba-filas" },
          r.deptos.map((d, i) => {
            const ancho = d.meta > 0 ? Math.min(100, (d.implementados / d.meta) * 100) : 0;
            return el("div", { class: "gemba-fila" }, [
              el("span", { class: "gemba-fila-nombre" }, [d.nombre]),
              el("span", { class: "gemba-barra" }, [el("i", { style: `width:${ancho}%;background:${colorDepto(d.nombre, i)}` })]),
              el("span", { class: "gemba-fila-valor r" }, [`${d.implementados}/${d.meta}`]),
            ]);
          })
        ),
      ]),
      el("div", { class: "gemba-card gemba-card-pend" }, [
        el("h3", {}, ["Pendientes de aprobación"]),
        el("div", { class: "gemba-tabla-head" }, [el("span", {}, ["Departamento"]), el("span", { class: "r" }, ["Pendientes"])]),
        el(
          "div",
          { class: "gemba-filas" },
          [
            ...r.deptos.map((d) =>
              el("div", { class: "gemba-fila gemba-fila-pend" }, [
                el("span", { class: "gemba-fila-nombre" }, [d.nombre]),
                el("span", { class: `gemba-fila-valor r ${d.pendientes === 0 ? "gemba-ok" : "gemba-pend-num"}` }, [String(d.pendientes)]),
              ])
            ),
            r.pendSinClasificar
              ? el("div", { class: "gemba-fila gemba-fila-pend" }, [
                  el("span", { class: "gemba-fila-nombre" }, ["Sin clasificar"]),
                  el("span", { class: "gemba-fila-valor r gemba-pend-num" }, [String(r.pendSinClasificar)]),
                ])
              : null,
          ].filter(Boolean)
        ),
        el("div", { class: "gemba-total" }, [el("span", {}, ["Total pendientes"]), el("strong", {}, [String(r.totalPend)])]),
      ]),
    ]),
    // Pie
    el("div", { class: "gemba-pie" }, [
      el("span", {}, [
        `Fuente: registro de SK de la app y, para ene–sep 2026, histórico de Mejora Continua. % Cumplimiento = SK implementados / meta del mes. Pendientes = SK en aprobación a la fecha de generación.`,
      ]),
      el("span", { class: "gemba-pie-fecha" }, [`Generado: ${formatDate(new Date())}`]),
    ]),
  ]);
}

// En pantalla la hoja (11 × 8.5 in) se escala al ancho disponible; al imprimir
// el CSS la deja a escala 1.
function ajustarEscala(view) {
  const cont = view.querySelector(".gemba-scale");
  if (!cont) return;
  const cs = getComputedStyle(view);
  const disponible = (view.clientWidth || HOJA_W) - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const s = Math.min(1, disponible / HOJA_W);
  cont.style.setProperty("--s", String(s));
}

export function unmount() {}
