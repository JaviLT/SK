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

// Nombres del catálogo que difieren del archivo de Mejora Continua (oct. 2026).
// Se aceptan ambos: si algún día se corrige el nombre en el catálogo, sigue
// coincidiendo con el del archivo.
const ALIAS_HISTORICO = {
  "C4 CEDIS": ["C4"],
  "ENTREGA2 LEAN": ["Entrega2"],
  "LOS INALCANZABLES": ["Los Incalcanzables"],
  "MORTAL KOMPRAS": ["Motal Kompras"],
};

/** ¿El equipo `nombreHist` del archivo es el mismo que `nombreCatalogo`? */
export function coincideEquipo(nombreHist, nombreCatalogo) {
  const objetivo = claveEquipo(nombreCatalogo);
  return [nombreHist, ...(ALIAS_HISTORICO[nombreHist] || [])].some((n) => claveEquipo(n) === objetivo);
}

/**
 * SK de un equipo en un mes: si el histórico de Mejora Continua trae dato para
 * ese equipo/año/mes se usa ese número; si no, los SK implementados reales de
 * la app (`status === "done"`, por `fechaImpl`). Así un mes nunca se cuenta
 * dos veces. `mes` es 1..12.
 */
export function conteoEquipoMes(historico, kaizens, nombreEquipo, anio, mes) {
  const histAnio = historico?.[String(anio)] || {};
  const nombreHist = Object.keys(histAnio).find((n) => coincideEquipo(n, nombreEquipo));
  const h = nombreHist ? histAnio[nombreHist][mes - 1] : null;
  if (h !== null && h !== undefined) return h;
  const clave = claveEquipo(nombreEquipo);
  return kaizens.filter((k) => {
    if (k.status !== "done" || !k.fechaImpl || claveEquipo(k.equipo) !== clave) return false;
    const d = new Date(k.fechaImpl);
    return d.getFullYear() === anio && d.getMonth() + 1 === mes;
  }).length;
}
