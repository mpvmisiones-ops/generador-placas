# Generador de Placas

Arma placas informativas (1080 × 1350) para 10 medios + placa neutra a partir del punteo diario.
Las placas se componen por código en el navegador (canvas): foto + capa PNG del medio + título.

- Sitio: https://mpvmisiones-ops.github.io/generador-placas/
- Backend: Supabase (login, roles, plantillas, historial).

## Estructura
- `index.html`, `css/`, `js/` — la web (sin compilar, se publica tal cual en GitHub Pages).
- `js/placas.js` — motor: lee el punteo, reparte títulos/fotos y arma cada placa en canvas.
- `js/generar.js` / `js/plantillas.js` — pestañas Generar placas y Plantillas.
- `js/config.js` — dirección y clave **pública** de Supabase (nunca claves secretas).
- `supabase/esquema.sql` — tablas, permisos (RLS) y datos iniciales de los medios.
- `supabase/functions/admin-usuarios/` — función del servidor para crear/pausar usuarios y cambiar contraseñas.
- `docs/guia-supabase.md` — cómo conectar Supabase paso a paso.
- `docs/medidas-canva.md` — medidas y tipografías tomadas del diseño en Canva.

## Cómo funciona el motor (Etapa 2)
- **Punteo:** las noticias se separan con `///`; los títulos van entre `*asteriscos*`. Si una noticia no tiene asteriscos se usa su primera línea.
- **Reparto:** cada medio en rotación recibe una combinación título + foto por noticia; se equilibra el uso y dos medios seguidos no repiten título ni foto. "Volver a mezclar" cambia el reparto.
- **Placa:** fondo → foto recortada a su zona (tipo "cover") → capa PNG del medio → título. Si el título no entra, la letra se achica hasta 55 % y, si aun así no entra, la placa se marca en rojo.
- **Capas:** `capas/<medio>.png` (1080×1350, zona de foto transparente). Si el admin sube otra desde Plantillas (Supabase Storage), tiene prioridad. Si ninguna carga, se dibuja un boceto.
- Las capas se armaron con `herramientas/armar_capas.py` a partir de 3 exportaciones gratuitas de Canva (fondo original, negro y blanco). Las 7 texturas prémium del Canva se redibujaron con código (parecidas, no idénticas).
- **Oak Sans** (Interesante) se reemplaza por Plus Jakarta Sans hasta que se suba el archivo de la tipografía.
- **ZIP:** una carpeta por medio, JPG 1080×1350. Al descargar se guarda el historial (solo textos).

## Pantalla del productor (Etapa 3)
Pensada primero para el celular: un paso por vez, con los botones principales fijos abajo.
1. **Punteo:** se pega el mensaje (botón "Pegar" o mantener apretado el cuadro) y se ve cuántas noticias y títulos encontró.
2. **Fotos:** una tarjeta por noticia con su botón "＋ Fotos"; "Armar placas" se habilita cuando todas tienen al menos una.
3. **Revisar:** placas agrupadas por noticia. **Tocar una placa** abre el editor a pantalla completa: elegir otro título del punteo, escribir uno propio, elegir otra foto o subir una nueva, con vista previa en vivo; "‹ ›" pasan a la placa vecina y "Guardar esta placa" la comparte o descarga sola.
- Las placas cambiadas a mano se marcan "Cambiada" y **"Volver a mezclar" las respeta** (solo re-reparte las demás). "Volver a la original" deshace el cambio.
- Si un título no entra, la placa se marca en rojo y aparece un aviso con el botón "Corregir".
- El botón "atrás" del celular vuelve al paso anterior o cierra el editor; si hay fotos cargadas, el navegador pide confirmar antes de salir de la página.
- El historial guarda también los textos propios (`texto`) y qué placas se cambiaron a mano (`a_mano`).
