// ============================================================================
// mock-backend.js
//
// Simulación en memoria del backend, SOLO para poder seguir desarrollando
// y probando el frontend mientras el backend real (Jesús / TI) no tenga
// listas las rutas nuevas descritas en el documento para TI.
//
// Reglas de este archivo:
// - No contiene ningún dato real de empleados, equipos ni credenciales de
//   Zubex — todos los nombres/equipos aquí son de ejemplo (ficticios).
// - Nada de lo que hay aquí se publica en producción: en cuanto
//   CONFIG.MOCK_MODE = false, este archivo deja de usarse por completo.
// - La forma de los datos (shape) sí debe respetarse — es el contrato que
//   se le entrega a TI para que el backend real devuelva lo mismo.
// ============================================================================

const LATENCY_MS = 380;

function delay(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function uid(prefix = "k") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Catálogos fijos (mismos nombres que usará el backend real) ----
export const DEPARTAMENTOS = [
  "ADMINISTRACIÓN PRODUCTIVA", "ADMÓN.", "CALIDAD", "COMERCIAL", "COMPRAS",
  "CONVERSIÓN", "CORRUGADO", "EXPORTACIONES", "EXTRUSIÓN", "IMPRESIÓN",
  "INGENIERÍA", "INNOVACION", "MEJORA CONTINUA", "PRE PRENSA", "PROGRAMACIÓN",
  "REC. HUM.", "SOSTENIBILIDAD", "VIGILANCIA",
];

export const ENFOQUES = ["Rentabilidad", "Bienestar del personal", "Sustentabilidad", "Mejora en el proceso"];

export const META_SK_POR_EQUIPO_MES = 4;
export const META_SK_GLOBAL_MES = 140;

// Persona(s) que resuelven el primer paso de aprobación ("Mejora Continua").
// En el backend real esto corresponde al rol "aprobador" del catálogo de personal.
const APROBADOR_MC = { nombre: "Sergio España (Mejora Continua)", email: "s.espana@zubex.com.mx" };

// ---- Catálogo de ejemplo (ficticio, no son datos reales de Zubex) ----
const EQUIPOS_DEMO = [
  {
    nombre: "Equipo Demo — Línea A",
    departamento: "EXTRUSIÓN",
    liderNombre: "Líder de Ejemplo",
    liderEmail: "lider.demo@ejemplo.com",
    gerenteNombre: "Gerente de Ejemplo",
    gerenteEmail: "gerente.demo@ejemplo.com",
    miembros: [
      { nomina: "0001", nombre: "Colaborador Demo Uno" },
      { nomina: "0002", nombre: "Colaborador Demo Dos" },
    ],
  },
  {
    nombre: "Equipo Demo — Mantenimiento",
    departamento: "EXTRUSIÓN",
    liderNombre: "Líder Mantenimiento (Demo)",
    liderEmail: "lider.mtto.demo@ejemplo.com",
    gerenteNombre: "Gerente de Ejemplo",
    gerenteEmail: "gerente.demo@ejemplo.com",
    miembros: [
      { nomina: "0003", nombre: "Colaborador Demo Tres" },
      { nomina: "0004", nombre: "Colaborador Demo Cuatro" },
    ],
  },
  {
    nombre: "Equipo Demo — Calidad",
    departamento: "CALIDAD",
    liderNombre: "Líder Calidad (Demo)",
    liderEmail: "lider.calidad.demo@ejemplo.com",
    gerenteNombre: "Gerente Calidad (Demo)",
    gerenteEmail: "gerente.calidad.demo@ejemplo.com",
    miembros: [{ nomina: "0005", nombre: "Colaborador Demo Cinco" }],
  },
];

// Directorio mínimo para poder "buscar nombre por nómina" al agregar un
// integrante en Administración solo con el número de nómina (como pide el
// diseño nuevo). El backend real hará este lookup contra el catálogo de
// personal completo (328 personas) — aquí solo hay unos cuantos de ejemplo.
const DIRECTORIO_NOMINAS_DEMO = {
  "0001": "Colaborador Demo Uno",
  "0002": "Colaborador Demo Dos",
  "0003": "Colaborador Demo Tres",
  "0004": "Colaborador Demo Cuatro",
  "0005": "Colaborador Demo Cinco",
  "0006": "Colaborador Demo Seis",
  "0007": "Colaborador Demo Siete",
};

// ---- Usuarios de ejemplo para el login (nómina + password) ----
const USUARIOS_DEMO = [
  { nomina: "0001", password: "demo123", nombre: "Colaborador Demo Uno", rol: "solicitante", equipo: "Equipo Demo — Línea A" },
  { nomina: "lider1", password: "demo123", nombre: "Líder de Ejemplo", rol: "lider", equipo: "Equipo Demo — Línea A" },
  { nomina: "gerente1", password: "demo123", nombre: "Gerente de Ejemplo", rol: "gerente", equipo: "Equipo Demo — Línea A" },
  { nomina: "aprobador1", password: "demo123", nombre: APROBADOR_MC.nombre, rol: "aprobador", equipo: null },
  { nomina: "admin1", password: "demo123", nombre: "Usuario Maestro (Demo)", rol: "admin", equipo: null },
];

function seedKaizens() {
  const now = Date.now();
  const days = (n) => new Date(now - n * 86400000).toISOString();
  return [
    {
      id: uid(), status: "done", equipo: "Equipo Demo — Línea A", departamento: "EXTRUSIÓN",
      nomina: "0001", nombre: "Colaborador Demo Uno",
      areaLinea: "Estación 4", breveDescripcion: "Guarda de seguridad de la banda transportadora",
      fechaId: days(30), fechaImpl: days(30),
      tiempoImpl: 2, unidadTiempo: "horas",
      enfoques: ["Bienestar del personal"],
      descAntes: "Guarda de banda floja, requería ajuste manual frecuente.",
      descDespues: "Guarda reforzada con tornillería de mayor torque, ya no requiere ajuste.",
      estandarizacion: "Se agregó a la lista de verificación semanal de mantenimiento.",
      fotoAntes: null, fotoDespues: null,
      emailAprobadorMC: APROBADOR_MC.email, aprMCn: APROBADOR_MC.nombre,
      emailLider: "lider.demo@ejemplo.com", apr1n: "Líder de Ejemplo",
      emailGerente: "gerente.demo@ejemplo.com", apr2n: "Gerente de Ejemplo",
      firmaMCNombre: APROBADOR_MC.nombre, firmaMCFecha: days(29),
      firmaLiderNombre: "Líder de Ejemplo", firmaLiderFecha: days(27),
      firmaGerenteNombre: "Gerente de Ejemplo", firmaGerenteDate: days(25),
      creadoEn: days(30), actualizadoEn: days(25),
    },
    {
      id: uid(), status: "pend_g", equipo: "Equipo Demo — Mantenimiento", departamento: "EXTRUSIÓN",
      nomina: "0003", nombre: "Colaborador Demo Tres",
      areaLinea: "Área de bolseo", breveDescripcion: "Calibración de sensor de peso",
      fechaId: days(6), fechaImpl: days(6),
      tiempoImpl: 1, unidadTiempo: "horas",
      enfoques: ["Mejora en el proceso"],
      descAntes: "Sensor descalibrado generaba piezas fuera de especificación.",
      descDespues: "Sensor recalibrado y se agregó checklist de verificación diaria.",
      estandarizacion: "",
      fotoAntes: null, fotoDespues: null,
      emailAprobadorMC: APROBADOR_MC.email, aprMCn: APROBADOR_MC.nombre,
      emailLider: "lider.mtto.demo@ejemplo.com", apr1n: "Líder Mantenimiento (Demo)",
      emailGerente: "gerente.demo@ejemplo.com", apr2n: "Gerente de Ejemplo",
      firmaMCNombre: APROBADOR_MC.nombre, firmaMCFecha: days(5),
      firmaLiderNombre: "Líder Mantenimiento (Demo)", firmaLiderFecha: days(3),
      firmaGerenteNombre: "", firmaGerenteDate: "",
      creadoEn: days(6), actualizadoEn: days(3),
    },
    {
      id: uid(), status: "pend_l", equipo: "Equipo Demo — Calidad", departamento: "CALIDAD",
      nomina: "0005", nombre: "Colaborador Demo Cinco",
      areaLinea: "Laboratorio", breveDescripcion: "Organización de instrumentos de medición",
      fechaId: days(1), fechaImpl: days(1),
      tiempoImpl: 3, unidadTiempo: "horas",
      enfoques: ["Sustentabilidad"],
      descAntes: "Instrumentos sin ubicación fija, tiempo de búsqueda alto.",
      descDespues: "Gabinete rotulado con silueta por instrumento.",
      estandarizacion: "",
      fotoAntes: null, fotoDespues: null,
      emailAprobadorMC: APROBADOR_MC.email, aprMCn: APROBADOR_MC.nombre,
      emailLider: "lider.calidad.demo@ejemplo.com", apr1n: "Líder Calidad (Demo)",
      emailGerente: "gerente.calidad.demo@ejemplo.com", apr2n: "Gerente Calidad (Demo)",
      firmaMCNombre: APROBADOR_MC.nombre, firmaMCFecha: days(1),
      firmaLiderNombre: "", firmaLiderFecha: "",
      firmaGerenteNombre: "", firmaGerenteDate: "",
      creadoEn: days(1), actualizadoEn: days(1),
    },
    {
      id: uid(), status: "pend_mc", equipo: "Equipo Demo — Línea A", departamento: "EXTRUSIÓN",
      nomina: "0002", nombre: "Colaborador Demo Dos",
      areaLinea: "Estación 2", breveDescripcion: "Reducción de empaque",
      fechaId: days(0), fechaImpl: days(0),
      tiempoImpl: 1, unidadTiempo: "horas",
      enfoques: ["Rentabilidad"],
      descAntes: "Se usaba doble empaque por precaución.",
      descDespues: "Propuesta: reducir a empaque sencillo.",
      estandarizacion: "",
      fotoAntes: null, fotoDespues: null,
      emailAprobadorMC: APROBADOR_MC.email, aprMCn: APROBADOR_MC.nombre,
      emailLider: "lider.demo@ejemplo.com", apr1n: "Líder de Ejemplo",
      emailGerente: "", apr2n: "",
      creadoEn: days(0), actualizadoEn: days(0),
    },
    {
      id: uid(), status: "rej_l", equipo: "Equipo Demo — Línea A", departamento: "EXTRUSIÓN",
      nomina: "0002", nombre: "Colaborador Demo Dos",
      areaLinea: "Estación 2", breveDescripcion: "Cambio de proveedor de empaque",
      fechaId: days(10), fechaImpl: days(10),
      tiempoImpl: 1, unidadTiempo: "horas",
      enfoques: ["Rentabilidad"],
      descAntes: "Se usaba doble empaque por precaución.",
      descDespues: "Propuesta: reducir a empaque sencillo.",
      estandarizacion: "",
      fotoAntes: null, fotoDespues: null,
      emailAprobadorMC: APROBADOR_MC.email, aprMCn: APROBADOR_MC.nombre,
      emailLider: "lider.demo@ejemplo.com", apr1n: "Líder de Ejemplo",
      emailGerente: "", apr2n: "",
      firmaMCNombre: APROBADOR_MC.nombre, firmaMCFecha: days(9),
      firmaLiderNombre: "", firmaLiderFecha: "",
      creadoEn: days(10), actualizadoEn: days(9),
    },
  ];
}

const db = {
  kaizens: seedKaizens(),
  tokens: new Map(), // token -> {kaizenId, step, used}
  sessions: new Map(), // token -> usuario
};

function makeToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function issueApprovalToken(kaizenId, step) {
  const token = makeToken();
  db.tokens.set(token, { kaizenId, step, used: false, createdAt: Date.now() });
  return token;
}

export const mockBackend = {
  async login(nomina, password) {
    const user = USUARIOS_DEMO.find((u) => u.nomina === nomina && u.password === password);
    if (!user) {
      await delay();
      throw new Error("Nómina o contraseña incorrecta.");
    }
    const token = makeToken();
    db.sessions.set(token, user);
    return delay({
      token,
      user: {
        nomina: user.nomina, nombre: user.nombre, rol: user.rol, equipo: user.equipo,
        requiereCambioPassword: Boolean(user.requiereCambioPassword),
      },
    });
  },

  async getSession(token) {
    const user = db.sessions.get(token);
    if (!user) return delay(null);
    return delay({ nomina: user.nomina, nombre: user.nombre, rol: user.rol, equipo: user.equipo });
  },

  async getDepartamentos() {
    return delay([...DEPARTAMENTOS]);
  },

  async cambiarPassword(passwordActual, passwordNueva) {
    // Simulación simple: no valida contra ningún usuario en particular porque
    // en modo mock no hay un "usuario actual" persistente más allá de la
    // sesión — el backend real sí debe validar passwordActual antes de
    // aceptar passwordNueva.
    if (!passwordActual || !passwordNueva) {
      await delay();
      throw new Error("Escribe tu contraseña actual y la nueva contraseña.");
    }
    if (passwordNueva.length < 8) {
      await delay();
      throw new Error("La nueva contraseña debe tener al menos 8 caracteres.");
    }
    return delay({ ok: true });
  },

  async getEquipos() {
    return delay(structuredClone(EQUIPOS_DEMO));
  },

  async getKaizens() {
    return delay(structuredClone(db.kaizens));
  },

  async getKaizen(id) {
    const k = db.kaizens.find((x) => x.id === id);
    if (!k) throw new Error("Kaizen no encontrado.");
    return delay(structuredClone(k));
  },

  async buscarEmpleadoPorNomina(nomina) {
    const nombre = DIRECTORIO_NOMINAS_DEMO[String(nomina).trim()];
    if (!nombre) throw new Error("No se encontró ningún empleado con esa nómina.");
    return delay({ nomina: String(nomina).trim(), nombre });
  },

  async crearKaizen(payload) {
    const equipo = EQUIPOS_DEMO.find((e) => e.nombre === payload.equipo);
    const nuevo = {
      id: uid(),
      status: "pend_mc",
      ...payload,
      emailAprobadorMC: APROBADOR_MC.email, aprMCn: APROBADOR_MC.nombre,
      emailLider: equipo?.liderEmail || "",
      apr1n: equipo?.liderNombre || "",
      emailGerente: equipo?.gerenteEmail || "",
      apr2n: equipo?.gerenteNombre || "",
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    };
    db.kaizens.unshift(nuevo);
    const token = issueApprovalToken(nuevo.id, "mc");
    // eslint-disable-next-line no-console
    console.info("[MOCK] Se habría enviado correo a Mejora Continua con link:", `?token=${token}`);
    return delay(structuredClone(nuevo));
  },

  // ==========================================================================
  // Administración de equipos/empleados — SOLO PARA MAQUETAR LA PANTALLA
  // ==========================================================================
  // Estas funciones existen únicamente para poder diseñar y probar
  // visualmente la pantalla de Administrador (js/views/admin.js) mientras
  // Jesús (TI) no ha construido las rutas reales para esto en el backend.
  // Todo lo que hacen es mutar el arreglo EQUIPOS_DEMO en memoria — se
  // pierde al recargar la página, y nunca toca el backend real.
  //
  // Cuando Jesús defina el contrato de API para administración (por ej.
  // POST /equipos, PUT /equipos/:id, POST /equipos/:id/empleados, etc.),
  // estas llamadas deben moverse a api.js igual que el resto de la app, y
  // este bloque puede eliminarse.
  // ==========================================================================

  async crearEquipo({ nombre, departamento, liderNombre, liderEmail, gerenteNombre, gerenteEmail }) {
    if (EQUIPOS_DEMO.some((e) => e.nombre === nombre)) {
      await delay();
      throw new Error("Ya existe un equipo con ese nombre.");
    }
    const nuevo = { nombre, departamento, liderNombre, liderEmail, gerenteNombre, gerenteEmail, miembros: [] };
    EQUIPOS_DEMO.push(nuevo);
    return delay(structuredClone(nuevo));
  },

  async actualizarEquipo(nombreOriginal, { nombre, departamento, liderNombre, liderEmail, gerenteNombre, gerenteEmail }) {
    const equipo = EQUIPOS_DEMO.find((e) => e.nombre === nombreOriginal);
    if (!equipo) {
      await delay();
      throw new Error("Equipo no encontrado.");
    }
    Object.assign(equipo, { nombre, departamento, liderNombre, liderEmail, gerenteNombre, gerenteEmail });
    return delay(structuredClone(equipo));
  },

  async eliminarEquipo(nombre) {
    const idx = EQUIPOS_DEMO.findIndex((e) => e.nombre === nombre);
    if (idx === -1) {
      await delay();
      throw new Error("Equipo no encontrado.");
    }
    EQUIPOS_DEMO.splice(idx, 1);
    return delay(true);
  },

  async agregarEmpleado(equipoNombre, { nomina }) {
    const equipo = EQUIPOS_DEMO.find((e) => e.nombre === equipoNombre);
    if (!equipo) {
      await delay();
      throw new Error("Equipo no encontrado.");
    }
    const nominaLimpia = String(nomina).trim();
    if (equipo.miembros.some((m) => m.nomina === nominaLimpia)) {
      await delay();
      throw new Error("Ya existe un empleado con esa nómina en este equipo.");
    }
    const nombre = DIRECTORIO_NOMINAS_DEMO[nominaLimpia];
    if (!nombre) {
      await delay();
      throw new Error("No se encontró ningún empleado con esa nómina en el catálogo de personal.");
    }
    equipo.miembros.push({ nomina: nominaLimpia, nombre });
    return delay(structuredClone(equipo));
  },

  async eliminarEmpleado(equipoNombre, nomina) {
    const equipo = EQUIPOS_DEMO.find((e) => e.nombre === equipoNombre);
    if (!equipo) {
      await delay();
      throw new Error("Equipo no encontrado.");
    }
    equipo.miembros = equipo.miembros.filter((m) => m.nomina !== nomina);
    return delay(structuredClone(equipo));
  },

  async obtenerDatosAprobacion(token) {
    const entry = db.tokens.get(token);
    if (!entry) throw new Error("Este link de aprobación no es válido.");
    if (entry.used) throw new Error("Este link ya fue utilizado.");
    const kaizen = db.kaizens.find((k) => k.id === entry.kaizenId);
    if (!kaizen) throw new Error("El kaizen asociado a este link ya no existe.");
    return delay({ kaizen: structuredClone(kaizen), step: entry.step });
  },

  async procesarAprobacion(token, { decision, password }) {
    const entry = db.tokens.get(token);
    if (!entry) throw new Error("Este link de aprobación no es válido.");
    if (entry.used) throw new Error("Este link ya fue utilizado.");
    if (!password) throw new Error("Falta la contraseña de autorización.");

    const kaizen = db.kaizens.find((k) => k.id === entry.kaizenId);
    if (!kaizen) throw new Error("El kaizen asociado a este link ya no existe.");

    entry.used = true;
    const ahora = new Date().toISOString();

    if (entry.step === "mc") {
      if (decision === "aprobar") {
        kaizen.status = "pend_l";
        kaizen.firmaMCNombre = kaizen.aprMCn;
        kaizen.firmaMCFecha = ahora;
        const nextToken = issueApprovalToken(kaizen.id, "lider");
        // eslint-disable-next-line no-console
        console.info("[MOCK] Se habría enviado correo al líder con link:", `?token=${nextToken}`);
      } else {
        kaizen.status = "rej_mc";
      }
    } else if (entry.step === "lider") {
      if (decision === "aprobar") {
        kaizen.status = "pend_g";
        kaizen.firmaLiderNombre = kaizen.apr1n;
        kaizen.firmaLiderFecha = ahora;
        const nextToken = issueApprovalToken(kaizen.id, "gerente");
        // eslint-disable-next-line no-console
        console.info("[MOCK] Se habría enviado correo al gerente con link:", `?token=${nextToken}`);
      } else {
        kaizen.status = "rej_l";
      }
    } else if (entry.step === "gerente") {
      if (decision === "aprobar") {
        kaizen.status = "done";
        kaizen.firmaGerenteNombre = kaizen.apr2n;
        kaizen.firmaGerenteDate = ahora;
      } else {
        kaizen.status = "rej_g";
      }
    }
    kaizen.actualizadoEn = ahora;
    return delay(structuredClone(kaizen));
  },
};
