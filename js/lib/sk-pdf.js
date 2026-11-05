// ============================================================================
// sk-pdf.js — PDF de un Short Kaizen (jsPDF, sin backend). Compartido por
// detalle.js ("Exportar PDF") y admin.js (descarga mensual en ZIP).
// ============================================================================

import { etiquetaEnfoque } from "./enfoques.js";
import { FORMATO_SK, filasFormatoSK } from "./formato-sk.js";
import { formatDate, formatDateTime, shortId } from "../utils.js";

/**
 * Construye el PDF de un kaizen, directo en el navegador (jsPDF, sin backend).
 *
 * Formato oficial MEJ-F-03 Rev. 08 (hoja carta horizontal, 792 x 612 pt):
 * mismas posiciones y tamaños que el PDF editable de Mejora Continua, con los
 * campos ya llenos. Si algún texto no cabe en su recuadro se reduce la letra
 * (hasta 6 pt); si aun así no cabe se corta con "…" y el texto completo va en
 * una hoja de continuación. La estandarización (que el formato Rev. 08 no
 * tiene como recuadro) también va en esa hoja cuando existe.
 */
export async function construirPdfSK(k) {
  const [{ jsPDF }, logoDataUrl] = await Promise.all([loadJsPDF(), loadLogoDataUrl()]);
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const folio = `SK-${shortId(k.id)}`;
  doc.setProperties({ title: `Short Kaizen — ${FORMATO_SK.clave} — ${folio}`, author: "Zubex Industrial" });

  const extras = []; // textos que no cupieron o que no tienen recuadro → hoja 2

  // ---- Encabezado azul ----
  rectRelleno(doc, 30, 24, 732, 42, C.azul);
  rectRelleno(doc, 36, 29, 32, 32, C.blanco);
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, "PNG", 39, 32, 26, 26); } catch { /* sin logo */ }
  }
  doc.setTextColor(...C.blanco);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Short Kaizen", 80, 51);

  // Bloque de control del formato (Sistema / Formato / Fecha / Clave / Revisión)
  doc.setFontSize(6.5);
  doc.text(FORMATO_SK.sistema, 420, 33);
  const ys = [41.5, 48.4, 55.3, 62.2];
  filasFormatoSK().forEach(([etiqueta, valor], i) => {
    doc.setFont("helvetica", "bold");
    const t = `${etiqueta}:`;
    doc.text(t, 420, ys[i]);
    const anchoEtiqueta = doc.getTextWidth(t); // se mide en negritas, antes de cambiar de fuente
    doc.setFont("helvetica", "normal");
    doc.text(valor, 420 + anchoEtiqueta + 3, ys[i]);
  });

  // Folio
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("Folio", 668, 42);
  caja(doc, 668, 46, 86, 14);
  texto(doc, folio, 668, 46, 86, 14, { max: 9, min: 7, bold: true, extras, titulo: "Folio" });

  doc.setTextColor(...C.gris);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Zubex Industrial · ${FORMATO_SK.sistema}`, 30, 79);

  // ---- ¿Quién identificó? / Enfoque ----
  barra(doc, "¿Quién identificó la mejora?", 30, 90, 470);
  barra(doc, "Enfoque de la mejora", 515, 90, 247);
  campo(doc, "Equipo", k.equipo, 110, extras);
  campo(doc, "Nómina / Nombre", `${k.nomina} — ${k.nombre}`, 126, extras);
  campo(doc, "Departamento / Área", `${k.departamento || "—"} — ${k.areaLinea || k.donde || "—"}`, 142, extras);

  caja(doc, 515, 106, 247, 52);
  const enfoques = (k.enfoques || []).map((f) => `• ${etiquetaEnfoque(f)}`).join("\n");
  texto(doc, enfoques, 515, 106, 247, 52, { max: 9, min: 6, extras, titulo: "Enfoque de la mejora" });

  // ---- Breve descripción ----
  barra(doc, "Breve descripción de la mejora", 30, 166, 732);
  caja(doc, 30, 182, 732, 34);
  texto(doc, k.breveDescripcion, 30, 182, 732, 34, { max: 8, min: 6, extras, titulo: "Breve descripción de la mejora" });

  // ---- Antes / Después ----
  barra(doc, "Antes", 30, 224, 358);
  barra(doc, "Después", 404, 224, 358);
  dibujarFoto(doc, k.fotoAntes, 30, 244, 358, 132);
  dibujarFoto(doc, k.fotoDespues, 404, 244, 358, 132);
  caja(doc, 30, 380, 358, 30);
  caja(doc, 404, 380, 358, 30);
  texto(doc, k.descAntes, 30, 380, 358, 30, { max: 8, min: 6, extras, titulo: "Antes — descripción" });
  texto(doc, k.descDespues, 404, 380, 358, 30, { max: 8, min: 6, extras, titulo: "Después y beneficios" });

  // ---- Fechas ----
  campo(doc, "Fecha de identificación", formatDate(k.fechaId), 418, extras, { x: 135, w: 253, h: 12, label: 428 });
  campo(doc, "Fecha de implementación", formatDate(k.fechaImpl), 433, extras, { x: 135, w: 253, h: 12, label: 443 });
  campo(
    doc,
    "Tiempo de implementación",
    k.tiempoImpl ? `${k.tiempoImpl} ${k.unidadTiempo || ""}`.trim() : "—",
    448,
    extras,
    { x: 135, w: 253, h: 12, label: 458 }
  );

  // ---- Autorizaciones ----
  barra(doc, "Autorizaciones", 30, 466, 732);
  const tienePaso3 = Boolean(k.nombreAprobacion3 || k.emailAprobacion3 || k.firmaAprobacion3Nombre);
  const aut = [
    ["Mejora Continua", k.firmaAprobacion1Nombre, k.firmaAprobacion1Fecha, true],
    [k.nombreAprobacion2 || "Aprobación 2", k.firmaAprobacion2Nombre, k.firmaAprobacion2Fecha, true],
    [k.nombreAprobacion3 || "Aprobación 3", k.firmaAprobacion3Nombre, k.firmaAprobacion3Fecha, tienePaso3],
  ];
  [30, 278, 526].forEach((x, i) => {
    const [rol, nombre, fecha, aplica] = aut[i];
    doc.setDrawColor(...C.borde);
    doc.setLineWidth(0.8);
    doc.setFillColor(...C.blanco);
    doc.rect(x, 488, 236, 62, "FD");
    const bx = x + 6;
    caja(doc, bx, 493, 224, 11);
    caja(doc, bx, 507, 224, 24);
    caja(doc, bx, 535, 224, 10);
    texto(doc, aplica ? rol : "No aplica", bx, 493, 224, 11, { max: 7, min: 6, color: C.gris, extras, titulo: "Autorización — rol" });
    if (aplica) {
      texto(doc, nombre || "Pendiente", bx, 507, 224, 24, { max: 8, min: 6, bold: true, extras, titulo: `Autorización — ${rol}` });
      texto(doc, fecha ? formatDate(fecha) : "—", bx, 535, 224, 10, { max: 7, min: 6, color: C.gris, extras, titulo: "Autorización — fecha" });
    }
  });

  caja(doc, 30, 560, 230, 11);
  texto(doc, `Generado: ${formatDateTime(new Date())}`, 30, 560, 230, 11, { max: 7, min: 6, color: C.gris, extras, titulo: "Generado" });

  // ---- Estandarización (el formato Rev. 08 no tiene recuadro para ella) ----
  if (k.estandarizacion) extras.push({ titulo: "Estandarización", texto: String(k.estandarizacion) });

  if (extras.length) hojaContinuacion(doc, folio, extras);

  return doc;
}

export function nombreArchivoSK(k) {
  return `SK-${shortId(k.id)}.pdf`;
}

// ---------------------------------------------------------------------------
// Paleta y primitivas de dibujo
// ---------------------------------------------------------------------------
const C = {
  azul: [13, 24, 168], // #0D18A8
  blanco: [255, 255, 255],
  campo: [219, 234, 254], // #DBEAFE — recuadros de captura del formato
  borde: [226, 232, 240], // #E2E8F0
  gris: [100, 116, 139], // #64748B
  hint: [148, 163, 184], // #94A3B8
  texto: [30, 41, 59], // #1E293B
};

function rectRelleno(doc, x, y, w, h, color) {
  doc.setFillColor(...color);
  doc.rect(x, y, w, h, "F");
}

function barra(doc, titulo, x, y, w) {
  rectRelleno(doc, x, y, w, 16, C.azul);
  doc.setTextColor(...C.blanco);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(titulo, x + 7, y + 11);
}

function caja(doc, x, y, w, h) {
  rectRelleno(doc, x, y, w, h, C.campo);
}

/** Etiqueta gris a la izquierda + recuadro azul claro con el valor. */
function campo(doc, etiqueta, valor, y, extras, o = {}) {
  const x = o.x ?? 130;
  const w = o.w ?? 370;
  const h = o.h ?? 13;
  doc.setTextColor(...C.gris);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${etiqueta}:`, 32, o.label ?? y + 10);
  caja(doc, x, y, w, h);
  texto(doc, valor, x, y, w, h, { max: 8, min: 6, extras, titulo: etiqueta });
}

/**
 * Escribe `valor` dentro del recuadro (x, y, w, h): baja la letra de `max` a
 * `min` hasta que quepa; si no cabe, corta con "…" y manda el texto completo a
 * la hoja de continuación (`extras`).
 */
function texto(doc, valor, x, y, w, h, { max = 8, min = 6, bold = false, color = C.texto, extras, titulo } = {}) {
  const t = String(valor ?? "").trim() || "—";
  const padX = 4;
  const padY = 2.5;
  const anchoUtil = w - padX * 2;
  const altoUtil = h - padY - 0.5;
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setTextColor(...color);

  let size = max;
  let lineas;
  for (;;) {
    doc.setFontSize(size);
    lineas = doc.splitTextToSize(t, anchoUtil);
    if (lineas.length * size * 1.2 <= altoUtil || size <= min) break;
    size = Math.max(min, size - 0.5);
  }

  const maxLineas = Math.max(1, Math.floor(altoUtil / (size * 1.2)));
  if (lineas.length > maxLineas) {
    const marca = " … (ver hoja 2)";
    lineas = lineas.slice(0, maxLineas);
    let ultima = lineas[maxLineas - 1];
    while (ultima.length && doc.getTextWidth(ultima + marca) > anchoUtil) ultima = ultima.slice(0, -1);
    lineas[maxLineas - 1] = ultima.trimEnd() + marca;
    extras?.push({ titulo, texto: t });
  }
  doc.text(lineas, x + padX, y + padY + size * 0.8, { lineHeightFactor: 1.2 });
}

/** Foto dentro de su marco, sin deformarla (se ajusta al recuadro y se centra). */
function dibujarFoto(doc, dataUrl, x, y, w, h) {
  doc.setFillColor(...C.blanco);
  doc.setDrawColor(...C.borde);
  doc.setLineWidth(0.8);
  doc.rect(x, y, w, h, "FD");
  if (!dataUrl) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.hint);
    doc.text("Sin foto", x + w / 2, y + h / 2 + 3, { align: "center" });
    return;
  }
  try {
    const format = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
    const props = doc.getImageProperties(dataUrl);
    const maxW = w - 4;
    const maxH = h - 4;
    const escala = Math.min(maxW / props.width, maxH / props.height);
    const iw = props.width * escala;
    const ih = props.height * escala;
    doc.addImage(dataUrl, format, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, "FAST");
  } catch {
    /* si la imagen no se puede insertar, se deja el marco vacío */
  }
}

/** Hoja(s) extra con los textos completos que no cupieron en la hoja 1. */
function hojaContinuacion(doc, folio, extras) {
  const unicos = [];
  extras.forEach((e) => {
    if (!unicos.some((u) => u.titulo === e.titulo && u.texto === e.texto)) unicos.push(e);
  });

  const nuevaHoja = () => {
    doc.addPage("letter", "landscape");
    rectRelleno(doc, 30, 24, 732, 28, C.azul);
    doc.setTextColor(...C.blanco);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Short Kaizen · ${folio} · Continuación`, 38, 42);
    doc.setFontSize(7);
    doc.text(`${FORMATO_SK.clave} · Rev. ${FORMATO_SK.revision}`, 754, 42, { align: "right" });
    return 64;
  };

  let y = nuevaHoja();
  const limite = 580;
  unicos.forEach(({ titulo, texto: t }) => {
    if (y + 16 + 14 > limite) y = nuevaHoja();
    barra(doc, titulo, 30, y, 732);
    y += 16 + 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.texto);
    const lineas = doc.splitTextToSize(t, 720);
    lineas.forEach((l) => {
      if (y > limite) y = nuevaHoja() + 12;
      doc.text(l, 36, y);
      y += 11.5;
    });
    y += 10;
  });
}

function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "assets/vendor/jspdf.umd.min.js";
    script.onload = () => resolve(window.jspdf);
    script.onerror = () => reject(new Error("No se pudo cargar el generador de PDF."));
    document.head.appendChild(script);
  });
}

let logoDataUrlCache = null;
/** Convierte assets/logo-mark.png a dataURL para poder incrustarlo con jsPDF. */
function loadLogoDataUrl() {
  if (logoDataUrlCache) return Promise.resolve(logoDataUrlCache);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        // El logo se dibuja a 26 pt: se reduce a 160 px para que cada PDF no
        // pese ~2 MB (jsPDF incrusta el PNG sin comprimir) — importa sobre todo
        // en la descarga mensual en ZIP, con decenas de PDF.
        const lado = Math.min(160, img.width);
        canvas.width = lado;
        canvas.height = Math.round((img.height * lado) / img.width);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        logoDataUrlCache = canvas.toDataURL("image/png");
        resolve(logoDataUrlCache);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = "assets/logo-mark.png";
  });
}
