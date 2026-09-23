// ============================================================================
// shell.js — Bootstrap compartido por cada página del sitio (multi-página).
//
// Cada .html es una página real e independiente (no hay router de SPA). Este
// módulo hace lo que antes hacía app.js + router.js dentro de una sola
// página: valida sesión, decide si hay que mandar a login/cambiar-password,
// pinta el topbar/menú móvil según el rol de la sesión (incluye el nuevo rol
// "mc") y expone el botón flotante "+ Nuevo Kaizen".
//
// Uso típico al final de cada página autenticada:
//   import { initShell } from "./js/shell.js";
//   import { render } from "./js/views/mis-kaizens.js";
//   const { root } = await initShell({ page: "mis-kaizens" });
//   if (root) render(root, {}, () => false);
// ============================================================================

import { api } from "./api.js";
import { setState } from "./state.js";
import { toast } from "./utils.js";
import { CONFIG } from "./config.js";

// Cada tab: a qué página apunta y qué roles pueden verla. `roles: null` = todos.
const NAV_ITEMS = [
  { page: "mis-kaizens", href: "mis-kaizens.html", label: "Mis Kaizens", roles: null },
  { page: "solicitudes", href: "solicitudes.html", label: "Solicitudes", roles: ["lider", "gerente", "mc", "admin"] },
  { page: "dashboard", href: "dashboard.html", label: "Dashboard", roles: null },
  { page: "admin", href: "admin.html", label: "Administración", roles: ["admin", "mc"] },
];

export function puedeAprobar(user) {
  return Boolean(user) && ["lider", "gerente", "mc", "admin"].includes(user.rol);
}

/**
 * @param {object} opts
 * @param {string} opts.page - id de la página actual (para resaltar el tab activo)
 * @param {boolean} [opts.requireAuth=true]
 * @param {boolean} [opts.allowPendingPasswordChange=false] - true solo en cambiar-password.html
 * @returns {Promise<{user: object|null, root: HTMLElement|null}>}
 */
export async function initShell({ page, requireAuth = true, allowPendingPasswordChange = false } = {}) {
  const user = await api.restoreSession().catch(() => null);

  if (!user) {
    if (requireAuth) {
      window.location.replace("login.html");
      return { user: null, root: null };
    }
    return { user: null, root: document.getElementById("app-root") };
  }

  setState({ user });

  if (user.requiereCambioPassword && !allowPendingPasswordChange) {
    window.location.replace("cambiar-password.html");
    return { user, root: null };
  }

  buildChrome(user, page);
  return { user, root: document.getElementById("app-root") };
}

function buildChrome(user, page) {
  const topbar = document.getElementById("topbar");
  const mobileNav = document.getElementById("mobile-nav");
  const fab = document.getElementById("fab-nuevo");
  if (topbar) topbar.hidden = false;
  if (mobileNav) mobileNav.hidden = false;
  if (fab) fab.hidden = false;

  // Versión visible en el topbar de toda la app — para confirmar a simple
  // vista que el navegador ya trae la última versión y no una copia vieja
  // en caché (pedido explícito de Javier, sept. 2026).
  const brandText = document.querySelector(".brand-text");
  if (brandText && !document.getElementById("app-version-badge")) {
    const badge = document.createElement("span");
    badge.id = "app-version-badge";
    badge.className = "app-version-badge";
    badge.textContent = `v${CONFIG.APP_VERSION}`;
    badge.title = "Versión de la aplicación en ejecución";
    brandText.appendChild(badge);
  }

  const nameEl = document.getElementById("user-chip-name");
  if (nameEl) nameEl.textContent = user.nombre;
  const roleEl = document.getElementById("user-chip-rol");
  if (roleEl) roleEl.textContent = ROLE_LABEL[user.rol] || user.rol;

  document.querySelectorAll("[data-nav]").forEach((node) => {
    const item = NAV_ITEMS.find((n) => n.page === node.dataset.nav);
    if (!item) return;
    const visible = !item.roles || item.roles.includes(user.rol);
    node.hidden = !visible;
    if (visible) node.classList.toggle("active", item.page === page);
  });

  document.querySelectorAll("[data-logout]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("¿Cerrar sesión?")) return;
      api.logout();
      toast("Sesión cerrada", "default");
      window.location.href = "login.html";
    });
  });

  document.querySelectorAll("[data-nuevo-kaizen]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = "formulario.html";
    });
  });
}

const ROLE_LABEL = {
  solicitante: "Integrante",
  lider: "Líder",
  gerente: "Gerente",
  mc: "Mejora Continua",
  admin: "Administrador",
};
