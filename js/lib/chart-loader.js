// chart-loader.js — Carga Chart.js desde la copia local (assets/vendor).
// (El CDN no sirve: la URL de cdnjs para chart.umd.min.js no existe.)
export function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "assets/vendor/chart.umd.js";
    script.onload = () => resolve(window.Chart);
    script.onerror = () => reject(new Error("No se pudo cargar Chart.js"));
    document.head.appendChild(script);
  });
}
