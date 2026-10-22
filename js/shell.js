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
import { getTheme, toggleTheme } from "./theme.js";

// Cada tab: a qué página apunta y qué roles pueden verla. `roles: null` = todos.
const NAV_ITEMS = [
  { page: "mis-kaizens", href: "mis-kaizens.html", label: "Mis Kaizens", roles: null },
  { page: "solicitudes", href: "solicitudes.html", label: "Solicitudes", roles: ["lider", "gerente", "mc", "admin"] },
  { page: "dashboard", href: "dashboard.html", label: "Tablero general", roles: null },
  { page: "gemba4", href: "gemba4.html", label: "GEMBA 4", roles: ["mc", "admin"] },
  { page: "admin", href: "admin.html", label: "Administración", roles: ["admin", "mc"] },
];

export function puedeAprobar(user) {
  return Boolean(user) && ["lider", "gerente", "mc", "admin"].includes(user.rol);
}

// Quien figura como Aprobador 2 o Aprobador 3 de algún equipo también aprueba
// (los pasos 2 y 3 después de Mejora Continua), sea cual sea su rol de
// sistema: el backend autoriza esos pasos por la nómina exacta congelada en
// el SK, no por rol (pedido de Javier, oct. 2026). El rol solo no basta para
// saberlo: se consulta `aprobador2Nomina`/`aprobador3Nomina` de GET /equipos.
const CLAVE_APROBADOR = "sk_es_aprobador";

function leerCacheAprobador(nomina) {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE_APROBADOR) || "null");
    return v && v.nomina === String(nomina) ? Boolean(v.valor) : null;
  } catch { return null; }
}

/**
 * ¿Esta persona es Aprobador 2/3 de al menos un equipo? Resultado cacheado en
 * sessionStorage para no repetir la consulta en cada página; si la consulta
 * falla devuelve lo último que se sabía (o false).
 */
export async function esAprobadorDeAlgunEquipo(user) {
  if (!user?.nomina) return false;
  try {
    const equipos = await api.getEquipos();
    const n = String(user.nomina);
    const valor = (equipos || []).some((eq) => String(eq.aprobador2Nomina || "") === n || String(eq.aprobador3Nomina || "") === n);
    try { sessionStorage.setItem(CLAVE_APROBADOR, JSON.stringify({ nomina: n, valor })); } catch { /* se ignora */ }
    return valor;
  } catch {
    return leerCacheAprobador(user.nomina) ?? false;
  }
}

/** ¿Puede ver la pestaña Solicitudes? Por rol, o por ser Aprobador 2/3. */
export async function puedeVerSolicitudes(user) {
  return puedeAprobar(user) || (await esAprobadorDeAlgunEquipo(user));
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
      // Recuerda a dónde iba (p. ej. detalle.html?id=123 desde el link de un
      // correo) para volver ahí tras iniciar sesión — ver login.js.
      try {
        const destino = window.location.pathname.split("/").pop() + window.location.search;
        sessionStorage.setItem("sk_return_to", destino);
      } catch { /* sin sessionStorage: se ignora, cae a la pantalla por defecto */ }
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

  buildVersionBar();

  const nameEl = document.getElementById("user-chip-name");
  if (nameEl) nameEl.textContent = user.nombre;
  // Pedido de Javier (sept. 2026): el chip ya no muestra el rol del
  // sistema — muestra el equipo al que pertenece (`user.equipo`, ver
  // contrato de /auth/login en api.js). Si no pertenece a ningún equipo
  // (gerentes/mc/admin normalmente no tienen uno asignado), se muestra
  // solo el nombre y se oculta la segunda línea por completo.
  const roleEl = document.getElementById("user-chip-rol");
  if (roleEl) {
    if (user.equipo) {
      roleEl.textContent = user.equipo;
      roleEl.hidden = false;
    } else {
      roleEl.textContent = "";
      roleEl.hidden = true;
    }
  }

  const mostrarNav = (extra = {}) => {
    document.querySelectorAll("[data-nav]").forEach((node) => {
      const item = NAV_ITEMS.find((n) => n.page === node.dataset.nav);
      if (!item) return;
      const visible = !item.roles || item.roles.includes(user.rol) || Boolean(extra[item.page]);
      node.hidden = !visible;
      if (visible) node.classList.toggle("active", item.page === page);
    });
  };
  // Se pinta ya con lo que se sabe (rol + último resultado cacheado) y, si el
  // rol no aprueba, se confirma en segundo plano si es Aprobador 2/3 para no
  // retrasar la carga de la página.
  const cacheado = leerCacheAprobador(user.nomina);
  mostrarNav({ solicitudes: cacheado === true });
  if (!puedeAprobar(user)) {
    esAprobadorDeAlgunEquipo(user).then((esAprobador) => {
      if (esAprobador !== (cacheado === true)) mostrarNav({ solicitudes: esAprobador });
    });
  }

  // Menú del usuario (pedido de Javier, sept. 2026): ya no se cierra sesión
  // con un solo clic directo sobre el chip — el clic abre un menú
  // desplegable con "Cerrar sesión" como opción, para evitar cierres de
  // sesión accidentales.
  const userMenuToggle = document.getElementById("user-chip-toggle");
  const userMenuDropdown = document.getElementById("user-menu-dropdown");
  if (userMenuToggle && userMenuDropdown) {
    userMenuToggle.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const abierto = !userMenuDropdown.hidden;
      userMenuDropdown.hidden = abierto;
      userMenuToggle.setAttribute("aria-expanded", String(!abierto));
    });
    document.addEventListener("click", (ev) => {
      if (userMenuDropdown.hidden) return;
      if (userMenuDropdown.contains(ev.target) || userMenuToggle.contains(ev.target)) return;
      userMenuDropdown.hidden = true;
      userMenuToggle.setAttribute("aria-expanded", "false");
    });
  }

  // Modo oscuro (pedido de Javier, sept. 2026) — mismo menú del usuario.
  // El tema ya se aplicó de forma síncrona por el script inline anti-
  // parpadeo en el <head> de cada página; aquí solo se pone el texto del
  // botón acorde y se conecta el clic.
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  if (themeToggleBtn) {
    const actualizarTextoTema = () => {
      themeToggleBtn.textContent = getTheme() === "dark" ? "☀️ Modo claro" : "🌙 Modo oscuro";
    };
    actualizarTextoTema();
    themeToggleBtn.addEventListener("click", () => {
      toggleTheme();
      actualizarTextoTema();
    });
  }

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

// Barra delgada fija en la parte inferior de la pantalla con la versión de
// la app (pedido de Javier, sept. 2026: antes vivía como texto chiquito
// dentro del topbar, junto al logo — se movió aquí para no competir
// visualmente con la marca, y el formato pasó de fecha (`2026.09.24`) a
// semántico (`X.X.X`). Se crea una sola vez por carga de página (todas las
// páginas autenticadas la comparten vía este mismo shell), y no se muestra
// en el flujo de login/cambio de contraseña (initShell nunca llega a
// buildChrome ahí).
function buildVersionBar() {
  if (document.getElementById("version-bar")) return;
  const bar = document.createElement("div");
  bar.id = "version-bar";
  bar.className = "version-bar";
  bar.textContent = `Short Kaizen v${CONFIG.APP_VERSION}` + (CONFIG.APP_BUILD ? ` · ${CONFIG.APP_BUILD}` : "");
  bar.title = "Versión de la aplicación en ejecución";
  document.body.appendChild(bar);
}

const ROLE_LABEL = {
  solicitante: "Integrante",
  lider: "Líder",
  gerente: "Gerente",
  mc: "Mejora Continua",
  admin: "Administrador",
};
