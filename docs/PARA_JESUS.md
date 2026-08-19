# Short Kaizen — Cambios necesarios en el backend (para Jesús)

**De:** Javier (Frontend) · **Para:** Jesús (TI — Backend y Seguridad)
**Contexto:** a partir de tu backend ya construido (Supabase + Microsoft
Graph), el frontend cambió bastante — nuevo flujo de aprobación de 3 pasos,
nuevos roles, pantalla de administración, y carga masiva del catálogo de
personal. Este documento junta todo lo que se necesita de tu lado para que
el frontend nuevo funcione con datos reales. No es urgente hacerlo todo de
golpe — están ordenados por qué tan bloqueante es cada uno.

---

## 1. Flujo de aprobación — ahora son 3 pasos, no 2

Antes: Líder → Gerente. Ahora:

```
Empleado registra el kaizen
  → Mejora Continua aprueba/rechaza   (nuevo paso)
    → Líder aprueba/rechaza
      → Gerente aprueba/rechaza
        → Kaizen cerrado ("done")
```

Rechazo en cualquier paso termina el flujo con ese estatus (`rej_mc`,
`rej_l`, `rej_g`) — no debe poder seguir avanzando.

### 1.1 Nuevo rol: `aprobador` (Mejora Continua)

En tu catálogo de personal ya existe una posición llamada **"aprobador"**
(la vi en el listado de aprobación — Sergio España, nómina 2442, aparece
con posición "aprobador"). Ese rol es quien debe recibir el correo del
primer paso y resolverlo desde un link de aprobación, exactamente igual
que Líder/Gerente hoy (mismo mecanismo de token amarrado a la persona +
contraseña).

Si solo hay una persona con ese rol, todos los correos del primer paso van
a ella; si hay más de una, cualquiera de ellas debería poder resolverlo (a
definir según cómo esté modelado tu catálogo — pregúntame si necesitas más
contexto de negocio aquí).

### 1.2 Endpoint de aprobación — ya NO se manda nombre, firma ni motivo

Se quitó la firma digital y el campo de comentarios de la pantalla de
aprobación (decisión del negocio, no técnica). El body de
`POST /approvals/:token` cambia de:

```json
{ "decision": "aprobar", "nombre": "...", "firma": "data:image/...", "razonRechazo": "...", "password": "..." }
```

a simplemente:

```json
{ "decision": "aprobar" | "rechazar", "password": "..." }
```

El nombre de quien aprueba ya no lo escribe la persona — tu backend ya lo
sabe porque el token está amarrado a ella. Debes seguir regresando ese
nombre en el objeto `Kaizen` actualizado (en los campos que ya tenías,
ahora con esta nomenclatura):

- `firmaMCNombre` / `firmaMCFecha` (nuevo — paso Mejora Continua)
- `firmaLiderNombre` / `firmaLiderFecha` (igual que antes)
- `firmaGerenteNombre` / `firmaGerenteDate` (igual que antes)

`GET /approvals/:token` debe regresar `step` con uno de estos 3 valores:
`"mc"`, `"lider"`, `"gerente"` (antes solo `"lider"`/`"gerente"`).

### 1.3 Estatus de un kaizen — nuevos valores

| Estatus | Significado |
|---|---|
| `pend_mc` | Recién creado, esperando a Mejora Continua (antes era el estado inicial `pend_l`) |
| `pend_l` | Aprobado por Mejora Continua, esperando al Líder |
| `pend_g` | Aprobado por el Líder, esperando al Gerente |
| `done` | Aprobado por los 3 — cerrado |
| `rej_mc` | Rechazado por Mejora Continua |
| `rej_l` | Rechazado por el Líder |
| `rej_g` | Rechazado por el Gerente |

`POST /kaizens` (crear) ahora debe dejar el kaizen en `pend_mc` y disparar
el correo al/a los aprobador(es) de Mejora Continua, no al líder
directamente.

---

## 2. Campos del formulario de captura — cambiaron varios

El formulario de "Nuevo Kaizen" se rediseñó por secciones. Los campos que
manda `POST /kaizens` ahora son:

```json
{
  "equipo": "string",
  "nomina": "string",
  "nombre": "string",
  "departamento": "string",
  "areaLinea": "string",
  "breveDescripcion": "string",
  "enfoques": ["Rentabilidad" | "Bienestar del personal" | "Sustentabilidad" | "Mejora en el proceso", "..."],
  "descAntes": "string",
  "descDespues": "string",
  "estandarizacion": "string (opcional)",
  "fechaId": "YYYY-MM-DD",
  "fechaImpl": "YYYY-MM-DD (siempre = fecha de creación, el frontend ya no deja elegirla)",
  "tiempoImpl": "number",
  "unidadTiempo": "minutos" | "horas" | "días",
  "fotoAntes": "data:image/...;base64,... | null",
  "fotoDespues": "data:image/...;base64,... | null"
}
```

Cambios respecto al contrato anterior:
- **Se quitó** `donde` (texto libre) → ahora es `departamento` (catálogo
  cerrado, ver sección 3) + `areaLinea` (texto libre).
- **Se quitó** `quien` ("detectado por") — ya no se captura.
- **Se agregó** `breveDescripcion`.
- `enfoques` ahora es un catálogo cerrado de 4 opciones fijas (antes eran
  6 libres tipo "Seguridad", "Calidad", "Costo", "Entrega", "5S",
  "Ergonomía" — ya no aplican, son las 4 nuevas de la lista de arriba).

## 3. Catálogo de departamentos

Necesito un endpoint nuevo:

```
GET /departamentos   ->   string[]
```

Con los mismos 18 departamentos de tu catálogo de personal (los extraje
del "Listado de aprobación sk" que me compartiste — te los paso en el CSV
de la sección 6 para que no haya diferencias de captura entre mayúsculas,
acentos, etc.).

---

## 4. Panel de Administración (rol `admin`) — endpoints nuevos

Pantalla nueva, solo visible para quien tenga `rol: "admin"` en la sesión.
Por ahora funciona en el frontend con datos de ejemplo en memoria — para
que sea real, se necesitan estos endpoints (mismo patrón de auth que ya
usas: requieren sesión con rol `admin`):

| Método | Ruta | Body | Qué hace |
|---|---|---|---|
| `POST` | `/equipos` | `{ nombre, departamento, liderNombre, liderEmail, gerenteNombre, gerenteEmail }` | Crea un equipo |
| `PUT` | `/equipos/:nombreOriginal` | igual que arriba | Edita un equipo (incluye poder renombrarlo) |
| `DELETE` | `/equipos/:nombre` | — | Elimina un equipo y sus integrantes |
| `POST` | `/equipos/:nombre/empleados` | `{ nomina }` | Agrega un integrante — **solo se manda la nómina**, el nombre se resuelve del catálogo de personal del lado del servidor |
| `DELETE` | `/equipos/:nombre/empleados/:nomina` | — | Quita un integrante del equipo |
| `GET` | `/empleados/:nomina` | — | Devuelve `{ nomina, nombre }` — usado también por el punto anterior, y podría reusarse en otras partes a futuro |

Nota de UX importante: al agregar un integrante, el admin ya NO escribe el
nombre — solo la nómina, y el sistema busca el nombre en el catálogo de
personal. Si la nómina no existe en el catálogo, debe regresar error 404
con mensaje claro ("No se encontró ningún empleado con esa nómina").

### 4.1 Rol `admin` — ya no `gerente`

Durante el desarrollo usé temporalmente el rol `gerente` para poder
revisar el diseño de esta pantalla sin bloquearme esperando el rol nuevo.
**Ya quedó revertido a `admin`** del lado del frontend — si en algún
momento le diste rol `admin` a un usuario de prueba solo para esa prueba
temporal, puedes dejarlo o quitarlo, ya no depende de eso.

---

## 5. Cuentas de empleados — usuario y contraseña automáticos

Definición acordada: **usuario = número de nómina** (como ya es hoy) y
**contraseña inicial simple y predecible** (por ejemplo `Zubex` + nómina,
o el esquema que definas — con tal de que sea fácil de comunicar a las
~328 personas del catálogo), forzando el cambio de contraseña en el primer
login.

Necesito que el login regrese una bandera nueva:

```json
{ "token": "...", "user": { "nomina": "...", "nombre": "...", "rol": "...", "equipo": "...", "requiereCambioPassword": true } }
```

Y un endpoint nuevo:

```
POST /auth/cambiar-password   { passwordActual, passwordNueva }   ->   { ok: true }
```

Debe validar `passwordActual` contra el hash guardado, y al guardar la
nueva, apagar `requiereCambioPassword` para esa persona. El frontend ya
tiene la pantalla lista (`js/views/cambiar-password.js`) — se muestra
automáticamente en vez del resto de la app mientras esa bandera esté en
`true`, sin tabs ni menú disponibles hasta que la cambien.

---

## 6. Carga masiva del catálogo de personal a Supabase

El usuario (Javier) compartió `Listado de aprobación sk.xlsx` (328
personas, 18 departamentos, ~58 equipos). Ya lo procesé y dejé 3 archivos
listos en `docs/carga_masiva/` de este mismo proyecto:

- **`equipos_limpio.csv`** — 58 filas: nombre de equipo, departamento,
  líder (nombre + correo), gerente (nombre + correo), número de
  integrantes.
- **`empleados_limpio.csv`** — 327 filas: nómina, nombre, tipo
  (administrativo/sindicalizado), departamento, equipo, posición, y los
  contactos de líder/gerente que traía su fila original.
- **`issues_a_revisar.csv`** — 65 observaciones encontradas al limpiar los
  datos, **antes de cargarlos**:
  - 61 casos donde el líder y el gerente de la persona son el mismo
    contacto/correo — puede ser normal en áreas administrativas chicas,
    pero vale la pena confirmarlo antes de cargarlo así.
  - 4 equipos donde sus integrantes no coinciden en quién es su líder o
    gerente (probablemente error de captura en el Excel original).

**Recomendación de proceso** (lo puede hacer Javier o tú, no requiere
programar):
1. Revisar `issues_a_revisar.csv` primero y decidir si algo hay que
   corregir en el Excel original o en el CSV limpio.
2. Crear en Supabase las tablas `departamentos`, `equipos` y `empleados`
   (con `empleados.equipo_id` y `equipos.departamento_id` como llaves
   foráneas) si no existen ya con esa forma.
3. Cargar `equipos_limpio.csv` primero (Supabase → Table Editor → botón
   "Insert" → "Import data from CSV" funciona directo, sin escribir SQL).
4. Cargar `empleados_limpio.csv` después, mapeando su columna `equipo` al
   `equipo_id` correspondiente (si tu tabla usa IDs numéricos en vez del
   nombre como llave, dime y te regreso los CSV ya mapeados a esos IDs en
   vez del nombre de equipo).
5. Para las contraseñas iniciales (sección 5): esa parte sí necesita un
   script de tu lado (no se puede hacer desde el importador de CSV,
   porque hay que generar el hash de cada contraseña) — puedo ayudarte a
   escribir ese script una vez que confirmes el esquema exacto de tu tabla
   de usuarios/auth en Supabase.

Si prefieres que te pase estos 3 CSV directo por otro canal en vez de
buscarlos en el repositorio, dímelo y te los reenvío.

---

## 7. Resumen de endpoints — nuevos o modificados

| Método | Ruta | Estado |
|---|---|---|
| `POST` | `/auth/login` | body igual, pero la respuesta ahora incluye `requiereCambioPassword` |
| `POST` | `/auth/cambiar-password` | **nuevo** |
| `GET` | `/departamentos` | **nuevo** |
| `POST` | `/kaizens` | body cambiado (sección 2) |
| `GET` | `/approvals/:token` | `step` ahora incluye `"mc"` |
| `POST` | `/approvals/:token` | body simplificado (sección 1.2) |
| `POST` | `/equipos` | **nuevo** |
| `PUT` | `/equipos/:nombre` | **nuevo** |
| `DELETE` | `/equipos/:nombre` | **nuevo** |
| `POST` | `/equipos/:nombre/empleados` | **nuevo** |
| `DELETE` | `/equipos/:nombre/empleados/:nomina` | **nuevo** |
| `GET` | `/empleados/:nomina` | **nuevo** |

Todo lo demás de tu backend actual (autenticación real, filtrado de
equipos ajenos, protección contra fuerza bruta, fotos/firmas en storage
privado, correo restringido a un solo buzón) sigue aplicando igual — nada
de esto lo cambia.

Cualquier duda sobre algún punto, dímelo directo y lo aclaramos antes de
que empieces a construir, para no ir y venir después.
