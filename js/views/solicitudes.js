// ============================================================================
// solicitudes.js — Pestaña "Solicitudes" (NUEVA).
//
// La ven quienes pueden aprobar (líder, gerente, mc, admin — ver js/shell.js)
// y, sin importar su rol de sistema, quien sea Aprobador 2 o 3 de algún
// equipo (oct. 2026). Aquí se aprueba/rechaza DIRECTO, con un solo clic, sin pedir
// contraseña otra vez (la sesión ya identifica a quien decide) — distinto
// del flujo por link de correo con token (ya retirado en oct. 2026).
//
// Alcance por rol:
//   - lider/gerente: Short Kaizen donde SU nómina coincide exactamente con
//                    nominaAprobacion2/nominaAprobacion3 del kaizen (paso
//                    actual según `status`) — la autorización real es por
//                    nómina exacta, nunca por rol/equipo/departamento (ver
//                    KaizenZX_Flujo_Definitivo_Aprobacion.md y confirmación
//                    de Jesús en KaizenZX_Respuestas_3_Preguntas_Tecnicas.md:
//                    `email` no sirve porque solo está poblado para los 47
//                    aprobadores del catálogo, no para las 326 personas).
//   - mc:      TODOS los Short Kaizen con status === "pend_aprobacion1".
//   - admin:   todos los pendientes, de cualquier paso (vista de respaldo).
// ============================================================================

import { el, formatDate, shortId, toast } from "../utils.js";
import { api } from "../api.js";
import { pedirMotivoRechazo } from "../lib/motivo-rechazo.js";
import { state, setState } from "../state.js";
import { puedeVerSolicitudes } from "../shell.js";

// `status` es la fuente de verdad (confirmado por Jesús, no derivar de las
// firmas). Valores: pend_aprobacion1/2/3, done, rej_aprobacion1/2/3.
function estadoActual(k) {
  const m = /^pend_(aprobacion[123])$/.exec(k.status || "");
  if (!m) return null; // ya cerrado (done o rechazado)
  const paso = m[1];
  const info = {
    aprobacion1: { paso: 1, label: "Mejora Continua", nomina: null },
    aprobacion2: { paso: 2, label: k.nombreAprobacion2 || "Aprobación 2", nomina: k.nominaAprobacion2 },
    aprobacion3: { paso: 3, label: k.nombreAprobacion3 || "Aprobación 3", nomina: k.nominaAprobacion3 },
  };
  return info[paso];
}

export async function render(container, params, isStale) {
  container.appendChild(el("div", { class: "view", id: "solicitudes-view" }, [el("div", { class: "skeleton", style: "height:200px" })]));

  const user = state.user || {};
  // Por rol (líder/gerente/mc/admin) o por ser Aprobador 2/3 de algún equipo.
  if (!(await puedeVerSolicitudes(user))) {
    if (isStale && isStale()) return;
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
  const pendientes = kaizens
    .map((k) => ({ k, actual: estadoActual(k) }))
    .filter(({ actual }) => actual);

  if (user.rol === "admin") return pendientes.map(({ k }) => k);

  // Pasos 2 y 3: coincidencia exacta de nómina contra el paso actual — nunca
  // por rol/equipo/departamento (confirmado por Jesús: `email` no es
  // confiable). Aplica a CUALQUIER rol (también solicitante y mc): quien es
  // Aprobador 2/3 decide aunque su rol de sistema no sea líder ni gerente.
  const porNomina = ({ actual }) =>
    (actual.paso === 2 || actual.paso === 3) && String(actual.nomina || "") === String(user.nomina || "");
  // mc además decide el paso 1 (cualquier cuenta mc).
  if (user.rol === "mc") return pendientes.filter((p) => p.actual.paso === 1 || porNomina(p)).map(({ k }) => k);
  return pendientes.filter(porNomina).map(({ k }) => k);
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
    solicitante: "Short Kaizen pendientes de tu aprobación",
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
    let motivo = null;
    if (decision === "aprobar") {
      if (!confirm(`¿Seguro que quieres aprobar SK-${shortId(k.id)}?`)) return;
    } else {
      // Rechazar exige motivo (pedido de Javier, oct. 2026).
      motivo = await pedirMotivoRechazo(`SK-${shortId(k.id)}`);
      if (motivo === null) return;
    }
    aprobarBtn.disabled = true;
    rechazarBtn.disabled = true;
    try {
      await api.aprobarEnApp(k.id, decision, motivo);
      toast(decision === "aprobar" ? "Short Kaizen aprobado." : "Short Kaizen rechazado.", "tg");
      const kaizens = await api.getKaizens();
      setState({ kaizens });
      paint(container);
    } catch (err) {
      toast(err.message || "No se pudo procesar tu decisión.", "tr");
      // 409: otra persona ya decidió (o el SK ya no está pendiente): se
      // recarga la lista para que desaparezca de Solicitudes.
      if (/ya fue decidido|no está pendiente/i.test(err.message || "")) {
        try {
          setState({ kaizens: await api.getKaizens() });
          paint(container);
          return;
        } catch { /* si la recarga falla, se deja el estado de los botones */ }
      }
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
          // Pedido de Javier (sept. 2026): mostrar fecha de implementación
          // (fechaImpl) en vez de fecha de identificación (fechaId) — el
          // campo ya existe en cada kaizen (ver formulario.js/api.js), no
          // requiere ningún cambio de backend.
          el("div", { class: "hint" }, [`${k.equipo} · ${k.nombre} (${k.nomina}) · ${formatDate(k.fechaImpl)}`]),
        ]
      ),
      el("span", { class: "badge badge-pend" }, [`Esperando ${estadoActual(k)?.label || "aprobación"}`]),
    ]),
    el("p", { style: "margin:10px 0" }, [k.breveDescripcion || ""]),
    el("div", { style: "display:flex;gap:10px;flex-wrap:wrap" }, [aprobarBtn, rechazarBtn]),
  ]);
}

export function unmount() {}
