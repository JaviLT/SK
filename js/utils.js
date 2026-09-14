// ============================================================================
// utils.js — Helpers sin estado, reutilizados por toda la app.
// ============================================================================

/**
 * Escapa HTML antes de insertar cualquier texto proveniente de datos
 * (formulario, base de datos, parámetros de URL, etc.) en el DOM.
 *
 * Regla del proyecto: NINGÚN dato dinámico se inserta con innerHTML sin
 * pasar primero por esta función (o por el helper `el()` de abajo, que ya
 * la aplica). Este es el punto que cierra el hallazgo de XSS de la versión
 * anterior — no se hace excepción para "campos que parecen seguros".
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Crea un elemento DOM de forma segura, sin pasar por innerHTML.
 * Uso: el('div', {class:'card'}, ['texto', otroElemento])
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === "class") node.className = val;
    else if (key.startsWith("on") && typeof val === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (val !== false && val !== null && val !== undefined) {
      node.setAttribute(key, val);
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/** Muestra un toast. type: 'default' | 'tg' (éxito) | 'tr' (error) */
export function toast(message, type = "default", duration = 3200) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const node = el("div", { class: `toast ${type !== "default" ? type : ""}`.trim() }, [message]);
  container.appendChild(node);
  setTimeout(() => node.remove(), duration);
}

/** Formatea una fecha ISO o Date a formato corto es-MX */
export function formatDate(value, opts = {}) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", ...opts });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Genera un id corto legible para mostrar (no usar como identificador real) */
export function shortId(id) {
  if (!id) return "----";
  return String(id).slice(-4).toUpperCase();
}

/**
 * Redimensiona y comprime una imagen (File/Blob) en el navegador antes de
 * enviarla — evita documentos pesados y cargas lentas en conexiones de planta.
 * Devuelve un dataURL base64 listo para preview o para enviar al backend.
 */
export function compressImage(file, { maxWidth = 900, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Archivo de imagen inválido"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Debounce simple para inputs de búsqueda/filtro */
export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Lee un parámetro de la query string actual */
export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}
