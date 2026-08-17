// ============================================================================
// api.js — Única puerta de entrada/salida de datos de la app.
//
// Ningún otro archivo debe usar `fetch` directo ni tocar `localStorage` para
// datos de negocio. Todo pasa por aquí, para que el día que el backend de
// Jesús esté listo, el cambio sea: apagar MOCK_MODE en config.js. Nada más.
//
// Contrato esperado del backend real (documentado también en README.md):
//
//   POST   /auth/login              { nomina, password }        -> { token, user }
//   GET    /equipos                                              -> Equipo[]
//   GET    /kaizens                                              -> Kaizen[]
//   GET    /kaizens/:id                                          -> Kaizen
//   POST   /kaizens                 { ...datosDelFormulario }    -> Kaizen
//   GET    /approvals/:token                                     -> { kaizen, step }
//   POST   /approvals/:token        { decision, nombre, firma,
//                                      razonRechazo, password }  -> Kaizen
//
// Todas las respuestas de error deben usar código HTTP != 2xx y un body
// { error: "mensaje legible" } — este módulo ya sabe leer ese formato.
// ============================================================================

import { CONFIG } from "./config.js";
import { mockBackend } from "./lib/mock-backend.js";

const SESSION_KEY = "sk_session_token"; // solo el token de sesión, nunca una contraseña

// Mapeo de rutas lógicas -> Supabase Edge Functions (cada función vive en su
// propia URL, a diferencia del backend con API_BASE_URL único que se había
// asumido originalmente). Ver guía de integración de Jesús (TI).
const FUNCTION_MAP = [
  { method: "POST", pattern: /^\/auth\/login$/, fn: "auth-login" },
  { method: "GET", pattern: /^\/auth\/session$/, fn: "auth-session" },
  { method: "GET", pattern: /^\/equipos$/, fn: "equipos-list" },
  { method: "GET", pattern: /^\/kaizens$/, fn: "kaizens-list" },
  { method: "GET", pattern: /^\/kaizens\/(.+)$/, fn: "kaizens-detail" },
  { method: "POST", pattern: /^\/kaizens$/, fn: "kaizens-create" },
  { method: "GET", pattern: /^\/approvals\/(.+)$/, fn: "approvals-get" },
  { method: "POST", pattern: /^\/approvals\/(.+)$/, fn: "approvals-post" },
];

function resolveUrl(path, method) {
  const match = FUNCTION_MAP.find((r) => r.method === method && r.pattern.test(path));
  if (!match) throw new Error(`No hay mapeo para ${method} ${path}`);
  const captured = path.match(match.pattern)?.[1];
  const base = `${CONFIG.SUPABASE_FUNCTIONS_URL}/${match.fn}`;
  return captured ? `${base}/${captured}` : base;
}

async function request(path, { method = "GET", body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(resolveUrl(path, method), {
      method,
      headers: {
        "Content-Type": "application/json",
        "apikey": CONFIG.SUPABASE_ANON_KEY,
        ...(getSessionToken() ? { Authorization: `Bearer ${getSessionToken()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error de red (${res.status})`);
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("El servidor no respondió a tiempo. Intenta de nuevo.");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function getSessionToken() {
  return sessionStorage.getItem(SESSION_KEY);
}
function setSessionToken(token) {
  if (token) sessionStorage.setItem(SESSION_KEY, token);
  else sessionStorage.removeItem(SESSION_KEY);
}

export const api = {
  isMock() {
    return CONFIG.MOCK_MODE;
  },

  async login(nomina, password) {
    const result = CONFIG.MOCK_MODE
      ? await mockBackend.login(nomina, password)
      : await request("/auth/login", { method: "POST", body: { nomina, password } });
    setSessionToken(result.token);
    return result.user;
  },

  logout() {
    setSessionToken(null);
  },

  hasSession() {
    return Boolean(getSessionToken());
  },

  async restoreSession() {
    const token = getSessionToken();
    if (!token) return null;
    if (CONFIG.MOCK_MODE) return mockBackend.getSession(token);
    try {
      return await request("/auth/session");
    } catch {
      setSessionToken(null);
      return null;
    }
  },

  async getEquipos() {
    return CONFIG.MOCK_MODE ? mockBackend.getEquipos() : request("/equipos");
  },

  async getKaizens() {
    return CONFIG.MOCK_MODE ? mockBackend.getKaizens() : request("/kaizens");
  },

  async getKaizen(id) {
    return CONFIG.MOCK_MODE ? mockBackend.getKaizen(id) : request(`/kaizens/${encodeURIComponent(id)}`);
  },

  async crearKaizen(payload) {
    return CONFIG.MOCK_MODE ? mockBackend.crearKaizen(payload) : request("/kaizens", { method: "POST", body: payload });
  },

  /** Se llama al abrir un link de aprobación (?token=...) proveniente del correo */
  async obtenerDatosAprobacion(token) {
    return CONFIG.MOCK_MODE
      ? mockBackend.obtenerDatosAprobacion(token)
      : request(`/approvals/${encodeURIComponent(token)}`);
  },

  /** Envía la decisión (aprobar/rechazar) de un paso de aprobación */
  async procesarAprobacion(token, payload) {
    return CONFIG.MOCK_MODE
      ? mockBackend.procesarAprobacion(token, payload)
      : request(`/approvals/${encodeURIComponent(token)}`, { method: "POST", body: payload });
  },
};
