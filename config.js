/*
  Configuración del Tablero de proyectos — Equipo ERP

  Pega aquí los datos de tu proyecto de Supabase
  (Project Settings → API Keys y la Project URL).

  - supabaseUrl: la URL del proyecto, termina en .supabase.co
  - supabaseKey: la llave PUBLICABLE (empieza con sb_publishable_…) o la "anon" de las llaves legacy.
  - dominioUsuarios: dominio interno con el que se guardan los usuarios cortos.
    Debe ser igual al de la función "usuarios" en Supabase. No se envían correos a este dominio.

  La llave publicable está hecha para ir en el navegador: por sí sola no da acceso a los datos,
  porque la base exige iniciar sesión y estar dado de alta en el equipo.

  NUNCA pongas aquí la llave secreta (sb_secret_… o service_role), la contraseña de la base
  de datos ni ninguna contraseña de usuario. Si la página detecta una llave secreta, no arranca.
*/
window.TABLERO_CONFIG = {
  supabaseUrl: "https://TU-PROYECTO.supabase.co",
  supabaseKey: "TU_LLAVE_PUBLICABLE",
  dominioUsuarios: "tablero-erp.local"
};
