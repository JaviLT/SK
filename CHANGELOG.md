# Short Kaizen — Historial de versiones

Cada entrega sube la versión (`APP_VERSION` en `js/config.js`). La versión y la fecha de build se ven abajo en la app ("Short Kaizen vX.Y.Z · fecha") y en el nombre del zip, para confirmar que está publicada la más reciente.

## 1.6.5 — 2026-11-11
- Nuevo Kaizen: la foto/dibujo del "después" ahora es obligatoria. La etiqueta lleva asterisco; si se intenta enviar sin ella, el formulario no se envía, marca el recuadro en rojo, baja hasta él y avisa con un mensaje. La foto del "antes" sigue siendo opcional. Cambio solo en el front (no requiere cambios en Supabase).

## 1.6.4 — 2026-11-10
- Detalle del SK: a la izquierda del botón "Exportar PDF", dentro de la franja azul, se muestran los datos de control del formato: Sistema de Gestión de Inocuidad y Calidad · Formato: Short Kaizen · Fecha de Revisión: 4 de noviembre 2026 · Clave: MEJ-F-03 · Revisión: 08. Los datos viven en `js/lib/formato-sk.js` (un solo lugar para actualizar la próxima revisión).
- Exportar PDF: ahora se descarga con el formato oficial MEJ-F-03 Rev. 08 (hoja carta horizontal, mismas secciones, recuadros y posiciones que el PDF de Mejora Continua), con el folio SK-XXXX en el recuadro "Folio". Las fotos ya no se deforman (se ajustan a su recuadro sin estirarse). Si un texto no cabe, se reduce la letra y, si aun así no cabe, se corta con "… (ver hoja 2)" y el texto completo va en una hoja de continuación. La Estandarización (que el formato Rev. 08 no tiene como recuadro) también va en esa hoja cuando existe. La descarga mensual en ZIP de Administración usa el mismo PDF.

## 1.6.3 — 2026-11-09
- Mis Kaizen: la gráfica ahora cuenta solo los SK aceptados (los KPIs de arriba no cambian).
- Nuevo Kaizen → "Enfoque de la mejora": cada opción muestra el texto completo ("Rentabilidad (Ahorros)", "Sustentabilidad (Enfoque de reducción del impacto ambiental)", "Bienestar del personal (Seguridad, Ergonomía)", "Mejoras en el proceso (8S, 7 Desperdicios + 1, Calidad, Merma, Entregas)"). Lo que va entre paréntesis se ve en cursiva, más pequeño y en gris. El mismo texto completo se muestra en el detalle del SK, el PDF y el Excel. El valor guardado en el SK no cambió.

## 1.6.2 — 2026-11-06
- Tablero general: se agregó al histórico de Mejora Continua el número de SK de OCTUBRE 2026 por equipo (archivo Libro2). Con "Todos los meses" y en OCTUBRE el tablero y GEMBA 4 usan ese número; noviembre en adelante siguen saliendo de los SK implementados en la app.
- El archivo nuevo trae además dos equipos que no estaban antes: LAS PAPAS y MC (con sus datos de enero a octubre). Si no coinciden con ningún equipo del catálogo, aparecen en "Histórico sin coincidencia en el catálogo" y no suman a los KPIs.

## 1.6.1 — 2026-11-05
- Nuevo Kaizen → "Enfoque de la mejora": los 4 textos ahora muestran solo lo que iba entre paréntesis: "Ahorros", "Enfoque de reducción del impacto ambiental", "Seguridad, Ergonomía" y "8S, 7 Desperdicios + 1, Calidad, Merma, Entregas". El mismo texto se ve en el detalle del SK, en el PDF y en el Excel de administración (también para los SK ya creados). El valor guardado en el SK no cambió.

## 1.6.0 — 2026-11-04
- Tablero general: todos los usuarios ven lo mismo que Mejora Continua (todos los departamentos, equipos y SK). Usa la vista ligera `kaizens-resumen` (pendiente en el backend; mientras no exista cae a `GET /kaizens`).
- Todos los SK: ahora la ven todos. Cada persona ve solo los SK de su departamento; Mejora Continua y administrador ven todos. Nuevo filtro de equipo (con opción "Sin equipo"). El departamento de un SK es el de quien lo creó.
- Mis Kaizen: se quitó el listado de SK y el de equipos. Los 4 KPIs ahora son clicables y abren un popup con los SK que corresponden (con filtro Todos/Pendientes/Aceptados/Rechazados). Nuevo filtro de año y mes (por defecto el mes en curso, o "Todos los meses").
- Mis Kaizen: nueva gráfica de SK creados con drill-down por rol: integrante/líder ven las personas de su equipo; gerente ve equipos y al hacer clic las personas; Mejora Continua y administrador ven departamentos → equipos → personas.
- GEMBA 4: los SK pendientes de aprobación se cuentan en el departamento de quien creó el SK, no en el departamento donde se aplicará la mejora.

## 1.5.0 — 2026-10-28
- Nueva pantalla "Todos los SK" (solo Mejora Continua y administrador): lista de todos los Short Kaizen creados con filtros de estatus, departamento, mes y año (por fecha de creación). Al abrir un SK y pulsar "Volver" se conservan los filtros.
- La barra de navegación ya no parte los textos en dos líneas ni desborda la página con 6 pestañas.

## 1.4.2 — 2026-10-24
- Administración → Acciones → "Restablecer contraseña": ahora basta escribir la nómina y el nombre aparece solo (búsqueda automática al dejar de escribir; el botón "Buscar" se conserva). Con el botón de confirmación se genera la contraseña temporal y la persona debe cambiarla al iniciar sesión. Disponible para Mejora Continua y administrador.

## 1.4.1 — 2026-10-23
- GEMBA 4: el nombre de la persona con más SK se muestra completo (se acomoda en 2 líneas y reduce el tamaño si es muy largo).
- PDF de cada SK: corregido el encimado del título "Enfoque de la mejora" con el primer enfoque; los enfoques largos ahora saltan de línea.
- Mis Kaizen: el popup del equipo solo se reabre al regresar con el botón "Volver" del detalle; si se sale por otra pestaña del menú y se regresa, ya no queda abierto.

## 1.4.0 — 2026-10-22
- Nueva sección "GEMBA 4" (solo Mejora Continua y administrador): hoja de resultados del mes con KPIs (SK implementados, meta, % cumplimiento, persona con más SK), avance por departamento vs. meta y pendientes de aprobación por departamento. Filtro de año y mes, botón Imprimir en tamaño carta horizontal.

## 1.3.0 — 2026-10-21
- Administración → Acciones → "Descargar SK del mes (PDF)": el admin elige año y mes y descarga un ZIP con un PDF por cada Short Kaizen creado en ese mes (cualquier estatus). Se genera en el navegador, sin backend nuevo.
- El PDF individual ahora pesa ~110 KB en vez de ~2 MB (logo reducido); el código del PDF quedó compartido en `js/lib/sk-pdf.js`. Se agregó JSZip en `assets/vendor/`.

## 1.2.1 — 2026-10-20
- Tablero general: los 4 equipos del histórico que no coincidían por nombre (C4 CEDIS = "C4", ENTREGA2 LEAN = "Entrega2", LOS INALCANZABLES = "Los Incalcanzables", MORTAL KOMPRAS = "Motal Kompras") ahora se enlazan con su equipo del catálogo. Aceptan también el nombre corregido si algún día se arregla en el catálogo.

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
