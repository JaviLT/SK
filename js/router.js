// ============================================================================
// router.js — Cambia el contenido de #app-root según la vista activa.
//
// No usa un framework de rutas: la app es una sola pantalla con vistas que
// se montan/desmontan. Cada módulo de vista exporta:
//   render(container, params, isStale) -> Promise<void> | void
//   unmount?()                          -> void   (opcional, limpia listeners/canvas)
//
// `isStale()` — MUY IMPORTANTE, léase antes de escribir una vista nueva:
// Cada vista hace al menos un `await` (llamada a la API) antes de pintar su
// contenido. Si el usuario navega a OTRA vista mientras ese `await` sigue en
// curso (típico con conexión lenta y un usuario que toca varias pestañas
// rápido), la vista vieja no debe seguir escribiendo en el DOM cuando por
// fin resuelva — haría que el contenido de la vista nueva se sobreescriba
// con el de la vieja. Por eso cada vista debe llamar `isStale()` justo
// después de cada `await` y, si devuelve `true`, dejar de ejecutar sin
// tocar el `container` en absoluto.
// ============================================================================

const routes = {
  login: () => import("./views/login.js"),
  historial: () => import("./views/historial.js"),
  formulario: () => import("./views/formulario.js"),
  detalle: () => import("./views/detalle.js"),
  dashboard: () => import("./views/dashboard.js"),
  aprobacion: () => import("./views/aprobacion.js"),
  admin: () => import("./views/admin.js"),
  "cambiar-password": () => import("./views/cambiar-password.js"),
};

let currentModule = null;
let currentView = null;
let navToken = 0; // se incrementa en cada navegación; identifica la "más reciente"

const root = () => document.getElementById("app-root");

export async function goTo(viewName, params = {}) {
  if (!routes[viewName]) {
    console.error(`Vista desconocida: ${viewName}`);
    return;
  }

  const myToken = ++navToken;
  const isStale = () => myToken !== navToken;

  if (currentModule && typeof currentModule.unmount === "function") {
    try {
      currentModule.unmount();
    } catch (err) {
      console.warn("Error al desmontar vista anterior:", err);
    }
  }

  currentView = viewName;
  updateNavActiveState(viewName);

  const container = root();
  container.innerHTML = "";
  container.setAttribute("data-view", viewName);

  const mod = await routes[viewName]();
  if (isStale()) return; // el usuario ya navegó a otra vista mientras cargábamos el módulo

  currentModule = mod;
  await mod.render(container, params, isStale);
  if (isStale()) return; // idem, mientras la vista renderizaba sus datos

  container.scrollIntoView({ block: "start" });
  window.scrollTo(0, 0);
}

export function getCurrentView() {
  return currentView;
}

function updateNavActiveState(viewName) {
  document.querySelectorAll(".tab[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });
  document.querySelectorAll(".mobile-nav-btn[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });
}
