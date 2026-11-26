// Configuración pública de Supabase.
// La "Publishable key" (o "anon key") está pensada para ir en el navegador: no da permisos
// por sí sola, todo lo protegen las reglas de seguridad (RLS) de la base de datos.
// NUNCA pegar acá la "secret key" ni la "service_role key".
window.CONFIG = {
  SUPABASE_URL: "https://mkzxrthxgiakbfpyjmls.supabase.co",
  SUPABASE_KEY: "sb_publishable_ovl8M0AlGsPDYdB0JrBl4g_0myOdM_N",
  DOMINIO_USUARIOS: "placas.local",
  // App de Meta para publicar en Facebook (ver docs/guia-facebook.md). El App ID es público.
  // META_CONFIG_ID: solo si la app usa "Inicio de sesión con Facebook para empresas".
  META_APP_ID: "1007840828452863",
  META_CONFIG_ID: "1800950077851451",
};
