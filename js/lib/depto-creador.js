// ============================================================================
// depto-creador.js — Departamento de QUIEN CREÓ un Short Kaizen (oct. 2026).
//
// `k.departamento` es el departamento donde se APLICARÁ la mejora (lo elige la
// persona en el formulario). Para GEMBA 4, Todos los SK y la gráfica de Mis
// Kaizen se necesita el departamento al que PERTENECE la persona que creó el
// SK. Se resuelve así, en orden:
//   1) el equipo del SK (`k.equipo`) → su departamento en el catálogo de equipos;
//   2) `k.departamentoSolicitante` (campo que se pidió a Jesús: departamento de
//      la persona que creó el SK) — sirve también para quien no tiene equipo;
//   3) nada → null ("Sin clasificar"); NO se cae al departamento de aplicación.
// ============================================================================

import { claveEquipo } from "./historico-sk.js";

/** Nombre del departamento de un equipo del catálogo (o null). */
export function departamentoDeEquipo(eq, departamentos, cacheKaizens = {}) {
  if (!eq) return null;
  if (eq.departamentoId) {
    const match = (departamentos || []).find((d) => String(d.id) === String(eq.departamentoId));
    if (match?.nombre) return match.nombre;
  }
  if (eq.departamento) return typeof eq.departamento === "string" ? eq.departamento : eq.departamento.nombre || null;
  return cacheKaizens[eq.nombre] || null;
}

/**
 * Construye una función `deptoDe(k)` con el contexto ya preparado.
 * @param {object[]} equipos       GET /equipos
 * @param {object[]} departamentos GET /departamentos (normalizados a {id,nombre})
 * @param {object[]} kaizens       solo para inferir depto de equipos sin dato directo
 * @param {{fallbackAplicacion?: boolean}} [opts] true = si no se puede saber el
 *   depto del creador, usar el de aplicación (solo para filtros de visibilidad)
 */
export function crearResolvedorDeptoCreador(equipos, departamentos, kaizens, opts = {}) {
  const cache = {};
  // Equipos sin departamento en el catálogo: se infiere del historial de SK
  // (igual que en el resto de la app; preferiendo el del creador si viene).
  (kaizens || []).forEach((k) => {
    const d = k.departamentoSolicitante || k.departamento;
    if (k.equipo && d) cache[k.equipo] = d;
  });
  const porEquipo = new Map((equipos || []).map((eq) => [claveEquipo(eq.nombre), departamentoDeEquipo(eq, departamentos, cache)]));
  return (k) => {
    if (k.equipo) {
      const d = porEquipo.get(claveEquipo(k.equipo));
      if (d) return d;
    }
    if (k.departamentoSolicitante) return k.departamentoSolicitante;
    return opts.fallbackAplicacion ? k.departamento || null : null;
  };
}
