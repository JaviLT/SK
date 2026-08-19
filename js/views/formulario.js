// ============================================================================
// formulario.js — Nuevo Short Kaizen.
//
// Estructura en secciones, alineada al formato oficial MEJ-F-03 (sin copiar
// su diseño exacto — ver css/views.css para la identidad propia de la app):
//   1. ¿Quién identificó la mejora?   (automático desde la sesión)
//   2. ¿Dónde aplicará la mejora?     (departamento + área/línea/máquina + breve descripción)
//   3. Enfoque de la mejora           (Rentabilidad / Bienestar del personal / Sustentabilidad / Mejora en el proceso)
//   4. Evidencia fotográfica          (foto + descripción del antes y del después, una junto a otra)
//   5. Estandarización y fechas       (estandarización, fecha de identificación, fecha de implementación automática, tiempo de implementación)
// ============================================================================

import { el, toast, compressImage } from "../utils.js";
import { api } from "../api.js";
import { state, setState } from "../state.js";
import { ENFOQUES } from "../lib/mock-backend.js";

export async function render(container, params, isStale) {
  if (!state.departamentos?.length) {
    try {
      const departamentos = await api.getDepartamentos();
      if (isStale && isStale()) return; // el usuario ya navegó a otra vista — no tocar el DOM
      setState({ departamentos });
    } catch {
      /* si falla, el select simplemente queda vacío y se avisa abajo */
    }
  }

  const user = state.user || {};
  const fotoAntesState = { dataUrl: null };
  const fotoDespuesState = { dataUrl: null };
  const hoyISO = new Date().toISOString().slice(0, 10);

  // ---- Sección 1: ¿Quién identificó la mejora? — solo lectura, viene de la sesión ----
  const quienSeccion = section("¿Quién identificó la mejora?", [
    row([readOnlyField("Equipo", user.equipo || "—"), readOnlyField("Nómina", user.nomina || "—")]),
    readOnlyField("Nombre", user.nombre || "—"),
  ]);

  // ---- Sección 2: ¿Dónde aplicará la mejora? ----
  const departamentoSelect = el(
    "select",
    { class: "select", id: "f-departamento", required: true },
    [
      el("option", { value: "" }, ["Selecciona un departamento…"]),
      ...(state.departamentos || []).map((d) => el("option", { value: d }, [d])),
    ]
  );
  const areaInput = el("input", { class: "input", id: "f-area", type: "text", required: true, placeholder: "Área / línea / máquina" });
  const breveDescInput = el("input", { class: "input", id: "f-breve", type: "text", required: true, placeholder: "Ej. Ajuste de guarda de banda transportadora" });

  const dondeSeccion = section("¿Dónde aplicará la mejora?", [
    field("Departamento *", departamentoSelect),
    field("Área / Línea / Máquina *", areaInput),
    field("Breve descripción de la mejora *", breveDescInput),
  ]);

  // ---- Sección 3: Enfoque de la mejora ----
  const enfoqueChecks = ENFOQUES.map((label) =>
    el("label", { class: "enfoque-option" }, [el("input", { type: "checkbox", name: "enfoque", value: label }), label])
  );
  const enfoqueSeccion = section("Enfoque de la mejora", [
    el("div", { class: "field" }, [el("div", { class: "enfoque-grid" }, enfoqueChecks)]),
  ]);

  // ---- Sección 4: Evidencia fotográfica (foto + descripción, antes/después lado a lado) ----
  const descAntesInput = el("textarea", { class: "textarea", id: "f-antes", required: true, placeholder: "¿Cómo estaba la situación antes?" });
  const descDespuesInput = el("textarea", { class: "textarea", id: "f-despues", required: true, placeholder: "¿Qué se hizo, cómo quedó después y qué beneficios trae?" });
  const fotoAntesBox = buildUploadBox("Foto/dibujo — antes", fotoAntesState);
  const fotoDespuesBox = buildUploadBox("Foto/dibujo — después", fotoDespuesState);

  const fotosSeccion = section("Evidencia fotográfica", [
    el("div", { class: "field-row" }, [
      el("div", {}, [fotoAntesBox, field("Descripción del antes *", descAntesInput)]),
      el("div", {}, [fotoDespuesBox, field("Descripción del después y beneficios *", descDespuesInput)]),
    ]),
  ]);

  // ---- Sección 5: Estandarización y fechas ----
  const estandarizacionInput = el("textarea", { class: "textarea", id: "f-estandarizacion", placeholder: "¿Cómo se va a mantener esta mejora en el tiempo? (opcional)" });
  const fechaIdInput = el("input", { class: "input", id: "f-fechaid", type: "date", required: true, max: hoyISO });
  const fechaImplInput = el("input", { class: "input", id: "f-fechaimpl", type: "date", value: hoyISO, disabled: true });
  const tiempoInput = el("input", { class: "input", id: "f-tiempo", type: "number", min: "0", step: "0.5", placeholder: "0" });
  const unidadSelect = el("select", { class: "select", id: "f-unidad" }, [
    el("option", { value: "minutos" }, ["minutos"]),
    el("option", { value: "horas" }, ["horas"]),
    el("option", { value: "días" }, ["días"]),
  ]);

  const cierreSeccion = section("Estandarización y fechas", [
    field("Estandarización", estandarizacionInput),
    row([field("Fecha de identificación *", fechaIdInput), field("Fecha de implementación (automática)", fechaImplInput)]),
    row([field("Tiempo de implementación", tiempoInput), field("Unidad", unidadSelect)]),
  ]);

  const submitBtn = el("button", { class: "btn btn-accent", type: "submit" }, ["Enviar para aprobación"]);

  const form = el(
    "form",
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const enfoques = Array.from(document.querySelectorAll('input[name="enfoque"]:checked')).map((c) => c.value);

        if (!departamentoSelect.value || !areaInput.value.trim() || !breveDescInput.value.trim() || !fechaIdInput.value) {
          toast("Completa los campos obligatorios (*) antes de continuar.", "tr");
          return;
        }
        if (!descAntesInput.value.trim() || !descDespuesInput.value.trim()) {
          toast("Describe la situación antes y después.", "tr");
          return;
        }
        if (!enfoques.length) {
          toast("Selecciona al menos un enfoque de la mejora.", "tr");
          return;
        }

        const payload = {
          equipo: user.equipo,
          nomina: user.nomina,
          nombre: user.nombre,
          departamento: departamentoSelect.value,
          areaLinea: areaInput.value.trim(),
          breveDescripcion: breveDescInput.value.trim(),
          enfoques,
          descAntes: descAntesInput.value.trim(),
          descDespues: descDespuesInput.value.trim(),
          estandarizacion: estandarizacionInput.value.trim(),
          fechaId: fechaIdInput.value,
          fechaImpl: hoyISO,
          tiempoImpl: Number(tiempoInput.value || 0),
          unidadTiempo: unidadSelect.value,
          fotoAntes: fotoAntesState.dataUrl,
          fotoDespues: fotoDespuesState.dataUrl,
        };

        submitBtn.disabled = true;
        submitBtn.textContent = "Enviando…";
        try {
          await api.crearKaizen(payload);
          if (isStale && isStale()) return; // el usuario ya salió de esta vista por su cuenta
          toast("Kaizen registrado y enviado a Mejora Continua para su revisión.", "tg");
          const { goTo } = await import("../router.js");
          goTo("historial");
        } catch (err) {
          toast(err.message || "No se pudo registrar el kaizen.", "tr");
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = "Enviar para aprobación";
        }
      },
    },
    [
      quienSeccion,
      dondeSeccion,
      enfoqueSeccion,
      fotosSeccion,
      cierreSeccion,
      el("div", { class: "form-actions" }, [
        el("button", {
          class: "btn btn-outline", type: "button",
          onclick: async () => { const { goTo } = await import("../router.js"); goTo("historial"); },
        }, ["Cancelar"]),
        submitBtn,
      ]),
    ]
  );

  container.appendChild(
    el("div", { class: "view" }, [el("div", { class: "view-header" }, [el("h1", {}, ["Nuevo Short Kaizen"])]), form])
  );
}

function section(title, children) {
  return el("div", { class: "card", style: "margin-bottom:20px" }, [el("h3", {}, [title]), el("div", { class: "form-grid" }, children)]);
}
function row(children) {
  return el("div", { class: "field-row" }, children);
}
function field(labelText, inputEl) {
  const id = inputEl.getAttribute("id");
  return el("div", { class: "field" }, [el("label", { for: id }, [labelText]), inputEl]);
}
function readOnlyField(labelText, value) {
  return el("div", { class: "field" }, [el("label", {}, [labelText]), el("div", { class: "readonly-field" }, [value])]);
}

function buildUploadBox(labelText, targetState) {
  const fileInput = el("input", { type: "file", accept: "image/*", class: "visually-hidden" });
  const box = el("div", { class: "upload-box" }, [el("span", {}, [`📷 ${labelText} — toca para subir`])]);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    box.innerHTML = "";
    box.appendChild(el("span", {}, ["Procesando imagen…"]));
    try {
      const dataUrl = await compressImage(file, { maxWidth: 900, quality: 0.72 });
      targetState.dataUrl = dataUrl;
      box.classList.add("has-image");
      box.innerHTML = "";
      box.appendChild(el("img", { src: dataUrl, alt: labelText }));
    } catch (err) {
      toast("No se pudo procesar la imagen.", "tr");
      box.innerHTML = "";
      box.appendChild(el("span", {}, [`📷 ${labelText} — toca para subir`]));
    }
  });

  box.addEventListener("click", () => fileInput.click());
  return el("div", { class: "field" }, [el("label", {}, [labelText]), box, fileInput]);
}

export function unmount() {}
