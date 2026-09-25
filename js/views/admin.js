// ============================================================================
// admin.js — Pantalla de administración: equipos, aprobadores y empleados,
// filtro por departamento y exportación a Excel.
//
// Conectado al contrato real de Fase 5 (KaizenZX_Handoff_Fase5_Final.md +
// KaizenZX_Respuestas_3_Preguntas_Tecnicas.md + KaizenZX_Respuestas_Admin_
// Conectado.md): equipos-create/update/delete, equipos-empleados-add/remove,
// empleados-get — todo vía js/api.js, con fallback a mock-backend.js cuando
// CONFIG.MOCK_MODE está activo, igual que el resto de la app.
//
// Modelo de roles (rediseño de septiembre 2026, pedido directo de Javier —
// "vamos a hacer los cambios bien"): esta pantalla distingue 3 roles
// separados por equipo, en vez de reusar el campo "líder" como si fuera un
// aprobador:
//   - Líder: rol de organigrama, puramente informativo. Viene de
//     `liderNombre`/`liderEmail` (GET /equipos) y se asigna por NÓMINA
//     (cualquier empleado de la empresa) — el correo se resuelve solo si
//     esa persona lo tiene capturado en RH.
//   - Aprobador 2 / Aprobador 3: quienes de verdad aprueban los pasos 2 y 3
//     del kaizen. SÍ se pueden asignar por equipo desde aquí desde
//     `KaizenZX_Cascada_Aprobador23_Lista.md` (Jesús, 24 sep 2026) — ver
//     mapa actualizado abajo.
//
// IMPORTANTE — mapa vigente de ruteo vs. visibilidad vs. informativo
// (actualizado con `KaizenZX_Cascada_Aprobador23_Lista.md`, respuesta final
// de Jesús a `KaizenZX_Cambios_Necesarios_Equipos_v2.md`):
//
//   RUTEO real (a quién le llega/quién puede aprobar):
//     `empleados.aprobador2_nomina` / `aprobador3_nomina` — se congelan en
//     el kaizen al crearse, así que el historial nunca cambia con esto.
//     Se editan por EQUIPO desde `openEquipoModal()` con `aprobador2Nomina`/
//     `aprobador3Nomina` en `POST`/`PUT /equipos` — Jesús ya construyó la
//     cascada: al guardar, se propaga automáticamente a
//     `aprobador2_nomina`/`aprobador3_nomina` de TODOS los miembros
//     ACTUALES del equipo. "" o `null` desasigna. Se valida que la nómina
//     exista en `usuarios` (400 con mensaje claro si no).
//     Los 3 equipos con valores antes no uniformes (C4, Las Papas, Motal
//     Kompras) ya quedan unificados en cuanto un admin los edite con este
//     modelo — decisión de Javier.
//   VISIBILIDAD (qué ve cada quien en listados) — funcional, pero no es ruteo:
//     `equipos_gerentes`/`departamentos_gerentes` (gerente por equipo/depto
//     en "Solicitudes"), `empleados.equipo_id` (qué ve un líder). Jesús
//     ajustó `kaizens-list`/`kaizens-detail` para resolver primero contra
//     `equipos.aprobador3_nomina` (cuando ya está editado) y solo caer a
//     estas tablas viejas como respaldo — transparente, sin cambio de
//     contrato de este lado.
//   PURAMENTE INFORMATIVO, sin efecto funcional en nada:
//     `equipos.lider_email` — el campo `liderEmail` de POST/PUT /equipos.
//     CONFIRMADO por Jesús: solo alimenta `liderNombre`/`liderEmail` en
//     GET /equipos, nunca toca ningún aprobador. Correcto y esperado para
//     "Líder" (siempre fue solo informativo).
//
// `GET /equipos` (el listado, usado para pintar las tarjetas) ya trae
// `aprobador2Nomina`/`aprobador2Nombre`/`aprobador3Nomina`/
// `aprobador3Nombre` con el nombre resuelto por el backend, igual que
// `liderNombre` (KaizenZX_Equipos_List_Aprobadores_Listo.md — a Jesús se le
// había pasado agregarlo al construir la cascada, ya corregido y probado).
// Jesús también corrigió de oficio `gerenteNombre`/`gerenteEmail` (el campo
// viejo de visibilidad) para que sigan la misma prioridad que
// `kaizens-list`/`kaizens-detail`: primero `aprobador3Nomina` del equipo si
// existe, y solo si no, caen al respaldo viejo (`equipos_gerentes`/
// `departamentos_gerentes`) — no se usa ya en este archivo (se reemplazó
// por `aprobador3Nombre`), pero queda anotado por si algún día hace falta.
//
// BACKFILL YA CORRIDO (KaizenZX_Backfill_Correos_Confirmado.md, 25 sep
// 2026): los 38 equipos reales ya tienen `aprobador2Nomina` poblado desde
// sus propios miembros (incluyendo la unificación de C4/Las Papas/Motal
// Kompras). `aprobador3Nomina` quedó vacío A PROPÓSITO en 11 de los 38 —
// esos equipos cierran en 2 pasos por diseño de RH (87/326 personas cierran
// en 2 pasos, concentradas justo en esos 11 equipos completos), NO es un
// hueco de datos ni algo que un admin tenga que corregir. `nominaBlock()`
// (ver abajo) distingue este caso ("cierra en 2 pasos", solo si
// `aprobador2Nomina` ya existe) de un equipo genuinamente sin migrar (los
// dos campos vacíos — ya no debería pasar para equipos reales tras el
// backfill, pero sí puede pasar con equipos de prueba nuevos).
//
// MOVER a alguien de equipo — YA actualiza su aprobador automáticamente
// (corregido por Jesús, `KaizenZX_Cascada_Aprobador23_Lista.md`):
// `equipos-empleados-add` reasigna `equipo_id` sin necesidad de quitar
// primero (funciona como "mover"), y además asigna automáticamente el
// `aprobador2_nomina`/`aprobador3_nomina` VIGENTE del equipo destino.
// ALERTA de transición: un equipo de prueba/nuevo sin editar con el modelo
// nuevo todavía puede tener `aprobador2Nomina`/`aprobador3Nomina` en
// `null` — mover a alguien ahí lo deja SIN aprobador2/3 hasta que se edite
// el equipo. No es bug. Se avisa en `openEmpleadoModal()` cuando el equipo
// destino tiene ambos campos en null (ya no debería pasar para los 38
// equipos reales tras el backfill).
//
// Aviso de "ya pertenece a otro equipo": al buscar una nómina (líder,
// aprobador o integrante nuevo), si `GET /empleados/:nomina` regresa un
// `equipo` distinto al que se está editando, se muestra una advertencia —
// ver advertenciaEquipoExistente(). No bloquea la acción, solo avisa (así
// lo pidió Javier) — y ahora es informativa, no una llamada de atención
// sobre un paso manual pendiente (el movimiento ya es automático).
//
// Filtro por departamento: `GET /equipos` NO trae departamento por equipo
// (confirmado por Jesús) — mientras se agrega ese campo, se infiere
// cruzando el historial de Short Kaizen de cada equipo (ver
// departamentoDeEquipo()). Es una aproximación, marcada como tal en
// pantalla, y no clasifica equipos sin ningún kaizen creado todavía.
//
// AJUSTES DE UX pedidos por Javier tras probar la pantalla ya con datos
// reales post-backfill (26 sep 2026):
//   - Correo de Aprobador 2/3: ya NO se captura a mano. `nominaBuscarField`
//     solo lo autocompleta al buscar (input deshabilitado) — evita errores
//     de captura como el typo real que tuvo la nómina 2442 (Sergio España,
//     "s.españa@" en vez de "sd.espana@"). Si RH no tiene el correo
//     capturado, se queda vacío — no hay forma de escribirlo aquí a mano.
//   - Correo de Líder: se quitó el campo por completo. A Javier no le
//     importa si el líder tiene o no correo capturado (es un rol solo
//     informativo) — se manda automáticamente si `buscarEmpleadoInfo`
//     encuentra uno, si no, el líder se guarda sin correo (limitación real
//     del contrato: `liderEmail` es el único campo de entrada para el
//     líder, así que si la persona no tiene correo en RH, no hay forma de
//     vincularlo por esta vía — no es algo que el frontend pueda resolver).
//   - Tarjeta de equipo: si un equipo ya tiene Aprobador 2 pero NO
//     Aprobador 3 (el caso confirmado de "cierra en 2 pasos por diseño de
//     RH", 11 de 38 equipos reales), la tarjeta ya NO muestra el bloque de
//     Aprobador 3 — se oculta en vez de mostrar "no aplica". Sigue
//     disponible para asignar desde el modal de "Editar equipo" por si el
//     negocio decide agregar un tercer paso más adelante.
//   - Bloques de rol (Líder/Aprobador 2/Aprobador 3): layout horizontal
//     (etiqueta a la izquierda, nombre/nómina a la derecha) en vez de
//     apilado vertical, para que quepan sin que la etiqueta se corte en 2
//     líneas (ver `.admin-role-block` en css/views.css).
//   - "Empleados" renombrado a "Integrantes" en toda la pantalla.
//   - `.modal` en css/components.css ahora tiene `max-height`/`overflow-y`
//     para que el popup de "Nuevo equipo" (el más largo, con 3 buscadores
//     de nómina) siempre quepa en pantalla con scroll interno, sin que el
//     admin tenga que achicar la ventana del navegador.
//
// Acceso: visible para usuarios con rol "admin" o "mc" (ver js/shell.js).
// ============================================================================

import { el, toast, formatDate, shortId } from "../utils.js";
import { api } from "../api.js";
import { state } from "../state.js";

let equiposCache = [];
let departamentosCache = []; // [{id, nombre}] — GET /departamentos (antes string[] en el mock)
let equipoDepartamentoCache = {}; // { [nombreEquipo]: nombreDepartamento } — inferido de kaizens, ver departamentoDeEquipo()
let departamentoFiltro = "";
// Buscador de equipos (pedido de Javier, sept. 2026): filtra por nombre de
// equipo, en vez de tener que bajar en una lista larga. Se combina con el
// filtro de departamento (ambos aplican a la vez, no son excluyentes).
let busquedaEquipo = "";

// Cache de correos resueltos por nómina (Aprobador 2/3) — varios equipos
// pueden compartir la misma persona como aprobador, así que se resuelve una
// sola vez por nómina aunque aparezca en varias tarjetas. Vive a nivel de
// módulo porque solo es un cache de lectura, no estado de negocio.
const correoPorNominaCache = {};
function obtenerCorreoCacheado(nomina) {
  if (!nomina) return Promise.resolve(null);
  if (!(nomina in correoPorNominaCache)) {
    correoPorNominaCache[nomina] = buscarEmpleadoInfo(nomina)
      .then((info) => info.correo)
      .catch(() => null);
  }
  return Promise.resolve(correoPorNominaCache[nomina]);
}

// Menú de acciones genérico (pedido de Javier, sept. 2026): reemplaza
// varios botones sueltos por un solo botón que despliega las opciones. Se
// cierra solo con un único listener de click a nivel de documento,
// adjuntado una sola vez (no en cada paint()) para no ir acumulando
// listeners fantasma en cada repintado de la vista.
let actionMenuGlobalListenerListo = false;
function ensureActionMenuGlobalListener() {
  if (actionMenuGlobalListenerListo) return;
  actionMenuGlobalListenerListo = true;
  document.addEventListener("click", () => {
    document.querySelectorAll(".action-menu-dropdown").forEach((d) => {
      d.hidden = true;
    });
  });
}
function buildActionMenu(triggerLabel, triggerClass, opciones) {
  ensureActionMenuGlobalListener();
  const dropdown = el(
    "div",
    { class: "action-menu-dropdown", hidden: true },
    opciones.map((op) =>
      el(
        "button",
        {
          class: `action-menu-item${op.danger ? " action-menu-item-danger" : ""}`,
          onclick: (ev) => {
            ev.stopPropagation();
            dropdown.hidden = true;
            op.onClick();
          },
        },
        [op.label]
      )
    )
  );
  const toggle = el(
    "button",
    {
      class: triggerClass,
      onclick: (ev) => {
        ev.stopPropagation();
        dropdown.hidden = !dropdown.hidden;
      },
    },
    [triggerLabel]
  );
  return el("div", { class: "action-menu" }, [toggle, dropdown]);
}

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
    const [equipos, departamentos, kaizens] = await Promise.all([api.getEquipos(), api.getDepartamentos(), api.getKaizens()]);
    if (isStale && isStale()) return; // el usuario ya navegó a otra vista — no tocar el DOM
    equiposCache = equipos;
    // Normaliza: el mock regresa string[], el backend real { id, nombre }[].
    departamentosCache = departamentos.map((d) => (typeof d === "string" ? { id: d, nombre: d } : d));
    // GET /equipos no trae departamento propio — se infiere del historial de
    // kaizens (sí trae `departamento`) mientras se agrega el campo real.
    equipoDepartamentoCache = {};
    (kaizens || []).forEach((k) => {
      if (k.equipo && k.departamento) equipoDepartamentoCache[k.equipo] = k.departamento;
    });
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
  return departamentosCache.find((d) => String(d.id) === String(id))?.nombre || id;
}

// Devuelve { id, nombre, estimado } o null si no se pudo determinar el
// departamento del equipo. Prioriza un campo directo del equipo (por si
// Jesús ya agregó departamentoId/departamento a GET /equipos) y solo cae al
// cruce con el historial de kaizens si no hay nada directo — ver nota en el
// encabezado del archivo.
function departamentoDeEquipo(eq) {
  if (eq.departamentoId) {
    return { id: eq.departamentoId, nombre: nombreDepartamento(eq.departamentoId), estimado: false };
  }
  if (eq.departamento) {
    const match = departamentosCache.find((d) => d.nombre === eq.departamento);
    return { id: match?.id || null, nombre: eq.departamento, estimado: false };
  }
  const inferido = equipoDepartamentoCache[eq.nombre];
  if (inferido) {
    const match = departamentosCache.find((d) => d.nombre === inferido);
    return { id: match?.id || null, nombre: inferido, estimado: true };
  }
  return null;
}

function paint(view) {
  view.innerHTML = "";

  // Botón único de acciones (pedido de Javier, sept. 2026): antes eran 3
  // botones sueltos ("Cambiar rol", "+ Crear empleado", "+ Nuevo equipo") —
  // ahora un solo botón despliega las tres opciones. También se quitó el
  // botón "Exportar a Excel" y el subtítulo de la pantalla, ambos por
  // pedido explícito.
  const accionesMenu = buildActionMenu("Acciones ▾", "btn btn-accent", [
    { label: "Cambiar rol", onClick: () => openCambiarRolModal(view) },
    { label: "+ Crear empleado", onClick: () => openCrearEmpleadoModal(view) },
    { label: "+ Nuevo equipo", onClick: () => openEquipoModal(view) },
    // Pedido de Javier para el Dashboard (sept. 2026, ver
    // KaizenZX_Grupos_Departamento_Dashboard.md): clasificar cada
    // departamento en uno de 3 grupos de negocio. Los equipos heredan el
    // grupo de su departamento automáticamente, no se asignan uno por uno.
    { label: "Asignar grupo a departamentos", onClick: () => openAsignarGrupoModal(view) },
  ]);

  view.appendChild(
    el("div", { class: "view-header" }, [
      el("div", {}, [el("h1", {}, ["Administración"])]),
      el("div", { style: "display:flex;gap:10px;flex-wrap:wrap" }, [accionesMenu]),
    ])
  );

  // Buscador y filtro en extremos opuestos de la misma fila (pedido de
  // Javier, sept. 2026): antes iban uno debajo del otro, con el filtro
  // primero. Ahora el buscador queda a la izquierda y el filtro de
  // departamento a la derecha.
  view.appendChild(
    el("div", { style: "display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:20px" }, [
      buildBuscadorEquipo(view),
      buildFiltroDepartamento(view),
    ])
  );

  // Comparación por String(): el <select> siempre entrega su value como
  // string, pero el id de departamento puede venir numérico si ya se
  // desplegó `departamentoId` real en el backend (antes solo existía el
  // id-string del mock) — comparar con === sin normalizar dejaba el filtro
  // siempre vacío (15 !== "15"). Bug reportado por Javier, sep. 2026.
  let equiposFiltrados = departamentoFiltro
    ? equiposCache.filter((eq) => String(departamentoDeEquipo(eq)?.id ?? "") === String(departamentoFiltro))
    : equiposCache;

  // Buscador de equipos (pedido de Javier, sept. 2026): filtra además por
  // nombre de equipo, insensible a mayúsculas/acentos.
  if (busquedaEquipo.trim()) {
    const normaliza = (s) => (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const q = normaliza(busquedaEquipo);
    equiposFiltrados = equiposFiltrados.filter((eq) => normaliza(eq.nombre).includes(q));
  }

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
        el("h3", {}, ["Sin equipos que coincidan"]),
        el("p", {}, ["Prueba otro departamento o ajusta la búsqueda."]),
      ])
    );
    return;
  }

  view.appendChild(el("div", { class: "admin-grid" }, equiposFiltrados.map((eq) => buildEquipoCard(view, eq))));
}

function buildBuscadorEquipo(view) {
  const input = el("input", {
    class: "input",
    type: "search",
    placeholder: "Buscar equipo por nombre…",
    value: busquedaEquipo,
    oninput: (e) => {
      busquedaEquipo = e.target.value;
      paint(view);
    },
  });
  // Re-enfoca el campo tras repintar, para poder seguir escribiendo sin
  // que el cursor se pierda cada vez que paint() reconstruye la vista.
  if (busquedaEquipo) {
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }
  return el("div", { class: "field search-field admin-search" }, [
    el("span", { class: "search-icon" }, ["🔍"]),
    input,
  ]);
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
      ...departamentosCache.map((d) => el("option", { value: d.id, selected: String(d.id) === String(departamentoFiltro) || undefined }, [d.nombre])),
    ]
  );
  return el("div", { class: "field", style: "max-width:320px;margin-bottom:0" }, [el("label", {}, ["Filtrar por departamento"]), select]);
}

function buildEquipoCard(view, eq) {
  const depto = departamentoDeEquipo(eq);
  const deptoTexto = depto ? (depto.estimado ? `${depto.nombre} (estimado por historial)` : depto.nombre) : "Departamento sin clasificar";

  // Equipo confirmado de "cierra en 2 pasos por diseño de RH" (11 de 38,
  // KaizenZX_Backfill_Correos_Confirmado.md): ya tiene Aprobador 2 propio
  // pero nunca va a tener Aprobador 3 salvo que el negocio lo decida. Pedido
  // de Javier: en ese caso, ni mostrar el bloque en la tarjeta — no es que
  // "falte" nada. Sigue disponible para asignar desde "Editar equipo" (ver
  // openEquipoModal) por si algún día se agrega un tercer paso. Un equipo
  // genuinamente sin migrar (los 2 campos vacíos) sigue mostrando los 3
  // bloques, para que quede visible que hace falta editarlo.
  const aprobador3Aplica = !(eq.aprobador2Nomina && !eq.aprobador3Nomina);

  const rolesRow = [
    // liderNombre/liderEmail = rol de organigrama, puramente informativo
    // (confirmado por Jesús — no mueve el ruteo de aprobación).
    roleBlock("Líder", eq.liderNombre, eq.liderEmail),
    // aprobador2Nomina/aprobador3Nomina = ruteo REAL, ya editable por
    // equipo (KaizenZX_Cascada_Aprobador23_Lista.md), y GET /equipos ya
    // resuelve el nombre igual que liderNombre (confirmado en
    // KaizenZX_Equipos_List_Aprobadores_Listo.md). Backfill ya corrido
    // (KaizenZX_Backfill_Correos_Confirmado.md): los 38 equipos reales
    // tienen `aprobador2Nomina`.
    nominaBlock("Aprobador 2", eq.aprobador2Nombre, eq.aprobador2Nomina, {
      notaVacia: "Este equipo todavía no ha sido editado con el modelo nuevo — edítalo para asignar un Aprobador 2.",
    }),
  ];
  if (aprobador3Aplica) {
    rolesRow.push(
      nominaBlock("Aprobador 3", eq.aprobador3Nombre, eq.aprobador3Nomina, {
        notaVacia: "Este equipo todavía no ha sido editado con el modelo nuevo — edítalo para asignar un Aprobador 3 (si le corresponde).",
      })
    );
  }

  // Editar/Eliminar unificados en un solo botón (pedido de Javier, sept.
  // 2026): antes eran 2 botones separados en cada tarjeta de equipo.
  const accionesEquipo = buildActionMenu("Opciones ▾", "btn btn-outline btn-sm", [
    { label: "Editar", onClick: () => openEquipoModal(view, eq) },
    { label: "Eliminar", danger: true, onClick: () => confirmEliminarEquipo(view, eq) },
  ]);

  return el("div", { class: "card admin-team-card" }, [
    el("div", { class: "card-header" }, [
      el("div", {}, [
        el("h3", {}, [eq.nombre]),
        el("div", { class: "hint" }, [deptoTexto]),
      ]),
      accionesEquipo,
    ]),

    el("div", { class: "admin-roles-row" }, rolesRow),

    el("div", { class: "admin-members-header" }, [
      el("h4", {}, [`${eq.miembros.length} integrantes`]),
      el("button", { class: "btn btn-outline btn-sm", onclick: () => openEmpleadoModal(view, eq) }, ["+ Agregar integrante"]),
    ]),

    buildMembersTable(view, eq),
  ]);
}

// Muestra Aprobador 2/3 en la tarjeta de equipo, con nombre ya resuelto por
// el backend (KaizenZX_Equipos_List_Aprobadores_Listo.md — GET /equipos
// regresa aprobador2Nombre/aprobador3Nombre igual que liderNombre). Cadena
// vacía "" tiene 2 causas distintas, no siempre es "falta algo" — ver el
// call site en buildEquipoCard(): (a) equipo genuinamente sin migrar al
// modelo nuevo, o (b) equipo que cierra en 2 pasos por diseño de RH
// (confirmado por Jesús, KaizenZX_Backfill_Correos_Confirmado.md — 11 de
// 38 equipos reales). `nombreVacio`/`notaVacia` los distingue en pantalla.
function nominaBlock(label, nombre, nomina, { nombreVacio = "— sin asignar aún —", notaVacia = null } = {}) {
  // Formato "1234 - Nombre" tal cual (pedido de Javier, sept. 2026): antes
  // la nómina iba abajo como referencia secundaria ("Nómina 1234"); ahora
  // va pegada al nombre, como un solo dato. El correo (pedido de Javier,
  // según boceto a mano) ya no lleva el prefijo "Correo:" — solo la
  // dirección tal cual, en la línea de abajo. El correo no viene en GET
  // /equipos (solo nombre/nómina) — se resuelve aparte con
  // `obtenerCorreoCacheado()` y se rellena async sin bloquear el resto de
  // la tarjeta.
  const correoEl = el("div", { class: "admin-role-correo" }, ["—"]);
  if (nomina) {
    correoEl.textContent = "buscando…";
    obtenerCorreoCacheado(nomina).then((correo) => {
      correoEl.textContent = correo || "no disponible en RH";
    });
  }
  const nombreTexto = nombre ? (nomina ? `${nomina} - ${nombre}` : nombre) : nombreVacio;
  return el("div", { class: "admin-role-block" }, [
    el("div", { class: "admin-role-label" }, [label]),
    el("div", { class: "admin-role-value" }, [
      el("div", { class: "admin-role-name" }, [nombreTexto]),
      nomina ? correoEl : null,
      !nomina && notaVacia ? el("div", { class: "hint" }, [notaVacia]) : null,
    ].filter(Boolean)),
  ]);
}

function roleBlock(label, nombre, email) {
  // Jesús confirmó (KaizenZX_Respuestas_Admin_Conectado.md): `liderNombre`
  // se resuelve buscando `liderEmail` en el catálogo de personal, pero solo
  // una parte de las 326 personas tienen correo institucional cargado en
  // RH. A Javier no le interesa el correo del líder en absoluto (rol solo
  // informativo) — pedido explícito: la tarjeta ya NO muestra el correo,
  // solo el nombre (o "— sin asignar —" si no hay ni nombre ni correo
  // resuelto). El correo sigue viajando internamente (ver
  // nominaBuscarField/getCorreo en el modal de edición), solo dejó de
  // mostrarse aquí.
  //
  // Centrado (pedido de Javier, sept. 2026): `.admin-role-block-centrado`
  // en css/views.css. Javier también pidió el formato "1234 - Nombre"
  // aquí igual que en Aprobador 2/3 — NO se puede hacer todavía: el
  // contrato real (confirmado por Jesús) identifica al líder únicamente
  // por `liderEmail`, GET /equipos nunca regresa una nómina de líder
  // (`liderNomina` no existe). Sigue anotado como pendiente real de
  // backend (ver sección 29.2/33 del documento de contexto) — habría que
  // preguntarle a Jesús si puede agregar `liderNomina` al contrato.
  return el("div", { class: "admin-role-block admin-role-block-centrado" }, [
    el("div", { class: "admin-role-label" }, [label]),
    el("div", { class: "admin-role-value" }, [
      el("div", { class: "admin-role-name" }, [nombre || (email ? "(nombre no disponible)" : "— sin asignar —")]),
    ]),
  ]);
}

function buildMembersTable(view, eq) {
  if (!eq.miembros.length) {
    return el("div", { class: "empty-state", style: "padding:24px 0" }, [
      el("p", {}, ["Este equipo todavía no tiene integrantes registrados."]),
    ]);
  }
  // Con más de 5 integrantes, la lista se vuelve scrollable en vez de
  // seguir creciendo la tarjeta — se ven los primeros ~5 y el resto se
  // alcanza con scroll interno.
  const listClass = eq.miembros.length > 5 ? "admin-member-list admin-member-list-scroll" : "admin-member-list";
  return el(
    "div",
    { class: listClass },
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
// GET /empleados/:nomina (empleados-get) confirmado por Jesús
// (KaizenZX_Respuestas_Filtro_Aprobadores.md): { nomina, nombre, tipo,
// posicion, departamento:{id,nombre}, equipo:{id,nombre} }.
// Correo: bug real de backend encontrado y corregido por Jesús
// (KaizenZX_Correo_Empleados_Get_Corregido.md, 26 sep 2026) — la tabla ya
// tenía el correo cargado (backfill de 108/109), pero `empleados-get` nunca
// se actualizó para incluirlo en la respuesta. Ya corregido: el campo se
// llama ÚNICAMENTE `email` (confirmado con 3 casos reales por Jesús,
// incluyendo `email:null` limpio para quien no tiene correo capturado) —
// se quita el intento de `empleado.correo`, ese nombre de campo nunca
// existió. Para el resto de las personas sin correo capturado en RH, sigue
// viniendo `null`, así que la nómina solo AUTOCOMPLETA el correo cuando
// existe. `equipo` sí viene siempre que la persona ya esté en uno — se usa
// para la advertencia de "ya pertenece a otro equipo" (ver
// advertenciaEquipoExistente()).
async function buscarEmpleadoInfo(nomina) {
  const empleado = await api.buscarEmpleadoPorNomina(nomina);
  return { nombre: empleado?.nombre || nomina, correo: empleado?.email || null, equipo: empleado?.equipo || null };
}

// Devuelve un mensaje de advertencia si `equipoDeLaPersona` existe y es
// distinto al equipo que se está editando/creando (`equipoActualId`) —
// null si no hay conflicto. Pedido explícito de Javier: solo avisa, no
// bloquea la acción. Desde que Jesús confirmó que `equipos-empleados-add`
// ya mueve automáticamente (`KaizenZX_Cascada_Aprobador23_Lista.md`), este
// aviso ya no advierte de un paso manual pendiente — solo informa qué va a
// pasar (incluyendo que hereda el aprobador2/3 del equipo nuevo).
function advertenciaEquipoExistente(equipoDeLaPersona, equipoActualId) {
  if (!equipoDeLaPersona) return null;
  if (equipoActualId && String(equipoDeLaPersona.id) === String(equipoActualId)) return null;
  return `⚠ Ya pertenece al equipo "${equipoDeLaPersona.nombre}". Si continúas, se mueve automáticamente a este equipo (deja de aparecer en el anterior) y hereda el Aprobador 2/3 de aquí.`;
}

// Nómina de ejemplo al azar (4 dígitos) para el placeholder del campo de
// búsqueda — pedido de Javier, sept. 2026 (antes decía "Nómina del líder"
// o similar como placeholder).
function placeholderNomina() {
  return `Ej. ${Math.floor(1000 + Math.random() * 9000)}`;
}

// Construye un bloque reutilizable "nómina → buscar → nombre/correo
// resueltos" usado para Líder, Aprobador 2 y Aprobador 3 dentro de
// openEquipoModal(). `nominaInicial` prellena el campo con la nómina que
// el equipo ya tiene asignada (si la hay), para que el submit no la borre
// por accidente si el admin no toca el campo.
//
// Rediseño de esta pantalla (pedido de Javier, sept. 2026): ya no hay
// mensajes de "Encontrado: ... correo cargado automáticamente" ni textos
// de ayuda genéricos — el nombre y el correo encontrados se muestran como
// simples etiquetas de texto debajo de su propia etiqueta fija ("Nombre",
// "Correo"), vacías hasta que se busque. El único mensaje que se conserva
// es el de error cuando la nómina no existe.
//
// `showCorreo` controla si se muestra la sección de correo (Aprobador 2/3
// sí, Líder no — a Javier no le interesa el correo del líder). El correo
// nunca se escribe a mano en ningún caso — solo se llena al buscar, pedido
// explícito de Javier tras el typo real de correo que tuvo la nómina 2442
// (Sergio España), para evitar que se repita ese tipo de error de captura.
// `getCorreo()` regresa el correo resuelto (o el inicial si no se ha
// vuelto a buscar) sin importar si hay sección de correo visible o no —
// así el líder también manda su correo automáticamente al guardar, aunque
// no se muestre en pantalla.
function nominaBuscarField({ nominaInicial = "", nombreInicial = "", correoInicial = "", equipoActualId = null, showCorreo = true } = {}) {
  const nominaInput = el("input", { class: "input", type: "text", placeholder: placeholderNomina(), value: nominaInicial });
  let correoActual = correoInicial || "";
  // En edición, se prellenan con lo que el equipo ya tiene asignado, para
  // que el admin vea de entrada quién está asignado sin tener que volver a
  // buscar — si busca otra nómina, se sobreescriben con lo nuevo.
  const nombreLabel = el("div", { class: "readonly-field" }, [nombreInicial || "—"]);
  const correoLabel = showCorreo ? el("div", { class: "readonly-field" }, [correoActual || "—"]) : null;
  const errorText = el("p", { class: "hint", style: "color:#991b1b" }, []);
  const warning = el("p", { class: "hint", style: "color:#991b1b" }, []);
  let ultimoResultado = null;

  const buscarBtn = el(
    "button",
    {
      class: "btn btn-outline btn-sm",
      type: "button",
      onclick: async () => {
        const nomina = nominaInput.value.trim();
        if (!nomina) {
          toast("Escribe primero la nómina.", "tr");
          return;
        }
        try {
          const info = await buscarEmpleadoInfo(nomina);
          ultimoResultado = info;
          correoActual = info.correo || "";
          errorText.textContent = "";
          nombreLabel.textContent = info.nombre || "—";
          if (correoLabel) correoLabel.textContent = correoActual || "—";
          warning.textContent = advertenciaEquipoExistente(info.equipo, equipoActualId) || "";
        } catch (err) {
          ultimoResultado = null;
          correoActual = "";
          warning.textContent = "";
          nombreLabel.textContent = "—";
          if (correoLabel) correoLabel.textContent = "—";
          errorText.textContent = err.message || "No se encontró ningún empleado con esa nómina.";
        }
      },
    },
    ["Buscar"]
  );

  return { nominaInput, nombreLabel, correoLabel, errorText, warning, buscarBtn, getResultado: () => ultimoResultado, getCorreo: () => correoActual };
}

function openEquipoModal(view, equipoExistente) {
  const esEdicion = Boolean(equipoExistente);
  const equipoActualId = equipoExistente?.id || null;
  let overlayRef; // se asigna abajo, antes de que el usuario pueda hacer clic en nada

  const nombreInput = el("input", { class: "input", type: "text", value: equipoExistente?.nombre || "", placeholder: "Ej. Equipo Línea A" });
  const departamentoActualId = departamentoDeEquipo(equipoExistente || {})?.id || "";
  const departamentoSelect = el(
    "select",
    { class: "select" },
    [
      el("option", { value: "" }, ["Selecciona un departamento…"]),
      ...departamentosCache.map((d) => el("option", { value: d.id, selected: d.id === departamentoActualId || undefined }, [d.nombre])),
    ]
  );

  // Líder — rol informativo de organigrama, cualquier empleado de la
  // empresa, se busca por NÓMINA. Viaja como `liderEmail` en POST/PUT
  // /equipos (contrato real confirmado por Jesús — no existe `liderNombre`
  // como campo de entrada), pero sin sección de correo visible: a Javier
  // no le interesa el correo del líder (`showCorreo:false`) — el correo
  // encontrado al buscar se manda solo, y si la persona no tiene correo en
  // RH, el líder se guarda igual, sin correo (limitación real del
  // contrato: sin correo no hay forma de vincular al líder por esta vía).
  const lider = nominaBuscarField({
    correoInicial: equipoExistente?.liderEmail || "",
    nombreInicial: equipoExistente?.liderNombre || "",
    equipoActualId,
    showCorreo: false,
  });

  // Aprobador 2 / Aprobador 3 — quienes de verdad aprueban los pasos 2 y 3.
  // Ya se guardan vía `aprobador2Nomina`/`aprobador3Nomina` en POST/PUT
  // /equipos (KaizenZX_Cascada_Aprobador23_Lista.md, Jesús): al guardar,
  // se propaga automáticamente a todos los integrantes actuales del
  // equipo. Se prellenan con el valor actual del equipo (si lo tiene) para
  // no perderlo si el admin no toca el campo.
  const aprobador2 = nominaBuscarField({
    nominaInicial: equipoExistente?.aprobador2Nomina || "",
    nombreInicial: equipoExistente?.aprobador2Nombre || "",
    equipoActualId,
  });
  const aprobador3 = nominaBuscarField({
    nominaInicial: equipoExistente?.aprobador3Nomina || "",
    nombreInicial: equipoExistente?.aprobador3Nombre || "",
    equipoActualId,
  });

  // Rediseño de esta pantalla (pedido de Javier, sept. 2026): estructura
  // fija por rol — etiqueta del rol, "Nómina" + campo/buscar, "Nombre" +
  // valor, y (si aplica) "Correo" + valor. Sin textos de ayuda genéricos
  // ni mensajes de confirmación — solo el error cuando la nómina no existe
  // (`errorText`) y el aviso de "ya pertenece a otro equipo" (`warning`).
  const body = el(
    "div",
    {},
    [
      field("Nombre del equipo *", nombreInput),
      field("Departamento *", departamentoSelect),

      el("p", { class: "hint", style: "font-weight:600;margin-top:8px" }, ["Líder del equipo"]),
      el("div", { class: "field" }, [
        el("label", {}, ["Número de nómina"]),
        el("div", { style: "display:flex;gap:8px" }, [lider.nominaInput, lider.buscarBtn]),
      ]),
      lider.errorText,
      lider.warning,
      el("div", { class: "field" }, [el("label", {}, ["Nombre"]), lider.nombreLabel]),

      el("p", { class: "hint", style: "font-weight:600;margin-top:16px" }, ["Aprobador 2"]),
      el("div", { class: "field" }, [
        el("label", {}, ["Nómina"]),
        el("div", { style: "display:flex;gap:8px" }, [aprobador2.nominaInput, aprobador2.buscarBtn]),
      ]),
      aprobador2.errorText,
      aprobador2.warning,
      el("div", { class: "field" }, [el("label", {}, ["Nombre"]), aprobador2.nombreLabel]),
      el("div", { class: "field" }, [el("label", {}, ["Correo"]), aprobador2.correoLabel]),

      el("p", { class: "hint", style: "font-weight:600;margin-top:16px" }, ["Aprobador 3"]),
      el("div", { class: "field" }, [
        el("label", {}, ["Nómina"]),
        el("div", { style: "display:flex;gap:8px" }, [aprobador3.nominaInput, aprobador3.buscarBtn]),
      ]),
      aprobador3.errorText,
      aprobador3.warning,
      el("div", { class: "field" }, [el("label", {}, ["Nombre"]), aprobador3.nombreLabel]),
      el("div", { class: "field" }, [el("label", {}, ["Correo"]), aprobador3.correoLabel]),

      el("p", { class: "hint" }, [
        "Al guardar, Aprobador 2 y Aprobador 3 se aplican a TODOS los integrantes actuales del equipo — los kaizens que ya existen no se ven afectados (su aprobador queda congelado desde que se crearon). Deja el campo de nómina en blanco para dejar ese rol sin asignar.",
      ]),
    ].filter(Boolean)
  );

  overlayRef = openModal(esEdicion ? "Editar equipo" : "Nuevo equipo", body, [
    el("button", { class: "btn btn-outline", onclick: () => closeModal(overlayRef) }, ["Cancelar"]),
    el(
      "button",
      {
        class: "btn btn-accent",
        onclick: async () => {
          const nombre = nombreInput.value.trim();
          const departamentoId = departamentoSelect.value;
          // Correo del líder: nunca se escribe a mano — viene solo de lo
          // que haya resuelto la búsqueda por nómina (o del valor previo si
          // no se volvió a buscar). Sin validación manual de formato: si
          // viene de RH, ya es válido.
          const correo = lider.getCorreo();
          const aprobador2Nomina = aprobador2.nominaInput.value.trim();
          const aprobador3Nomina = aprobador3.nominaInput.value.trim();

          if (!nombre || !departamentoId) {
            toast("Completa todos los campos obligatorios (*).", "tr");
            return;
          }

          const payload = { nombre, departamentoId };
          if (correo) payload.liderEmail = correo;
          // Se mandan siempre (incluso vacíos): "" desasigna, tal como
          // confirmó Jesús. Así, si el admin borra el campo a propósito,
          // se refleja en el backend en vez de quedarse con el valor viejo.
          payload.aprobador2Nomina = aprobador2Nomina;
          payload.aprobador3Nomina = aprobador3Nomina;

          try {
            let equipoResultado;
            if (esEdicion) {
              equipoResultado = await api.actualizarEquipo(equipoExistente.id, payload);
              toast("Equipo actualizado.", "tg");
            } else {
              equipoResultado = await api.crearEquipo(payload);
              toast("Equipo creado.", "tg");
            }
            equiposCache = await api.getEquipos();
            closeModal(overlayRef);
            paint(view);

            // Al crear (no al editar): se abre de inmediato el popup para
            // agregar integrantes, tal como pidió Javier.
            if (!esEdicion) {
              const equipoNuevo =
                equiposCache.find((e) => e.id === equipoResultado?.id) || equiposCache.find((e) => e.nombre === nombre);
              if (equipoNuevo) openEmpleadoModal(view, equipoNuevo);
              else toast("Equipo creado. Agrega sus integrantes desde la tarjeta del equipo.", "default");
            }
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
  if (!confirm(`¿Eliminar el equipo "${eq.nombre}" y sus ${eq.miembros.length} integrante(s)? Esta acción no se puede deshacer.`)) return;
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
// Modal: agregar integrante — solo se pide la nómina, el nombre se busca solo
// ---------------------------------------------------------------------------
function openEmpleadoModal(view, eq) {
  let overlayRef; // se asigna abajo, antes de que el usuario pueda hacer clic en nada
  const nominaInput = el("input", { class: "input", type: "text", placeholder: "Ej. 0006", autofocus: true });

  // Alerta de transición (KaizenZX_Cascada_Aprobador23_Lista.md, Jesús):
  // si este equipo todavía no tiene Aprobador 2/3 propios (ninguno de los
  // dos ha sido editado con el modelo nuevo), a quien se agregue aquí se le
  // va a quitar su aprobador anterior y quedar SIN aprobador2/3 hasta que
  // alguien edite este equipo. No es un error del sistema — es el estado
  // real mientras el negocio va migrando equipo por equipo.
  const sinAprobadoresPropios = !eq.aprobador2Nomina && !eq.aprobador3Nomina;

  const body = el("div", {}, [
    el("p", { class: "hint", style: "margin-bottom:16px" }, [`Equipo: ${eq.nombre}`]),
    field("Nómina *", nominaInput),
    el("p", { class: "hint" }, ["El nombre se completa automáticamente al buscarlo en el catálogo de personal."]),
    el("p", { class: "hint" }, [
      "Si la persona ya pertenece a otro equipo, se mueve automáticamente a este (Jesús ya lo confirmó como comportamiento estándar) y hereda el Aprobador 2/3 de aquí.",
    ]),
    sinAprobadoresPropios
      ? el("p", { class: "hint", style: "color:#991b1b" }, [
          "⚠ Este equipo todavía no tiene Aprobador 2 ni Aprobador 3 propios asignados (sigue en el estado de transición). Si agregas a alguien aquí, va a quedar SIN aprobador2/3 hasta que edites este equipo con el modelo nuevo (botón \"Editar\" en la tarjeta).",
        ])
      : null,
  ].filter(Boolean));

  overlayRef = openModal("Agregar integrante", body, [
    el("button", { class: "btn btn-outline", onclick: () => closeModal(overlayRef) }, ["Cancelar"]),
    el(
      "button",
      {
        class: "btn btn-accent",
        onclick: async () => {
          const nomina = nominaInput.value.trim();
          if (!nomina) {
            toast("Escribe la nómina del integrante.", "tr");
            return;
          }
          // Aviso (no bloqueo, pedido explícito de Javier): si la nómina ya
          // pertenece a otro equipo, se confirma antes de agregarlo aquí
          // también. Si la búsqueda falla, se sigue con el flujo normal —
          // `agregarEmpleado` igual valida del lado del backend.
          try {
            const info = await buscarEmpleadoInfo(nomina);
            const advertencia = advertenciaEquipoExistente(info.equipo, eq.id);
            if (advertencia && !confirm(`${advertencia}\n\n¿Agregar de todas formas a "${eq.nombre}"?`)) {
              return;
            }
          } catch {
            /* no se pudo resolver la nómina de antemano; se intenta agregar igual */
          }
          try {
            const equipoActualizado = await api.agregarEmpleado(eq.id, nomina);
            const agregado = equipoActualizado?.miembros?.find((m) => m.nomina === nomina);
            toast(`Integrante agregado: ${agregado?.nombre || nomina}.`, "tg");
            equiposCache = await api.getEquipos();
            closeModal(overlayRef);
            paint(view);
          } catch (err) {
            toast(err.message || "No se pudo agregar el integrante.", "tr");
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
      toast("Integrante eliminado del equipo.", "tg");
      equiposCache = await api.getEquipos();
      paint(view);
    })
    .catch((err) => toast(err.message || "No se pudo quitar al integrante.", "tr"));
}

// ---------------------------------------------------------------------------
// Modal: crear empleado nuevo (POST /empleados, empleados-create) — Fase
// 5.5, KaizenZX_Alta_Empleados_Y_Cambio_Rol_Listo.md (Jesús, sept. 2026).
// Reglas de negocio ya confirmadas con Javier
// (KaizenZX_Respuestas_Alta_Empleados.md):
//   1. El aprobador 2/3 se elige por nómina (búsqueda contra el catálogo),
//      nunca capturando correo a mano.
//   2. El equipo es opcional al dar de alta — puede quedar sin asignar.
//   3. La nómina la captura el admin tal como se la da RH, no la genera el
//      sistema.
//   4. La contraseña inicial se muestra en pantalla una sola vez para que
//      el admin la copie y se la dé a la persona — nunca se vuelve a
//      poder consultar (openPasswordInicialModal(), abajo).
// ---------------------------------------------------------------------------
function openCrearEmpleadoModal(view) {
  let overlayRef;

  const nominaInput = el("input", { class: "input", type: "text", placeholder: placeholderNomina() });
  const nombreInput = el("input", { class: "input", type: "text", placeholder: "Nombre completo" });
  const departamentoSelect = el(
    "select",
    { class: "select" },
    [
      el("option", { value: "" }, ["Selecciona un departamento…"]),
      ...departamentosCache.map((d) => el("option", { value: d.id }, [d.nombre])),
    ]
  );
  const equipoSelect = el(
    "select",
    {
      class: "select",
      onchange: () => {
        const eq = equiposCache.find((e) => String(e.id) === equipoSelect.value);
        // Auto-relleno desde el equipo elegido (confirmado por Jesús: el
        // backend hace lo mismo si se manda vacío) — aquí se refleja en
        // pantalla de una vez para que el admin vea lo que va a heredar,
        // y lo puede sobreescribir a mano si quiere un aprobador distinto.
        aprobador2Input.value = eq?.aprobador2Nomina || "";
        aprobador3Input.value = eq?.aprobador3Nomina || "";
      },
    },
    [
      el("option", { value: "" }, ["Sin equipo asignado"]),
      ...equiposCache.map((e) => el("option", { value: e.id }, [e.nombre])),
    ]
  );
  const posicionSelect = el(
    "select",
    { class: "select" },
    [
      el("option", { value: "integrante" }, ["Integrante"]),
      el("option", { value: "lider" }, ["Líder"]),
      el("option", { value: "gerente" }, ["Gerente"]),
    ]
  );
  const aprobador2Input = el("input", { class: "input", type: "text", placeholder: placeholderNomina() });
  const aprobador3Input = el("input", { class: "input", type: "text", placeholder: placeholderNomina() });

  const body = el("div", {}, [
    field("Número de nómina *", nominaInput),
    field("Nombre completo *", nombreInput),
    field("Departamento *", departamentoSelect),
    field("Equipo (opcional)", equipoSelect),
    field("Posición", posicionSelect),
    el("p", { class: "hint", style: "font-weight:600;margin-top:8px" }, ["Aprobador 2 / Aprobador 3"]),
    field("Aprobador 2 — nómina", aprobador2Input),
    field("Aprobador 3 — nómina", aprobador3Input),
    el("p", { class: "hint" }, [
      "Se rellenan solos al elegir un equipo (heredan su Aprobador 2/3 actual) — puedes escribir una nómina distinta para sobreescribirlos, o dejarlos vacíos si no aplica.",
    ]),
  ]);

  overlayRef = openModal("Crear empleado", body, [
    el("button", { class: "btn btn-outline", onclick: () => closeModal(overlayRef) }, ["Cancelar"]),
    el(
      "button",
      {
        class: "btn btn-accent",
        onclick: async () => {
          const nomina = nominaInput.value.trim();
          const nombre = nombreInput.value.trim();
          const departamentoId = departamentoSelect.value;
          if (!nomina || !nombre || !departamentoId) {
            toast("Completa todos los campos obligatorios (*).", "tr");
            return;
          }
          const payload = {
            nomina,
            nombre,
            departamentoId,
            posicion: posicionSelect.value,
          };
          if (equipoSelect.value) payload.equipoId = equipoSelect.value;
          // Se mandan siempre que el admin haya escrito algo — vacío
          // significa "no sobreescribir lo que herede del equipo" salvo
          // que el admin lo haya limpiado a propósito para forzar "sin
          // aprobador", tal como confirmó Jesús para el mismo patrón en
          // equipos.
          if (aprobador2Input.value.trim()) payload.aprobador2Nomina = aprobador2Input.value.trim();
          if (aprobador3Input.value.trim()) payload.aprobador3Nomina = aprobador3Input.value.trim();

          try {
            const resultado = await api.crearEmpleado(payload);
            closeModal(overlayRef);
            equiposCache = await api.getEquipos();
            paint(view);
            openPasswordInicialModal(resultado);
          } catch (err) {
            toast(err.message || "No se pudo crear el empleado.", "tr");
          }
        },
      },
      ["Crear empleado"]
    ),
  ]);
}

// Muestra la contraseña inicial UNA SOLA VEZ, tal como confirmó Jesús
// (nunca se puede volver a consultar) — con botón de copiar y advertencia
// explícita, y sin botón de "Cancelar" (solo "Ya la copié, cerrar") para
// que el admin no la pierda por cerrar el modal sin querer.
function openPasswordInicialModal(resultado) {
  const passwordText = el("div", { class: "readonly-field", style: "font-size:1.1em;font-weight:700;letter-spacing:.03em" }, [
    resultado.passwordInicial,
  ]);
  const body = el("div", {}, [
    el("p", {}, [`Empleado creado: ${resultado.nombre} (nómina ${resultado.nomina}).`]),
    field("Contraseña inicial", passwordText),
    el("p", { class: "hint", style: "color:#991b1b" }, [
      "⚠ Cópiala y dásela ahora a la persona — no se va a volver a mostrar en ningún lado.",
    ]),
  ]);
  const overlayRef = openModal("Contraseña inicial", body, [
    el(
      "button",
      {
        class: "btn btn-outline",
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(resultado.passwordInicial);
            toast("Contraseña copiada.", "tg");
          } catch {
            toast("No se pudo copiar automáticamente — selecciónala a mano.", "tr");
          }
        },
      },
      ["Copiar"]
    ),
    el("button", { class: "btn btn-accent", onclick: () => closeModal(overlayRef) }, ["Ya la copié, cerrar"]),
  ]);
}

// ---------------------------------------------------------------------------
// Modal: cambiar rol de sistema de una persona (POST /usuarios/:nomina/rol,
// usuarios-cambiar-rol) — Fase 5.5, KaizenZX_Alta_Empleados_Y_Cambio_Rol_
// Listo.md (Jesús, sept. 2026). Reglas de negocio confirmadas con Javier
// (KaizenZX_Falta_Cambiar_Rol_Sistema.md): solo admin/mc, nadie puede
// cambiar su propio rol, nunca se puede asignar "mc" desde aquí (esa
// cuenta solo se administra directo en Supabase), y esto nunca toca los
// aprobadores reales de la persona (aprobador2/3_nomina son independientes
// del rol de sistema).
// ---------------------------------------------------------------------------
function openCambiarRolModal(view) {
  let overlayRef;
  const nominaInput = el("input", { class: "input", type: "text", placeholder: placeholderNomina() });
  const nombreLabel = el("div", { class: "readonly-field" }, ["—"]);
  const errorText = el("p", { class: "hint", style: "color:#991b1b" }, []);
  const rolSelect = el(
    "select",
    { class: "select" },
    [
      el("option", { value: "solicitante" }, ["Integrante (solicitante)"]),
      el("option", { value: "lider" }, ["Líder"]),
      el("option", { value: "gerente" }, ["Gerente"]),
      el("option", { value: "admin" }, ["Administrador"]),
    ]
  );

  const buscarBtn = el(
    "button",
    {
      class: "btn btn-outline btn-sm",
      type: "button",
      onclick: async () => {
        const nomina = nominaInput.value.trim();
        if (!nomina) {
          toast("Escribe primero la nómina.", "tr");
          return;
        }
        try {
          const info = await buscarEmpleadoInfo(nomina);
          errorText.textContent = "";
          nombreLabel.textContent = info.nombre || "—";
        } catch (err) {
          nombreLabel.textContent = "—";
          errorText.textContent = err.message || "No se encontró ningún empleado con esa nómina.";
        }
      },
    },
    ["Buscar"]
  );

  const historialBtn = el(
    "button",
    { class: "btn btn-outline btn-sm", type: "button", onclick: () => openHistorialRolModal() },
    ["Ver historial de cambios"]
  );

  const body = el("div", {}, [
    el("div", { class: "field" }, [
      el("label", {}, ["Número de nómina"]),
      el("div", { style: "display:flex;gap:8px" }, [nominaInput, buscarBtn]),
    ]),
    errorText,
    el("div", { class: "field" }, [el("label", {}, ["Nombre"]), nombreLabel]),
    field("Nuevo rol", rolSelect),
    el("p", { class: "hint" }, [
      "No se puede asignar el rol \"Mejora Continua\" desde aquí (se administra directo con TI), ni cambiar tu propio rol.",
    ]),
    el("div", { style: "margin-top:12px" }, [historialBtn]),
  ]);

  overlayRef = openModal("Cambiar rol", body, [
    el("button", { class: "btn btn-outline", onclick: () => closeModal(overlayRef) }, ["Cancelar"]),
    el(
      "button",
      {
        class: "btn btn-accent",
        onclick: async () => {
          const nomina = nominaInput.value.trim();
          if (!nomina) {
            toast("Escribe la nómina de la persona.", "tr");
            return;
          }
          try {
            const resultado = await api.cambiarRolUsuario(nomina, rolSelect.value);
            toast(resultado?.mensaje || "Rol actualizado.", "tg");
            closeModal(overlayRef);
          } catch (err) {
            toast(err.message || "No se pudo cambiar el rol.", "tr");
          }
        },
      },
      ["Cambiar rol"]
    ),
  ]);
}

// Historial de cambios de rol (GET /cambios-rol, cambios-rol-list) — de
// solo lectura, más reciente primero (ya viene así del backend).
function openHistorialRolModal() {
  const body = el("div", { class: "skeleton", style: "height:120px" });
  const overlayRef = openModal("Historial de cambios de rol", body, [
    el("button", { class: "btn btn-outline", onclick: () => closeModal(overlayRef) }, ["Cerrar"]),
  ]);

  api
    .getHistorialCambiosRol()
    .then((historial) => {
      const nuevoBody = !historial?.length
        ? el("p", { class: "hint" }, ["Todavía no hay cambios de rol registrados."])
        : el(
            "div",
            { class: "admin-member-list" },
            historial.map((h) =>
              el("div", { class: "admin-member-row" }, [
                el("div", {}, [
                  el("div", { style: "font-weight:600" }, [`${h.nombreAfectada} (${h.nominaAfectada})`]),
                  el("div", { class: "hint" }, [`"${h.rolAnterior}" → "${h.rolNuevo}" · por ${h.nombreEjecutor} · ${formatDate(h.creadoEn)}`]),
                ]),
              ])
            )
          );
      body.replaceWith(nuevoBody);
    })
    .catch((err) => {
      body.replaceWith(el("p", { class: "hint", style: "color:#991b1b" }, [err.message || "No se pudo cargar el historial."]));
    });
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

// Los 3 grupos de negocio confirmados con Jesús (KaizenZX_Respuesta_Grupo_
// Departamento_Y_Mc.md, sept. 2026) — la clave es lo que se guarda en el
// backend, el label es solo lo que ve el usuario.
const GRUPOS_DEPARTAMENTO = [
  { value: "proceso_productivo", label: "Proceso Productivo" },
  { value: "areas_servicio", label: "Áreas de Servicio" },
  { value: "administrativo", label: "Administrativos" },
];

// Modal "Asignar grupo a departamentos" (pedido de Javier para el
// Dashboard, sept. 2026): el admin elige uno de los 3 grupos y marca qué
// departamentos pertenecen a él — los equipos de esos departamentos
// heredan el grupo automáticamente (no se asigna por equipo). Un
// departamento solo puede pertenecer a un grupo a la vez: si estaba en
// otro grupo y se marca aquí, se mueve; si estaba en este grupo y se
// desmarca, se limpia (se llama al mismo endpoint con `grupo: null`).
//
// NOTA: el endpoint de asignación masiva (`POST /departamentos/grupo`)
// todavía no está construido del lado de Jesús a la fecha de este código
// (confirmado como viable en KaizenZX_Respuesta_Grupo_Departamento_Y_Mc.md,
// pendiente de que lo construya) — en MOCK_MODE ya funciona completo contra
// `mock-backend.js` para poder seguir probando esta pantalla mientras
// tanto.
function openAsignarGrupoModal(view) {
  let grupoSeleccionado = GRUPOS_DEPARTAMENTO[0].value;
  const listaEl = el("div", { class: "admin-member-list-scroll", style: "max-height:280px" });

  function renderLista() {
    listaEl.innerHTML = "";
    departamentosCache
      .slice()
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      .forEach((d) => {
        const enEsteGrupo = d.grupo === grupoSeleccionado;
        const otroGrupo = d.grupo && !enEsteGrupo ? GRUPOS_DEPARTAMENTO.find((g) => g.value === d.grupo)?.label : null;
        const checkbox = el("input", { type: "checkbox", checked: enEsteGrupo || undefined, "data-depto-id": d.id });
        listaEl.appendChild(
          el(
            "label",
            { style: "display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-100)" },
            [checkbox, el("span", {}, [d.nombre]), otroGrupo ? el("span", { class: "hint" }, [`(hoy: ${otroGrupo})`]) : null].filter(Boolean)
          )
        );
      });
  }
  renderLista();

  const grupoSelect = el(
    "select",
    { class: "select", onchange: (e) => { grupoSeleccionado = e.target.value; renderLista(); } },
    GRUPOS_DEPARTAMENTO.map((g) => el("option", { value: g.value }, [g.label]))
  );

  const body = el("div", {}, [
    field("Grupo", grupoSelect),
    el("p", { class: "hint", style: "margin:10px 0 6px" }, [
      "Marca los departamentos que pertenecen a este grupo. Un departamento solo puede estar en un grupo a la vez.",
    ]),
    listaEl,
  ]);

  const guardarBtn = el("button", { class: "btn btn-primary" }, ["Guardar"]);
  const overlay = openModal("Asignar grupo a departamentos", body, [
    el("button", { class: "btn btn-outline", onclick: () => closeModal(overlay) }, ["Cancelar"]),
    guardarBtn,
  ]);

  guardarBtn.addEventListener("click", async () => {
    guardarBtn.disabled = true;
    guardarBtn.textContent = "Guardando…";
    try {
      const checkboxes = [...listaEl.querySelectorAll("input[type=checkbox]")];
      const marcados = checkboxes.filter((c) => c.checked).map((c) => c.getAttribute("data-depto-id"));
      const previamenteEnGrupo = departamentosCache.filter((d) => d.grupo === grupoSeleccionado).map((d) => String(d.id));
      const quitados = previamenteEnGrupo.filter((id) => !marcados.includes(id));
      if (marcados.length) await api.asignarGrupoDepartamentos(grupoSeleccionado, marcados);
      if (quitados.length) await api.asignarGrupoDepartamentos(null, quitados);
      const frescos = await api.getDepartamentos().catch(() => departamentosCache);
      departamentosCache = (frescos || []).map((d) => (typeof d === "string" ? { id: d, nombre: d } : d));
      toast("Grupo de departamentos actualizado.", "tg");
      closeModal(overlay);
      paint(view);
    } catch (err) {
      toast(err.message || "No se pudo guardar el grupo.", "tr");
      guardarBtn.disabled = false;
      guardarBtn.textContent = "Guardar";
    }
  });
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
