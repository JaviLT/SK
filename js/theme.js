// ============================================================================
// theme.js — Modo claro/oscuro (pedido de Javier, sept. 2026).
//
// Preferencia explícita del usuario, guardada en localStorage — NO sigue la
// preferencia del sistema operativo automáticamente, para que sea una
// elección consistente del usuario entre sesiones y no cambie sola. Se
// aplica poniendo `data-theme="dark"|"light"` en <html>; todo el resto del
// tema vive en variables CSS (ver css/variables.css, bloque
// `:root[data-theme="dark"]`) — este módulo solo decide y persiste cuál
// aplica, no define ningún color.
//
// Para evitar el parpadeo de tema (FOUC: se ve claro un instante y luego
// cambia a oscuro), cada página autenticada trae además un script inline
// chiquito en el <head>, ANTES de cargar las hojas de estilo, que aplica el
// tema guardado de forma síncrona — este módulo es para lo que pasa
// DESPUÉS de cargada la página (el toggle en el menú de usuario).
// ============================================================================

const KEY = "sk_theme"; // "light" | "dark"

export function getTheme() {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme === "dark" ? "dark" : "light");
  } catch {
    /* localStorage no disponible (privado/bloqueado) — el tema no persiste entre recargas, pero la página no se rompe */
  }
  applyTheme(theme);
}

export function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

// Por si esta página no trajo el script inline anti-parpadeo en el <head>
// (por ejemplo si se agrega una página nueva y se le olvida) — aplica el
// tema guardado de todos modos, aunque ya con el parpadeo inicial.
export function initTheme() {
  applyTheme(getTheme());
}
