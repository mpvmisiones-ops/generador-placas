// Configuración pública de Supabase.
// La "Publishable key" (o "anon key") está pensada para ir en el navegador: no da permisos
// por sí sola, todo lo protegen las reglas de seguridad (RLS) de la base de datos.
// NUNCA pegar acá la "secret key" ni la "service_role key".
window.CONFIG = {
  SUPABASE_URL: "PEGAR_ACA_LA_PROJECT_URL",          // ej: https://abcdefgh.supabase.co
  SUPABASE_KEY: "PEGAR_ACA_LA_PUBLISHABLE_KEY",      // ej: sb_publishable_... o eyJ...
  DOMINIO_USUARIOS: "placas.local",
};
