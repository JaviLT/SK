// ============================================================================
// sk-pdf.js — PDF de un Short Kaizen (jsPDF, sin backend). Compartido por
// detalle.js ("Exportar PDF") y admin.js (descarga mensual en ZIP).
// ============================================================================

import { formatDate, formatDateTime, shortId } from "../utils.js";

/**
 * Construye el PDF de un kaizen, directo en el navegador (jsPDF, sin backend).
 * Lo usan el botón "Exportar PDF" del detalle y la descarga masiva (ZIP) de
 * Administración.
 *
 * El diseño se acerca a la primera página del formato oficial MEJ-F-03
 * (encabezado azul, secciones por bloques, fotos antes/después lado a
 * lado), incluyendo el logo de Short Kaizen en el encabezado (dentro de un
 * recuadro blanco, para no deformarlo ni recolorearlo — ver manual de marca).
 */
export async function construirPdfSK(k) {
  {
    const [{ jsPDF }, logoDataUrl] = await Promise.all([loadJsPDF(), loadLogoDataUrl()]);
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 12;
    const contentW = pageW - margin * 2;
    const BLUE = [13, 24, 168]; // #0D18A8
    const GRAY = [100, 116, 139];

    let y = margin;

    // ---- Encabezado ----
    doc.setFillColor(...BLUE);
    doc.rect(margin, y, contentW, 14, "F");
    if (logoDataUrl) {
      // Logo dentro de un chip blanco: mantiene la combinación de color
      // permitida (azul sobre blanco) aunque el fondo del encabezado sea azul.
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 2, y + 2, 10, 10, 1.2, 1.2, "F");
      doc.addImage(logoDataUrl, "PNG", margin + 2.8, y + 2.8, 8.4, 8.4);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, "bold");
    doc.setFontSize(14);
    doc.text("Short Kaizen", margin + (logoDataUrl ? 16 : 4), y + 9);
    doc.setFontSize(10);
    doc.text(`SK-${shortId(k.id)}`, margin + contentW - 4, y + 9, { align: "right" });
    y += 14 + 4;

    doc.setTextColor(...GRAY);
    doc.setFont(undefined, "normal");
    doc.setFontSize(8);
    doc.text("Zubex Industrial · Sistema de Gestión de Inocuidad y Calidad", margin, y);
    y += 6;

    // ---- ¿Quién identificó? / Enfoque ----
    const col2 = margin + contentW * 0.62;
    y = seccionTitulo(doc, "¿Quién identificó la mejora?", margin, y, contentW * 0.58);
    const yEnfoqueTitulo = seccionTitulo(doc, "Enfoque de la mejora", col2, y - 6, contentW * 0.38);
    let yA = campoTexto(doc, "Equipo", k.equipo, margin, y);
    yA = campoTexto(doc, "Nómina / Nombre", `${k.nomina} — ${k.nombre}`, margin, yA);
    yA = campoTexto(doc, "Departamento / Área", `${k.departamento || "—"} — ${k.areaLinea || k.donde || "—"}`, margin, yA);

    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    let yB = y;
    (k.enfoques || []).forEach((f) => {
      doc.text(`• ${f}`, col2, yB);
      yB += 5;
    });
    y = Math.max(yA, yB) + 3;

    // ---- Breve descripción ----
    y = seccionTitulo(doc, "Breve descripción de la mejora", margin, y, contentW);
    y = parrafo(doc, k.breveDescripcion, margin, y, contentW);

    // ---- Fotos antes/después ----
    const fotoW = contentW / 2 - 3;
    const fotoH = 42;
    const yFotosTop = y;
    y = seccionTitulo(doc, "Antes", margin, y, fotoW);
    seccionTitulo(doc, "Después", margin + fotoW + 6, yFotosTop, fotoW);
    const yFotos = y;
    dibujarFoto(doc, k.fotoAntes, margin, yFotos, fotoW, fotoH);
    dibujarFoto(doc, k.fotoDespues, margin + fotoW + 6, yFotos, fotoW, fotoH);
    y = yFotos + fotoH + 4;

    y = parrafo(doc, k.descAntes, margin, y, fotoW, margin + fotoW + 6);
    const yDespuesTexto = parrafo(doc, k.descDespues, margin + fotoW + 6, yFotos + fotoH + 4, fotoW);
    y = Math.max(y, yDespuesTexto) + 3;

    // ---- Estandarización / fechas ----
    if (k.estandarizacion) {
      y = seccionTitulo(doc, "Estandarización", margin, y, contentW);
      y = parrafo(doc, k.estandarizacion, margin, y, contentW);
    }
    y = campoTexto(doc, "Fecha de identificación", formatDate(k.fechaId), margin, y + 2);
    y = campoTexto(doc, "Fecha de implementación", formatDate(k.fechaImpl), margin, y);
    y = campoTexto(doc, "Tiempo de implementación", k.tiempoImpl ? `${k.tiempoImpl} ${k.unidadTiempo || ""}` : "—", margin, y);

    // ---- Autorizaciones ----
    y += 2;
    y = seccionTitulo(doc, "Autorizaciones", margin, y, contentW);
    const tienePaso3 = Boolean(k.nombreAprobacion3 || k.emailAprobacion3 || k.firmaAprobacion3Nombre);
    const autItems = [
      ["Mejora Continua", k.firmaAprobacion1Nombre, k.firmaAprobacion1Fecha],
      [k.nombreAprobacion2 || "Aprobación 2", k.firmaAprobacion2Nombre, k.firmaAprobacion2Fecha],
    ];
    if (tienePaso3) autItems.push([k.nombreAprobacion3 || "Aprobación 3", k.firmaAprobacion3Nombre, k.firmaAprobacion3Fecha]);
    const autCols = contentW / autItems.length;
    autItems.forEach(([rol, nombre, fecha], i) => autorizacion(doc, rol, nombre, fecha, margin + autCols * i, y, autCols - 3));

    y += 16 + 8;
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generado: ${formatDateTime(new Date())}`, margin, y);

    return doc;
  }
}

export function nombreArchivoSK(k) {
  return `SK-${shortId(k.id)}.pdf`;
}

function seccionTitulo(doc, texto, x, y, w) {
  doc.setFillColor(13, 24, 168);
  doc.rect(x, y, w, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, "bold");
  doc.setFontSize(8.5);
  doc.text(texto, x + 2, y + 4.2);
  doc.setTextColor(30, 41, 59);
  doc.setFont(undefined, "normal");
  return y + 6 + 3;
}

function campoTexto(doc, label, valor, x, y) {
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`${label}:`, x, y);
  doc.setTextColor(30, 41, 59);
  doc.setFont(undefined, "bold");
  doc.text(String(valor || "—"), x + 42, y);
  doc.setFont(undefined, "normal");
  return y + 5;
}

function parrafo(doc, texto, x, y, w) {
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  const lines = doc.splitTextToSize(texto || "—", w);
  doc.text(lines, x, y);
  return y + lines.length * 4.2 + 3;
}

function dibujarFoto(doc, dataUrl, x, y, w, h) {
  doc.setDrawColor(226, 232, 240);
  doc.rect(x, y, w, h);
  if (!dataUrl) {
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("Sin foto", x + w / 2, y + h / 2, { align: "center" });
    return;
  }
  try {
    const format = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
    doc.addImage(dataUrl, format, x + 1, y + 1, w - 2, h - 2, undefined, "FAST");
  } catch {
    /* si la imagen no se puede insertar, se deja el recuadro vacío */
  }
}

function autorizacion(doc, rol, nombre, fecha, x, y, w) {
  doc.setDrawColor(226, 232, 240);
  doc.rect(x, y, w, 16);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(rol, x + 2, y + 4);
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.setFont(undefined, "bold");
  doc.text(nombre || "Pendiente", x + 2, y + 10);
  doc.setFont(undefined, "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(fecha ? formatDate(fecha) : "—", x + 2, y + 14);
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
        // El logo se dibuja a 8.4 mm: se reduce a 160 px para que cada PDF no
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
