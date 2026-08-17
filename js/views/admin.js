// ============================================================================
// admin.js — Pantalla de administración: equipos, líderes, gerentes y
// empleados.
//
// NOTA IMPORTANTE (léase antes de tocar este archivo):
// Esta vista todavía trabaja 100% contra js/lib/mock-backend.js, sin pasar
// por api.js, a propósito — es una MAQUETA visual mientras Jesús (TI) no ha
// construido las rutas reales de administración en el backend (el contrato
// de API actual solo contempla GET /equipos, de solo lectura). En cuanto
// esas rutas existan, hay que:
//   1. Agregarlas al contrato de api.js (crearEquipo, actualizarEquipo,
//      eliminarEquipo, agregarEmpleado, eliminarEmpleado), respetando el
//      mismo patrón MOCK_MODE que ya usa el resto de la app.
//   2. Cambiar los imports de este archivo de "../lib/mock-backend.js" a
//      "../api.js" y listo — el resto de la pantalla no debería cambiar.
//
// Acceso: solo visible para usuarios con rol "admin" (ver app.js).
// ============================================================================

import { el, toast, isValidEmail } from "../utils.js";
import { mockBackend } from "../lib/mock-backend.js";

let equiposCache = [];

export async function render(container, params, isStale) {
  const view = el("div", { class: "view", id: "admin-view" });
  container.appendChild(view);
  view.appendChild(el("div", { class: "skeleton", style: "height:220px" }));

  try {
    const equipos = await mockBackend.getEquipos();
    if (isStale && isStale()) return; // el usuario ya navegó a otra vista — no tocar el DOM
    equiposCache = equipos;
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

  view.appendChild(
    el("div", { class: "view-header" }, [
      el("div", {}, [
        el("h1", {}, ["Administración"]),
        el("p", {}, ["Equipos, líderes, gerentes y empleados — solo visible para el usuario maestro"]),
      ]),
      el("button", { class: "btn btn-accent", onclick: () => openEquipoModal(view) }, ["+ Nuevo equipo"]),
    ])
  );

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

  view.appendChild(el("div", { class: "admin-grid" }, equiposCache.map((eq) => buildEquipoCard(view, eq))));
}

function buildEquipoCard(view, eq) {
  return el("div", { class: "card admin-team-card" }, [
    el("div", { class: "card-header" }, [
      el("h3", {}, [eq.nombre]),
      el("div", { style: "display:flex;gap:8px" }, [
        el("button", { class: "btn btn-outline btn-sm", onclick: () => openEquipoModal(view, eq) }, ["Editar"]),
        el("button", { class: "btn btn-danger btn-sm", onclick: () => confirmEliminarEquipo(view, eq) }, ["Eliminar"]),
      ]),
    ]),

    el("div", { class: "admin-roles-row" }, [
      roleBlock("Líder", eq.liderNombre, eq.liderEmail),
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
  const liderNombreInput = el("input", { class: "input", type: "text", value: equipoExistente?.liderNombre || "", placeholder: "Nombre del líder" });
  const liderEmailInput = el("input", { class: "input", type: "email", value: equipoExistente?.liderEmail || "", placeholder: "correo@zubex.com.mx" });
  const gerenteNombreInput = el("input", { class: "input", type: "text", value: equipoExistente?.gerenteNombre || "", placeholder: "Nombre del gerente" });
  const gerenteEmailInput = el("input", { class: "input", type: "email", value: equipoExistente?.gerenteEmail || "", placeholder: "correo@zubex.com.mx" });

  const body = el("div", {}, [
    field("Nombre del equipo *", nombreInput),
    field("Líder — nombre *", liderNombreInput),
    field("Líder — correo *", liderEmailInput),
    field("Gerente — nombre *", gerenteNombreInput),
    field("Gerente — correo *", gerenteEmailInput),
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
            liderNombre: liderNombreInput.value.trim(),
            liderEmail: liderEmailInput.value.trim(),
            gerenteNombre: gerenteNombreInput.value.trim(),
            gerenteEmail: gerenteEmailInput.value.trim(),
          };
          if (!payload.nombre || !payload.liderNombre || !payload.liderEmail || !payload.gerenteNombre || !payload.gerenteEmail) {
            toast("Completa todos los campos obligatorios (*).", "tr");
            return;
          }
          if (!isValidEmail(payload.liderEmail) || !isValidEmail(payload.gerenteEmail)) {
            toast("Revisa que los correos del líder y del gerente sean válidos.", "tr");
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
// Modal: agregar empleado
// ---------------------------------------------------------------------------
function openEmpleadoModal(view, eq) {
  let overlayRef; // se asigna abajo, antes de que el usuario pueda hacer clic en nada
  const nominaInput = el("input", { class: "input", type: "text", placeholder: "Ej. 0006" });
  const nombreInput = el("input", { class: "input", type: "text", placeholder: "Nombre completo" });

  const body = el("div", {}, [
    el("p", { class: "hint", style: "margin-bottom:16px" }, [`Equipo: ${eq.nombre}`]),
    field("Nómina *", nominaInput),
    field("Nombre completo *", nombreInput),
  ]);

  overlayRef = openModal("Agregar empleado", body, [
    el("button", { class: "btn btn-outline", onclick: () => closeModal(overlayRef) }, ["Cancelar"]),
    el(
      "button",
      {
        class: "btn btn-accent",
        onclick: async () => {
          const nomina = nominaInput.value.trim();
          const nombre = nombreInput.value.trim();
          if (!nomina || !nombre) {
            toast("Completa nómina y nombre.", "tr");
            return;
          }
          try {
            await mockBackend.agregarEmpleado(eq.nombre, { nomina, nombre });
            toast("Empleado agregado.", "tg");
            equiposCache = await mockBackend.getEquipos();
            closeModal(overlayRef);
            paint(view);
          } catch (err) {
            toast(err.message || "No se pudo agregar el empleado.", "tr");
          }
        },
      },
      ["Agregar"]
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
