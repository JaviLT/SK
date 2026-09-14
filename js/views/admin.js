// ============================================================================
// admin.js — Pantalla de administración: equipos, líderes, gerentes y
// empleados, filtro por departamento y exportación a Excel.
//
// NOTA IMPORTANTE (léase antes de tocar este archivo):
// La parte de equipos/empleados (crear, editar, eliminar) todavía trabaja
// 100% contra js/lib/mock-backend.js, sin pasar por api.js, a propósito —
// es una MAQUETA visual mientras Jesús (TI) no ha construido las rutas
// reales de administración en el backend (el contrato de API actual solo
// contempla GET /equipos, de solo lectura). En cuanto esas rutas existan:
//   1. Agregarlas al contrato de api.js (crearEquipo, actualizarEquipo,
//      eliminarEquipo, agregarEmpleado, eliminarEmpleado, buscarEmpleadoPorNomina),
//      respetando el mismo patrón MOCK_MODE que ya usa el resto de la app.
//   2. Cambiar los imports de este archivo de "../lib/mock-backend.js" a
//      "../api.js" y listo — el resto de la pantalla no debería cambiar.
//
// La exportación a Excel y el listado de Short Kaizen SÍ usan api.js (datos
// reales), porque GET /kaizens ya existe en el contrato actual.
//
// Acceso: visible para usuarios con rol "admin" o "mc" (ver js/shell.js).
// ============================================================================

import { el, toast, isValidEmail, formatDate, shortId } from "../utils.js";
import { api } from "../api.js";
import { mockBackend, DEPARTAMENTOS } from "../lib/mock-backend.js";
import { state } from "../state.js";

let equiposCache = [];
let gerentesCache = {}; // departamento -> {nombre, email} — el gerente ahora es por departamento, no por equipo
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
    const [equipos, gerentes] = await Promise.all([mockBackend.getEquipos(), mockBackend.getGerentesPorDepartamento()]);
    if (isStale && isStale()) return; // el usuario ya navegó a otra vista — no tocar el DOM
    equiposCache = equipos;
    gerentesCache = gerentes;
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

  if (departamentoFiltro) {
    view.appendChild(buildGerenteDepartamentoCard(view, departamentoFiltro));
  }

  const equiposFiltrados = departamentoFiltro ? equiposCache.filter((eq) => eq.departamento === departamentoFiltro) : equiposCache;

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
      ...DEPARTAMENTOS.map((d) => el("option", { value: d, selected: d === departamentoFiltro || undefined }, [d])),
    ]
  );
  return el("div", { class: "field", style: "max-width:320px;margin-bottom:20px" }, [el("label", {}, ["Filtrar por departamento"]), select]);
}

// El gerente ya no se asigna por equipo — aprueba y ve TODO el departamento,
// así que se administra una sola vez por departamento, no por cada equipo.
function buildGerenteDepartamentoCard(view, departamento) {
  const gerente = gerentesCache[departamento] || { nombre: "", email: "" };
  return el("div", { class: "card", style: "margin-bottom:20px" }, [
    el("div", { class: "card-header" }, [
      el("div", {}, [
        el("h3", {}, [`Gerente de ${departamento}`]),
        el("div", { class: "hint" }, ["Ve y aprueba todos los Short Kaizen de este departamento, sin importar el equipo Lean"]),
      ]),
      el("button", { class: "btn btn-outline btn-sm", onclick: () => openGerenteModal(view, departamento) }, [gerente.nombre ? "Editar" : "Asignar"]),
    ]),
    el("div", { class: "admin-role-block" }, [
      el("div", { class: "admin-role-name" }, [gerente.nombre || "— sin asignar —"]),
      gerente.email ? el("div", { class: "hint" }, [gerente.email]) : null,
    ]),
  ]);
}

function openGerenteModal(view, departamento) {
  let overlayRef;
  const gerente = gerentesCache[departamento] || { nombre: "", email: "" };
  const nombreInput = el("input", { class: "input", type: "text", value: gerente.nombre || "", placeholder: "Nombre del gerente" });
  const emailInput = el("input", { class: "input", type: "email", value: gerente.email || "", placeholder: "correo@zubex.com.mx" });

  const body = el("div", {}, [
    el("p", { class: "hint", style: "margin-bottom:16px" }, [`Departamento: ${departamento}`]),
    field("Nombre *", nombreInput),
    field("Correo *", emailInput),
  ]);

  overlayRef = openModal(`Gerente de ${departamento}`, body, [
    el("button", { class: "btn btn-outline", onclick: () => closeModal(overlayRef) }, ["Cancelar"]),
    el(
      "button",
      {
        class: "btn btn-accent",
        onclick: async () => {
          const nombre = nombreInput.value.trim();
          const email = emailInput.value.trim();
          if (!nombre || !email) {
            toast("Completa el nombre y el correo del gerente.", "tr");
            return;
          }
          if (!isValidEmail(email)) {
            toast("Revisa que el correo sea válido.", "tr");
            return;
          }
          try {
            await mockBackend.actualizarGerenteDepartamento(departamento, { nombre, email });
            gerentesCache = await mockBackend.getGerentesPorDepartamento();
            toast("Gerente actualizado.", "tg");
            closeModal(overlayRef);
            paint(view);
          } catch (err) {
            toast(err.message || "No se pudo guardar el gerente.", "tr");
          }
        },
      },
      ["Guardar"]
    ),
  ]);
}

function buildEquipoCard(view, eq) {
  return el("div", { class: "card admin-team-card" }, [
    el("div", { class: "card-header" }, [
      el("div", {}, [
        el("h3", {}, [eq.nombre]),
        eq.departamento ? el("div", { class: "hint" }, [eq.departamento]) : null,
      ]),
      el("div", { style: "display:flex;gap:8px" }, [
        el("button", { class: "btn btn-outline btn-sm", onclick: () => openEquipoModal(view, eq) }, ["Editar"]),
        el("button", { class: "btn btn-danger btn-sm", onclick: () => confirmEliminarEquipo(view, eq) }, ["Eliminar"]),
      ]),
    ]),

    el("div", { class: "admin-roles-row" }, [
      roleBlock("Líder", eq.liderNombre, eq.liderEmail),
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
  const departamentoSelect = el(
    "select",
    { class: "select" },
    [
      el("option", { value: "" }, ["Selecciona un departamento…"]),
      ...DEPARTAMENTOS.map((d) => el("option", { value: d, selected: d === equipoExistente?.departamento || undefined }, [d])),
    ]
  );
  const liderNombreInput = el("input", { class: "input", type: "text", value: equipoExistente?.liderNombre || "", placeholder: "Nombre del líder" });
  const liderEmailInput = el("input", { class: "input", type: "email", value: equipoExistente?.liderEmail || "", placeholder: "correo@zubex.com.mx" });

  const body = el("div", {}, [
    field("Nombre del equipo *", nombreInput),
    field("Departamento *", departamentoSelect),
    field("Líder — nombre *", liderNombreInput),
    field("Líder — correo *", liderEmailInput),
    el("p", { class: "hint" }, ["El gerente ya no se asigna por equipo — se administra una sola vez por departamento, desde el filtro de arriba."]),
  ]);

  overlayRef = openModal(esEdicion ? "Editar equipo" : "Nuevo equipo", body, [
    el("button", { class: "btn btn-outline", onclick: () => closeModal(overlayRef) }, ["Cancelar"]),
    el(
      "button",
      {
        class: "btn btn-accent",
        onclick: async () => {
          const payload = {
            nombre: nombreInput.value.trim(),
            departamento: departamentoSelect.value,
            liderNombre: liderNombreInput.value.trim(),
            liderEmail: liderEmailInput.value.trim(),
          };
          if (!payload.nombre || !payload.departamento || !payload.liderNombre || !payload.liderEmail) {
            toast("Completa todos los campos obligatorios (*).", "tr");
            return;
          }
          if (!isValidEmail(payload.liderEmail)) {
            toast("Revisa que el correo del líder sea válido.", "tr");
            return;
          }
          try {
            if (esEdicion) {
              await mockBackend.actualizarEquipo(equipoExistente.nombre, payload);
              toast("Equipo actualizado.", "tg");
            } else {
              await mockBackend.crearEquipo(payload);
              toast("Equipo creado.", "tg");
            }
            equiposCache = await mockBackend.getEquipos();
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
  mockBackend
    .eliminarEquipo(eq.nombre)
    .then(async () => {
      toast("Equipo eliminado.", "tg");
      equiposCache = await mockBackend.getEquipos();
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
            const equipoActualizado = await mockBackend.agregarEmpleado(eq.nombre, { nomina });
            const agregado = equipoActualizado.miembros.find((m) => m.nomina === nomina);
            toast(`Empleado agregado: ${agregado?.nombre || nomina}.`, "tg");
            equiposCache = await mockBackend.getEquipos();
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
  mockBackend
    .eliminarEmpleado(eq.nombre, miembro.nomina)
    .then(async () => {
      toast("Empleado eliminado del equipo.", "tg");
      equiposCache = await mockBackend.getEquipos();
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
      { header: "Mejora Continua", key: "aprMC", width: 22 },
      { header: "Líder", key: "aprLider", width: 22 },
      { header: "Gerente", key: "aprGerente", width: 22 },
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

    const ESTATUS_LABEL = {
      done: "Aceptado", rej_mc: "Rechazado (Mejora Continua)", rej_l: "Rechazado (Líder)", rej_g: "Rechazado (Gerente)",
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
        aprMC: k.firmaMCNombre || "",
        aprLider: k.firmaLiderNombre || "",
        aprGerente: k.firmaGerenteNombre || "",
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
