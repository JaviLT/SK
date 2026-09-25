import { el, formatDate, formatDateTime, shortId, toast } from "../utils.js";
import { api } from "../api.js";
import { state } from "../state.js";

export async function render(container, params, isStale) {
  const view = el("div", { class: "view", id: "detalle-view" });
  container.appendChild(view);
  view.appendChild(el("div", { class: "skeleton", style: "height:300px" }));

  try {
    const kaizen = await api.getKaizen(params.id);
    if (isStale && isStale()) return; // el usuario ya navegó a otra vista — no tocar el DOM
    view.innerHTML = "";
    paint(view, kaizen);
  } catch (err) {
    if (isStale && isStale()) return;
    view.innerHTML = "";
    view.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "icon" }, ["⚠️"]),
        el("h3", {}, ["No se encontró el kaizen"]),
        el("p", {}, [err.message || ""]),
      ])
    );
  }
}

// El resumen en pantalla se organiza como el reporte descargable en PDF:
// encabezado azul con folio y logo, bloque "quién/dónde/enfoque", breve
// descripción, fotos antes/después, estandarización y autorizaciones.
function paint(view, k) {
  view.appendChild(
    el("div", { class: "detail-header sk-report-header" }, [
      el("button", {
        class: "btn btn-outline btn-sm sk-back-btn",
        // Pedido de Javier (sept. 2026): "Volver" siempre regresa a
        // Solicitudes (antes iba a Mis Kaizens) — el detalle se abre casi
        // siempre desde ahí para aprobar/rechazar, así que es a donde debe
        // regresar sin importar de dónde se haya entrado.
        onclick: () => { window.location.href = "solicitudes.html"; },
      }, ["← Volver"]),
      el("div", { class: "sk-report-banner" }, [
        el("img", { src: "assets/logo-mark.png", alt: "Short Kaizen", class: "sk-report-logo" }),
        el("div", {}, [
          el("h1", {}, [`SK-${shortId(k.id)}`]),
          el("p", {}, [`${k.equipo} · ${k.areaLinea || k.donde || "—"}`]),
        ]),
        el("button", { class: "btn btn-accent sk-export-btn", onclick: () => exportPDF(k) }, ["⬇ Exportar PDF"]),
      ]),
    ])
  );

  const grid = el("div", { class: "detail-grid" }, [
    el("div", { class: "card" }, [
      el("h3", {}, ["Datos generales"]),
      kv("Solicitante", `${k.nombre} (${k.nomina})`),
      kv("Departamento", k.departamento),
      kv("Breve descripción", k.breveDescripcion),
      kv("Fecha de identificación", formatDate(k.fechaId)),
      kv("Fecha de implementación", formatDate(k.fechaImpl)),
      kv("Tiempo de implementación", k.tiempoImpl ? `${k.tiempoImpl} ${k.unidadTiempo || ""}` : null),
      kv("Enfoque", (k.enfoques || []).join(", ")),
    ]),
    el("div", { class: "card" }, [
      el("h3", {}, ["Descripción de la mejora"]),
      kv("Antes", k.descAntes),
      kv("Después y beneficios", k.descDespues),
      kv("Estandarización", k.estandarizacion),
    ]),
  ]);
  view.appendChild(grid);

  if (k.fotoAntes || k.fotoDespues) {
    view.appendChild(
      el("div", { class: "card", style: "margin-top:20px" }, [
        el("h3", {}, ["Evidencia fotográfica"]),
        el("div", { class: "detail-photos" }, [
          photoFigure(k.fotoAntes, "Antes"),
          photoFigure(k.fotoDespues, "Después"),
        ]),
      ])
    );
  }

  view.appendChild(
    el("div", { class: "card", style: "margin-top:20px" }, [el("h3", {}, ["Autorizaciones"]), buildAutorizaciones(k)])
  );

  // Pedido de Javier (sept. 2026): poder aprobar/rechazar directo desde el
  // detalle, no solo desde la pestaña Solicitudes. Reutiliza exactamente la
  // misma llamada de un clic (`api.aprobarEnApp`, ya usada en
  // solicitudes.js) y la misma regla de autorización por rol/nómina — se
  // duplica aquí a propósito (mismo criterio que otras duplicaciones ya
  // documentadas en el proyecto, como `departamentoDeEquipo()`), porque
  // solicitudes.js no expone estas funciones como módulo reutilizable.
  if (puedeDecidir(k)) {
    view.appendChild(
      el("div", { class: "card", style: "margin-top:20px" }, [
        el("h3", {}, ["Tu decisión"]),
        el("p", { class: "hint", style: "margin-bottom:12px" }, ["Este Short Kaizen está esperando tu aprobación."]),
        el("div", { style: "display:flex;gap:12px" }, [
          el("button", { class: "btn btn-success", onclick: () => decidir(k, "aprobar", view) }, ["✓ Aprobar"]),
          el("button", { class: "btn btn-danger", onclick: () => decidir(k, "rechazar", view) }, ["✕ Rechazar"]),
        ]),
      ])
    );
  }

  view.appendChild(
    el("div", { class: "card", style: "margin-top:20px" }, [el("h3", {}, ["Línea de tiempo"]), buildTimeline(k)])
  );
}

// Mismo criterio de autorización que `pendientesParaUsuario()` en
// solicitudes.js (duplicado a propósito, ver comentario arriba): mc decide
// cualquier pendiente del paso 1; admin decide cualquier paso; líder/gerente
// solo si su nómina coincide exactamente con la congelada en el kaizen para
// el paso actual (nunca por rol/equipo/departamento).
function estadoActualParaDecision(k) {
  const m = /^pend_(aprobacion[123])$/.exec(k.status || "");
  if (!m) return null;
  const paso = m[1];
  const info = {
    aprobacion1: { paso: 1, nomina: null },
    aprobacion2: { paso: 2, nomina: k.nominaAprobacion2 },
    aprobacion3: { paso: 3, nomina: k.nominaAprobacion3 },
  };
  return info[paso];
}

function puedeDecidir(k) {
  const user = state.user || {};
  const actual = estadoActualParaDecision(k);
  if (!actual) return false;
  if (user.rol === "mc") return actual.paso === 1;
  if (user.rol === "admin") return true;
  if (user.rol === "lider" || user.rol === "gerente") {
    return (actual.paso === 2 || actual.paso === 3) && actual.nomina === user.nomina;
  }
  return false;
}

async function decidir(k, decision, view) {
  const verbo = decision === "aprobar" ? "aprobar" : "rechazar";
  if (!confirm(`¿Seguro que quieres ${verbo} SK-${shortId(k.id)}?`)) return;
  try {
    await api.aprobarEnApp(k.id, decision);
    toast(decision === "aprobar" ? "Short Kaizen aprobado." : "Short Kaizen rechazado.", "tg");
    const actualizado = await api.getKaizen(k.id);
    view.innerHTML = "";
    paint(view, actualizado);
  } catch (err) {
    toast(err.message || "No se pudo procesar tu decisión.", "tr");
  }
}

// El kaizen puede cerrar en 2 o 3 pasos según la fila del creador (ver
// KaizenZX_Flujo_Definitivo_Aprobacion.md) — el paso 3 solo se muestra si el
// backend mandó datos de aprobador para ese paso (nombreAprobacion3/
// emailAprobacion3), sin asumir un número fijo de pasos.
function buildAutorizaciones(k) {
  const items = [
    ["Mejora Continua", k.firmaAprobacion1Nombre, k.firmaAprobacion1Fecha],
    ["Aprobación 2" + (k.nombreAprobacion2 ? ` (${k.nombreAprobacion2})` : ""), k.firmaAprobacion2Nombre, k.firmaAprobacion2Fecha],
  ];
  if (k.nombreAprobacion3 || k.emailAprobacion3 || k.firmaAprobacion3Nombre) {
    items.push([
      "Aprobación 3" + (k.nombreAprobacion3 ? ` (${k.nombreAprobacion3})` : ""),
      k.firmaAprobacion3Nombre,
      k.firmaAprobacion3Fecha,
    ]);
  }
  return el(
    "div",
    { class: "sk-autorizaciones" },
    items.map(([rol, nombre, fecha]) =>
      el("div", { class: "sk-autorizacion-box" }, [
        el("div", { class: "hint" }, [rol]),
        el("div", { style: "font-weight:700" }, [nombre || "Pendiente"]),
        el("div", { class: "hint" }, [fecha ? formatDate(fecha) : "—"]),
      ])
    )
  );
}

function photoFigure(src, label) {
  return el("figure", {}, [
    src ? el("img", { src, alt: label }) : el("div", { style: "aspect-ratio:4/3;background:var(--gray-100);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--gray-400)" }, ["Sin foto"]),
    el("figcaption", {}, [label]),
  ]);
}

function kv(label, value) {
  if (!value) return null;
  return el("p", { style: "margin-bottom:8px" }, [el("strong", { style: "color:var(--gray-700)" }, [`${label}: `]), String(value)]);
}

// `status` es la fuente de verdad del paso en el que va el kaizen
// (confirmado por Jesús — nunca derivar el estado de las firmas, sería
// lógica duplicada). Valores: pend_aprobacion1/2/3, done, rej_aprobacion1/2/3.
// Los campos de firma solo se usan para MOSTRAR quién/cuándo firmó, no para
// decidir el estado de cada paso.
function buildTimeline(k) {
  const pendMatch = /^pend_(aprobacion([123]))$/.exec(k.status || "");
  const rejMatch = /^rej_(aprobacion([123]))$/.exec(k.status || "");
  const pasoPendiente = pendMatch ? Number(pendMatch[2]) : null;
  const pasoRechazado = rejMatch ? Number(rejMatch[2]) : null;
  const tienePaso3 = Boolean(k.nombreAprobacion3 || k.emailAprobacion3 || k.firmaAprobacion3Nombre);

  function estadoPaso(n) {
    if (pasoRechazado === n) return "rej";
    if (k.status === "done") return "done";
    if (pasoRechazado !== null && n < pasoRechazado) return "done";
    if (pasoPendiente !== null) {
      if (n < pasoPendiente) return "done";
      if (n === pasoPendiente) return "pending";
      return "todo";
    }
    return "todo";
  }

  const steps = [
    { label: "Solicitud creada", date: k.creadoEn, state: "done" },
    {
      label: "Revisión de Mejora Continua",
      date: k.firmaAprobacion1Fecha,
      state: estadoPaso(1),
      extra: k.firmaAprobacion1Nombre || (pasoRechazado === 1 ? k.rechazoAprobacion1Razon : null),
    },
    {
      label: k.nombreAprobacion2 ? `Aprobación de ${k.nombreAprobacion2}` : "Aprobación 2",
      date: k.firmaAprobacion2Fecha,
      state: estadoPaso(2),
      extra: k.firmaAprobacion2Nombre || (pasoRechazado === 2 ? k.rechazoAprobacion2Razon : null),
    },
  ];
  if (tienePaso3) {
    steps.push({
      label: k.nombreAprobacion3 ? `Aprobación de ${k.nombreAprobacion3}` : "Aprobación 3",
      date: k.firmaAprobacion3Fecha,
      state: estadoPaso(3),
      extra: k.firmaAprobacion3Nombre || (pasoRechazado === 3 ? k.rechazoAprobacion3Razon : null),
    });
  }

  return el(
    "div",
    { class: "timeline" },
    steps.map((s) =>
      el("div", { class: "timeline-step" }, [
        el("div", { class: `timeline-dot ${s.state === "todo" ? "" : s.state}` }, [dotIcon(s.state)]),
        el("div", {}, [
          el("div", { style: "font-weight:600" }, [s.label]),
          s.date ? el("div", { class: "hint" }, [formatDateTime(s.date)]) : null,
          s.extra ? el("div", { class: "hint" }, [s.extra]) : null,
        ]),
      ])
    )
  );
}
function dotIcon(state) {
  if (state === "done") return "✓";
  if (state === "rej") return "✕";
  if (state === "pending") return "…";
  return "";
}

/**
 * Exporta el kaizen a PDF, directo en el navegador (jsPDF, sin backend).
 *
 * El diseño se acerca a la primera página del formato oficial MEJ-F-03
 * (encabezado azul, secciones por bloques, fotos antes/después lado a
 * lado), incluyendo el logo de Short Kaizen en el encabezado (dentro de un
 * recuadro blanco, para no deformarlo ni recolorearlo — ver manual de marca).
 */
async function exportPDF(k) {
  try {
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

    doc.save(`SK-${shortId(k.id)}.pdf`);
  } catch (err) {
    toast("No se pudo generar el PDF.", "tr");
  }
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
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
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
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
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

export function unmount() {}
