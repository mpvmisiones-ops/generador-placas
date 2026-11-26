// Generador de Placas · publicar en Facebook.
// Quien tiene permiso (admin o usuario habilitado por el admin) conecta su Facebook y publica o programa
// las placas en las páginas que administra. El token de Facebook vive SOLO en la memoria de esta pestaña:
// no se guarda en la base ni en el navegador. En la base solo queda qué página corresponde a cada medio.
(() => {
  const VERSION = "v26.0", GRAPH = `https://graph.facebook.com/${VERSION}`;
  const PERMISOS = "pages_show_list,pages_manage_posts,pages_read_engagement"; // business_management: opcional (portfolios)
  const MIN_PROG = 11 * 60e3, MAX_PROG = 29 * 864e5; // Facebook: entre 10 minutos y 30 días
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  let conectado = false;
  let cuenta = null;          // { token, vence, nombre }
  let paginas = [];           // [{ id, name, access_token }]
  let asignadas = new Map();  // medio_id → { pagina_id, pagina_nombre }
  let filas = [];             // una por placa: { pl, i, medio, sel, cuando: Date|null, estado, mal }
  let textos = [];            // texto de la publicación por noticia
  let modo = "auto";          // auto (escalonado) | ahora (la primera ya, el resto escalonado) | elegir
  let variar = false, nVar = 9, semillaCopy = 0;
  let tipoPub = "foto";       // foto (placa fija) | reel (video vertical) | video (video en el feed)
  const NOMBRE_TIPO = { foto: "placa", reel: "Reel", video: "video" };
  let copies = [];            // por noticia: [{ texto, editado }] (opciones de copy)
  let publicando = false;

  const config = () => window.CONFIG || {};
  const conectada = () => !!cuenta && Date.now() < cuenta.vence - 60e3;
  const G = () => window.Generar.estado;
  const puede = () => !!window.perfil?.activo && (window.perfil.rol === "admin" || !!window.perfil.puede_publicar);
  const paginaDe = (medio) => { const a = asignadas.get(medio); return a && (paginas.find(p => p.id === a.pagina_id) || { id: a.pagina_id, name: a.pagina_nombre, access_token: null }); };

  function nota(t, mal) { const p = $("#fb-nota"); p.textContent = t; p.classList.toggle("mal", !!mal); }

  // ---------- Abrir ----------
  async function abrir() {
    const dlg = $("#dlg-fb");
    if (!conectado) {
      dlg.addEventListener("click", alClic);
      dlg.addEventListener("change", alCambiar);
      dlg.addEventListener("input", alEscribir);
      $("#fb-medios-det").querySelector("summary").addEventListener("click", () => { $("#fb-medios-det").dataset.tocado = "1"; });
      // Al pegar un bloque de copys, se separa solo.
      dlg.addEventListener("paste", (e) => {
        const t = e.target.closest?.("[data-pegar]"); if (!t) return;
        setTimeout(() => { if (t.value.trim()) aplicarPegado(+t.dataset.pegar, t.value); }, 0);
      });
      window.addEventListener("popstate", () => { if (dlg.open && !publicando) dlg.close(); });
      conectado = true;
    }
    const g = G();
    const cuerpos = window.Placas.leerPunteo($("#g-punteo").value).map(n => n.cuerpo || "");
    // Misma tanda que la vez anterior: se conservan textos y copys (pegados o editados).
    const misma = filas.length > 0 && filas[0].pl === g.placas[0] && filas.length === g.placas.length;
    const antes = new Map(filas.map(f => [f.pl, f]));
    textos = g.noticias.map((n, k) => misma && textos[k] ? textos[k] : (cuerpos[k] || n.titulos[0] || ""));
    // Lo ya publicado queda anotado en la placa (y en el historial): sale desmarcado para no repetirlo.
    filas = g.placas.map((pl, i) => ({ pl, i, medio: pl.medio, sel: !pl.facebook, cuando: null, estado: pl.facebook ? textoHecho(pl.facebook) : "", mal: false,
      variante: misma ? antes.get(pl)?.variante ?? null : null, varManual: misma ? !!antes.get(pl)?.varManual : false }));
    if (!misma) copies = [];
    nota("");
    dlg.showModal();
    pintar();
    try {
      const { data, error } = await window.sb.from("facebook_paginas").select("medio_id, pagina_id, pagina_nombre");
      if (error) throw error;
      asignadas = new Map(data.map(a => [a.medio_id, a]));
    } catch (e) { nota("No se pudieron leer las páginas de cada medio: " + e.message, true); }
    reajustar();
  }

  // ---------- Conectar con Facebook (ventana de Facebook → fb.html → esta pestaña) ----------
  function conectar() {
    const c = config();
    if (!c.META_APP_ID) return nota("Falta configurar la app de Meta (META_APP_ID en js/config.js).", true);
    const estadoOAuth = crypto.randomUUID();
    const vuelta = new URL("fb.html", location.origin + location.pathname).href;
    const u = new URL(`https://www.facebook.com/${VERSION}/dialog/oauth`);
    u.searchParams.set("client_id", c.META_APP_ID);
    u.searchParams.set("redirect_uri", vuelta);
    u.searchParams.set("response_type", "token");
    u.searchParams.set("state", estadoOAuth);
    if (c.META_CONFIG_ID) u.searchParams.set("config_id", c.META_CONFIG_ID); else u.searchParams.set("scope", PERMISOS + ",business_management");
    u.searchParams.set("auth_type", "rerequest"); // vuelve a preguntar lo que no se dio (páginas, portfolios)
    const canal = new BroadcastChannel("placas-fb");
    const ventana = window.open(u.href, "placas-fb", "width=620,height=720");
    if (!ventana) { canal.close(); return nota("El navegador bloqueó la ventana de Facebook. Permití las ventanas emergentes para este sitio.", true); }
    nota("Esperando a Facebook…");
    const limite = setTimeout(() => { canal.close(); if (!cuenta) nota("No llegó la respuesta de Facebook. Probá de nuevo.", true); }, 10 * 60e3);
    canal.onmessage = async (e) => {
      const r = new URLSearchParams(String(e.data?.hash || "").replace(/^#/, ""));
      if (e.data?.tipo !== "fb-retorno" || r.get("state") !== estadoOAuth) return; // no es la respuesta a este pedido
      clearTimeout(limite); canal.close();
      if (r.get("error")) return nota(r.get("error_reason") === "user_denied" ? "Cancelaste la conexión con Facebook." : "Facebook no dio permiso: " + (r.get("error_description") || r.get("error")), true);
      const token = r.get("access_token");
      if (!token) return nota("Facebook no devolvió el permiso. Probá de nuevo.", true);
      cuenta = { token, vence: Date.now() + (+r.get("expires_in") || 3600) * 1000, nombre: "" };
      await cargarPaginas();
    };
  }

  async function graph(ruta, token, opciones) {
    const url = new URL(GRAPH + ruta);
    let r;
    if (opciones?.body) { opciones.body.append("access_token", token); r = await fetch(url, { method: "POST", body: opciones.body }); }
    else { url.searchParams.set("access_token", token); r = await fetch(url); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      const e = new Error(j.error?.error_user_msg || j.error?.message || `Facebook respondió ${r.status}`);
      e.codigo = j.error?.code; throw e;
    }
    return j;
  }

  // Páginas donde puede publicar: las personales (/me/accounts) y las de cada portfolio comercial
  // (propias y de clientes). Si una página llega sin permiso de publicación, se pide aparte.
  async function listar(ruta, token) {
    const todo = [];
    while (ruta) {
      const r = await graph(ruta, token);
      todo.push(...(r.data || []));
      ruta = r.paging?.next ? r.paging.next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+/, "").replace(/&?access_token=[^&]*/, "") : null;
    }
    return todo;
  }
  async function cargarPaginas() {
    nota("Leyendo tus páginas y portfolios…");
    try {
      const yo = await graph("/me?fields=name", cuenta.token);
      cuenta.nombre = yo.name || "";
      const permisos = await graph("/me/permissions", cuenta.token);
      const dado = (p) => permisos.data?.some(x => x.permission === p && x.status === "granted");
      const faltan = PERMISOS.split(",").filter(p => !dado(p));
      const porId = new Map();
      const sumar = (p, origen) => { if (p?.id && !porId.has(p.id)) porId.set(p.id, { id: p.id, name: p.name || p.id, access_token: p.access_token || null, tasks: p.tasks, origen }); };
      (await listar("/me/accounts?fields=id,name,access_token,tasks&limit=100", cuenta.token)).forEach(p => sumar(p, "Tus páginas"));
      cuenta.portfolios = [];
      if (dado("business_management")) {
        const negocios = await listar("/me/businesses?fields=id,name&limit=100", cuenta.token).catch(() => []);
        for (const b of negocios) {
          let n = 0;
          for (const edge of ["owned_pages", "client_pages"]) {
            try {
              const ps = await listar(`/${b.id}/${edge}?fields=id,name,access_token&limit=100`, cuenta.token);
              ps.forEach(p => { if (!porId.has(p.id)) n++; sumar(p, b.name); });
            } catch (e) { console.warn("[facebook]", b.name, edge, e.message); }
          }
          cuenta.portfolios.push({ nombre: b.name, paginas: n });
        }
      }
      // Las que llegaron sin permiso de página: se pide directo (funciona si tiene una tarea asignada en ella).
      for (const p of porId.values()) {
        if (p.access_token) continue;
        try { p.access_token = (await graph(`/${p.id}?fields=access_token`, cuenta.token)).access_token || null; } catch {}
      }
      const todas = [...porId.values()];
      paginas = todas.filter(p => p.access_token && (!p.tasks || p.tasks.includes("CREATE_CONTENT")));
      cuenta.sinPermiso = todas.length - paginas.length;
      paginas.sort((a, b) => a.origen.localeCompare(b.origen, "es") || a.name.localeCompare(b.name, "es"));
      const avisos = [];
      if (faltan.length) avisos.push(`Facebook no dio estos permisos: ${faltan.join(", ")}. Tocá "Volver a conectar" y aceptá todo.`);
      if (!dado("business_management")) avisos.push('No diste acceso a tus portfolios comerciales: si tus páginas están en un portfolio, tocá "Volver a conectar" y elegilos.');
      if (cuenta.sinPermiso) avisos.push(`${plural(cuenta.sinPermiso, "página no deja", "páginas no dejan")} publicar con tu usuario (pedí que te den permiso de contenido).`);
      nota(avisos.length ? avisos.join(" ") : `Listo: ${plural(paginas.length, "página", "páginas")} donde podés publicar.`, !!avisos.length || !paginas.length);
    } catch (e) { cuenta = null; nota("No se pudieron leer tus páginas: " + e.message, true); }
    pintar();
  }

  // ---------- Página de cada medio (queda guardada para todos) ----------
  async function asignar(medio, paginaId) {
    const p = paginas.find(x => x.id === paginaId);
    const { error } = p
      ? await window.sb.from("facebook_paginas").upsert({ medio_id: medio, pagina_id: p.id, pagina_nombre: p.name })
      : await window.sb.from("facebook_paginas").delete().eq("medio_id", medio);
    if (error) { nota("No se pudo guardar la página: " + error.message, true); pintar(); return; }
    if (p) asignadas.set(medio, { medio_id: medio, pagina_id: p.id, pagina_nombre: p.name }); else asignadas.delete(medio);
    pintar();
  }

  // ---------- Horarios ----------
  const aLocal = (d) => { if (!d) return ""; const z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4); return z.toISOString().slice(0, 16); };
  const hora = (d) => d.toLocaleString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const textoHecho = (fb) => (fb.estado === "programada" ? "Ya programada ✓ para " + hora(new Date(fb.cuando)) : "Ya publicada ✓ " + hora(new Date(fb.cuando))) + (fb.tipo && fb.tipo !== "foto" ? ` (${NOMBRE_TIPO[fb.tipo]})` : "") + (fb.pagina ? " · " + fb.pagina : "");
  function inicioSugerido() { const d = new Date(Date.now() + 15 * 60e3); d.setSeconds(0, 0); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5); return d; }
  // Escalonado (para que Facebook no lo tome como una red publicando en bloque):
  // · las páginas se turnan (una placa de cada página por vuelta, nunca todas juntas);
  // · entre dos publicaciones cualesquiera pasan al menos unos minutos (el intervalo repartido entre las páginas);
  // · una misma página espera el intervalo completo entre sus publicaciones;
  // · a todo se le suma un poco de azar, para que no salgan "en punto".
  const enCola = () => filas.filter(f => f.sel && paginaDe(f.medio));
  function cola() {
    const porPagina = new Map();
    enCola().forEach(f => { const id = paginaDe(f.medio).id; if (!porPagina.has(id)) porPagina.set(id, []); porPagina.get(id).push(f); });
    const grupos = [...porPagina.values()], q = [];
    for (let i = 0; grupos.some(g => g[i]); i++) grupos.forEach(g => g[i] && q.push(g[i]));
    return { q, nPag: grupos.length };
  }
  const ajustes = () => {
    const cada = Math.max(15, Math.min(720, +$("#fb-cada").value || 30));
    return { cada, vari: Math.max(0, Math.min(cada / 3, +$("#fb-vari").value || 0)) };
  };
  function repartir(silencioso) {
    const { cada, vari } = ajustes();
    const { q, nPag } = cola();
    if (!q.length) { if (!silencioso) nota("Elegí placas con página asignada.", true); pintar(); return; }
    const ahora = modo === "ahora";
    let desde = ahora ? new Date() : new Date($("#fb-desde").value || aLocal(inicioSugerido()));
    if (isNaN(desde)) desde = inicioSugerido();
    const hueco = Math.max(4, cada / Math.max(1, nPag)); // minutos mínimos entre dos publicaciones cualesquiera
    let ultimo = null; const ultimoPag = new Map();
    q.forEach((f, i) => {
      const id = paginaDe(f.medio).id;
      if (ahora && i === 0) { f.cuando = null; ultimo = Date.now(); ultimoPag.set(id, ultimo); return; }
      let t = ultimo == null ? desde.getTime() : ultimo + hueco * 60e3;
      if (ultimoPag.has(id)) t = Math.max(t, ultimoPag.get(id) + cada * 60e3);
      t += Math.random() * vari * 60e3;
      t = Math.max(t, Date.now() + MIN_PROG);
      const d = new Date(t); d.setSeconds(0, 0);
      f.cuando = d; ultimo = d.getTime(); ultimoPag.set(id, ultimo);
    });
    const fechas = q.map(f => f.cuando).filter(Boolean);
    const nombres = [...new Set(q.map(f => paginaDe(f.medio).name))];
    const muchas = nombres.map(n => [n, q.filter(f => paginaDe(f.medio).name === n).length]).filter(([, c]) => c > (tipoPub === "reel" ? 30 : 6));
    if (!silencioso || muchas.length) nota(
      (fechas.length ? `${ahora ? "La primera sale ya; " : ""}${plural(fechas.length, "publicación programada", "publicaciones programadas")} entre ${hora(new Date(Math.min(...fechas)))} y ${hora(new Date(Math.max(...fechas)))}. ` : "Sale ya. ") +
      `Al menos ${Math.round(hueco)} min entre páginas y ${cada} min en la misma página.` +
      (muchas.length ? ` Ojo: ${muchas.map(([n, c]) => `${n} recibe ${c}`).join(", ")}; muchas en el día pueden bajar el alcance.` : ""), !!muchas.length);
    pintar();
  }
  // Recalcula solo cuando el reparto es automático (con "Elijo la hora" se respeta lo elegido).
  function reajustar() { asignarVariantes(); if (modo === "elegir") pintar(); else repartir(true); }
  // Horarios elegidos a mano: avisa si quedaron muy juntos.
  function muyJuntos(lista) {
    const ord = [...lista].sort((a, b) => a.cuando - b.cuando), mal = [];
    for (let i = 1; i < ord.length; i++) if (ord[i].cuando - ord[i - 1].cuando < 2 * 60e3) { mal.push("hay publicaciones con menos de 2 minutos de diferencia"); break; }
    const porPag = new Map(); ord.forEach(f => { const id = paginaDe(f.medio).id; if (!porPag.has(id)) porPag.set(id, []); porPag.get(id).push(f); });
    for (const fs of porPag.values()) for (let i = 1; i < fs.length; i++) if (fs[i].cuando - fs[i - 1].cuando < 15 * 60e3) { mal.push(`${paginaDe(fs[i].medio).name} tiene dos con menos de 15 minutos`); return mal; }
    return mal;
  }

  // ---------- Opciones de copy (hasta 9 por noticia) ----------
  // Cada variante combina el texto de la noticia con un título distinto y otra forma de arrancar o cerrar.
  // Se pueden editar; las editadas no se pisan al cambiar el texto base ni al pedir otras opciones.
  const EMOJIS = ["🔴", "📰", "📢", "👉", "⚡", "📌", "🗞️", "ℹ️", "🟠"];
  function armarCopies(k) {
    const n = G().noticias[k], Ts = n.titulos.length ? n.titulos : [""];
    const T = (i) => Ts[i % Ts.length], e = (i) => EMOJIS[(i + semillaCopy) % EMOJIS.length];
    const cuerpo = (textos[k] || "").trim() || T(0);
    const formas = [
      () => cuerpo,
      () => `${e(0)} ${T(0)}\n\n${cuerpo}`,
      () => `${T(1)}\n\n${cuerpo}`,
      () => `${e(1)} ${cuerpo}`,
      () => `${cuerpo}\n\n${e(2)} ${T(2)}`,
      () => `${T(0)} ${e(3)}\n\n${cuerpo}`,
      () => `${e(4)} ${T(1)}\n${cuerpo}`,
      () => `${e(5)} ${T(2)} ${e(5)}\n\n${cuerpo}`,
      () => `${cuerpo}\n\n${e(6)} ${T(0)}`,
    ];
    const viejas = copies[k] || [];
    copies[k] = Array.from({ length: nVar }, (_, j) =>
      viejas[j]?.editado ? viejas[j] : { texto: formas[(j + semillaCopy) % formas.length]().trim(), editado: false });
  }
  // Reparte las variantes entre las placas de cada noticia (una distinta por página, en ronda).
  function asignarVariantes() {
    if (!variar) return;
    G().noticias.forEach((n, k) => {
      if (!copies[k] || (!copies[k].pegado && copies[k].length !== nVar)) armarCopies(k);
      const total = copies[k].length;
      let j = 0;
      filas.filter(f => f.pl.noticia === k && paginaDe(f.medio)).forEach(f => {
        if (f.varManual && f.variante < total) return;
        f.variante = j++ % total;
      });
    });
  }
  // Bloque de copys pegado (por ejemplo, el que arma ChatGPT): se separa por los números del principio
  // de cada copy (1. 1) 1- 1: "Copy 1" "Opción 1" 1️⃣) y se les saca el número. Los números tienen que
  // ir en orden, así un renglón como "38 grados el sábado" no se confunde con un número de copy.
  function separarCopys(texto) {
    const lineas = String(texto || "").replace(/\r/g, "").split("\n");
    const marca = /^\s*[*_#>•\-\s]*(?:(?:copy|opci[oó]n|variante|texto)\s*(\d{1,2})\s*[.):\-–—]?|(\d{1,2})\s*[.):\-–—]|(\d{1,2})\uFE0F?\u20E3)\s*[*_]*\s*/i;
    const items = [];
    let actual = null, esperado = null;
    for (const l of lineas) {
      const m = l.match(marca), num = m ? +(m[1] || m[2] || m[3]) : null;
      if (m && (esperado === null || num === esperado)) {
        if (actual) items.push(actual);
        actual = [l.slice(m[0].length)];
        esperado = num + 1;
      } else if (actual) actual.push(l);
    }
    if (actual) items.push(actual);
    let lista = items.map(ls => ls.join("\n"));
    if (!lista.length) lista = String(texto || "").split(/\n\s*\n/); // sin números: un copy por párrafo
    return lista.map(t => t.trim().replace(/^\*\*(.*)\*\*$/s, "$1").replace(/^["“«](.*)["”»]$/s, "$1").trim()).filter(Boolean);
  }
  function aplicarPegado(k, texto) {
    let lista = separarCopys(texto);
    if (!lista.length) return nota("No encontré copys en lo que pegaste.", true);
    const sobran = lista.length > 9 ? lista.length - 9 : 0;
    lista = lista.slice(0, 9);
    copies[k] = lista.map(t => ({ texto: t, editado: true }));
    copies[k].pegado = true;
    variar = true;
    filas.forEach(f => { if (f.pl.noticia === k) f.varManual = false; });
    asignarVariantes(); pintar();
    nota(`Noticia ${k + 1}: ${plural(lista.length, "copy cargado", "copys cargados")} y repartidos entre las páginas.${sobran ? ` Se usaron los primeros 9 (sobraban ${sobran}).` : ""}`, !!sobran);
  }
  const textoDe = (f) => variar ? (copies[f.pl.noticia]?.[f.variante ?? 0]?.texto ?? textos[f.pl.noticia]) : textos[f.pl.noticia];

  // ---------- Publicar ----------
  // Antes de publicar se relee la tanda de la base: si otra persona ya publicó alguna de estas placas
  // (por noticia y medio), se marca y se saca de la lista para no repetirla.
  async function marcasFrescas() {
    const g = G(); if (!g.historialId || !window.sb) return 0;
    const { data, error } = await window.sb.from("historial").select("resultado").eq("id", g.historialId).maybeSingle();
    if (error || !data) return 0;
    const ya = new Map((data.resultado?.placas || []).filter(p => p?.facebook).map(p => [p.noticia + "|" + p.medio, p.facebook]));
    let nuevas = 0;
    filas.forEach(f => {
      const m = ya.get(f.pl.noticia + "|" + f.pl.medio);
      if (m && !f.pl.facebook) { f.pl.facebook = m; f.sel = false; f.estado = textoHecho(m); nuevas++; }
    });
    return nuevas;
  }
  // ---------- Subidas ----------
  const cuandoSeg = (f) => String(Math.floor(f.cuando.getTime() / 1000));
  async function subirFoto(pag, f, texto) {
    const fd = new FormData();
    fd.append("source", f.pl.blob, "placa.jpg");
    if (texto) fd.append("message", texto);
    if (!f.cuando) fd.append("published", "true");
    else { fd.append("published", "false"); fd.append("scheduled_publish_time", cuandoSeg(f)); fd.append("unpublished_content_type", "SCHEDULED"); }
    await graph(`/${pag.id}/photos`, pag.access_token, { body: fd });
  }
  // Video de la placa: se arma en el momento (o se reusa si ya estaba hecho con las mismas opciones).
  const opcionesVideo = () => ({
    formato: tipoPub === "reel" ? $("#fb-vformato").value : "placa",
    estilo: $("#fb-vestilo").value, duracion: +$("#fb-vdur").value || 8,
  });
  async function videoDe(pl) {
    const op = opcionesVideo(), g = G();
    const v = pl.video;
    if (v && v.formato === op.formato && v.estilo === op.estilo && v.duracion === op.duracion && v.ext === "mp4") return v.blob;
    const medio = g.medios.find(m => m.id === pl.medio);
    const foto = g.noticias[pl.noticia]?.fotos.find(x => x.id === pl.fotoId)?.bmp;
    const titulo = pl.texto ?? g.noticias[pl.noticia].titulos[pl.titulo];
    const r = await window.Videos.codificar(window.Placas.prepararAnimacion({ medio, foto, titulo, ajuste: pl.ajuste, ...op }));
    if (r.ext !== "mp4") throw new Error("este navegador no puede armar MP4 (probá con Chrome o Edge actualizados)");
    pl.video = { blob: r.blob, ext: r.ext, ...op };
    return r.blob;
  }
  async function subirVideo(pag, f, texto, video) {
    const fd = new FormData();
    fd.append("source", video, "placa.mp4");
    if (texto) fd.append("description", texto);
    if (!f.cuando) fd.append("published", "true");
    else { fd.append("published", "false"); fd.append("scheduled_publish_time", cuandoSeg(f)); }
    await graph(`/${pag.id}/videos`, pag.access_token, { body: fd });
  }
  // Reels: 1) se abre la subida, 2) se manda el archivo a rupload.facebook.com, 3) se publica o programa.
  async function subirReel(pag, f, texto, video) {
    const ini = new FormData(); ini.append("upload_phase", "start");
    const { video_id, upload_url } = await graph(`/${pag.id}/video_reels`, pag.access_token, { body: ini });
    let r;
    try {
      r = await fetch(upload_url || `https://rupload.facebook.com/video-upload/${VERSION}/${video_id}`, {
        method: "POST", body: video,
        headers: { Authorization: "OAuth " + pag.access_token, offset: "0", file_size: String(video.size) },
      });
    } catch { throw new Error("Facebook no dejó subir el Reel desde el navegador. Probá con «Video en el feed»."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error || j.success === false) throw new Error(j.error?.message || j.debug_info?.message || "no se pudo subir el Reel");
    const fin = new FormData();
    fin.append("upload_phase", "finish"); fin.append("video_id", video_id);
    if (texto) fin.append("description", texto);
    if (!f.cuando) fin.append("video_state", "PUBLISHED");
    else { fin.append("video_state", "SCHEDULED"); fin.append("scheduled_publish_time", cuandoSeg(f)); }
    await graph(`/${pag.id}/video_reels`, pag.access_token, { body: fin });
  }

  async function publicar() {
    if (G().soloLectura && !window.Generar.corregirAjena("Para publicar, el Generador anota en la tanda qué placas salieron (así nadie las repite).")) return;
    const otras = await marcasFrescas();
    if (otras) { pintar(); return nota(`${plural(otras, "placa ya la publicó", "placas ya las publicó")} otra persona: las saqué de la lista. Revisá y volvé a tocar Programar.`, true); }
    const lista = filas.filter(f => f.sel && paginaDe(f.medio));
    if (!lista.length) return nota("No hay placas elegidas con página asignada.", true);
    if (!cuenta || Date.now() > cuenta.vence - 60e3) { cuenta = null; pintar(); return nota("Conectá Facebook (o volvé a conectar: el permiso venció).", true); }
    if (modo !== "elegir") repartir(true); // horarios frescos (el reloj avanzó desde que se repartieron)
    const ya = lista.filter(f => !f.cuando).length; // solo la primera en "Ahora"
    if (ya > 1) return nota("Solo una placa puede salir en el momento; el resto se escalona.", true);
    if (tipoPub === "reel") { // Facebook: hasta 30 Reels por página cada 24 horas desde una app
      const porPag = {}; lista.forEach(f => { const n = paginaDe(f.medio).name; porPag[n] = (porPag[n] || 0) + 1; });
      const pasa = Object.entries(porPag).find(([, c]) => c > 30);
      if (pasa) return nota(`${pasa[0]} recibiría ${pasa[1]} Reels: Facebook permite hasta 30 por día. Destildá algunos.`, true);
    }
    const mal = lista.find(f => f.cuando && (f.cuando - Date.now() < MIN_PROG - 60e3 || f.cuando - Date.now() > MAX_PROG));
    if (mal) return nota(`Revisá el horario de ${window.Generar.estado.medios.find(m => m.id === mal.medio)?.nombre} (noticia ${mal.pl.noticia + 1}): tiene que ser entre 10 minutos y 29 días desde ahora.`, true);
    if (modo === "elegir") {
      const juntos = muyJuntos(lista);
      if (juntos.length && confirm(`Ojo: ${juntos.join(" y ")}. Publicar tan seguido puede hacer que Facebook baje el alcance o lo tome como spam.\n\n¿Los acomodo automáticamente a partir del primer horario?`)) {
        const primero = new Date(Math.min(...lista.map(f => f.cuando)));
        $("#fb-desde").value = aLocal(primero); modo = "auto"; repartir();
        return nota("Acomodé los horarios en modo Automático. Revisalos y tocá Programar.");
      }
    }
    const vacio = lista.find(f => !textoDe(f)?.trim());
    if (vacio && !confirm(`La noticia ${vacio.pl.noticia + 1} no tiene texto. ¿Publicar solo con la imagen?`)) return;
    const como = tipoPub === "foto" ? "" : ` como ${tipoPub === "reel" ? "Reels" : "videos"} (se arman los videos ahora)`;
    if (!confirm((ya ? `¿Publicar 1 AHORA y programar ${lista.length - 1} escalonadas en Facebook` : `¿Programar ${plural(lista.length, "publicación", "publicaciones")} escalonadas en Facebook`) + como + "?")) return;
    publicando = true; pintar();
    let ok = 0;
    try {
    await Promise.all(lista.map(f => f.pl.redibujo));
    for (const f of lista) {
      const pag = paginaDe(f.medio);
      f.estado = tipoPub === "foto" ? "Subiendo…" : "Armando el video…"; f.mal = false; pintarEstado(f);
      try {
        if (!pag.access_token) throw new Error("Tu Facebook no administra la página " + pag.name + ".");
        const texto = textoDe(f)?.trim();
        if (tipoPub === "foto") await subirFoto(pag, f, texto);
        else {
          const video = await videoDe(f.pl);
          f.estado = "Subiendo el video…"; pintarEstado(f);
          if (tipoPub === "video") await subirVideo(pag, f, texto, video);
          else await subirReel(pag, f, texto, video);
        }
        f.estado = (!f.cuando ? "Publicada ✓" : "Programada ✓ " + hora(f.cuando)) + (tipoPub === "foto" ? "" : ` (${NOMBRE_TIPO[tipoPub]})`);
        f.pl.facebook = { estado: !f.cuando ? "publicada" : "programada", cuando: (f.cuando || new Date()).toISOString(), pagina: pag.name, tipo: tipoPub };
        f.sel = false; ok++;
        window.Generar.guardarHistorial?.({ silencioso: true }); // queda anotada enseguida en la tanda
      } catch (e) {
        f.mal = true; f.estado = "Error: " + e.message;
        if (e.codigo === 190) { cuenta = null; f.estado = "Error: el permiso de Facebook venció. Volvé a conectar."; pintarEstado(f); break; }
      }
      pintarEstado(f);
      await new Promise(r => setTimeout(r, 600)); // sin apurar a Facebook
    }
    } catch (e) { nota("Se cortó la publicación: " + e.message, true); }
    finally { publicando = false; window.Generar.pintarResumen3?.(); }
    // Queda anotado en el historial (si la tanda no estaba guardada, se guarda ahora con sus fotos).
    if (ok) { try { await window.Generar.guardarHistorial?.(); } catch (e) { console.warn("[facebook] historial:", e.message); } }
    const fallas = lista.filter(f => f.mal).length;
    nota(`Listas: ${ok} de ${lista.length}.${fallas ? " Las que fallaron quedaron marcadas en rojo." : ""}`, !!fallas);
    pintar();
  }

  // ---------- Pantalla ----------
  function pintar() {
    const g = G(), c = config();
    const medios = [...new Set(g.placas.map(p => p.medio))].map(id => g.medios.find(m => m.id === id)).filter(Boolean);
    $("#fb-cuenta").innerHTML = !c.META_APP_ID
      ? '<p class="error">Falta configurar la app de Meta. El administrador tiene que seguir la guía (docs/guia-facebook.md).</p>'
      : cuenta ? `<p>Conectado como <strong>${esc(cuenta.nombre || "tu cuenta")}</strong> · ${plural(paginas.length, "página", "páginas")} <button type="button" class="btn btn-chico btn-borde" data-fb="conectar">Volver a conectar</button></p>` +
        (cuenta.portfolios?.length ? `<p class="suave fb-portfolios">Portfolios: ${cuenta.portfolios.map(b => `${esc(b.nombre)} (${b.paginas})`).join(" · ")}</p>` : "") +
        '<p class="suave fb-portfolios">¿Falta alguna página? Tocá "Volver a conectar" y, en la ventana de Facebook, elegí "Editar acceso" y marcá todos los portfolios y páginas.</p>'
      : '<button type="button" class="btn btn-fb" data-fb="conectar">Conectar con Facebook</button><p class="suave">Se abre una ventana de Facebook. Nada de tu cuenta se guarda acá: al cerrar la página hay que volver a conectar.</p>';

    $("#fb-medios").innerHTML = medios.map(m => {
      const a = asignadas.get(m.id);
      const opciones = cuenta
        ? `<select data-medio="${esc(m.id)}"${publicando ? " disabled" : ""}><option value="">— No publicar —</option>${[...new Set(paginas.map(p => p.origen))].map(o => `<optgroup label="${esc(o)}">${paginas.filter(p => p.origen === o).map(p => `<option value="${esc(p.id)}"${a?.pagina_id === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>`).join("")}${a && !paginas.some(p => p.id === a.pagina_id) ? `<option value="${esc(a.pagina_id)}" selected>${esc(a.pagina_nombre)} (no la administrás)</option>` : ""}</select>`
        : `<span class="${a ? "" : "suave"}">${a ? esc(a.pagina_nombre) : "Sin página"}</span>`;
      return `<div class="fb-medio"><strong>${esc(m.nombre)}</strong>${opciones}</div>`;
    }).join("");

    // 2) Páginas de cada medio: cuando ya están todas asignadas, se pliegan (se elige una sola vez).
    const asignadasN = medios.filter(m => asignadas.get(m.id)).length, det = $("#fb-medios-det");
    $("#fb-medios-resumen").textContent = `${asignadasN} de ${medios.length} medios con página`;
    if (!det.dataset.tocado) det.open = asignadasN < medios.filter(m => !m.es_neutra).length;
    document.querySelectorAll("#fb-modo [data-modo]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.modo === modo)));
    $("#fb-auto").hidden = modo === "elegir";
    $("#fb-desde-l").hidden = modo !== "auto";
    $("#fb-modo-ayuda").textContent = modo === "auto" ? "Recomendado: las páginas se turnan y cada una espera su intervalo, con un poco de azar. Así Facebook no lo toma como publicación en bloque."
      : modo === "ahora" ? "Sale una sola placa en el momento; el resto se programa escalonado igual que en Automático."
      : "Elegís la hora de cada placa. Si quedan muy juntas, te aviso antes de programar.";
    document.querySelectorAll("#fb-tipo [data-tipo]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tipo === tipoPub)));
    $("#fb-video-op").hidden = tipoPub === "foto";
    $("#fb-vformato-l").hidden = tipoPub !== "reel";
    $("#fb-tipo-ayuda").textContent = tipoPub === "foto" ? "Se publica la placa como imagen."
      : tipoPub === "reel" ? "Cada placa se convierte en un video vertical animado y se sube como Reel (hasta 30 por página por día). Los videos se arman en este dispositivo al publicar."
      : "Cada placa se convierte en un video 4:5 animado y se sube al feed de la página.";
    $("#fb-variar").checked = variar; $("#fb-copy-cfg").hidden = !variar; $("#fb-nvar").value = String(nVar);
    if (!$("#fb-desde").value) $("#fb-desde").value = aLocal(inicioSugerido());

    $("#fb-lista").innerHTML = g.noticias.map((n, k) => {
      const suyas = filas.filter(f => f.pl.noticia === k && paginaDe(f.medio));
      const sinPagina = filas.filter(f => f.pl.noticia === k && !paginaDe(f.medio)).map(f => g.medios.find(x => x.id === f.medio)?.nombre).filter(Boolean);
      return `<section class="fb-noticia">
        <h3>Noticia ${k + 1}: ${esc(n.titulos[0] || "")}</h3>
        <label>${variar ? "Texto base de la noticia" : "Texto de la publicación"}<textarea rows="4" data-texto="${k}"${publicando ? " disabled" : ""}>${esc(textos[k] || "")}</textarea></label>
        ${variar ? `<div class="fb-pegar"><label>📋 Pegá acá todos los copys de esta noticia, numerados (1. 2. 3.…): se separan solos
          <textarea rows="2" data-pegar="${k}" placeholder="1. Primer copy…&#10;2. Segundo copy…"${publicando ? " disabled" : ""}></textarea></label>
          <button type="button" class="btn btn-chico btn-borde" data-fb="separar" data-k="${k}">Separar copys</button></div>` : ""}
        ${variar && copies[k] ? `<details class="fb-copies"${k === 0 || copies[k].pegado ? " open" : ""}><summary>${plural(copies[k].length, "opción de copy", "opciones de copy")}${copies[k].pegado ? " pegadas" : ""} (se reparten entre las páginas)</summary>
          ${copies[k].map((c, j) => `<label class="fb-copy">Copy ${j + 1}${c.editado ? ' <span class="suave">(editado)</span>' : ""}<textarea rows="3" data-copy="${k}-${j}"${publicando ? " disabled" : ""}>${esc(c.texto)}</textarea></label>`).join("")}
        </details>` : ""}
        ${suyas.map(f => {
          const m = g.medios.find(x => x.id === f.medio), pag = paginaDe(f.medio);
          return `<div class="fb-fila${pag ? "" : " fb-sin"}" data-fila="${f.i}">
            <input type="checkbox" data-sel aria-label="Publicar la placa de ${esc(m?.nombre)}"${f.sel && pag ? " checked" : ""}${pag && !publicando ? "" : " disabled"}>
            <img src="${esc(f.pl.url || "")}" alt="">
            <div class="fb-dato"><strong>${esc(m?.nombre)}</strong><span class="suave">${pag ? "→ " + esc(pag.name) : "sin página asignada"}</span>
              ${pag && f.sel && !f.pl.facebook ? (modo === "elegir" ? `<input type="datetime-local" data-cuando value="${aLocal(f.cuando)}"${publicando ? " disabled" : ""}>`
                : `<span class="fb-cuando">${f.cuando ? "🕒 " + esc(hora(f.cuando)) : "⚡ Sale ya"}</span>`) : ""}
              ${variar && pag && f.sel ? `<select data-var aria-label="Copy de esta placa"${publicando ? " disabled" : ""}>${(copies[f.pl.noticia] || []).map((_, j) => `<option value="${j}"${f.variante === j ? " selected" : ""}>Copy ${j + 1}</option>`).join("")}</select>` : ""}
              <span class="fb-estado${f.mal ? " mal" : ""}">${esc(f.estado)}</span></div>
          </div>`;
        }).join("")}
        ${sinPagina.length ? `<p class="suave fb-sin-pagina">Sin página asignada (no se publican): ${esc(sinPagina.join(", "))}.</p>` : ""}
      </section>`;
    }).join("");

    const n = filas.filter(f => f.sel && paginaDe(f.medio)).length;
    const b = $("#fb-publicar");
    const sinConexion = !conectada();
    b.disabled = publicando || (!n && !sinConexion);
    b.classList.toggle("btn-fb", sinConexion && !publicando);
    b.textContent = publicando ? "Publicando…"
      : sinConexion ? (cuenta ? "Volver a conectar Facebook (venció el permiso)" : "Conectar Facebook para publicar")
      : !n ? "Elegí placas para publicar"
      : modo === "ahora" ? (n > 1 ? `Publicar 1 ya y escalonar ${n - 1}` : "Publicar ahora") : `Programar ${plural(n, "placa", "placas")} escalonadas`;
  }
  function pintarEstado(f) {
    const el = document.querySelector(`#fb-lista [data-fila="${f.i}"] .fb-estado`);
    if (el) { el.textContent = f.estado; el.classList.toggle("mal", f.mal); }
  }

  function alClic(e) {
    const tb = e.target.closest("[data-tipo]");
    if (tb && !publicando) { tipoPub = tb.dataset.tipo; return modo === "elegir" ? pintar() : repartir(true); }
    const b = e.target.closest("[data-fb], [data-modo]"); if (!b || publicando) return;
    if (b.dataset.modo) {
      modo = b.dataset.modo;
      if (modo === "elegir") { filas.forEach(f => { f.cuando ||= inicioSugerido(); }); nota(""); pintar(); }
      else repartir();
      return;
    }
    const acc = b.dataset.fb;
    if (acc === "cerrar") $("#dlg-fb").close();
    else if (acc === "conectar") conectar();
    else if (acc === "repartir") repartir();
    else if (acc === "separar") { const k = +b.dataset.k, t = document.querySelector(`[data-pegar="${k}"]`); aplicarPegado(k, t?.value); }
    else if (acc === "mezclar") { semillaCopy++; G().noticias.forEach((n, k) => armarCopies(k)); asignarVariantes(); pintar(); nota("Nuevas opciones de copy (las editadas a mano se mantienen)."); }
    else if (acc === "publicar") { if (conectada()) publicar(); else conectar(); }
  }
  function alCambiar(e) {
    const t = e.target;
    if (t.matches("select[data-medio]")) return asignar(t.dataset.medio, t.value).then(reajustar);
    if (t.id === "fb-variar") { variar = t.checked; copies = []; filas.forEach(f => { f.variante = null; f.varManual = false; }); asignarVariantes(); return pintar(); }
    if (t.id === "fb-nvar") { nVar = Math.max(1, Math.min(9, +t.value || 9)); filas.forEach(f => { f.varManual = false; }); copies = copies.map(c => (c?.pegado ? c : null)); asignarVariantes(); return pintar(); }
    if (t.id === "fb-cada" || t.id === "fb-vari" || t.id === "fb-desde") { if (modo !== "elegir") repartir(); return; }
    if (t.matches("[data-texto]")) { if (variar) { armarCopies(+t.dataset.texto); pintar(); } return; }
    const fila = t.closest("[data-fila]"); if (!fila) return;
    const f = filas.find(x => x.i === +fila.dataset.fila);
    if (t.matches("[data-sel]")) { f.sel = t.checked; reajustar(); }
    else if (t.matches("[data-cuando]")) { f.cuando = t.value ? new Date(t.value) : null; }
    else if (t.matches("[data-var]")) { f.variante = +t.value; f.varManual = true; }
  }
  function alEscribir(e) {
    const t = e.target;
    if (t.matches("[data-texto]")) textos[+t.dataset.texto] = t.value;
    else if (t.matches("[data-copy]")) { const [k, j] = t.dataset.copy.split("-").map(Number); if (copies[k]?.[j]) Object.assign(copies[k][j], { texto: t.value, editado: true }); }
  }

  window.Facebook = { abrir, puede };
})();
