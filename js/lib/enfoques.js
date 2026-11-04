// ============================================================================
// enfoques.js — Opciones de "Enfoque de la mejora".
//
// Nov. 2026 (pedido de Javier): cada opción muestra el texto COMPLETO, p. ej.
// "Rentabilidad (Ahorros)"; en el formulario lo que va entre paréntesis
// (`detalle`) se ve con otro formato y más pequeño que el texto principal.
// El `valor` es lo que se guarda en el SK y NO cambió (así no se rompe la
// validación del backend ni los SK ya creados).
// ============================================================================

export const ENFOQUES = [
  { valor: "Rentabilidad", principal: "Rentabilidad", detalle: "Ahorros" },
  { valor: "Sustentabilidad", principal: "Sustentabilidad", detalle: "Enfoque de reducción del impacto ambiental" },
  { valor: "Bienestar del personal", principal: "Bienestar del personal", detalle: "Seguridad, Ergonomía" },
  { valor: "Mejora en el proceso", principal: "Mejoras en el proceso", detalle: "8S, 7 Desperdicios + 1, Calidad, Merma, Entregas" },
];

/** Texto completo a mostrar (detalle, PDF, Excel); valores desconocidos se muestran tal cual. */
export function etiquetaEnfoque(valor) {
  const e = ENFOQUES.find((x) => x.valor === valor);
  return e ? `${e.principal} (${e.detalle})` : valor;
}

/** Lista de enfoques de un SK, ya con su texto completo para mostrar. */
export function etiquetasEnfoques(lista) {
  return (lista || []).map(etiquetaEnfoque);
}
