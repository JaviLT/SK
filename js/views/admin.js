// ============================================================================
// admin.js — Pantalla de administración: equipos, líderes, gerentes y
// empleados, filtro por departamento y exportación a Excel.
//
// Conectado al contrato real de Fase 5 (KaizenZX_Handoff_Fase5_Final.md +
// KaizenZX_Respuestas_3_Preguntas_Tecnicas.md): equipos-create/update/delete,
// equipos-empleados-add/remove, empleados-get — todo vía js/api.js, con
// fallback a mock-backend.js cuando CONFIG.MOCK_MODE está activo, igual que
// el resto de la app.
//
// Modelo de gerente: YA NO se administra por departamento — cada equipo
// trae su propio gerente ya resuelto por el backend (`gerenteNombre`/
// `gerenteEmail` en la respuesta de GET /equipos, vía equipos_gerentes o
// departamentos_gerentes según el caso — transparente para el frontend).
// Aquí solo se MUESTRA, no se edita todavía — no hay endpoint documentado
// para reasignar gerente directamente; si el negocio lo necesita, es un
// pendiente a levantar con Jesús.
//
// Acceso: visible para usuarios con rol "admin" o "mc" (ver js/shell.js).
// ============================================================================

import { el, toast, isValidEmail, formatDate, shortId } from "../utils.js";
import { api } from "../api.js";
import { state } from "../state.js";

let equiposCache = [];
let departamentosCache = []; // [{id, nombre}] — GET /departamentos (antes string[] en el mock)
let departamentoFiltro = "";

export async function render(container, params, isStale) {
  const view = el("div", { class: "view", id: "admin-view" });
  container.appendChild(view);

  const rol = state.user?.rol;
  if (!["admin", "mc"].includes(rol)) {
    view.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "icon" }, ["🔒"]),
        el("h3", {}, ["No tienes acceso a esta pantalla"]),
        el("p", {}, ["Solo el usuario maestro y Mejora Continua pueden administrar equipos."]),
      ])
    );
    return;
  }

  view.appendChild(el("div", { class: "skeleton", style: "height:220px" }));

  try {
    const [equipos, departamentos] = await Promise.all([api.getEquipos(), api.getDepartamentos()]);
    if (isStale && isStale()) return; // el usuario ya navegó a otra vista — no tocar el DOM
    equiposCache = equipos;
    // Normaliza: el mock regresa string[], el backend real { id, nombre }[].
    departamentosCache = departamentos.map((d) => (typeof d === "string" ? { id: d, nombre: d } : d));
    paint(view);
  } catch (err) {
    if (isStale && isStale()) return;
    view.innerHTML = "";
    view.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "icon" }, ["⚠️"]),
        el("h3", {}, ["No se pudo cargar la información"]),
        el("p", {}, [err.message || ""]),
      ])
    );
  }
}

function nombreDepartamento(id) {
  return departamentosCache.find((d) => d.id === id)?.nombre || id;
}

function paint(view) {
  view.innerHTML = "";

  const exportBtn = el("button", { class: "btn btn-outline", onclick: () => exportarExcel() }, ["⬇ Exportar a Excel"]);
  const nuevoBtn = el("button", { class: "btn btn-accent", onclick: () => openEquipoModal(view) }, ["+ Nuevo equipo"]);

  view.appendChild(
    el("div", { class: "view-header" }, [
      el("div", {}, [
        el("h1", {}, ["Administración"]),
        el("p", {}, ["Equipos, líderes, gerentes y empleados — solo visible para el usuario maestro y Mejora Continua"]),
      ]),
      el("div", { style: "display:flex;gap:10px;flex-wrap:wrap" }, [exportBtn, nuevoBtn]),
    ])
  );

  view.appendChild(buildFiltroDepartamento(view));

  const equiposFiltrados = departamentoFiltro
    ? equiposCache.filter(
        (eq) =>
          eq.departamentoId === departamentoFiltro ||
          eq.departamento === departamentoFiltro ||
          eq.departamento === nombreDepartamento(departamentoFiltro)
      )
    : equiposCache;

  if (!equiposCache.length) {
    view.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "icon" }, ["🏷️"]),
        el("h3", {}, ["Todavía no hay equipos"]),
        el("p", {}, ["Crea el primer equipo con el botón de arriba."]),
      ])
    );
    return;
  }

  if (!equiposFiltrados.length) {
    view.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "icon" }, ["🔍"]),
        el("h3", {}, ["Sin equipos en este departamento"]),
        el("p", {}, ["Elige otro departamento o quita el filtro."]),
      ])
    );
    return;
  }

  view.appendChild(el("div", { class: "admin-grid" }, equiposFiltrados.map((eq) => buildEquipoCard(view, eq))));
}

function buildFiltroDepartamento(view) {
  const select = el(
    "select",
    {
      class: "select",
      style: "max-width:320px",
      onchange: (e) => {
        departamentoFiltro = e.target.value;
        paint(view);
      },
    },
    [
      el("option", { value: "" }, ["Todos los departamentos"]),
      ...departamentosCache.map((d) => el("option", { value: d.id, selected: d.id === departamentoFiltro || undefined }, [d.nombre])),
    ]
  );
  return el("div", { class: "field", style: "max-width:320px;margin-bottom:20px" }, [el("label", {}, ["Filtrar por departamento"]), select]);
}

function buildEquipoCard(view, eq) {
  const nombreDepto = eq.departamento || nombreDepartamento(eq.departamentoId);
  return el("div", { class: "card admin-team-card" }, [
    el("div", { class: "card-header" }, [
      el("div", {}, [
        el("h3", {}, [eq.nombre]),
        nombreDepto ? el("div", { class: "hint" }, [nombreDepto]) : null,
      ]),
      el("div", { style: "display:flex;gap:8px" }, [
        el("button", { class: "btn btn-outline btn-sm", onclick: () => openEquipoModal(view, eq) }, ["Editar"]),
        el("button", { class: "btn btn-danger btn-sm", onclick: () => confirmEliminarEquipo(view, eq) }, ["Eliminar"]),
      ]),
    ]),

    el("div", { class: "admin-roles-row" }, [
      roleBlock("Líder", eq.liderNombre, eq.liderEmail),
      // El gerente ya se resuelve por equipo del lado del backend (vía el
      // equipo específico o el gerente único del departamento, según el
      // caso) — aquí solo se muestra, no se edita: no hay endpoint
      // documentado todavía para reasignar gerente directamente.
      roleBlock("Gerente", eq.gerenteNombre, eq.gerenteEmail),
    ]),

    el("div", { class: "admin-members-header" }, [
      el("h4", {}, [`Empleados (${eq.miembros.length})`]),
      el("button", { class: "btn btn-outline btn-sm", onclick: () => openEmpleadoModal(view, eq) }, ["+ Agregar empleado"]),
    ]),

    buildMembersTable(view, eq),
  ]);
}

function roleBlock(label, nombre, email) {
  return el("div", { class: "admin-role-block" }, [
    el("div", { class: "admin-role-label" }, [label]),
    el("div", { class: "admin-role-name" }, [nombre || "— sin asignar —"]),
    email ? el("div", { class: "hint" }, [email]) : null,
  ]);
}

function buildMembersTable(view, eq) {
  if (!eq.miembros.length) {
    return el("div", { class: "empty-state", style: "padding:24px 0" }, [
      el("p", {}, ["Este equipo todavía no tiene empleados registrados."]),
    ]);
  }
  return el(
    "div",
    { class: "admin-member-list" },
    eq.miembros.map((m) =>
      el("div", { class: "admin-member-row" }, [
        el("div", {}, [
          el("div", { style: "font-weight:600" }, [m.nombre]),
          el("div", { class: "hint" }, [`Nómina ${m.nomina}`]),
        ]),
        el(
          "button",
          { class: "btn btn-outline btn-sm", onclick: () => confirmEliminarEmpleado(view, eq, m) },
          ["Quitar"]
        ),
      ])
    )
  );
}

// ---------------------------------------------------------------------------
// Modal: crear / editar equipo
// ---------------------------------------------------------------------------
function openEquipoModal(view, equipoExistente) {
  const esEdicion = Boolean(equipoExistente);
  let overlayRef; // se asigna abajo, antes de que el usuario pueda hacer clic en nada

  const nombreInput = el("input", { class: "input", type: "text", value: equipoExistente?.nombre || "", placeholder: "Ej. Equipo Línea A" });
  const departamentoActualId = equipoExistente?.departamentoId
    || departamentosCache.find((d) => d.nombre === equipoExistente?.departamento)?.id
    || "";
  const departamentoSelect = el(
    "select",
    { class: "select" },
    [
      el("option", { value: "" }, ["Selecciona un departamento…"]),
      ...departamentosCache.map((d) => el("option", { value: d.id, selected: d.id === departamentoActualId || undefined }, [d.nombre])),
    ]
  );
  // POST /equipos solo acepta { nombre, departamentoId, liderEmail? } — no
  // existe `liderNombre` en el contrato real (se resuelve del lado del
  // backend a partir del correo, si aplica). Ver KaizenZX_Handoff_Fase5_Final.md.
  const liderEmailInput = el("input", { class: "input", type: "email", value: equipoExistente?.liderEmail || "", placeholder: "correo@zubex.com.mx (opcional)" });

  const body = el("div", {}, [
    field("Nombre del equipo *", nombreInput),
    field("Departamento *", departamentoSelect),
    field("Líder — correo", liderEmailInput),
    el("p", { class: "hint" }, ["El gerente ya no se asigna aquí — se resuelve automáticamente por equipo del lado del backend."]),
  ]);

  overlayRef = openModal(esEdicion ? "Editar equipo" : "Nuevo equipo", body, [
    el("button", { class: "btn btn-outline", onclick: () => closeModal(overlayRef) }, ["Cancelar"]),
    el(
      "button",
      {
        class: "btn btn-accent",
        onclick: async () => {
          const liderEmail = liderEmailInput.value.trim();
          const payload = {
            nombre: nombreInput.value.trim(),
            departamentoId: departamentoSelect.value,
          };
          if (liderEmail) payload.liderEmail = liderEmail;

          if (!payload.nombre || !payload.departamentoId) {
            toast("Completa todos los campos obligatorios (*).", "tr");
            return;
          }
          if (liderEmail && !isValidEmail(liderEmail)) {
            toast("Revisa que el correo del líder sea válido.", "tr");
            return;
          }
          try {
            if (esEdicion) {
              await api.actualizarEquipo(equipoExistente.id, payload);
              toast("Equipo actualizado.", "tg");
            } else {
              await api.crearEquipo(payload);
              toast("Equipo creado.", "tg");
            }
            equiposCache = await api.getEquipos();
            closeModal(overlayRef);
            paint(view);
          } catch (err) {
            toast(err.message || "No se pudo guardar el equipo.", "tr");
          }
        },
      },
      [esEdicion ? "Guardar cambios" : "Crear equipo"]
    ),
  ]);
}

function confirmEliminarEquipo(view, eq) {
  if (!confirm(`¿Eliminar el equipo "${eq.nombre}" y sus ${eq.miembros.length} empleado(s)? Esta acción no se puede deshacer.`)) return;
  api
    .eliminarEquipo(eq.id)
    .then(async () => {
      toast("Equipo eliminado.", "tg");
      equiposCache = await api.getEquipos();
      paint(view);
    })
    .catch((err) => toast(err.message || "No se pudo eliminar el equipo.", "tr"));
}

// ---------------------------------------------------------------------------
// Modal: agregar empleado — solo se pide la nómina, el nombre se busca solo
// ---------------------------------------------------------------------------
function openEmpleadoModal(view, eq) {
  let overlayRef; // se asigna abajo, antes de que el usuario pueda hacer clic en nada
  const nominaInput = el("input", { class: "input", type: "text", placeholder: "Ej. 0006", autofocus: true });

  const body = el("div", {}, [
    el("p", { class: "hint", style: "margin-bottom:16px" }, [`Equipo: ${eq.nombre}`]),
    field("Nómina *", nominaInput),
    el("p", { class: "hint" }, ["El nombre se completa automáticamente al buscarlo en el catálogo de personal."]),
  ]);

  overlayRef = openModal("Agregar empleado", body, [
    el("button", { class: "btn btn-outline", onclick: () => closeModal(overlayRef) }, ["Cancelar"]),
    el(
      "button",
      {
        class: "btn btn-accent",
        onclick: async () => {
          const nomina = nominaInput.value.trim();
          if (!nomina) {
            toast("Escribe la nómina del empleado.", "tr");
            return;
          }
          try {
            const equipoActualizado = await api.agregarEmpleado(eq.id, nomina);
            const agregado = equipoActualizado?.miembros?.find((m) => m.nomina === nomina);
            toast(`Empleado agregado: ${agregado?.nombre || nomina}.`, "tg");
            equiposCache = await api.getEquipos();
            closeModal(overlayRef);
            paint(view);
          } catch (err) {
            toast(err.message || "No se pudo agregar el empleado.", "tr");
          }
        },
      },
      ["Buscar y agregar"]
    ),
  ]);
}

function confirmEliminarEmpleado(view, eq, miembro) {
  if (!confirm(`¿Quitar a ${miembro.nombre} (nómina ${miembro.nomina}) del equipo "${eq.nombre}"?`)) return;
  // DELETE /equipos/empleados solo necesita la nómina — el backend resuelve
  // el equipo (confirmado por Jesús), no hace falta pasar el id del equipo.
  api
    .eliminarEmpleado(miembro.nomina)
    .then(async () => {
      toast("Empleado eliminado del equipo.", "tg");
      equiposCache = await api.getEquipos();
      paint(view);
    })
    .catch((err) => toast(err.message || "No se pudo quitar al empleado.", "tr"));
}

// ---------------------------------------------------------------------------
// Exportar a Excel — todos los kaizen aceptados y rechazados, cualquier
// fecha, con los datos generales y las fotos incrustadas.
// ---------------------------------------------------------------------------
async function exportarExcel() {
  toast("Generando Excel…", "default");
  try {
    const [ExcelJS, kaizens] = await Promise.all([loadExcelJS(), api.getKaizens()]);
    const relevantes = kaizens.filter((k) => k.status === "done" || String(k.status).startsWith("rej_"));

    if (!relevantes.length) {
      toast("No hay kaizens aceptados o rechazados todavía para exportar.", "tr");
      return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Short Kaizen");

    const columnas = [
      { header: "Folio", key: "folio", width: 12 },
      { header: "Estatus", key: "estatus", width: 22 },
      { header: "Equipo", key: "equipo", width: 22 },
      { header: "Departamento", key: "departamento", width: 20 },
      { header: "Nómina", key: "nomina", width: 10 },
      { header: "Nombre", key: "nombre", width: 26 },
      { header: "Área / Línea / Máquina", key: "areaLinea", width: 22 },
      { header: "Breve descripción", key: "breveDescripcion", width: 30 },
      { header: "Enfoque(s)", key: "enfoques", width: 22 },
      { header: "Descripción antes", key: "descAntes", width: 34 },
      { header: "Descripción después y beneficios", key: "descDespues", width: 34 },
      { header: "Estandarización", key: "estandarizacion", width: 30 },
      { header: "Fecha identificación", key: "fechaId", width: 16 },
      { header: "Fecha implementación", key: "fechaImpl", width: 16 },
      { header: "Tiempo implementación", key: "tiempoImpl", width: 16 },
      { header: "Aprobación 1 (Mejora Continua)", key: "apr1", width: 22 },
      { header: "Aprobación 2", key: "apr2", width: 22 },
      { header: "Aprobación 3", key: "apr3", width: 22 },
      { header: "Foto antes", key: "fotoAntes", width: 18 },
      { header: "Foto después", key: "fotoDespues", width: 18 },
    ];
    ws.columns = columnas;

    // ---- Encabezado con la paleta institucional (sección 6 del manual) ----
    ws.getRow(1).eachCell((cell) => {
      cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E75B6" } };
      cell.alignment = { vertical: "middle" };
    });
    ws.getRow(1).height = 20;

    // Estatus final confirmado (KaizenZX_Respuestas_3_Preguntas_Tecnicas.md):
    // done, rej_aprobacion1, rej_aprobacion2, rej_aprobacion3.
    const ESTATUS_LABEL = {
      done: "Aceptado",
      rej_aprobacion1: "Rechazado (Mejora Continua)",
      rej_aprobacion2: "Rechazado (Aprobación 2)",
      rej_aprobacion3: "Rechazado (Aprobación 3)",
    };

    relevantes.forEach((k, idx) => {
      const row = ws.addRow({
        folio: `SK-${shortId(k.id)}`,
        estatus: ESTATUS_LABEL[k.status] || k.status,
        equipo: k.equipo,
        departamento: k.departamento,
        nomina: k.nomina,
        nombre: k.nombre,
        areaLinea: k.areaLinea || k.donde,
        breveDescripcion: k.breveDescripcion,
        enfoques: (k.enfoques || []).join(", "),
        descAntes: k.descAntes,
        descDespues: k.descDespues,
        estandarizacion: k.estandarizacion,
        fechaId: formatDate(k.fechaId),
        fechaImpl: formatDate(k.fechaImpl),
        tiempoImpl: k.tiempoImpl ? `${k.tiempoImpl} ${k.unidadTiempo || ""}` : "",
        apr1: k.firmaAprobacion1Nombre || "",
        apr2: k.firmaAprobacion2Nombre || "",
        apr3: k.firmaAprobacion3Nombre || "",
      });
      row.height = 70;
      if (idx % 2 === 1) {
        row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDEEAF1" } }; });
      }
      insertarFoto(wb, ws, k.fotoAntes, row.number, 19);
      insertarFoto(wb, ws, k.fotoDespues, row.number, 20);
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ShortKaizen_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Excel generado.", "tg");
  } catch (err) {
    toast(err.message || "No se pudo generar el Excel.", "tr");
  }
}

function insertarFoto(wb, ws, dataUrl, rowNumber, colNumber) {
  if (!dataUrl) return;
  try {
    const extension = dataUrl.startsWith("data:image/png") ? "png" : "jpeg";
    const base64 = dataUrl.split(",")[1];
    const imageId = wb.addImage({ base64, extension });
    ws.addImage(imageId, {
      tl: { col: colNumber - 1, row: rowNumber - 1 },
      ext: { width: 90, height: 90 },
    });
  } catch {
    /* si la imagen no se puede incrustar, se deja la celda vacía */
  }
}

function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
    script.onload = () => resolve(window.ExcelJS);
    script.onerror = () => reject(new Error("No se pudo cargar el generador de Excel."));
    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Helpers de modal genéricos (mismo patrón visual que .modal-overlay/.modal
// ya definidos en css/components.css)
// ---------------------------------------------------------------------------
function field(labelText, input) {
  return el("div", { class: "field" }, [el("label", {}, [labelText]), input]);
}

function openModal(title, bodyNode, actions) {
  const overlay = el("div", { class: "modal-overlay" }, [
    el("div", { class: "modal" }, [
      el("h2", { style: "margin-bottom:20px" }, [title]),
      bodyNode,
      el("div", { class: "form-actions" }, actions),
    ]),
  ]);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal(overlay);
  });
  document.body.appendChild(overlay);
  return overlay;
}

function closeModal(overlay) {
  overlay?.remove();
}

export function unmount() {}
