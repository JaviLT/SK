import { api } from "./api.js";
import { setState } from "./state.js";
import { goTo } from "./router.js";
import { getQueryParam, toast } from "./utils.js";

async function boot() {
  const token = getQueryParam("token");

  // Un link de aprobación (?token=...) siempre tiene prioridad y no requiere
  // sesión iniciada — así el Líder/Gerente puede resolverlo directo desde
  // el correo, sin necesidad de loguearse en la app completa.
  if (token) {
    await goTo("aprobacion");
    return;
  }

  const user = await api.restoreSession().catch(() => null);
  if (user) {
    setState({ user });
    if (user.requiereCambioPassword) {
      await goTo("cambiar-password");
      return;
    }
    showChrome(user);
    await goTo("historial");
  } else {
    await goTo("login");
  }
}

export function showChrome(user) {
  document.getElementById("topbar").hidden = false;
  document.getElementById("mobile-nav").hidden = false;
  document.getElementById("user-chip-name").textContent = user.nombre;

  // El tab de Administración solo se muestra al usuario maestro (rol "admin").
  document.querySelectorAll(".admin-only").forEach((node) => {
    node.hidden = user.rol !== "admin";
  });
}

function wireNav() {
  document.querySelectorAll(".tab[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => goTo(btn.dataset.view));
  });
  document.querySelectorAll(".mobile-nav-btn[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => goTo(btn.dataset.view));
  });
  document.getElementById("btn-nuevo").addEventListener("click", () => goTo("formulario"));
  document.getElementById("mobile-nuevo").addEventListener("click", () => goTo("formulario"));

  document.getElementById("user-chip").addEventListener("click", () => {
    if (!confirm("¿Cerrar sesión?")) return;
    api.logout();
    document.getElementById("topbar").hidden = true;
    document.getElementById("mobile-nav").hidden = true;
    toast("Sesión cerrada", "default");
    goTo("login");
  });
}

wireNav();
boot();
