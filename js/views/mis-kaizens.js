// ============================================================================
// mis-kaizens.js — Pantalla "Mis Kaizens" (antes "Solicitudes").
//
// Se renombró y se simplificaron sus KPIs a solo 4: total creados,
// pendientes de firma, aceptados y rechazados — el detalle de en qué paso
// exacto está cada pendiente ahora vive en la nueva pestaña "Solicitudes"
// (solicitudes.js), que es donde se aprueba.
//
// La regla de visibilidad NO cambió:
//   - solicitante: solo sus propios Short Kaizen enviados.
//   - lider:       los Short Kaizen de su propio Equipo Lean.
//   - gerente:     TODOS los Short Kaizen de su departamento.
//   - admin/mc:    todo, sin restricción.
// ============================================================================

import { el, formatDate, shortId } from "../utils.js";
import { api } from "../api.js";
import { state, setState } from "../state.js";

const STATUS_META = {
  pend_mc: { label: "Pend. Mejora Continua", badge: "badge-pend" },
  pend_l: { label: "Pend. Líder", badge: "badge-pend" },
  pend_g: { label: "Pend. Gerente", badge: "badge-pend" },
  done: { label: "Aceptado", badge: "badge-done" },
  rej_mc: { label: "Rechazado (Mejora Continua)", badge: "badge-rej" },
  rej_l: { label: "Rechazado (Líder)", badge: "badge-rej" },
  rej_g: { label: "Rechazado (Gerente)", badge: "badge-rej" },
};
const PENDIENTES = ["pend_mc", "pend_l", "pend_g"];
const RECHAZADOS = ["rej_mc", "rej_l", "rej_g"];

export async function render(container, params, isStale) {
  container.appendChild(el("div", { class: "view", id: "historial-view" }, [renderSkeleton()]));

  try {
    const [equipos, kaizens] = await Promise.all([api.getEquipos(), api.getKaizens()]);
    if (isStale && isStale()) return;
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

function alcanceParaUsuario() {
  const user = state.user || {};
  const rol = user.rol;

  if (rol === "solicitante") {
    return {
      mostrarMosaico: false,
      equiposVisibles: [],
      kaizensVisibles: state.kaizens.filter((k) => k.nomina === user.nomina),
      titulo: "Mis Kaizens",
      subtitulo: "Short Kaizen que has enviado",
    };
  }

  if (rol === "lider") {
    const equiposVisibles = state.equipos.filter((eq) => eq.nombre === user.equipo);
    return {
      mostrarMosaico: false,
      equiposVisibles,
      kaizensVisibles: state.kaizens.filter((k) => k.equipo === user.equipo),
      titulo: `Mis Kaizens — ${user.equipo || "tu equipo"}`,
      subtitulo: "Short Kaizen de tu equipo",
    };
  }

  if (rol === "gerente") {
    const equiposVisibles = state.equipos.filter((eq) => eq.departamento === user.departamento);
    const nombresEquipos = new Set(equiposVisibles.map((eq) => eq.nombre));
    return {
      mostrarMosaico: true,
      equiposVisibles,
      kaizensVisibles: state.kaizens.filter((k) => k.departamento === user.departamento || nombresEquipos.has(k.equipo)),
      titulo: `Mis Kaizens — ${user.departamento || "tu departamento"}`,
      subtitulo: "Selecciona un equipo para ver sus Short Kaizen",
    };
  }

  return {
    mostrarMosaico: true,
    equiposVisibles: state.equipos,
    kaizensVisibles: state.kaizens,
    titulo: "Mis Kaizens",
    subtitulo: "Registro y seguimiento de Short Kaizen",
  };
}

function paint(container) {
  const view = container.querySelector("#historial-view");
  view.innerHTML = "";

  const alcance = alcanceParaUsuario();

  view.appendChild(
    el("div", { class: "view-header" }, [el("div", {}, [el("h1", {}, [alcance.titulo]), el("p", {}, [alcance.subtitulo])])])
  );

  view.appendChild(buildStatsRow(alcance.kaizensVisibles));

  if (alcance.mostrarMosaico) {
    view.appendChild(el("h3", {}, ["Equipos"]));
    view.appendChild(buildMosaico(alcance.equiposVisibles, alcance.kaizensVisibles, container));
  }

  view.appendChild(
    el("div", { class: "view-header", style: "margin-top:8px" }, [
      el("h3", {}, [state.equipoActivo ? `Short Kaizen — ${state.equipoActivo}` : "Todos los Short Kaizen"]),
      state.equipoActivo
        ? el("button", { class: "btn btn-outline btn-sm", onclick: () => { setState({ equipoActivo: null }); paint(container); } }, ["Quitar filtro"])
        : null,
    ])
  );
  view.appendChild(buildList(alcance.kaizensVisibles, state.equipoActivo));
}

function buildStatsRow(kaizens) {
  const counts = {
    total: kaizens.length,
    pendientes: kaizens.filter((k) => PENDIENTES.includes(k.status)).length,
    aceptados: kaizens.filter((k) => k.status === "done").length,
    rechazados: kaizens.filter((k) => RECHAZADOS.includes(k.status)).length,
  };
  const items = [
    ["Total SK creados", counts.total],
    ["Pendientes de firma", counts.pendientes],
    ["Aceptados", counts.aceptados],
    ["Rechazados", counts.rechazados],
  ];
  return el(
    "div",
    { class: "stats-row stats-row-4" },
    items.map(([label, value]) =>
      el("div", { class: "kpi-card" }, [
        el("div", { class: "kpi-label" }, [label]),
        el("div", { class: "kpi-value" }, [String(value)]),
      ])
    )
  );
}

function buildMosaico(equipos, kaizens, container) {
  if (!equipos.length) {
    return el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, ["🏷️"]),
      el("p", {}, ["No hay equipos asignados a tu cuenta todavía."]),
    ]);
  }
  return el(
    "div",
    { class: "mosaico" },
    equipos.map((eq) => {
      const count = kaizens.filter((k) => k.equipo === eq.nombre).length;
      const isActive = state.equipoActivo === eq.nombre;
      return el(
        "div",
        {
          class: `equipo-card${isActive ? " active" : ""}`,
          onclick: () => {
            setState({ equipoActivo: isActive ? null : eq.nombre });
            paint(container);
          },
        },
        [
          el("div", { class: "eq-name" }, [eq.nombre]),
          el("div", { class: "eq-count" }, [String(count)]),
          el("div", { class: "eq-sub" }, ["kaizens registrados"]),
        ]
      );
    })
  );
}

function buildList(kaizens, equipoActivo) {
  const filtered = equipoActivo ? kaizens.filter((k) => k.equipo === equipoActivo) : kaizens;
  if (!filtered.length) {
    return el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, ["📭"]),
      el("h3", {}, ["Sin Short Kaizen"]),
      el("p", {}, ["Aún no hay kaizens para mostrar aquí."]),
    ]);
  }
  return el(
    "div",
    { class: "kaizen-list" },
    filtered.map((k) => {
      const meta = STATUS_META[k.status] || { label: k.status, badge: "badge-nuevo" };
      return el(
        "div",
        {
          class: "kaizen-row",
          onclick: () => { window.location.href = `detalle.html?id=${encodeURIComponent(k.id)}`; },
        },
        [
          el("div", { class: "kr-main" }, [
            el("div", { class: "kr-title" }, [`SK-${shortId(k.id)} · ${k.areaLinea || k.donde || "—"}`]),
            el("div", { class: "kr-sub" }, [`${k.equipo} · ${k.nombre} · ${formatDate(k.fechaId)}`]),
          ]),
          el("span", { class: `badge ${meta.badge}` }, [meta.label]),
        ]
      );
    })
  );
}

export function unmount() {}
