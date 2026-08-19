// ============================================================================
// cambiar-password.js — Cambio de contraseña obligatorio en el primer login.
//
// Se muestra cuando el backend marca user.requiereCambioPassword = true (ver
// contrato en api.js). Mientras esa bandera siga en true, esta es la única
// vista a la que el usuario puede llegar — no hay tabs ni menú disponibles.
// ============================================================================

import { el, toast } from "../utils.js";
import { api } from "../api.js";
import { state, setState } from "../state.js";

export async function render(container) {
  const actualInput = el("input", { class: "input", type: "password", placeholder: "Contraseña temporal", required: true, autocomplete: "current-password" });
  const nuevaInput = el("input", { class: "input", type: "password", placeholder: "Mínimo 8 caracteres", required: true, autocomplete: "new-password" });
  const confirmarInput = el("input", { class: "input", type: "password", placeholder: "Repite la nueva contraseña", required: true, autocomplete: "new-password" });
  const submitBtn = el("button", { class: "btn btn-primary btn-full", type: "submit" }, ["Cambiar contraseña y continuar"]);

  const form = el(
    "form",
    {
      class: "login-form",
      onsubmit: async (e) => {
        e.preventDefault();
        if (!actualInput.value || !nuevaInput.value || !confirmarInput.value) {
          toast("Completa los tres campos.", "tr");
          return;
        }
        if (nuevaInput.value !== confirmarInput.value) {
          toast("La nueva contraseña no coincide en ambos campos.", "tr");
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "Guardando…";
        try {
          await api.cambiarPassword(actualInput.value, nuevaInput.value);
          setState({ user: { ...state.user, requiereCambioPassword: false } });
          toast("Contraseña actualizada.", "tg");
          const { showChrome } = await import("../app.js");
          const { goTo } = await import("../router.js");
          showChrome(state.user);
          goTo("historial");
        } catch (err) {
          toast(err.message || "No se pudo cambiar la contraseña.", "tr");
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = "Cambiar contraseña y continuar";
        }
      },
    },
    [
      el("div", { class: "field" }, [el("label", {}, ["Contraseña temporal (la que te dieron)"]), actualInput]),
      el("div", { class: "field" }, [el("label", {}, ["Nueva contraseña"]), nuevaInput]),
      el("div", { class: "field" }, [el("label", {}, ["Confirmar nueva contraseña"]), confirmarInput]),
      submitBtn,
    ]
  );

  const card = el("div", { class: "login-card" }, [
    el("div", { class: "login-mark" }, ["ZX"]),
    el("h1", {}, ["Cambia tu contraseña"]),
    el("p", { class: "sub" }, ["Es tu primer inicio de sesión — necesitas definir una contraseña propia antes de continuar."]),
    form,
  ]);

  container.appendChild(el("div", { class: "login-screen" }, [card]));
}

export function unmount() {}
