// ============================================================================
// mock-backend.js
//
// Simulación en memoria del backend, SOLO para poder seguir desarrollando
// y probando el frontend mientras el backend real (Jesús / TI, en Azure)
// no esté disponible.
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

// ---- Catálogo de ejemplo (ficticio, no son datos reales de Zubex) ----
const EQUIPOS_DEMO = [
  {
    nombre: "Equipo Demo — Línea A",
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
    liderNombre: "Líder Calidad (Demo)",
    liderEmail: "lider.calidad.demo@ejemplo.com",
    gerenteNombre: "Gerente Calidad (Demo)",
    gerenteEmail: "gerente.calidad.demo@ejemplo.com",
    miembros: [{ nomina: "0005", nombre: "Colaborador Demo Cinco" }],
  },
];

// ---- Usuarios de ejemplo para el login (nómina + password) ----
const USUARIOS_DEMO = [
  { nomina: "0001", password: "demo123", nombre: "Colaborador Demo Uno", rol: "solicitante", equipo: "Equipo Demo — Línea A" },
  { nomina: "lider1", password: "demo123", nombre: "Líder de Ejemplo", rol: "lider", equipo: "Equipo Demo — Línea A" },
  { nomina: "gerente1", password: "demo123", nombre: "Gerente de Ejemplo", rol: "gerente", equipo: "Equipo Demo — Línea A" },
];

function seedKaizens() {
  const now = Date.now();
  const days = (n) => new Date(now - n * 86400000).toISOString();
  return [
    {
      id: uid(), status: "done", equipo: "Equipo Demo — Línea A",
      nomina: "0001", nombre: "Colaborador Demo Uno", donde: "Estación 4",
      quien: "Colaborador Demo Uno", fechaId: days(30), fechaImpl: days(25),
      tiempoImpl: 2, unidadTiempo: "horas",
      enfoques: ["Seguridad"], enfoquesMejora: "Reducción de riesgo de atrapamiento",
      descAntes: "Guarda de banda floja, requería ajuste manual frecuente.",
      descDespues: "Guarda reforzada con tornillería de mayor torque, ya no requiere ajuste.",
      estandarizacion: "Se agregó a la lista de verificación semanal de mantenimiento.",
      fotoAntes: null, fotoDespues: null,
      emailLider: "lider.demo@ejemplo.com", apr1n: "Líder de Ejemplo",
      emailGerente: "gerente.demo@ejemplo.com", apr2n: "Gerente de Ejemplo",
      firmaLiderNombre: "Líder de Ejemplo", firmaLiderFecha: days(24),
      firmaGerenteNombre: "Gerente de Ejemplo", firmaGerenteDate: days(20),
      creadoEn: days(30), actualizadoEn: days(20),
    },
    {
      id: uid(), status: "pend_g", equipo: "Equipo Demo — Mantenimiento",
      nomina: "0003", nombre: "Colaborador Demo Tres", donde: "Área de bolseo",
      quien: "Colaborador Demo Tres", fechaId: days(6), fechaImpl: days(4),
      tiempoImpl: 1, unidadTiempo: "horas",
      enfoques: ["Calidad"], enfoquesMejora: "Reducción de scrap por mal ajuste",
      descAntes: "Sensor descalibrado generaba piezas fuera de especificación.",
      descDespues: "Sensor recalibrado y se agregó checklist de verificación diaria.",
      estandarizacion: "",
      fotoAntes: null, fotoDespues: null,
      emailLider: "lider.mtto.demo@ejemplo.com", apr1n: "Líder Mantenimiento (Demo)",
      emailGerente: "gerente.demo@ejemplo.com", apr2n: "Gerente de Ejemplo",
      firmaLiderNombre: "Líder Mantenimiento (Demo)", firmaLiderFecha: days(3),
      firmaGerenteNombre: "", firmaGerenteDate: "",
      creadoEn: days(6), actualizadoEn: days(3),
    },
    {
      id: uid(), status: "pend_l", equipo: "Equipo Demo — Calidad",
      nomina: "0005", nombre: "Colaborador Demo Cinco", donde: "Laboratorio",
      quien: "Colaborador Demo Cinco", fechaId: days(1), fechaImpl: days(0),
      tiempoImpl: 3, unidadTiempo: "horas",
      enfoques: ["5S"], enfoquesMejora: "Organización de instrumentos de medición",
      descAntes: "Instrumentos sin ubicación fija, tiempo de búsqueda alto.",
      descDespues: "Gabinete rotulado con silueta por instrumento.",
      estandarizacion: "",
      fotoAntes: null, fotoDespues: null,
      emailLider: "lider.calidad.demo@ejemplo.com", apr1n: "Líder Calidad (Demo)",
      emailGerente: "gerente.calidad.demo@ejemplo.com", apr2n: "Gerente Calidad (Demo)",
      firmaLiderNombre: "", firmaLiderFecha: "",
      firmaGerenteNombre: "", firmaGerenteDate: "",
      creadoEn: days(1), actualizadoEn: days(1),
    },
    {
      id: uid(), status: "rej_l", equipo: "Equipo Demo — Línea A",
      nomina: "0002", nombre: "Colaborador Demo Dos", donde: "Estación 2",
      quien: "Colaborador Demo Dos", fechaId: days(10), fechaImpl: days(9),
      tiempoImpl: 1, unidadTiempo: "horas",
      enfoques: ["Costo"], enfoquesMejora: "Reducción de consumo de material",
      descAntes: "Se usaba doble empaque por precaución.",
      descDespues: "Propuesta: reducir a empaque sencillo.",
      estandarizacion: "",
      fotoAntes: null, fotoDespues: null,
      emailLider: "lider.demo@ejemplo.com", apr1n: "Líder de Ejemplo",
      emailGerente: "", apr2n: "",
      firmaLiderNombre: "", firmaLiderFecha: "",
      rechazoLiderRazon: "Falta evidencia de que el empaque sencillo cumple la norma de manejo.",
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
    return delay({ token, user: { nomina: user.nomina, nombre: user.nombre, rol: user.rol, equipo: user.equipo } });
  },

  async getSession(token) {
    const user = db.sessions.get(token);
    if (!user) return delay(null);
    return delay({ nomina: user.nomina, nombre: user.nombre, rol: user.rol, equipo: user.equipo });
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

  async crearKaizen(payload) {
    const equipo = EQUIPOS_DEMO.find((e) => e.nombre === payload.equipo);
    const nuevo = {
      id: uid(),
      status: "pend_l",
      ...payload,
      emailLider: equipo?.liderEmail || "",
      apr1n: equipo?.liderNombre || "",
      emailGerente: equipo?.gerenteEmail || "",
      apr2n: equipo?.gerenteNombre || "",
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    };
    db.kaizens.unshift(nuevo);
    const token = issueApprovalToken(nuevo.id, "lider");
    // eslint-disable-next-line no-console
    console.info("[MOCK] Se habría enviado correo al líder con link:", `?token=${token}`);
    return delay(structuredClone(nuevo));
  },

  async obtenerDatosAprobacion(token) {
    const entry = db.tokens.get(token);
    if (!entry) throw new Error("Este link de aprobación no es válido.");
    if (entry.used) throw new Error("Este link ya fue utilizado.");
    const kaizen = db.kaizens.find((k) => k.id === entry.kaizenId);
    if (!kaizen) throw new Error("El kaizen asociado a este link ya no existe.");
    return delay({ kaizen: structuredClone(kaizen), step: entry.step });
  },

  async procesarAprobacion(token, { decision, nombre, firma, razonRechazo, password }) {
    const entry = db.tokens.get(token);
    if (!entry) throw new Error("Este link de aprobación no es válido.");
    if (entry.used) throw new Error("Este link ya fue utilizado.");
    if (!password) throw new Error("Falta la contraseña de autorización.");

    const kaizen = db.kaizens.find((k) => k.id === entry.kaizenId);
    if (!kaizen) throw new Error("El kaizen asociado a este link ya no existe.");

    entry.used = true;

    if (entry.step === "lider") {
      if (decision === "aprobar") {
        kaizen.status = "pend_g";
        kaizen.firmaLiderNombre = nombre;
        kaizen.firmaLiderFecha = new Date().toISOString();
        const nextToken = issueApprovalToken(kaizen.id, "gerente");
        // eslint-disable-next-line no-console
        console.info("[MOCK] Se habría enviado correo al gerente con link:", `?token=${nextToken}`);
      } else {
        kaizen.status = "rej_l";
        kaizen.rechazoLiderRazon = razonRechazo || "";
      }
    } else if (entry.step === "gerente") {
      if (decision === "aprobar") {
        kaizen.status = "done";
        kaizen.firmaGerenteNombre = nombre;
        kaizen.firmaGerenteDate = new Date().toISOString();
      } else {
        kaizen.status = "rej_g";
        kaizen.rechazoGerenteRazon = razonRechazo || "";
      }
    }
    kaizen.actualizadoEn = new Date().toISOString();
    return delay(structuredClone(kaizen));
  },
};
