# Generador de Placas

Arma placas informativas (1080 × 1350) para 10 medios + placa neutra a partir del punteo diario.
Las placas se componen por código en el navegador (canvas): foto + capa PNG del medio + título.

- Sitio: https://mpvmisiones-ops.github.io/generador-placas/
- Backend: Supabase (login, roles, plantillas, historial).

## Estructura
- `index.html`, `css/`, `js/` — la web (sin compilar, se publica tal cual en GitHub Pages).
- `js/config.js` — dirección y clave **pública** de Supabase (nunca claves secretas).
- `supabase/esquema.sql` — tablas, permisos (RLS) y datos iniciales de los medios.
- `supabase/functions/admin-usuarios/` — función del servidor para crear/pausar usuarios y cambiar contraseñas.
- `docs/guia-supabase.md` — cómo conectar Supabase paso a paso.
- `docs/medidas-canva.md` — medidas y tipografías tomadas del diseño en Canva.
