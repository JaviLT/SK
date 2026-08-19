import { el, formatDate, formatDateTime, shortId, toast } from "../utils.js";
import { api } from "../api.js";

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

function paint(view, k) {
  view.appendChild(
    el("div", { class: "detail-header" }, [
      el("div", {}, [
        el("button", {
          class: "btn btn-outline btn-sm", style: "margin-bottom:10px",
          onclick: async () => { const { goTo } = await import("../router.js"); goTo("historial"); },
        }, ["← Volver"]),
        el("h1", {}, [`SK-${shortId(k.id)}`]),
        el("p", {}, [`${k.equipo} · ${k.areaLinea || k.donde || "—"}`]),
      ]),
      el("button", { class: "btn btn-primary", onclick: () => exportPDF(k) }, ["⬇ Exportar PDF"]),
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
    el("div", { class: "card", style: "margin-top:20px" }, [el("h3", {}, ["Línea de tiempo"]), buildTimeline(k)])
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

function buildTimeline(k) {
  const steps = [
    { label: "Solicitud creada", date: k.creadoEn, state: "done" },
    {
      label: "Revisión de Mejora Continua",
      date: k.firmaMCFecha,
      state: k.status === "rej_mc" ? "rej" : k.firmaMCNombre ? "done" : k.status === "pend_mc" ? "pending" : "todo",
      extra: k.firmaMCNombre,
    },
    {
      label: "Aprobación del Líder",
      date: k.firmaLiderFecha,
      state: k.status === "rej_l" ? "rej" : k.firmaLiderNombre ? "done" : k.status === "pend_l" ? "pending" : "todo",
      extra: k.firmaLiderNombre,
    },
    {
      label: "Autorización del Gerente",
      date: k.firmaGerenteDate,
      state: k.status === "rej_g" ? "rej" : k.firmaGerenteNombre ? "done" : k.status === "pend_g" ? "pending" : "todo",
      extra: k.firmaGerenteNombre,
    },
  ];

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
 * lado) para que a quien ya conoce ese formato le resulte familiar — pero
 * no es una copia: usa la identidad visual propia de la app (mismos
 * colores/tipografía que el resto de la interfaz), no el layout exacto del
 * documento impreso.
 */
async function exportPDF(k) {
  try {
    const { jsPDF } = await loadJsPDF();
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
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, "bold");
    doc.setFontSize(14);
    doc.text("Short Kaizen", margin + 4, y + 9);
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
    const autCols = contentW / 3;
    autorizacion(doc, "Mejora Continua", k.firmaMCNombre, k.firmaMCFecha, margin, y, autCols - 3);
    autorizacion(doc, "Líder / Coordinador", k.firmaLiderNombre, k.firmaLiderFecha, margin + autCols, y, autCols - 3);
    autorizacion(doc, "Gerente de Área", k.firmaGerenteNombre, k.firmaGerenteDate, margin + autCols * 2, y, autCols - 3);

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

export function unmount() {}
