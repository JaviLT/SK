// ============================================================================
// historico-sk.js — Conteo mensual histórico de Short Kaizen por equipo.
//
// Origen: archivo de Mejora Continua (oct. 2026) con el número de SK que hizo
// cada equipo en cada mes de 2026, de ENERO a SEPTIEMBRE (antes de que la app
// registrara los SK). Vive en assets/data/historico-sk.json con la forma:
//   { "2026": { "NOMBRE DEL EQUIPO": [ene, feb, ..., dic], ... } }
// donde un mes sin dato es `null` (esos meses se calculan con los SK reales
// de la app) y un 0 es un cero real.
//
// Es SOLO el número por equipo y mes — sin detalle de cada SK. Para mover
// esto al backend más adelante basta con reemplazar `cargarHistorico()`; el
// resto del dashboard solo consume el objeto que regresa.
// ============================================================================

import { CONFIG } from "../config.js";

let cache = null;

export async function cargarHistorico() {
  if (cache) return cache;
  try {
    const res = await fetch(`assets/data/historico-sk.json?v=${encodeURIComponent(CONFIG.APP_VERSION)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cache = await res.json();
  } catch (err) {
    console.warn("[dashboard] No se pudo cargar el histórico mensual de SK:", err);
    cache = {};
  }
  return cache;
}

/** Clave comparable de un nombre de equipo: sin acentos, mayúsculas/minúsculas,
 *  signos ni espacios ("LOS CUARTOS BAT'S" == "Los Cuartos Bats",
 *  "TEAMWORK" == "Team Work"). */
export function claveEquipo(nombre) {
  return String(nombre || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
