# Publicar en Facebook desde el Generador

**Estado (26/11/2026):** app de Meta "Generador de Placas" creada (App ID `1007840828452863`, configuración "Publicar placas" `1800950077851451`, sin portfolio comercial, en modo desarrollo). Ya está cargada en `js/config.js`.

El Generador publica o programa cada placa en la página de Facebook de su medio. Quien publica conecta su propio Facebook. La página no guarda la clave de Facebook (token): vive solo en la pestaña abierta.

## 1. Crear la app de Meta (una sola vez, la hace el administrador)

1. Entrá a https://developers.facebook.com con tu Facebook y tocá **Mis apps → Crear app**.
2. Caso de uso: **"Administrar todo en tu página"** (Manage everything on your Page). Si no aparece, elegí tipo **Empresa**.
3. Nombre: `Generador de Placas` (lo ve quien conecta). No hace falta vincular un portfolio comercial.
4. En **Personalizar caso de uso**, agregá estos permisos:
   - `pages_show_list`
   - `pages_manage_posts`
   - `pages_read_engagement`
5. En **Inicio de sesión con Facebook → Configuración**:
   - Inicio de sesión de OAuth de cliente: **Sí**
   - Inicio de sesión de OAuth web: **Sí**
   - URI de redireccionamiento de OAuth válidos: `https://mpvmisiones-ops.github.io/generador-placas/fb.html`
6. En **Configuración de la app → Básica**:
   - Dominios de la app: `mpvmisiones-ops.github.io`
   - URL de la política de privacidad: `https://mpvmisiones-ops.github.io/generador-placas/privacidad.html`
   - Copiá el **Identificador de la app** (App ID). Es público, no es una clave secreta.
7. Si la app te pide una **configuración** de "Inicio de sesión con Facebook para empresas", creala con los mismos tres permisos y copiá su **ID de configuración**.

La **clave secreta de la app** (App Secret) NO se usa y no hay que copiarla en ningún lado.

## 2. Quién puede conectar

La app queda en **modo desarrollo**. Así no hace falta la revisión de Meta, pero solo la pueden usar las personas con un rol en la app.

- En **Roles de la app → Roles**, agregá a cada persona que va a publicar (por ejemplo Gilda) como **Evaluador** (Tester) o **Desarrollador**.
- Cada una acepta la invitación desde https://developers.facebook.com/requests.
- Además, cada una tiene que ser administradora (o tener permiso de crear contenido) en las páginas donde va a publicar.

## 3. Cargar el App ID en el Generador

Se pone en `js/config.js` y se publica el sitio:

```js
META_APP_ID: "123456789012345",
META_CONFIG_ID: "",   // solo si se creó la configuración del paso 1.7
```

## 4. Habilitar a los usuarios del Generador

En **⚙ → Usuarios**, el admin toca **"Habilitar Facebook"** en cada productor que pueda publicar. Los admins pueden siempre.

## 5. Publicar

1. Armá las placas como siempre y, en el paso 3, tocá **Publicar en Facebook**.
2. Tocá **Conectar con Facebook** y aceptá los permisos. La primera vez, elegí todas las páginas.
3. Elegí la página de cada medio. Se guarda para todos, así que se hace una sola vez.
4. Elegí cuándo:
   - **Ahora**: se publica en el momento.
   - **Elijo la hora**: una fecha y hora por placa.
   - **Automático**: desde una hora, una cada X minutos por página, con una variación al azar.
5. Revisá el texto de cada noticia. Sale del punteo, sin los títulos, y se puede editar.
6. Tocá **Publicar** o **Programar**. Las programadas se ven en Meta Business Suite → Planificador, y desde ahí se pueden mover o borrar.

Facebook acepta programar entre 10 minutos y 30 días hacia adelante. El permiso de Facebook dura alrededor de una hora: si vence, el Generador pide volver a conectar.
