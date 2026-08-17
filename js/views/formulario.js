import { el, toast, compressImage } from "../utils.js";
import { api } from "../api.js";
import { state, setState } from "../state.js";

const ENFOQUES = ["Seguridad", "Calidad", "Costo", "Entrega", "5S", "Ergonomía"];

export async function render(container, params, isStale) {
  if (!state.equipos.length) {
    try {
      const equipos = await api.getEquipos();
      if (isStale && isStale()) return; // el usuario ya navegó a otra vista — no tocar el DOM
      setState({ equipos });
    } catch {
      /* si falla, el select simplemente queda vacío y se avisa abajo */
    }
  }

  const fotoAntesState = { dataUrl: null };
  const fotoDespuesState = { dataUrl: null };

  const equipoSelect = el(
    "select",
    { class: "select", id: "f-equipo", required: true },
    [
      el("option", { value: "" }, ["Selecciona tu equipo…"]),
      ...state.equipos.map((eq) => el("option", { value: eq.nombre }, [eq.nombre])),
    ]
  );

  const nominaInput = el("input", { class: "input", id: "f-nomina", type: "text", required: true, placeholder: "Ej. 2087" });
  const nombreInput = el("input", { class: "input", id: "f-nombre", type: "text", required: true, placeholder: "Nombre completo" });
  const dondeInput = el("input", { class: "input", id: "f-donde", type: "text", required: true, placeholder: "Área / estación / línea" });
  const quienInput = el("input", { class: "input", id: "f-quien", type: "text", placeholder: "Quién detectó la oportunidad" });
  const fechaIdInput = el("input", { class: "input", id: "f-fechaid", type: "date", required: true });
  const fechaImplInput = el("input", { class: "input", id: "f-fechaimpl", type: "date" });
  const tiempoInput = el("input", { class: "input", id: "f-tiempo", type: "number", min: "0", step: "0.5", placeholder: "0" });
  const unidadSelect = el("select", { class: "select", id: "f-unidad" }, [
    el("option", { value: "minutos" }, ["minutos"]),
    el("option", { value: "horas" }, ["horas"]),
    el("option", { value: "días" }, ["días"]),
  ]);

  const enfoqueChecks = ENFOQUES.map((label) =>
    el("label", { style: "display:flex;align-items:center;gap:8px;font-size:var(--fs-sm);font-weight:400;color:var(--gray-700)" }, [
      el("input", { type: "checkbox", name: "enfoque", value: label }),
      label,
    ])
  );

  const enfoquesMejoraInput = el("input", { class: "input", id: "f-enfoque-mejora", type: "text", placeholder: "Ej. Reducción de tiempo de ajuste" });
  const descAntesInput = el("textarea", { class: "textarea", id: "f-antes", required: true, placeholder: "¿Cómo estaba la situación antes?" });
  const descDespuesInput = el("textarea", { class: "textarea", id: "f-despues", required: true, placeholder: "¿Qué se hizo / cómo quedó después?" });
  const estandarizacionInput = el("textarea", { class: "textarea", id: "f-estandarizacion", placeholder: "¿Cómo se va a mantener esta mejora en el tiempo? (opcional)" });

  const fotoAntesBox = buildUploadBox("Foto — antes", fotoAntesState);
  const fotoDespuesBox = buildUploadBox("Foto — después", fotoDespuesState);

  const submitBtn = el("button", { class: "btn btn-accent", type: "submit" }, ["Enviar para aprobación"]);

  const form = el(
    "form",
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const enfoques = Array.from(document.querySelectorAll('input[name="enfoque"]:checked')).map((c) => c.value);

        if (!equipoSelect.value || !nominaInput.value || !nombreInput.value || !dondeInput.value || !fechaIdInput.value) {
          toast("Completa los campos obligatorios (*) antes de continuar.", "tr");
          return;
        }
        if (!descAntesInput.value.trim() || !descDespuesInput.value.trim()) {
          toast("Describe la situación antes y después.", "tr");
          return;
        }

        const payload = {
          equipo: equipoSelect.value,
          nomina: nominaInput.value.trim(),
          nombre: nombreInput.value.trim(),
          donde: dondeInput.value.trim(),
          quien: quienInput.value.trim(),
          fechaId: fechaIdInput.value,
          fechaImpl: fechaImplInput.value,
          tiempoImpl: Number(tiempoInput.value || 0),
          unidadTiempo: unidadSelect.value,
          enfoques,
          enfoquesMejora: enfoquesMejoraInput.value.trim(),
          descAntes: descAntesInput.value.trim(),
          descDespues: descDespuesInput.value.trim(),
          estandarizacion: estandarizacionInput.value.trim(),
          fotoAntes: fotoAntesState.dataUrl,
          fotoDespues: fotoDespuesState.dataUrl,
        };

        submitBtn.disabled = true;
        submitBtn.textContent = "Enviando…";
        try {
          await api.crearKaizen(payload);
          if (isStale && isStale()) return; // el usuario ya salió de esta vista por su cuenta
          toast("Kaizen registrado. Se notificó al líder para su aprobación.", "tg");
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
      section("Datos generales", [
        field("Equipo *", equipoSelect),
        row([field("Nómina *", nominaInput), field("Nombre completo *", nombreInput)]),
        field("Área / dónde se detectó *", dondeInput),
        field("Detectado por", quienInput),
        row([field("Fecha de identificación *", fechaIdInput), field("Fecha de implementación", fechaImplInput)]),
        row([field("Tiempo de implementación", tiempoInput), field("Unidad", unidadSelect)]),
      ]),
      section("Enfoque de la mejora", [
        el("div", { class: "field" }, [
          el("label", {}, ["¿A qué enfoque(s) aplica?"]),
          el("div", { style: "display:flex;flex-wrap:wrap;gap:14px" }, enfoqueChecks),
        ]),
        field("Descripción breve del enfoque", enfoquesMejoraInput),
      ]),
      section("Descripción de la mejora", [
        field("Antes *", descAntesInput),
        field("Después *", descDespuesInput),
        field("Estandarización", estandarizacionInput),
      ]),
      section("Evidencia fotográfica", [row([fotoAntesBox, fotoDespuesBox])]),
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
    el("div", { class: "view" }, [
      el("div", { class: "view-header" }, [el("h1", {}, ["Nuevo Short Kaizen"]), el("p", {}, ["El líder de tu equipo recibirá la solicitud para su aprobación."])]),
      form,
    ])
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
