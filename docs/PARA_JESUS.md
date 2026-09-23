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

### 1.1 Paso "Mejora Continua" — YA NO es un rol del catálogo de personal

**Corrección sobre una versión anterior de este documento:** el listado de
aprobación cambió y el puesto "aprobador" que mencioné antes (Sergio
España, nómina 2442) **ya no existe** — RH lo quitó del catálogo. Revisé
las 326 filas vigentes y la columna `Posición` solo trae `Integrante`,
`Líder` y `Gerente`.

El paso de Mejora Continua sigue existiendo en el flujo (es el primero),
pero **no está amarrado a ninguna persona/nómina del catálogo**: la
columna `Aprobación 1` del listado (que le correspondería) viene **vacía
en el 100% de las 326 filas** — el correo/buzón de Mejora Continua todavía
no existe. Voy a validar ese contacto directamente con el negocio y te
aviso en cuanto lo tengamos confirmado.

**No implementes el mecanismo de "token amarrado a un rol resuelto contra
la tabla de personal" para este paso** (el que sí aplica y ya está bien
para Líder/Gerente) — no hay ninguna fila de personal que represente
"Mejora Continua". Mi sugerencia mientras tanto:

- Modela el contacto de Mejora Continua como un **valor de configuración
  fijo** (un solo correo, en tu config de backend, no en la tabla de
  personal).
- El token de este paso puede amarrarse simplemente a "quien tenga acceso
  a ese buzón" — no necesita el mismo mecanismo de nómina-exacta que
  Líder/Gerente, porque no hay una persona/nómina detrás todavía.
- En cuanto tenga el correo definitivo, te aviso y lo actualizas en ese
  único lugar de configuración — no debería requerir cambio de esquema.

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
| `POST` | `/equipos` | `{ nombre, departamento, liderNombre, liderEmail }` | Crea un equipo |
| `PUT` | `/equipos/:nombreOriginal` | igual que arriba | Edita un equipo (incluye poder renombrarlo) |
| `DELETE` | `/equipos/:nombre` | — | Elimina un equipo y sus integrantes |
| `POST` | `/equipos/:nombre/empleados` | `{ nomina }` | Agrega un integrante — **solo se manda la nómina**, el nombre se resuelve del catálogo de personal del lado del servidor |
| `DELETE` | `/equipos/:nombre/empleados/:nomina` | — | Quita un integrante del equipo |
| `GET` | `/empleados/:nomina` | — | Devuelve `{ nomina, nombre }` — usado también por el punto anterior, y podría reusarse en otras partes a futuro |

**Cambio importante respecto a la versión anterior de este documento:** el
equipo **ya NO lleva `gerenteNombre`/`gerenteEmail`** — el gerente ahora
se administra por departamento (ver 4.2), no por equipo, porque un
departamento puede tener varios Equipos Lean y el mismo gerente los ve/
aprueba todos.

Nota de UX importante: al agregar un integrante, el admin ya NO escribe el
nombre — solo la nómina, y el sistema busca el nombre en el catálogo de
personal. Si la nómina no existe en el catálogo, debe regresar error 404
con mensaje claro ("No se encontró ningún empleado con esa nómina").

### 4.2 Gerente por departamento (endpoints nuevos, reemplaza al gerente-por-equipo)

```
GET  /departamentos/:departamento/gerente          ->  { nombre, email }
PUT  /departamentos/:departamento/gerente   { nombre, email }  ->  { nombre, email }
```

El gerente ve y aprueba **todos** los Short Kaizen de su departamento
(todos los Equipos Lean de ese departamento), no solo los de un equipo en
particular. Te mando `departamentos_gerentes.csv` en la sección 6 con el
gerente detectado para cada uno de los 18 departamentos — dos de ellos
(Administración Productiva, Ingeniería) traen dos candidatos casi
empatados en los datos de origen, márcalos como pendientes de confirmar
con RH antes de darlos de alta como el gerente "oficial".

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
~326 personas del catálogo), forzando el cambio de contraseña en el primer
login.

Necesito que el login regrese una bandera nueva:

```json
{ "token": "...", "user": { "nomina": "...", "nombre": "...", "rol": "...", "equipo": "...", "departamento": "...", "requiereCambioPassword": true } }
```

`rol` ∈ `"solicitante" | "lider" | "gerente" | "admin"` (ya no existe
`"aprobador"`, ver sección 1.1). `departamento` es obligatorio para el rol
`gerente` (es con qué compara para decidir qué ve) y opcional para los
demás roles.

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

**Actualizado — el listado de origen cambió.** RH nos mandó una versión
nueva de `Listado de aprobación sk.xlsx` (326 personas vigentes, 18
departamentos, 38 Equipos Lean) que ya no trae la columna `TIPO` y ahora
trae 3 columnas de aprobación en vez de 2. Ya lo reprocesé y dejé 4
archivos listos en `docs/carga_masiva/` de este mismo proyecto (los 3
anteriores ya NO aplican, bórralos si los tenías importados o en
proceso):

- **`empleados_limpio.csv`** — 326 filas: nómina, nombre, departamento,
  equipo, posición (`integrante`/`lider`/`gerente`), y la cadena de
  aprobación de esa persona tal como viene en el Excel (`mc_*` — vacío en
  el 100% de las filas, ver sección 1.1 —, `aprobacion2_*`,
  `aprobacion3_*`). Estas dos últimas son la cadena personal de cada
  empleado (a quién le llega SU kaizen) — **no uses estas columnas para
  inferir quién es el líder de un equipo o el gerente de un departamento**
  (ver el porqué justo abajo).
- **`equipos_limpio.csv`** — 38 filas: nombre de equipo, departamento,
  líder (nombre + correo) y número de integrantes. El líder de cada
  equipo se calculó por **voto de mayoría** entre los `Aprobación 2` de
  sus integrantes (no tomando la fila marcada como "Líder" directamente,
  porque la cadena de aprobación de un líder es la de él como
  solicitante — a veces apunta a su propio jefe, no sirve para inferir a
  quién le reportan los demás). 3 equipos tuvieron más de un candidato —
  quedaron marcados en `issues_a_revisar.csv`.
- **`departamentos_gerentes.csv`** (nuevo, reemplaza al gerente-por-equipo
  de la versión anterior) — 18 filas: departamento, gerente (nombre +
  correo), calculado igual por voto de mayoría entre los `Aprobación 3` de
  los integrantes/líderes de ese departamento. 2 departamentos
  (Administración Productiva, Ingeniería) tuvieron dos candidatos casi
  empatados — quedaron marcados como pendientes de confirmar con RH.
- **`issues_a_revisar.csv`** — 54 observaciones encontradas al limpiar los
  datos, **antes de cargarlos**: 48 personas sin Equipo Lean asignado
  (posiciones administrativas/gerenciales sueltas, parece normal pero
  vale la pena que RH lo confirme), 3 equipos y 2 departamentos con más
  de un candidato a líder/gerente por voto de mayoría, y un caso de un
  mismo equipo capturado dos veces con distinta mayúscula/minúscula
  ("Los Jefes" / "los jefes" en Conversión — probable duplicado de
  captura).

**Recomendación de proceso** (lo puede hacer Javier o tú, no requiere
programar):
1. Revisar `issues_a_revisar.csv` primero y decidir si algo hay que
   corregir en el Excel original o en el CSV limpio — en particular,
   confirmar con RH el gerente vigente de Administración Productiva e
   Ingeniería antes de darlos de alta.
2. Crear en Supabase las tablas `departamentos`, `equipos`, `empleados` y
   la nueva `departamentos_gerentes` (o una columna `gerente_id` directo
   en `departamentos`, como prefieras modelarlo) si no existen ya con esa
   forma.
3. Cargar `equipos_limpio.csv` y `departamentos_gerentes.csv` primero
   (Supabase → Table Editor → botón "Insert" → "Import data from CSV"
   funciona directo, sin escribir SQL).
4. Cargar `empleados_limpio.csv` después, mapeando su columna `equipo` al
   `equipo_id` correspondiente (si tu tabla usa IDs numéricos en vez del
   nombre como llave, dime y te regreso los CSV ya mapeados a esos IDs en
   vez del nombre de equipo).
5. Para las contraseñas iniciales (sección 5): esa parte sí necesita un
   script de tu lado (no se puede hacer desde el importador de CSV,
   porque hay que generar el hash de cada contraseña) — puedo ayudarte a
   escribir ese script una vez que confirmes el esquema exacto de tu tabla
   de usuarios/auth en Supabase.

Si prefieres que te pase estos 4 CSV directo por otro canal en vez de
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
| `POST` | `/equipos` | **nuevo** — ya sin `gerenteNombre`/`gerenteEmail` |
| `PUT` | `/equipos/:nombre` | **nuevo** — ya sin `gerenteNombre`/`gerenteEmail` |
| `DELETE` | `/equipos/:nombre` | **nuevo** |
| `POST` | `/equipos/:nombre/empleados` | **nuevo** |
| `DELETE` | `/equipos/:nombre/empleados/:nomina` | **nuevo** |
| `GET` | `/empleados/:nomina` | **nuevo** |
| `GET` | `/departamentos/:departamento/gerente` | **nuevo** (sección 4.2) |
| `PUT` | `/departamentos/:departamento/gerente` | **nuevo** (sección 4.2) |

Todo lo demás de tu backend actual (autenticación real, filtrado de
equipos ajenos, protección contra fuerza bruta, fotos/firmas en storage
privado, correo restringido a un solo buzón) sigue aplicando igual — nada
de esto lo cambia.

Cualquier duda sobre algún punto, dímelo directo y lo aclaramos antes de
que empieces a construir, para no ir y venir después.
