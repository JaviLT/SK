import { el, toast, formatDate, shortId, getQueryParam } from "../utils.js";
import { api } from "../api.js";

// Nota de seguridad — léase antes de modificar este archivo:
// Este archivo NUNCA debe leer datos del kaizen directamente de la URL
// (a diferencia de la versión anterior, que traía el JSON completo en un
// parámetro `k`/`kd` en base64). Aquí SOLO se lee el `token`, y todo el
// contenido (datos del kaizen, validez, si ya fue usado) se obtiene del
// backend a través de api.obtenerDatosAprobacion(token). El backend es el
// único que decide si el token es válido — el cliente nunca lo asume.
//
// Ya no se pide firma digital ni nombre/comentarios al aprobar o rechazar:
// el token ya identifica a la persona exacta que debe decidir, y el backend
// valida su identidad con la contraseña. Solo hace falta contraseña +
// decisión (aprobar/rechazar) + confirmar.

const STEP_LABEL = { mc: "Mejora Continua", lider: "Líder", gerente: "Gerente" };

export async function render(container, params, isStale) {
  const token = getQueryParam("token");
  const view = el("div", { class: "view", id: "aprobacion-view" });
  container.appendChild(view);

  if (!token) {
    paintError(view, "Este link no incluye un código de aprobación válido.");
    return;
  }

  view.appendChild(el("div", { class: "skeleton", style: "height:220px" }));

  try {
    const { kaizen, step } = await api.obtenerDatosAprobacion(token);
    if (isStale && isStale()) return; // el usuario ya navegó a otra vista — no tocar el DOM
    view.innerHTML = "";
    paintForm(view, kaizen, step, token);
  } catch (err) {
    if (isStale && isStale()) return;
    view.innerHTML = "";
    paintError(view, err.message || "Este link de aprobación ya no es válido.");
  }
}

function paintError(view, message) {
  view.appendChild(
    el("div", { class: "empty-state" }, [
      el("div", { class: "icon" }, ["🔒"]),
      el("h3", {}, ["No se puede continuar"]),
      el("p", {}, [message]),
      el("p", { class: "hint" }, ["Si crees que esto es un error, solicita que te reenvíen el correo de aprobación."]),
      botonVolver(),
    ])
  );
}

function botonVolver() {
  return el(
    "button",
    {
      class: "btn btn-outline",
      style: "margin-top:16px",
      onclick: () => {
        // El link de aprobación no requiere sesión iniciada — "volver" manda
        // a la pantalla principal, que a su vez decide si pide login o no.
        window.location.href = window.location.pathname;
      },
    },
    ["← Volver a la aplicación"]
  );
}

function paintForm(view, kaizen, step, token) {
  const rol = STEP_LABEL[step] || step;

  const summary = el("div", { class: "card", style: "margin-bottom:20px" }, [
    el("div", { class: "card-header" }, [el("h2", {}, [`SK-${shortId(kaizen.id)}`]), el("span", { class: "badge badge-pend" }, [`Esperando ${rol}`])]),
    kv("Equipo", kaizen.equipo),
    kv("Departamento", kaizen.departamento),
    kv("Solicitante", `${kaizen.nombre} (${kaizen.nomina})`),
    kv("Área / Línea / Máquina", kaizen.areaLinea),
    kv("Fecha de identificación", formatDate(kaizen.fechaId)),
    el("hr", { style: "border:none;border-top:1px solid var(--gray-200);margin:14px 0" }),
    kv("Antes", kaizen.descAntes),
    kv("Después y beneficios", kaizen.descDespues),
    kaizen.estandarizacion ? kv("Estandarización", kaizen.estandarizacion) : null,
    step === "lider" ? kv("Aprobado por Mejora Continua", `${kaizen.firmaMCNombre || "—"} · ${formatDate(kaizen.firmaMCFecha)}`) : null,
    step === "gerente"
      ? kv("Aprobado por Líder", `${kaizen.firmaLiderNombre || "—"} · ${formatDate(kaizen.firmaLiderFecha)}`)
      : null,
  ]);

  const passInput = el("input", { class: "input", type: "password", id: "ap-pass", placeholder: "Contraseña de autorización", required: true });

  let decision = null;
  const approveBtn = el("button", { class: "btn btn-success", type: "button" }, ["✓ Aprobar"]);
  const rejectBtn = el("button", { class: "btn btn-danger", type: "button" }, ["✕ Rechazar"]);
  const confirmBtn = el("button", { class: "btn btn-primary btn-full", type: "button", style: "margin-top:16px", disabled: true }, ["Selecciona una decisión"]);

  approveBtn.addEventListener("click", () => {
    decision = "aprobar";
    approveBtn.classList.add("is-selected");
    rejectBtn.classList.remove("is-selected");
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirmar aprobación";
  });
  rejectBtn.addEventListener("click", () => {
    decision = "rechazar";
    rejectBtn.classList.add("is-selected");
    approveBtn.classList.remove("is-selected");
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirmar rechazo";
  });

  confirmBtn.addEventListener("click", async () => {
    if (!passInput.value) return toast("Ingresa la contraseña de autorización.", "tr");

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Enviando…";
    try {
      await api.procesarAprobacion(token, { decision, password: passInput.value });
      view.innerHTML = "";
      view.appendChild(
        el("div", { class: "empty-state" }, [
          el("div", { class: "icon" }, [decision === "aprobar" ? "✅" : "❌"]),
          el("h3", {}, [decision === "aprobar" ? "Aprobación registrada" : "Rechazo registrado"]),
          el("p", {}, ["Ya puedes volver a la aplicación o cerrar esta ventana."]),
          botonVolver(),
        ])
      );
    } catch (err) {
      toast(err.message || "No se pudo procesar tu decisión.", "tr");
      confirmBtn.disabled = false;
      confirmBtn.textContent = decision === "aprobar" ? "Confirmar aprobación" : "Confirmar rechazo";
    }
  });

  view.appendChild(summary);
  view.appendChild(
    el("div", { class: "card" }, [
      el("h3", {}, [`Autorización — ${rol}`]),
      el("div", { class: "field" }, [el("label", {}, ["Contraseña de autorización *"]), passInput]),
      el("div", { style: "display:flex;gap:12px;margin-top:8px" }, [approveBtn, rejectBtn]),
      confirmBtn,
      botonVolver(),
    ])
  );
}

function kv(label, value) {
  if (!value) return null;
  return el("p", { style: "margin-bottom:8px" }, [el("strong", { style: "color:var(--gray-700)" }, [`${label}: `]), String(value)]);
}

export function unmount() {}
