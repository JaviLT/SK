// ============================================================================
// state.js — Estado en memoria de la sesión de la app (no persistente).
//
// Nada sensible vive aquí más allá de lo que ya está en memoria por
// necesidad de la sesión activa. No hay contraseñas ni tokens de aprobación
// almacenados en este objeto — el token de sesión vive solo en api.js
// (sessionStorage), y los tokens de aprobación nunca se guardan del lado
// del cliente, se leen una vez de la URL y se descartan.
// ============================================================================

const listeners = new Set();

export const state = {
  user: null, // { nomina, nombre, rol, equipo, requiereCambioPassword }
  equipos: [],
  kaizens: [],
  departamentos: [],
  equipoActivo: null, // filtro de mosaico en la vista Historial / Administración
};

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
