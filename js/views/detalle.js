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
        el("p", {}, [`${k.equipo} · ${k.donde}`]),
      ]),
      el("button", { class: "btn btn-primary", onclick: () => exportPDF(k) }, ["⬇ Exportar PDF"]),
    ])
  );

  const grid = el("div", { class: "detail-grid" }, [
    el("div", { class: "card" }, [
      el("h3", {}, ["Datos generales"]),
      kv("Solicitante", `${k.nombre} (${k.nomina})`),
      kv("Detectado por", k.quien),
      kv("Fecha de identificación", formatDate(k.fechaId)),
      kv("Fecha de implementación", formatDate(k.fechaImpl)),
      kv("Tiempo de implementación", k.tiempoImpl ? `${k.tiempoImpl} ${k.unidadTiempo || ""}` : null),
      kv("Enfoque", (k.enfoques || []).join(", ")),
    ]),
    el("div", { class: "card" }, [
      el("h3", {}, ["Descripción de la mejora"]),
      kv("Antes", k.descAntes),
      kv("Después", k.descDespues),
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
      label: "Aprobación del Líder",
      date: k.firmaLiderFecha,
      state: k.status === "rej_l" ? "rej" : k.firmaLiderNombre ? "done" : k.status === "pend_l" ? "pending" : "todo",
      extra: k.status === "rej_l" ? k.rechazoLiderRazon : k.firmaLiderNombre,
    },
    {
      label: "Autorización del Gerente",
      date: k.firmaGerenteDate,
      state: k.status === "rej_g" ? "rej" : k.firmaGerenteNombre ? "done" : k.status === "pend_g" ? "pending" : "todo",
      extra: k.status === "rej_g" ? k.rechazoGerenteRazon : k.firmaGerenteNombre,
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
 * Exporta un resumen del kaizen a PDF, directo en el navegador.
 * No requiere backend ni credenciales — jsPDF corre 100% del lado cliente.
 */
async function exportPDF(k) {
  try {
    const { jsPDF } = await loadJsPDF();
    const doc = new jsPDF();
    let y = 18;
    const line = (text, size = 11, gap = 7) => {
      doc.setFontSize(size);
      doc.text(String(text), 14, y);
      y += gap;
    };
    doc.setFont(undefined, "bold");
    line(`Short Kaizen — SK-${shortId(k.id)}`, 16, 10);
    doc.setFont(undefined, "normal");
    line(`Equipo: ${k.equipo}`);
    line(`Solicitante: ${k.nombre} (${k.nomina})`);
    line(`Área: ${k.donde}`);
    line(`Fecha de identificación: ${formatDate(k.fechaId)}`);
    y += 4;
    doc.setFont(undefined, "bold");
    line("Antes:");
    doc.setFont(undefined, "normal");
    y = wrapText(doc, k.descAntes, y);
    doc.setFont(undefined, "bold");
    line("Después:");
    doc.setFont(undefined, "normal");
    y = wrapText(doc, k.descDespues, y);
    if (k.estandarizacion) {
      doc.setFont(undefined, "bold");
      line("Estandarización:");
      doc.setFont(undefined, "normal");
      y = wrapText(doc, k.estandarizacion, y);
    }
    doc.save(`SK-${shortId(k.id)}.pdf`);
  } catch (err) {
    toast("No se pudo generar el PDF.", "tr");
  }
}
function wrapText(doc, text, y) {
  const lines = doc.splitTextToSize(text || "—", 180);
  doc.text(lines, 14, y);
  return y + lines.length * 6 + 4;
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
