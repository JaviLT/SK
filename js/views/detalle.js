import { el, formatDate, formatDateTime, getQueryParam, shortId, toast } from "../utils.js";
import { api } from "../api.js";
import { pedirMotivoRechazo } from "../lib/motivo-rechazo.js";
import { state } from "../state.js";
import { construirPdfSK, nombreArchivoSK } from "../lib/sk-pdf.js";

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
        // Pedido de Javier (oct. 2026): "Volver" regresa a la página desde la
        // que se abrió el detalle (?from=mis-kaizens | solicitudes). Sin
        // origen válido (enlace directo) → Mis Kaizens, que ve todo el mundo.
        // Al volver a Mis Kaizens, la vista reabre el popup del equipo con su
        // filtro (estado guardado en sessionStorage por mis-kaizens.js).
        onclick: () => { window.location.href = getQueryParam("from") === "solicitudes" ? "solicitudes.html" : "mis-kaizens.html"; },
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
  if (user.rol === "admin") return true;
  // Pasos 2/3: nómina exacta, sea cual sea el rol de sistema (también
  // solicitante): quien es Aprobador 2/3 decide (pedido de Javier, oct. 2026).
  const esSuPaso = (actual.paso === 2 || actual.paso === 3) && String(actual.nomina || "") === String(user.nomina || "");
  if (user.rol === "mc") return actual.paso === 1 || esSuPaso;
  return esSuPaso;
}

async function decidir(k, decision, view) {
  let motivo = null;
  if (decision === "aprobar") {
    if (!confirm(`¿Seguro que quieres aprobar SK-${shortId(k.id)}?`)) return;
  } else {
    // Rechazar exige motivo (pedido de Javier, oct. 2026).
    motivo = await pedirMotivoRechazo(`SK-${shortId(k.id)}`);
    if (motivo === null) return;
  }
  try {
    await api.aprobarEnApp(k.id, decision, motivo);
    toast(decision === "aprobar" ? "Short Kaizen aprobado." : "Short Kaizen rechazado.", "tg");
    const actualizado = await api.getKaizen(k.id);
    view.innerHTML = "";
    paint(view, actualizado);
  } catch (err) {
    toast(err.message || "No se pudo procesar tu decisión.", "tr");
    // 409: otra persona ya decidió (o el SK ya no está pendiente) → se
    // recarga el SK para mostrar su estado real y quitar los botones.
    if (/ya fue decidido|no está pendiente/i.test(err.message || "")) {
      try {
        const actualizado = await api.getKaizen(k.id);
        view.innerHTML = "";
        paint(view, actualizado);
      } catch { /* se deja la pantalla como está */ }
    }
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

async function exportPDF(k) {
  try {
    const doc = await construirPdfSK(k);
    doc.save(nombreArchivoSK(k));
  } catch (err) {
    toast("No se pudo generar el PDF.", "tr");
  }
}

export function unmount() {}
