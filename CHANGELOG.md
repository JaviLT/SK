# Short Kaizen — Historial de versiones

Cada entrega sube la versión (`APP_VERSION` en `js/config.js`). La versión y la fecha de build se ven abajo en la app ("Short Kaizen vX.Y.Z · fecha") y en el nombre del zip, para confirmar que está publicada la más reciente.

## 1.2.0 — 2026-10-20
- Tablero general: nuevo filtro de AÑO (por default el año en curso) y meses en MAYÚSCULAS.
- Con "Todos los meses" ya no hay barra de progreso: cada equipo muestra el número de SK de cada mes (ENE–DIC) y su total. La barra se queda solo al elegir un mes específico.
- Histórico de Mejora Continua (enero–septiembre 2026, 31 equipos) cargado desde `assets/data/historico-sk.json`; de octubre en adelante cuenta los SK implementados reales de la app. Equipos del archivo sin coincidencia de nombre con el catálogo aparecen en un grupo aparte y no suman a los indicadores.

## 1.1.0 — 2026-10-16
- Mis Kaizen: los SK de un equipo se ven en un popup con filtro (Todos / Pendientes / Aceptados / Rechazados).
- Detalle: "Volver" regresa a la página de origen (Mis Kaizen o Solicitudes); desde Mis Kaizen reabre el popup del equipo con su filtro.
- Dashboard: corregidas las gráficas Top 5 (Chart.js, ExcelJS y jsPDF ahora van dentro del proyecto en `assets/vendor/`).
- Aprobador 2 y 3 ven la pestaña Solicitudes y pueden aprobar/rechazar.
- Cambios previos acumulados: contraseña temporal / restablecer contraseña, mostrar contraseña en login, líder por nómina e integrante del equipo, motivo de rechazo obligatorio.

## 1.0.0
- Primera versión estable.
