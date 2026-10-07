// ============================================================================
// motivo-rechazo.js — Modal "Rechazar Short Kaizen" con motivo OBLIGATORIO.
//
// Pedido de Javier (oct. 2026): todo rechazo debe llevar motivo, para que el
// solicitante sepa por qué lo rechazaron (el correo de rechazo y el detalle
// ya lo muestran — `rechazoAprobacionNRazon`). Lo usan solicitudes.js y
// detalle.js (las dos pantallas desde donde se puede rechazar).
//
// Devuelve una promesa que resuelve con el texto del motivo (ya sin espacios
// sobrantes) o con `null` si la persona cancela.
// ============================================================================

import { el } from "../utils.js";

export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 500;

export function pedirMotivoRechazo(etiquetaSK) {
  return new Promise((resolve) => {
    const textarea = el("textarea", {
      class: "textarea",
      maxlength: String(MOTIVO_MAX),
      placeholder: "Explica brevemente por qué se rechaza este Short Kaizen…",
      "aria-label": "Motivo del rechazo",
    });
    const errorEl = el("div", { class: "hint", style: "color:var(--zx-negative);min-height:18px;margin-top:6px" }, [""]);
    const contador = el("div", { class: "hint", style: "text-align:right" }, [`0 / ${MOTIVO_MAX}`]);
    const confirmarBtn = el("button", { class: "btn btn-danger" }, ["Rechazar"]);
    const cancelarBtn = el("button", { class: "btn btn-outline" }, ["Cancelar"]);

    const overlay = el("div", { class: "modal-overlay" }, [
      el("div", { class: "modal", role: "dialog", "aria-modal": "true" }, [
        el("h3", { style: "margin-bottom:6px" }, [`Rechazar ${etiquetaSK}`]),
        el("p", { class: "hint", style: "margin-bottom:12px" }, [
          "El motivo es obligatorio: se le muestra al solicitante y va en el correo de rechazo.",
        ]),
        textarea,
        contador,
        errorEl,
        el("div", { style: "display:flex;gap:10px;justify-content:flex-end;margin-top:14px" }, [cancelarBtn, confirmarBtn]),
      ]),
    ]);

    const cerrar = (valor) => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(valor);
    };
    const onKey = (ev) => { if (ev.key === "Escape") cerrar(null); };

    textarea.addEventListener("input", () => {
      contador.textContent = `${textarea.value.length} / ${MOTIVO_MAX}`;
      if (errorEl.textContent) errorEl.textContent = "";
    });
    cancelarBtn.addEventListener("click", () => cerrar(null));
    overlay.addEventListener("click", (ev) => { if (ev.target === overlay) cerrar(null); });
    confirmarBtn.addEventListener("click", () => {
      const motivo = textarea.value.trim();
      if (motivo.length < MOTIVO_MIN) {
        errorEl.textContent = `Escribe el motivo del rechazo (mínimo ${MOTIVO_MIN} caracteres).`;
        textarea.focus();
        return;
      }
      cerrar(motivo);
    });

    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    textarea.focus();
  });
}
