import { el, toast, formatDate, shortId, getQueryParam } from "../utils.js";
import { api } from "../api.js";
import { createSignaturePad } from "../lib/signature-pad.js";

// Nota de seguridad — léase antes de modificar este archivo:
// Este archivo NUNCA debe leer datos del kaizen directamente de la URL
// (a diferencia de la versión anterior, que traía el JSON completo en un
// parámetro `k`/`kd` en base64). Aquí SOLO se lee el `token`, y todo el
// contenido (datos del kaizen, validez, si ya fue usado) se obtiene del
// backend a través de api.obtenerDatosAprobacion(token). El backend es el
// único que decide si el token es válido — el cliente nunca lo asume.

let pad = null;

const STEP_LABEL = { lider: "Líder", gerente: "Gerente" };

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
    ])
  );
}

function paintForm(view, kaizen, step, token) {
  const rol = STEP_LABEL[step] || step;

  const summary = el("div", { class: "card", style: "margin-bottom:20px" }, [
    el("div", { class: "card-header" }, [el("h2", {}, [`SK-${shortId(kaizen.id)}`]), el("span", { class: "badge badge-pend" }, [`Esperando ${rol}`])]),
    kv("Equipo", kaizen.equipo),
    kv("Solicitante", `${kaizen.nombre} (${kaizen.nomina})`),
    kv("Área", kaizen.donde),
    kv("Fecha de identificación", formatDate(kaizen.fechaId)),
    el("hr", { style: "border:none;border-top:1px solid var(--gray-200);margin:14px 0" }),
    kv("Antes", kaizen.descAntes),
    kv("Después", kaizen.descDespues),
    kaizen.estandarizacion ? kv("Estandarización", kaizen.estandarizacion) : null,
    step === "gerente"
      ? kv("Aprobado por Líder", `${kaizen.firmaLiderNombre || "—"} · ${formatDate(kaizen.firmaLiderFecha)}`)
      : null,
  ]);

  const passInput = el("input", { class: "input", type: "password", id: "ap-pass", placeholder: "Contraseña de autorización", required: true });
  const nombreInput = el("input", { class: "input", id: "ap-nombre", placeholder: "Tu nombre completo", required: true });

  const canvas = el("canvas", { height: "140" });
  const sigWrap = el("div", { class: "sig-pad-wrap" }, [
    canvas,
    el("div", { class: "sig-toolbar" }, [
      el("span", { class: "hint" }, ["Firma dentro del recuadro"]),
      el("button", { class: "btn btn-outline btn-sm", type: "button", onclick: () => pad && pad.clear() }, ["Limpiar"]),
    ]),
  ]);

  const razonBox = el("div", { class: "field", id: "ap-razon-box", style: "display:none" }, [
    el("label", {}, ["Motivo del rechazo *"]),
    el("textarea", { class: "textarea", id: "ap-razon", placeholder: "Explica por qué se rechaza" }),
  ]);

  let decision = null;
  const approveBtn = el("button", { class: "btn btn-success", type: "button" }, ["✓ Aprobar"]);
  const rejectBtn = el("button", { class: "btn btn-danger", type: "button" }, ["✕ Rechazar"]);
  const confirmBtn = el("button", { class: "btn btn-primary btn-full", type: "button", style: "margin-top:16px", disabled: true }, ["Selecciona una decisión"]);

  approveBtn.addEventListener("click", () => {
    decision = "aprobar";
    approveBtn.classList.add("btn-success");
    razonBox.style.display = "none";
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirmar aprobación";
  });
  rejectBtn.addEventListener("click", () => {
    decision = "rechazar";
    razonBox.style.display = "block";
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirmar rechazo";
  });

  confirmBtn.addEventListener("click", async () => {
    if (!passInput.value) return toast("Ingresa la contraseña de autorización.", "tr");
    if (!nombreInput.value.trim()) return toast("Ingresa tu nombre completo.", "tr");
    if (decision === "aprobar" && (!pad || pad.isEmpty())) return toast("Falta la firma digital.", "tr");
    if (decision === "rechazar" && !document.getElementById("ap-razon").value.trim()) {
      return toast("Escribe el motivo del rechazo.", "tr");
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Enviando…";
    try {
      await api.procesarAprobacion(token, {
        decision,
        nombre: nombreInput.value.trim(),
        firma: pad ? pad.toDataURL() : null,
        razonRechazo: decision === "rechazar" ? document.getElementById("ap-razon").value.trim() : "",
        password: passInput.value,
      });
      view.innerHTML = "";
      view.appendChild(
        el("div", { class: "empty-state" }, [
          el("div", { class: "icon" }, [decision === "aprobar" ? "✅" : "❌"]),
          el("h3", {}, [decision === "aprobar" ? "Aprobación registrada" : "Rechazo registrado"]),
          el("p", {}, ["Puedes cerrar esta ventana."]),
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
      el("div", { class: "field" }, [el("label", {}, ["Nombre completo *"]), nombreInput]),
      el("div", { class: "field" }, [el("label", {}, ["Firma digital *"]), sigWrap]),
      razonBox,
      el("div", { style: "display:flex;gap:12px;margin-top:8px" }, [approveBtn, rejectBtn]),
      confirmBtn,
    ])
  );

  pad = createSignaturePad(canvas);
}

function kv(label, value) {
  if (!value) return null;
  return el("p", { style: "margin-bottom:8px" }, [el("strong", { style: "color:var(--gray-700)" }, [`${label}: `]), String(value)]);
}

export function unmount() {
  if (pad) {
    pad.destroy();
    pad = null;
  }
}
