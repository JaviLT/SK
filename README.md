# Short Kaizen — Zubex Industrial (Frontend)

Reconstrucción del frontend de KaizenZX: registro de mejoras continuas con
aprobación en 3 pasos (Mejora Continua → Líder → Gerente), roles con
visibilidad distinta (solicitante, líder, gerente, admin), panel de
administración de equipos/empleados, dashboard de cumplimiento de metas, y
exportación a PDF/Excel — todo sin credenciales ni datos de personal en el
código, y responsivo para cualquier dispositivo.

## Flujo de negocio actual

```
Empleado llena el formulario
  → Mejora Continua revisa (aprueba/rechaza)
    → Líder de su equipo aprueba/rechaza
      → Gerente de área aprueba/rechaza
        → Kaizen cerrado ("Aceptado")
```

Si cualquiera de los 3 pasos rechaza, el kaizen queda como rechazado en ese
paso (`rej_mc`, `rej_l` o `rej_g`) y el flujo termina ahí.

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
- Ninguna firma digital ni campo de comentarios en la pantalla de
  aprobación — solo contraseña + decisión (aprobar/rechazar) + confirmar. El
  backend identifica a quien decide por el token, no por lo que escriba.

**Todo lo anterior es responsabilidad del backend, que administra TI
(Jesús)** — ver `docs/PARA_JESUS.md` para el detalle completo de lo que
falta construir del lado del backend para que todo esto funcione con datos
reales.

## Estructura del proyecto

```
shortkaizen/
├── index.html                 # Shell — sin lógica de negocio
├── css/
│   ├── variables.css          # Tokens de marca (colores, tipografía, espaciado, ancho fluido)
│   ├── base.css                # Reset y estilos globales
│   ├── components.css          # Botones, tarjetas, formularios, modal, toasts
│   ├── views.css                # Layout específico de cada vista
│   └── responsive.css          # Media queries (tablet / móvil)
└── js/
    ├── config.js                # ← Único lugar con la config del backend y el modo mock
    ├── api.js                    # Única puerta de entrada/salida de datos
    ├── state.js                   # Estado en memoria de la sesión
    ├── router.js                  # Cambia de vista dentro de #app-root
    ├── utils.js                   # Helpers (DOM seguro, fechas, toasts, imágenes)
    ├── app.js                      # Punto de entrada
    ├── lib/
    │   ├── mock-backend.js         # Backend simulado en memoria (solo desarrollo)
    │   └── signature-pad.js        # (sin uso actualmente — se quitó la firma digital)
    └── views/
        ├── login.js                # Nómina + contraseña
        ├── cambiar-password.js     # Cambio obligatorio en el primer login
        ├── historial.js            # KPIs + lista de kaizens, filtrados por rol
        ├── formulario.js           # Captura de un nuevo kaizen, en secciones
        ├── aprobacion.js           # Se abre desde el link del correo (?token=...)
        ├── detalle.js               # Detalle + línea de tiempo + exportar PDF
        ├── dashboard.js             # Cumplimiento de metas + top 5 equipos/empleados
        └── admin.js                 # Equipos/empleados + exportar Excel (rol "admin")
```

No hay paso de build (bundler/transpilador) — son módulos ES nativos
(`<script type="module">`), así que funciona igual en GitHub Pages que en
tu computadora, abriendo `index.html` con un servidor local simple:

```bash
python3 -m http.server 8000
# o
npx serve .
```

(Abrir `index.html` con doble clic, sin servidor, no funciona: los módulos
ES nativos requieren que el navegador lo cargue vía `http://`, no `file://`.)

## Roles y qué ve cada uno en "Solicitudes"

| Rol | Qué ve |
|---|---|
| `solicitante` | Solo sus propios Short Kaizen enviados |
| `lider` | Los Short Kaizen de su propio equipo |
| `gerente` | Mosaico de los equipos que le reportan, y al abrir uno, sus kaizens |
| `aprobador` | Resuelve el primer paso de aprobación (Mejora Continua) vía el link del correo — no tiene una pantalla propia dentro de la app más allá de eso |
| `admin` | Todo sin restricción + acceso al tab "Administración" |

## Modo mock (desarrollo sin backend)

Mientras el backend real no tenga listas las rutas nuevas, `js/config.js`
puede volver a `MOCK_MODE: true` temporalmente. En ese modo la app funciona
con datos **ficticios** de `js/lib/mock-backend.js`, incluyendo:

- Login de prueba: `0001`/`demo123` (solicitante), `lider1`/`demo123`,
  `gerente1`/`demo123`, `aprobador1`/`demo123`, `admin1`/`demo123`.
- Simulación completa del flujo de 3 pasos (tokens de un solo uso).
- Catálogo ficticio de departamentos y equipos.

## Conectar al backend real

`js/config.js` tiene `SUPABASE_FUNCTIONS_URL`, `SUPABASE_ANON_KEY` y
`MOCK_MODE: false` — ver `docs/PARA_JESUS.md` para el contrato completo de
endpoints que todavía faltan (departamentos, cambio de contraseña, y todo
lo de administración de equipos/empleados).

## Diseño / marca

Colores, tipografía y estructura siguen el Manual de Estandarización de
Reportes IA de Zubex (`#0D18A8` azul primario, `#227EF6` azul de acento,
verde/rojo semántico para KPIs, tipografía Poppins con fallback Segoe UI).

## Responsivo

El ancho de contenido (`--content-max` en `css/variables.css`) es fluido —
crece con la ventana hasta un tope de 1680px, en vez de un valor fijo
angosto, para no dejar franjas vacías en monitores grandes. El resto del
layout usa grids fluidos (`auto-fill`/`minmax`) y sustituye la barra
superior por navegación inferior en pantallas ≤ 720px.

## Exportaciones

- **PDF** (botón "Exportar PDF" en el detalle de un kaizen): jsPDF, 100%
  del lado del cliente. El diseño se acerca a la primera página del
  formato oficial MEJ-F-03 (encabezado azul, secciones por bloques, fotos
  antes/después) sin ser una copia exacta — usa la identidad visual propia
  de la app.
- **Excel** (botón "Exportar a Excel" en Administración, solo rol `admin`):
  ExcelJS, 100% del lado del cliente. Incluye todos los kaizen con estatus
  "Aceptado" o "Rechazado" (cualquier fecha), con sus fotos incrustadas.

Ambas librerías se cargan desde cdnjs.cloudflare.com — requieren conexión a
internet en el navegador de quien exporta (no hay backend de por medio).
