# Tablero de proyectos — Equipo ERP

Tablero para registrar y seguir los proyectos del equipo: estados, módulos, fases, mejoras, cronograma e indicadores. Es una página estática (HTML, CSS y JavaScript) publicada en GitHub Pages, con los datos y los usuarios en Supabase.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos (estándar de imagen Zubex) |
| `app.js` | Lógica del tablero, inicio de sesión y conexión con Supabase |
| `config.js` | URL del proyecto de Supabase, llave publicable y dominio interno de usuarios |

## Usuarios

- Cada persona entra con un **usuario corto** (ej. `jperez`) y su contraseña; no escribe correo.
- Solo un administrador da de alta usuarios, desde el botón **Usuarios** del tablero.
- Al crear un usuario se genera una **contraseña temporal**. La primera vez que la persona entra, el tablero le pide cambiarla y no la deja ver nada hasta hacerlo.
- Si alguien olvida su contraseña, el administrador le genera una **nueva temporal** desde el mismo panel.
- Cualquiera puede cambiar su contraseña con el botón **Contraseña**.

## Seguridad

- El repositorio **no contiene contraseñas ni llaves secretas**.
- `config.js` solo lleva la **llave publicable** de Supabase, que está diseñada para usarse en el navegador.
- Para ver o guardar datos hay que iniciar sesión, estar dado de alta en el equipo y haber cambiado la contraseña temporal. Estas reglas viven en la base de datos (RLS), no en esta página.
- La creación de usuarios y el manejo de contraseñas pasan por una función de Supabase que usa la llave de servicio del lado del servidor; esa llave nunca llega al navegador.
- El registro público de usuarios está desactivado.
- Nunca subas la llave secreta (`sb_secret_…` / `service_role`) ni la contraseña de la base de datos.

## Actualizar la página

Sube los archivos modificados al repositorio; GitHub Pages publica los cambios en uno o dos minutos.
