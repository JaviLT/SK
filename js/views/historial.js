import { el, formatDate, shortId } from "../utils.js";
import { api } from "../api.js";
import { state, setState } from "../state.js";

const STATUS_META = {
  nuevo: { label: "Nuevo", badge: "badge-nuevo" },
  pend_l: { label: "Esperando Líder", badge: "badge-pend" },
  pend_g: { label: "Esperando Gerente", badge: "badge-pend" },
  done: { label: "Cerrado", badge: "badge-done" },
  rej_l: { label: "Rechazado (Líder)", badge: "badge-rej" },
  rej_g: { label: "Rechazado (Gerente)", badge: "badge-rej" },
};

export async function render(container, params, isStale) {
  container.appendChild(el("div", { class: "view", id: "historial-view" }, [renderSkeleton()]));

  try {
    const [equipos, kaizens] = await Promise.all([api.getEquipos(), api.getKaizens()]);
    if (isStale && isStale()) return; // el usuario ya navegó a otra vista — no tocar el DOM
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

function paint(container) {
  const view = container.querySelector("#historial-view");
  view.innerHTML = "";

  view.appendChild(
    el("div", { class: "view-header" }, [
      el("div", {}, [el("h1", {}, ["Solicitudes"]), el("p", {}, ["Registro y seguimiento de Short Kaizen"])]),
    ])
  );

  view.appendChild(buildStatsRow(state.kaizens));
  view.appendChild(el("h3", {}, ["Equipos"]));
  view.appendChild(buildMosaico(state.equipos, state.kaizens));
  view.appendChild(
    el("div", { class: "view-header", style: "margin-top:8px" }, [
      el("h3", {}, [state.equipoActivo ? `Solicitudes — ${state.equipoActivo}` : "Todas las solicitudes"]),
      state.equipoActivo
        ? el("button", { class: "btn btn-outline btn-sm", onclick: () => { setState({ equipoActivo: null }); paint(container); } }, ["Quitar filtro"])
        : null,
    ])
  );
  view.appendChild(buildList(state.kaizens, state.equipoActivo, container));
}

function buildStatsRow(kaizens) {
  const counts = {
    total: kaizens.length,
    nuevo: kaizens.filter((k) => k.status === "nuevo").length,
    pend_l: kaizens.filter((k) => k.status === "pend_l").length,
    pend_g: kaizens.filter((k) => k.status === "pend_g").length,
    done: kaizens.filter((k) => k.status === "done").length,
  };
  const items = [
    ["Total", counts.total],
    ["Nuevos", counts.nuevo],
    ["Pend. Líder", counts.pend_l],
    ["Pend. Gerente", counts.pend_g],
    ["Cerrados", counts.done],
  ];
  return el(
    "div",
    { class: "stats-row" },
    items.map(([label, value]) =>
      el("div", { class: "kpi-card" }, [
        el("div", { class: "kpi-label" }, [label]),
        el("div", { class: "kpi-value" }, [String(value)]),
      ])
    )
  );
}

function buildMosaico(equipos, kaizens) {
  if (!equipos.length) {
    return el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, ["🏷️"]),
      el("p", {}, ["Todavía no hay equipos configurados en el backend."]),
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
            const root = document.getElementById("app-root");
            paint(root);
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

function buildList(kaizens, equipoActivo, container) {
  const filtered = equipoActivo ? kaizens.filter((k) => k.equipo === equipoActivo) : kaizens;
  if (!filtered.length) {
    return el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, ["📭"]),
      el("h3", {}, ["Sin solicitudes"]),
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
          onclick: async () => {
            const { goTo } = await import("../router.js");
            goTo("detalle", { id: k.id });
          },
        },
        [
          el("div", { class: "kr-main" }, [
            el("div", { class: "kr-title" }, [`SK-${shortId(k.id)} · ${k.donde || "—"}`]),
            el("div", { class: "kr-sub" }, [`${k.equipo} · ${k.nombre} · ${formatDate(k.fechaId)}`]),
          ]),
          el("span", { class: `badge ${meta.badge}` }, [meta.label]),
        ]
      );
    })
  );
}

export function unmount() {}
