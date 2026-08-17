# Short Kaizen — Zubex Industrial (Frontend)

Reconstrucción del frontend de KaizenZX: mismo propósito y flujo (registro de
mejoras continuas con aprobación de Líder → Gerente), con arquitectura nueva,
sin credenciales ni datos de personal en el código, y responsivo para
cualquier dispositivo.

## Por qué se reconstruyó

La versión anterior (`index.html` de un solo archivo) tenía varios problemas
de seguridad ya documentados por el equipo de revisión técnica junto con TI:
base de datos con lectura/escritura pública, aprobaciones falsificables por
URL, contraseñas compartidas verificadas en el navegador, catálogo de
empleados escrito directo en el código fuente, y riesgo de inyección de
código (XSS). Esta versión corrige esos puntos desde la arquitectura, no como
parche sobre lo existente.

## Qué NO contiene este proyecto (a propósito)

- Ninguna credencial de Firebase, EmailJS, Azure ni Microsoft 365.
- Ningún dato real de empleados, nóminas, correos o equipos de Zubex.
- Ninguna contraseña por defecto ni comparación de contraseñas en el cliente.
- Ningún `innerHTML` con datos dinámicos sin escapar (todo el DOM se
  construye con el helper `el()` de `js/utils.js`, que inserta texto de forma
  segura).
- Ningún link de aprobación con datos embebidos — solo se pasa un `token`
  opaco en la URL; el contenido y la validez los resuelve el backend.

**Todo esto es responsabilidad del backend, que administra TI (Jesús)
directamente**, según quedó definido en la revisión de seguridad.

## Estructura del proyecto

```
shortkaizen/
├── index.html                 # Shell — sin lógica de negocio
├── css/
│   ├── variables.css          # Tokens de marca (colores, tipografía, espaciado)
│   ├── base.css                # Reset y estilos globales
│   ├── components.css          # Botones, tarjetas, formularios, modal, toasts
│   ├── views.css                # Layout específico de cada vista
│   └── responsive.css          # Media queries (tablet / móvil)
└── js/
    ├── config.js                # ← Único lugar con la URL del backend y el modo mock
    ├── api.js                    # Única puerta de entrada/salida de datos
    ├── state.js                   # Estado en memoria de la sesión
    ├── router.js                  # Cambia de vista dentro de #app-root
    ├── utils.js                   # Helpers (DOM seguro, fechas, toasts, imágenes)
    ├── app.js                      # Punto de entrada
    ├── lib/
    │   ├── mock-backend.js         # Backend simulado en memoria (solo desarrollo)
    │   └── signature-pad.js        # Captura de firma digital en <canvas>
    └── views/
        ├── login.js                # Nómina + contraseña (no depende de correo @zubex)
        ├── historial.js            # KPIs, mosaico de equipos, lista de kaizens
        ├── formulario.js           # Captura de un nuevo kaizen
        ├── aprobacion.js           # Se abre desde el link del correo (?token=...)
        ├── detalle.js               # Detalle + línea de tiempo + exportar PDF
        └── dashboard.js             # Gráficas (Chart.js vía CDN, solo lectura)
```

No hay paso de build (bundler/transpilador) — son módulos ES nativos
(`<script type="module">`), así que funciona igual en GitHub Pages que en
tu computadora, abriendo `index.html` con un servidor local simple:

```bash
# Cualquiera de estas opciones sirve el proyecto en http://localhost:8000
python3 -m http.server 8000
# o
npx serve .
```

(Abrir `index.html` con doble clic, sin servidor, no funciona: los módulos
ES nativos requieren que el navegador lo cargue vía `http://`, no `file://`.)

## Modo mock (desarrollo sin backend)

Mientras el backend real no exista, `js/config.js` tiene `MOCK_MODE: true`.
En ese modo, toda la app funciona con datos de ejemplo **ficticios** (no son
datos reales de Zubex) generados en `js/lib/mock-backend.js`, incluyendo:

- Login de prueba: nómina `0001`, contraseña `demo123`.
- 3 equipos de ejemplo con kaizens en distintos estados.
- Simulación completa del flujo de aprobación (tokens de un solo uso,
  igual que se espera del backend real).

Esto permite seguir construyendo y probando la interfaz sin depender de que
el backend ya esté disponible.

## Conectar al backend real (cuando esté listo)

Dos cambios, en un solo archivo (`js/config.js`):

```js
export const CONFIG = {
  API_BASE_URL: "https://<lo-que-defina-Jesús>.azurewebsites.net/api",
  MOCK_MODE: false,
  // ...
};
```

Nada más en el proyecto debería requerir cambios — toda la lógica de vistas
llama a `api.js`, nunca a `fetch` directo ni a un servicio externo.

## Contrato de API esperado (para coordinar con TI)

El backend debe implementar estos endpoints con esta forma exacta de
respuesta (es la que ya consume el frontend):

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| `POST` | `/auth/login` | `{ nomina, password }` | `{ token, user: { nomina, nombre, rol, equipo } }` |
| `GET` | `/auth/session` | — (usa header `Authorization: Bearer <token>`) | `{ nomina, nombre, rol, equipo }` o error 401 |
| `GET` | `/equipos` | — | `Equipo[]` — ver forma abajo |
| `GET` | `/kaizens` | — | `Kaizen[]` |
| `GET` | `/kaizens/:id` | — | `Kaizen` |
| `POST` | `/kaizens` | `Kaizen` (sin `id`/`status`) | `Kaizen` creado (backend asigna `id`, `status: 'pend_l'`, y envía el correo al líder) |
| `GET` | `/approvals/:token` | — | `{ kaizen: Kaizen, step: 'lider' \| 'gerente' }` |
| `POST` | `/approvals/:token` | `{ decision: 'aprobar'\|'rechazar', nombre, firma, razonRechazo, password }` | `Kaizen` actualizado |

**Errores:** cualquier respuesta con código HTTP fuera del rango 2xx debe
traer `{ "error": "mensaje legible para mostrar al usuario" }`.

**Forma de `Equipo`:**
```json
{
  "nombre": "string",
  "liderNombre": "string", "liderEmail": "string",
  "gerenteNombre": "string", "gerenteEmail": "string",
  "miembros": [{ "nomina": "string", "nombre": "string" }]
}
```

**Forma de `Kaizen`:** ver los objetos de ejemplo en
`js/lib/mock-backend.js` (`seedKaizens()`) — esos campos son exactamente
los que la interfaz espera recibir y envía al crear uno nuevo.

**Puntos de seguridad que debe garantizar el backend** (no los puede
resolver el frontend por sí solo):
- El token de `/approvals/:token` debe ser de un solo uso y expirar.
- La contraseña de autorización (líder/gerente) se valida en el backend
  contra un hash — nunca se compara en texto plano ni se expone al cliente.
- `/kaizens` (lectura) puede requerir sesión válida; `/approvals/:token`
  se diseñó para NO requerir sesión (se accede desde el correo), por eso su
  propia validación de token es la única barrera — debe ser robusta.

## Diseño / marca

Colores, tipografía y estructura siguen el Manual de Estandarización de
Reportes IA de Zubex (`#0D18A8` azul primario, `#227EF6` azul de acento,
verde/rojo semántico para KPIs, tipografía Poppins con fallback Segoe UI).
El logo oficial no se incluyó (vive en SharePoint, fuera de este entorno) —
el espacio para colocarlo está en `.brand-mark` (`index.html` /
`css/components.css`).

## Responsivo

Sin breakpoints "por dispositivo" fijos: el layout usa grids fluidos
(`auto-fill`/`minmax`) que se reacomodan solos, y `css/responsive.css` solo
ajusta la densidad de columnas y sustituye la barra superior por navegación
inferior en pantallas ≤ 720px (patrón estándar de apps móviles, con área
seguro para notch/home-indicator vía `env(safe-area-inset-bottom)`).
