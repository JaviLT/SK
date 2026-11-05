// ============================================================================
// formato-sk.js — Datos de control del formato oficial "Short Kaizen"
// (Sistema de Gestión de Inocuidad y Calidad). Un solo lugar para actualizar
// cuando cambie la revisión: lo usan el encabezado de detalle.html y el PDF
// descargable (sk-pdf.js).
// ============================================================================

export const FORMATO_SK = {
  sistema: "Sistema de Gestión de Inocuidad y Calidad",
  formato: "Short Kaizen",
  fechaRevision: "4 de noviembre 2026",
  clave: "MEJ-F-03",
  revision: "08",
};

/** Filas "etiqueta: valor" del bloque de control (la primera línea va sola). */
export function filasFormatoSK() {
  return [
    ["Formato", FORMATO_SK.formato],
    ["Fecha de Revisión", FORMATO_SK.fechaRevision],
    ["Clave", FORMATO_SK.clave],
    ["Revisión", FORMATO_SK.revision],
  ];
}
