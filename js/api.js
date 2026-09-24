// ============================================================================
// api.js — Única puerta de entrada/salida de datos de la app.
//
// Ningún otro archivo debe usar `fetch` directo ni tocar `localStorage` para
// datos de negocio. Todo pasa por aquí, para que el día que el backend de
// Jesús esté listo, el cambio sea: apagar MOCK_MODE en config.js. Nada más.
//
// Contrato esperado del backend real (documentado también en README.md y en
// el documento de traspaso para Jesús — flujo de 3 pasos: Mejora Continua →
// Líder → Gerente):
//
//   POST   /auth/login              { nomina, password }        -> { token, user }
//                                    user.requiereCambioPassword indica si
//                                    hay que forzar el cambio de contraseña
//                                    antes de dejar entrar a la app.
//                                    user = { nomina, nombre, rol, equipo,
//                                    departamento, requiereCambioPassword }
//                                    — rol ∈ "solicitante" | "lider" |
//                                    "gerente" | "admin" (ya NO existe el
//                                    rol "aprobador": el paso de Mejora
//                                    Continua se resuelve por correo, no por
//                                    un usuario que inicia sesión). El
//                                    gerente ve/aprueba TODO su
//                                    "departamento" (puede tener varios
//                                    Equipos Lean), no un equipo asignado.
//   POST   /auth/cambiar-password   { passwordActual,
//                                      passwordNueva }           -> { ok: true }
//   GET    /departamentos                                        -> string[]
//   GET    /equipos                                              -> Equipo[]
//   GET    /kaizens                                              -> Kaizen[]
//   GET    /kaizens/:id                                          -> Kaizen
//   POST   /kaizens                 { ...datosDelFormulario }    -> Kaizen
//   GET    /approvals/:token                                     -> { kaizen, step }
//                                    step ∈ "aprobacion1" | "aprobacion2" |
//                                    "aprobacion3" (modelo de 2-o-3 pasos,
//                                    ver KaizenZX_Flujo_Definitivo_Aprobacion.md)
//   POST   /approvals/:token        { decision, password }       -> Kaizen
//                                    decision ∈ "aprobar" | "rechazar" — ya
//                                    NO se manda nombre/firma/razón: el
//                                    backend identifica a quien aprueba por
//                                    el token + su contraseña.
//   POST   /kaizens/:id/decision    { decision }                 -> Kaizen
//                                    Aprobación de un clic desde la pestaña
//                                    "Solicitudes" (con sesión). Autoriza por
//                                    nómina exacta congelada en el kaizen,
//                                    nunca por rol.
//   POST   /equipos                 { nombre, departamentoId, liderEmail? } -> Equipo
//   PUT    /equipos/:id             { ...campos a actualizar }   -> Equipo
//   DELETE /equipos/:id                                          -> { ok: true }
//                                    Bloquea si el equipo tiene empleados o
//                                    kaizens históricos asociados.
//   POST   /equipos/:id/empleados   { nomina }                   -> Equipo
//   DELETE /equipos/empleados       { nomina }                   -> { ok: true }
//   GET    /empleados/:nomina                                    -> Empleado
//                                    Restringido a admin/mc.
//   POST   /empleados               { nomina, nombre,
//                                      departamentoId, equipoId?,
//                                      posicion, aprobador2Nomina?,
//                                      aprobador3Nomina? }
//                                    -> { nomina, nombre, passwordInicial,
//                                         aprobador2Nomina,
//                                         aprobador3Nomina, mensaje }
//                                    Alta de empleados nuevos
//                                    (KaizenZX_Alta_Empleados_Y_Cambio_Rol_
//                                    Listo.md, Jesús, sept. 2026).
//                                    Restringido a admin/mc. `equipoId` es
//                                    opcional. `posicion` ∈
//                                    "integrante"|"lider"|"gerente" — de
//                                    ahí el backend deriva el `rol` de
//                                    sistema, no se manda aparte.
//                                    `aprobador2Nomina`/`aprobador3Nomina`
//                                    se auto-rellenan desde `equipoId` si
//                                    no se mandan explícitos; mandar ""
//                                    fuerza dejarlos vacíos aunque el
//                                    equipo sí tenga uno asignado. 409 si
//                                    la nómina ya existe.
//                                    `passwordInicial` viene en texto
//                                    plano UNA SOLA VEZ en la respuesta —
//                                    no se puede volver a consultar, hay
//                                    que mostrarla en pantalla para que el
//                                    admin la copie.
//   POST   /usuarios/:nomina/rol    { rol }                      -> { nomina,
//                                      nombre, rolAnterior, rolNuevo,
//                                      mensaje }
//                                    Cambiar el rol de sistema de una
//                                    persona (mismo documento que alta de
//                                    empleados). Restringido a admin/mc.
//                                    `rol` ∈ "solicitante"|"lider"|
//                                    "gerente"|"admin" — NUNCA "mc" (400
//                                    si se intenta, bloqueo duro del
//                                    backend) y nunca el propio usuario
//                                    autenticado (400, bloqueo duro). Los
//                                    aprobadores reales de la persona
//                                    (aprobador2/3_nomina) NUNCA se tocan
//                                    al cambiar su rol. Si deja de ser
//                                    "gerente", el backend limpia solo sus
//                                    filas de `equipos_gerentes`/
//                                    `departamentos_gerentes`.
//   GET    /cambios-rol             (sin parámetros)              -> [{
//                                      id, nominaAfectada,
//                                      nombreAfectada, rolAnterior,
//                                      rolNuevo, nominaEjecutor,
//                                      nombreEjecutor, creadoEn }]
//                                    Historial de cambios de rol, más
//                                    reciente primero.
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
  { method: "POST", pattern: /^\/auth\/cambiar-password$/, fn: "auth-cambiar-password" }, // pendiente en el backend, ver doc para Jesús
  { method: "GET", pattern: /^\/departamentos$/, fn: "departamentos-list" }, // pendiente en el backend, ver doc para Jesús
  { method: "GET", pattern: /^\/equipos$/, fn: "equipos-list" },
  { method: "GET", pattern: /^\/kaizens$/, fn: "kaizens-list" },
  { method: "GET", pattern: /^\/kaizens\/(.+)$/, fn: "kaizens-detail" },
  { method: "POST", pattern: /^\/kaizens$/, fn: "kaizens-create" },
  { method: "GET", pattern: /^\/approvals\/(.+)$/, fn: "approvals-get" },
  { method: "POST", pattern: /^\/approvals\/(.+)$/, fn: "approvals-post" },
  // Aprobación de un clic desde la pestaña "Solicitudes" (ya con sesión
  // iniciada) — pendiente en el backend real, ver docs/PARA_JESUS.md.
  { method: "POST", pattern: /^\/kaizens\/(.+)\/decision$/, fn: "kaizens-decision" },
  // Administración de equipos/empleados — Fase 5, ya construidas por Jesús.
  //
  // BUG CORREGIDO (KaizenZX_Bugs_Frontend_Quitar_Eliminar.md, reportado por
  // Jesús): `resolveUrl()` usa `FUNCTION_MAP.find(...)`, que se queda con la
  // PRIMERA regla que haga match — no la más específica. El patrón genérico
  // `DELETE /equipos/(.+)` (equipos-delete) hacía match también con
  // "/equipos/empleados" (capturando "empleados" como si fuera un id de
  // equipo) porque estaba declarado ANTES que el patrón específico de
  // equipos-empleados-remove. Resultado: `eliminarEmpleado()` nunca llegaba
  // a `equipos-empleados-remove` — llamaba a `equipos-delete` con un id
  // inexistente ("empleados"). Fix: el patrón específico va primero, y de
  // paso se excluye "empleados" del patrón genérico como segunda capa de
  // seguridad (`(?!empleados$)`), para que este tipo de colisión no pueda
  // repetirse aunque cambie el orden del arreglo en el futuro.
  { method: "POST", pattern: /^\/equipos$/, fn: "equipos-create" },
  { method: "PUT", pattern: /^\/equipos\/(.+)$/, fn: "equipos-update" },
  { method: "DELETE", pattern: /^\/equipos\/empleados$/, fn: "equipos-empleados-remove" },
  { method: "DELETE", pattern: /^\/equipos\/(?!empleados$)(.+)$/, fn: "equipos-delete" },
  { method: "POST", pattern: /^\/equipos\/(.+)\/empleados$/, fn: "equipos-empleados-add" },
  { method: "GET", pattern: /^\/empleados\/(.+)$/, fn: "empleados-get" },
  // Alta de empleados + cambio de rol de sistema, ya construidas por Jesús
  // (KaizenZX_Alta_Empleados_Y_Cambio_Rol_Listo.md, sept. 2026).
  { method: "POST", pattern: /^\/empleados$/, fn: "empleados-create" },
  { method: "POST", pattern: /^\/usuarios\/(.+)\/rol$/, fn: "usuarios-cambiar-rol" },
  { method: "GET", pattern: /^\/cambios-rol$/, fn: "cambios-rol-list" },
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
    // Si el body no es JSON válido (p.ej. el backend regresó texto plano o
    // el body viene vacío), no perder silenciosamente el mensaje real del
    // servidor: se incluye un fragmento del texto crudo en el fallback, en
    // vez de solo "Error de red (status)" sin contexto — así, si vuelve a
    // pasar algo como el bug reportado por Jesús (mensaje genérico en vez
    // del error real de `equipos-delete`), el toast da una pista real de
    // qué llegó del servidor en vez de esconderlo.
    const rawText = await res.clone().text().catch(() => "");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const fallback = rawText ? `Error de red (${res.status}): ${rawText.slice(0, 200)}` : `Error de red (${res.status})`;
      throw new Error(data.error || fallback);
    }
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

  /** Cambio de contraseña obligatorio en el primer login (ver ¿Qué falta del backend? en el doc para Jesús) */
  async cambiarPassword(passwordActual, passwordNueva) {
    return CONFIG.MOCK_MODE
      ? mockBackend.cambiarPassword(passwordActual, passwordNueva)
      : request("/auth/cambiar-password", { method: "POST", body: { passwordActual, passwordNueva } });
  },

  async getDepartamentos() {
    return CONFIG.MOCK_MODE ? mockBackend.getDepartamentos() : request("/departamentos");
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

  /**
   * Aprobación/rechazo de un clic desde la pestaña "Solicitudes" dentro de la
   * app (no desde el link de correo) — no pide contraseña otra vez: el
   * backend real debe identificar a quien decide por la sesión (el token
   * Bearer ya enviado en cada request), nunca por un campo del body.
   */
  async aprobarEnApp(kaizenId, decision) {
    const { state } = await import("./state.js");
    return CONFIG.MOCK_MODE
      ? mockBackend.aprobarEnApp(kaizenId, decision, state.user)
      : request(`/kaizens/${encodeURIComponent(kaizenId)}/decision`, { method: "POST", body: { decision } });
  },

  // ---- Administración de equipos/empleados (Fase 5) ----

  async crearEquipo(payload) {
    return CONFIG.MOCK_MODE ? mockBackend.crearEquipo(payload) : request("/equipos", { method: "POST", body: payload });
  },

  async actualizarEquipo(equipoId, payload) {
    return CONFIG.MOCK_MODE
      ? mockBackend.actualizarEquipo(equipoId, payload)
      : request(`/equipos/${encodeURIComponent(equipoId)}`, { method: "PUT", body: payload });
  },

  async eliminarEquipo(equipoId) {
    return CONFIG.MOCK_MODE
      ? mockBackend.eliminarEquipo(equipoId)
      : request(`/equipos/${encodeURIComponent(equipoId)}`, { method: "DELETE" });
  },

  async agregarEmpleado(equipoId, nomina) {
    return CONFIG.MOCK_MODE
      ? mockBackend.agregarEmpleado(equipoId, { nomina })
      : request(`/equipos/${encodeURIComponent(equipoId)}/empleados`, { method: "POST", body: { nomina } });
  },

  async eliminarEmpleado(nomina) {
    return CONFIG.MOCK_MODE
      ? mockBackend.eliminarEmpleado(nomina)
      : request("/equipos/empleados", { method: "DELETE", body: { nomina } });
  },

  async buscarEmpleadoPorNomina(nomina) {
    return CONFIG.MOCK_MODE
      ? mockBackend.buscarEmpleadoPorNomina(nomina)
      : request(`/empleados/${encodeURIComponent(nomina)}`);
  },

  // ---- Alta de empleados + cambio de rol de sistema (Fase 5.5) ----
  // KaizenZX_Alta_Empleados_Y_Cambio_Rol_Listo.md, Jesús, sept. 2026.

  async crearEmpleado(payload) {
    return CONFIG.MOCK_MODE ? mockBackend.crearEmpleado(payload) : request("/empleados", { method: "POST", body: payload });
  },

  async cambiarRolUsuario(nomina, rol) {
    return CONFIG.MOCK_MODE
      ? mockBackend.cambiarRolUsuario(nomina, rol)
      : request(`/usuarios/${encodeURIComponent(nomina)}/rol`, { method: "POST", body: { rol } });
  },

  async getHistorialCambiosRol() {
    return CONFIG.MOCK_MODE ? mockBackend.getHistorialCambiosRol() : request("/cambios-rol");
  },
};
