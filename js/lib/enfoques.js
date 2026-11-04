// ============================================================================
// enfoques.js — Opciones de "Enfoque de la mejora" (nov. 2026).
//
// Pedido de Javier: el texto que se ve en pantalla, PDF y exportes es solo lo
// que iba entre paréntesis (p. ej. "Rentabilidad (Ahorros)" → "Ahorros").
// El `valor` es lo que se guarda en el SK y NO cambió (así no se rompe la
// validación del backend ni los SK ya creados); solo cambia la etiqueta.
// ============================================================================

export const ENFOQUES = [
  { valor: "Rentabilidad", label: "Ahorros" },
  { valor: "Sustentabilidad", label: "Enfoque de reducción del impacto ambiental" },
  { valor: "Bienestar del personal", label: "Seguridad, Ergonomía" },
  { valor: "Mejora en el proceso", label: "8S, 7 Desperdicios + 1, Calidad, Merma, Entregas" },
];

/** Texto a mostrar para un enfoque guardado (valores desconocidos se muestran tal cual). */
export function etiquetaEnfoque(valor) {
  return ENFOQUES.find((e) => e.valor === valor)?.label ?? valor;
}

/** Lista de enfoques de un SK, ya con su texto para mostrar. */
export function etiquetasEnfoques(lista) {
  return (lista || []).map(etiquetaEnfoque);
}
