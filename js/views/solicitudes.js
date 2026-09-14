// ============================================================================
// solicitudes.js — Pestaña "Solicitudes" (NUEVA).
//
// Solo la ven quienes pueden aprobar (líder, gerente, mc, admin — ver
// js/shell.js). Aquí se aprueba/rechaza DIRECTO, con un solo clic, sin pedir
// contraseña otra vez (la sesión ya identifica a quien decide) — distinto
// del flujo por link de correo (js/views/aprobacion.js), que no se toca.
//
// Alcance por rol:
//   - lider:   Short Kaizen de SU equipo, pendientes de su firma (pend_l).
//   - gerente: Short Kaizen de SU departamento, pendientes de su firma (pend_g).
//   - mc:      TODOS los Short Kaizen de TODA la empresa pendientes del paso
//              de Mejora Continua (pend_mc) — sin importar equipo/departamento.
//   - admin:   todos los pendientes, de cualquier paso (vista de respaldo).
// ============================================================================

import { el, formatDate, shortId, toast } from "../utils.js";
import { api } from "../api.js";
import { state, setState } from "../state.js";

const STEP_LABEL = { pend_mc: "Mejora Continua", pend_l: "Líder", pend_g: "Gerente" };

export async function render(container, params, isStale) {
  container.appendChild(el("div", { class: "view", id: "solicitudes-view" }, [el("div", { class: "skeleton", style: "height:200px" })]));

  const user = state.user || {};
  if (!["lider", "gerente", "mc", "admin"].includes(user.rol)) {
    paintSinPermiso(container);
    return;
  }

  try {
    const kaizens = await api.getKaizens();
    if (isStale && isStale()) return;
    setState({ kaizens });
    paint(container);
  } catch (err) {
    if (isStale && isStale()) return;
    paintError(container, err);
  }
}

function paintSinPermiso(container) {
  const view = container.querySelector("#solicitudes-view");
  view.innerHTML = "";
  view.appendChild(
    el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, ["🔒"]),
      el("h3", {}, ["No tienes acceso a esta pantalla"]),
      el("p", {}, ["Solo las personas que pueden aprobar Short Kaizen ven esta pestaña."]),
    ])
  );
}

function paintError(container, err) {
  const view = container.querySelector("#solicitudes-view") || container;
  view.innerHTML = "";
  view.appendChild(
    el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, ["⚠️"]),
      el("h3", {}, ["No se pudo cargar la información"]),
      el("p", {}, [err.message || ""]),
    ])
  );
}

function pendientesParaUsuario() {
  const user = state.user || {};
  const kaizens = state.kaizens || [];
  if (user.rol === "lider") return kaizens.filter((k) => k.status === "pend_l" && k.equipo === user.equipo);
  if (user.rol === "gerente") return kaizens.filter((k) => k.status === "pend_g" && k.departamento === user.departamento);
  if (user.rol === "mc") return kaizens.filter((k) => k.status === "pend_mc");
  if (user.rol === "admin") return kaizens.filter((k) => ["pend_mc", "pend_l", "pend_g"].includes(k.status));
  return [];
}

function paint(container) {
  const view = container.querySelector("#solicitudes-view");
  view.innerHTML = "";

  const user = state.user || {};
  const pendientes = pendientesParaUsuario();

  const subtitulos = {
    lider: "Short Kaizen de tu equipo pendientes de tu firma",
    gerente: "Short Kaizen de tu departamento pendientes de tu firma",
    mc: "Short Kaizen de TODA la empresa pendientes de revisión de Mejora Continua",
    admin: "Todos los Short Kaizen pendientes de cualquier paso de aprobación",
  };

  view.appendChild(
    el("div", { class: "view-header" }, [
      el("div", {}, [
        el("h1", {}, ["Solicitudes"]),
        el("p", {}, [subtitulos[user.rol] || "Short Kaizen pendientes de aprobación"]),
      ]),
      el("span", { class: "badge badge-pend" }, [`${pendientes.length} pendiente(s)`]),
    ])
  );

  if (!pendientes.length) {
    view.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "icon" }, ["✅"]),
        el("h3", {}, ["No hay nada pendiente"]),
        el("p", {}, ["Todos los Short Kaizen a tu cargo ya fueron atendidos."]),
      ])
    );
    return;
  }

  view.appendChild(el("div", { class: "solicitudes-list" }, pendientes.map((k) => buildCard(k, container))));
}

function buildCard(k, container) {
  const aprobarBtn = el("button", { class: "btn btn-success btn-sm" }, ["✓ Aprobar"]);
  const rechazarBtn = el("button", { class: "btn btn-danger btn-sm" }, ["✕ Rechazar"]);

  const decidir = async (decision) => {
    const verbo = decision === "aprobar" ? "aprobar" : "rechazar";
    if (!confirm(`¿Seguro que quieres ${verbo} SK-${shortId(k.id)}?`)) return;
    aprobarBtn.disabled = true;
    rechazarBtn.disabled = true;
    try {
      await api.aprobarEnApp(k.id, decision);
      toast(decision === "aprobar" ? "Short Kaizen aprobado." : "Short Kaizen rechazado.", "tg");
      const kaizens = await api.getKaizens();
      setState({ kaizens });
      paint(container);
    } catch (err) {
      toast(err.message || "No se pudo procesar tu decisión.", "tr");
      aprobarBtn.disabled = false;
      rechazarBtn.disabled = false;
    }
  };

  aprobarBtn.addEventListener("click", () => decidir("aprobar"));
  rechazarBtn.addEventListener("click", () => decidir("rechazar"));

  return el("div", { class: "card solicitud-card" }, [
    el("div", { class: "card-header" }, [
      el(
        "div",
        { class: "solicitud-titulo", onclick: () => { window.location.href = `detalle.html?id=${encodeURIComponent(k.id)}`; } },
        [
          el("div", { style: "font-weight:700" }, [`SK-${shortId(k.id)} · ${k.areaLinea || k.donde || "—"}`]),
          el("div", { class: "hint" }, [`${k.equipo} · ${k.nombre} (${k.nomina}) · ${formatDate(k.fechaId)}`]),
        ]
      ),
      el("span", { class: "badge badge-pend" }, [`Esperando ${STEP_LABEL[k.status] || k.status}`]),
    ]),
    el("p", { style: "margin:10px 0" }, [k.breveDescripcion || ""]),
    el("div", { style: "display:flex;gap:10px;flex-wrap:wrap" }, [aprobarBtn, rechazarBtn]),
  ]);
}

export function unmount() {}
