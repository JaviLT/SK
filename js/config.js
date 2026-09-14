// ============================================================================
// config.js — Único lugar donde vive la configuración de entorno.
//
// IMPORTANTE (léase antes de tocar este archivo):
// Este frontend NO contiene credenciales de ningún servicio (Firebase,
// EmailJS, Azure/Microsoft 365, etc.) — esa parte la administra TI (Jesús)
// directamente en el backend, según los hallazgos de seguridad documentados.
//
// El frontend solo necesita saber la URL base del backend. Cuando ese
// backend esté listo, actualizar ÚNICAMENTE la constante API_BASE_URL y
// cambiar MOCK_MODE a false — nada más en este proyecto debería requerir
// cambios para conectarse a datos reales.
// ============================================================================

export const CONFIG = {
  // Backend real (Supabase Edge Functions), construido y probado por TI (Jesús).
  // Ver js/api.js -> resolveUrl() para el mapeo de rutas a funciones.
  SUPABASE_FUNCTIONS_URL: "https://prikubwqqvmjwsyegpqg.supabase.co/functions/v1",
  // La ANON KEY no es secreta: está diseñada para usarse del lado del cliente.
  SUPABASE_ANON_KEY: "sb_publishable_StBkIMg34ZDZzjH--SvCVQ_u4pt2d5i",

  // Mientras el backend no exista o no esté conectado, la app funciona
  // completa con datos de ejemplo en memoria (ver js/lib/mock-backend.js).
  // Cámbialo a false únicamente cuando el backend real esté disponible.
  MOCK_MODE: false,

  // Tiempo máximo de espera para cualquier llamada al backend (ms).
  REQUEST_TIMEOUT_MS: 15000,

  // Vigencia esperada de un link de aprobación (solo referencia visual en UI;
  // la validación real de expiración la hace el backend, nunca el cliente).
  APPROVAL_TOKEN_HINT_DAYS: 7,

  APP_NAME: "Short Kaizen",
  COMPANY_NAME: "Zubex Industrial",
};
