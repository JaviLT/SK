# Short Kaizen — Zubex Industrial (Frontend)

Registro de mejoras continuas con aprobación, roles con visibilidad distinta
(integrante, líder, gerente, Mejora Continua, admin), panel de
administración de equipos/empleados, dashboard de cumplimiento de metas, y
exportación a PDF/Excel — todo sin credenciales ni datos de personal en el
código, y responsivo para cualquier dispositivo.

## Flujo de negocio actual

El flujo de aprobación (cuántos pasos y a quién se le envía cada uno) lo
decide el backend a partir de las columnas del listado de personal — ver
`docs/PARA_JESUS.md` para el contrato completo. El frontend no asume un
número fijo de pasos: solo conoce los estatus que el backend le devuelva
(`pend_mc`, `pend_l`, `pend_g`, `done`, `rej_*`, etc.).

Si cualquier paso rechaza, el kaizen queda rechazado en ese paso y el flujo
termina ahí.

## Qué NO contiene este proyecto (a propósito)

- Ninguna credencial de Firebase, EmailJS, Azure ni Microsoft 365 (más allá
  de la anon key pública de Supabase, que está diseñada para ir en el
  cliente).
- Ningún dato real de empleados, nóminas, correos o equipos de Zubex.
- Ninguna contraseña por defecto ni comparación de contraseñas en el cliente.
- Ningún `innerHTML` con datos dinámicos sin escapar (todo el DOM se
  construye con el helper `el()` de `js/utils.js`).
- Ningún link de aprobación con datos embebidos — solo se pasa un `token`
  opaco en la URL; el contenido y la validez los resuelve el backend.

**Todo lo anterior es responsabilidad del backend, que administra TI
(Jesús)** — ver `docs/PARA_JESUS.md` para el detalle completo de lo que
falta construir del lado del backend para que todo esto funcione con datos
reales.

## Estructura del proyecto — sitio multi-página

A partir de esta versión, el sitio dejó de ser una SPA (aplicación de una
sola página con router de JavaScript): **cada pantalla es su propio archivo
`.html` real**, con su propia navegación por enlaces normales.

```
shortkaizen/
├── index.html                 # Redirige a login.html / mis-kaizens.html / aprobacion.html
├── login.html                 # Inicio de sesión
├── cambiar-password.html      # Cambio de contraseña obligatorio (primer login)
├── mis-kaizens.html           # "Mis Kaizens" (antes "Solicitudes") — KPIs + lista, según rol
├── solicitudes.html           # NUEVA — aprobar en un clic (solo roles que aprueban)
├── formulario.html            # Nuevo Short Kaizen
├── detalle.html                # Detalle de un kaizen + exportar PDF (parecido al PDF)
├── dashboard.html               # Cumplimiento de metas (sin cambios de diseño esta ronda)
├── admin.html                   # Equipos/empleados/gerentes + exportar Excel (admin y mc)
├── aprobacion.html              # Se abre desde el link del correo (?token=...) — sin sesión
├── assets/
│   ├── logo-sk.png             # Logo completo (círculo + wordmark) — imagen entregada
│   └── logo-mark.png           # Solo el monograma circular — usado en topbar/PDF/login
├── css/
│   ├── variables.css           # Tokens de marca (colores, tipografía, espaciado)
│   ├── base.css                # Reset y estilos globales
│   ├── components.css          # Botones, tarjetas, topbar, FAB, modal, toasts
│   ├── views.css                # Layout específico de cada vista
│   └── responsive.css          # Media queries (tablet / móvil)
└── js/
    ├── config.js                # Único lugar con la config del backend y el modo mock
    ├── api.js                    # Única puerta de entrada/salida de datos
    ├── state.js                   # Estado en memoria de la sesión (dentro de una página)
    ├── shell.js                   # Bootstrap compartido: sesión, topbar/menú móvil, FAB
    ├── utils.js                   # Helpers (DOM seguro, fechas, toasts, imágenes)
    ├── pages/                     # Un módulo mínimo por página — llama a shell.js + a la vista
    │   ├── login.js, cambiar-password.js, mis-kaizens.js, solicitudes.js,
    │   │   formulario.js, detalle.js, dashboard.js, admin.js, aprobacion.js
    ├── lib/
    │   ├── mock-backend.js         # Backend simulado, persistido en localStorage (solo dev)
    │   └── signature-pad.js        # (sin uso actualmente)
    └── views/
        ├── login.js, cambiar-password.js, mis-kaizens.js, solicitudes.js,
        │   formulario.js, aprobacion.js, detalle.js, dashboard.js, admin.js
        # Cada archivo exporta render(container, params, isStale) — la lógica de
        # cada pantalla vive aquí; js/pages/*.js solo la invoca desde su página.
```

No hay paso de build (bundler/transpilador) — son módulos ES nativos
(`<script type="module">`), así que funciona igual en GitHub Pages que en
tu computadora, abriendo cualquier página con un servidor local simple:

```bash
python3 -m http.server 8000
# o
npx serve .
```

(Abrir los `.html` con doble clic, sin servidor, no funciona: los módulos
ES nativos requieren que el navegador los cargue vía `http://`, no `file://`.)

## Roles y qué ve cada uno

| Rol | Mis Kaizens | Solicitudes (aprobar) | Dashboard | Administración |
|---|---|---|---|---|
| `solicitante` (Integrante) | Solo los suyos | — | Sí | — |
| `lider` | Los de su Equipo Lean | Los de su equipo, pendientes de su firma | Sí | — |
| `gerente` | Todos los de su departamento | Los de su departamento, pendientes de su firma | Sí | — |
| `mc` (Mejora Continua) — **NUEVO** | Todo, sin restricción | **TODOS** los de la empresa, pendientes del paso de Mejora Continua | Sí | Sí |
| `admin` | Todo, sin restricción | Todos los pendientes, de cualquier paso | Sí | Sí |

### Pestaña "Solicitudes" (nueva)

Antes, aprobar un Short Kaizen solo era posible desde el link del correo
(`aprobacion.html?token=...`), que sigue existiendo tal cual (pide
contraseña, no cambió). Ahora, quien puede aprobar y ya inició sesión en la
app también ve la pestaña **Solicitudes**, donde aprueba/rechaza con **un
solo clic — sin volver a pedir contraseña** (la sesión ya lo identifica).

### Rol "mc" (nuevo)

Representa a Mejora Continua dentro de la app (antes ese paso solo existía
como un correo/buzón, sin nadie con sesión). Alguien con este rol:
- ve **todas** las solicitudes pendientes de Mejora Continua, de **cualquier
  equipo o departamento** (no está limitado a un equipo/departamento propio);
- tiene acceso al tab **Administración**, igual que `admin`.

## Botón "+ Nuevo Kaizen"

Se reubicó del topbar a un botón flotante (FAB) fijo en la esquina inferior
derecha, visible en cualquier pantalla autenticada (escritorio y móvil). Se
descartó la idea de crear un kaizen sin iniciar sesión (solo con nómina) por
el riesgo de suplantación de identidad — ver `docs/PARA_JESUS.md`.

## Logo

El logo de Short Kaizen (`assets/logo-mark.png`) aparece en: el topbar de
cada pantalla autenticada, la pantalla de login/cambio de contraseña, el
encabezado del detalle de un kaizen, y el PDF exportado — siempre dentro de
un recuadro blanco (azul sobre blanco), respetando las combinaciones de
color permitidas por el manual de marca.

## Modo mock (desarrollo sin backend)

Mientras el backend real no tenga listas las rutas nuevas, `js/config.js`
puede volver a `MOCK_MODE: true` temporalmente. En ese modo la app funciona
con datos **ficticios** de `js/lib/mock-backend.js` — su estado (sesión,
kaizens creados, equipos) ahora se guarda en `localStorage` para que
sobreviva la navegación real entre páginas (antes, al ser una sola página,
bastaba con una variable en memoria).

- Login de prueba: `0001`/`demo123` (integrante), `lider1`/`demo123`,
  `gerente1`/`demo123` (ve todo el departamento EXTRUSIÓN), `mc1`/`demo123`
  (Mejora Continua), `admin1`/`demo123`.

## Conectar al backend real

`js/config.js` tiene `SUPABASE_FUNCTIONS_URL`, `SUPABASE_ANON_KEY` y
`MOCK_MODE: false` — ver `docs/PARA_JESUS.md` para el contrato completo de
endpoints, incluyendo el nuevo `POST /kaizens/:id/decision` que necesita la
pestaña Solicitudes.

## Diseño / marca

Colores, tipografía y estructura siguen el Manual de Estandarización de
Reportes IA de Zubex (`#0D18A8` azul primario, `#227EF6` azul de acento,
verde/rojo semántico para KPIs, tipografía Poppins con fallback Segoe UI).

## Responsivo

El ancho de contenido (`--content-max` en `css/variables.css`) es fluido —
crece con la ventana hasta un tope de 1680px. El resto del layout usa grids
fluidos (`auto-fill`/`minmax`) y sustituye la barra superior por navegación
inferior en pantallas ≤ 720px; el FAB se recoloca arriba de esa barra.

## Exportaciones

- **PDF** (botón "Exportar PDF" en el detalle de un kaizen): jsPDF, 100%
  del lado del cliente. Incluye el logo de Short Kaizen en el encabezado.
- **Excel** (botón "Exportar a Excel" en Administración, roles `admin`/`mc`):
  ExcelJS, 100% del lado del cliente.

Ambas librerías se cargan desde cdnjs.cloudflare.com — requieren conexión a
internet en el navegador de quien exporta (no hay backend de por medio).
