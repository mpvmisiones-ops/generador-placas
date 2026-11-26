// Generador de Placas · publicar en Facebook.
// Quien tiene permiso (admin o usuario habilitado por el admin) conecta su Facebook y publica o programa
// las placas en las páginas que administra. El token de Facebook vive SOLO en la memoria de esta pestaña:
// no se guarda en la base ni en el navegador. En la base solo queda qué página corresponde a cada medio.
(() => {
  const VERSION = "v26.0", GRAPH = `https://graph.facebook.com/${VERSION}`;
  const PERMISOS = "pages_show_list,pages_manage_posts,pages_read_engagement";
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
  let modo = "ahora";         // ahora | elegir | auto
  let publicando = false;
  const hechas = new WeakMap(); // placa → "Publicada" / "Programada …" (para no repetir sin querer)

  const config = () => window.CONFIG || {};
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
      window.addEventListener("popstate", () => { if (dlg.open && !publicando) dlg.close(); });
      conectado = true;
    }
    const g = G();
    const cuerpos = window.Placas.leerPunteo($("#g-punteo").value).map(n => n.cuerpo || "");
    textos = g.noticias.map((n, k) => textos[k] && filas.length && filas[0].pl === g.placas[0] ? textos[k] : (cuerpos[k] || n.titulos[0] || ""));
    filas = g.placas.map((pl, i) => ({ pl, i, medio: pl.medio, sel: !hechas.has(pl), cuando: null, estado: hechas.get(pl) || "", mal: false }));
    nota("");
    dlg.showModal();
    pintar();
    try {
      const { data, error } = await window.sb.from("facebook_paginas").select("medio_id, pagina_id, pagina_nombre");
      if (error) throw error;
      asignadas = new Map(data.map(a => [a.medio_id, a]));
    } catch (e) { nota("No se pudieron leer las páginas de cada medio: " + e.message, true); }
    pintar();
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
    if (c.META_CONFIG_ID) u.searchParams.set("config_id", c.META_CONFIG_ID); else u.searchParams.set("scope", PERMISOS);
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

  async function cargarPaginas() {
    nota("Leyendo tus páginas…");
    try {
      const yo = await graph("/me?fields=name", cuenta.token);
      cuenta.nombre = yo.name || "";
      const permisos = await graph("/me/permissions", cuenta.token);
      const faltan = PERMISOS.split(",").filter(p => !permisos.data?.some(x => x.permission === p && x.status === "granted"));
      paginas = [];
      let ruta = "/me/accounts?fields=id,name,access_token,tasks&limit=100";
      while (ruta) {
        const r = await graph(ruta, cuenta.token);
        paginas.push(...(r.data || []).filter(p => p.access_token && (!p.tasks || p.tasks.includes("CREATE_CONTENT"))));
        ruta = r.paging?.next ? r.paging.next.replace(GRAPH, "").replace(/&?access_token=[^&]*/, "") : null;
      }
      paginas.sort((a, b) => a.name.localeCompare(b.name, "es"));
      nota(faltan.length ? `Facebook no dio estos permisos: ${faltan.join(", ")}. Volvé a conectar y aceptá todo.` : `Listo: ${plural(paginas.length, "página", "páginas")} donde podés publicar.`, !!faltan.length || !paginas.length);
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
  function inicioSugerido() { const d = new Date(Date.now() + 15 * 60e3); d.setSeconds(0, 0); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5); return d; }
  // Automático: cada página recibe sus publicaciones separadas por el intervalo (con un poco de variación
  // para que no salgan todas "en punto"), y las páginas arrancan escalonadas entre sí.
  function repartir() {
    const desde = new Date($("#fb-desde").value || aLocal(inicioSugerido()));
    const cada = Math.max(5, +$("#fb-cada").value || 30), vari = Math.max(0, Math.min(cada / 2, +$("#fb-vari").value || 0));
    if (isNaN(desde)) return nota("Elegí desde qué hora.", true);
    const porPagina = new Map();
    filas.filter(f => f.sel && paginaDe(f.medio)).forEach(f => {
      const id = paginaDe(f.medio).id;
      if (!porPagina.has(id)) porPagina.set(id, []);
      porPagina.get(id).push(f);
    });
    const n = porPagina.size || 1;
    [...porPagina.values()].forEach((lista, k) => lista.forEach((f, j) => {
      const azar = vari ? (Math.random() * 2 - 1) * vari : 0;
      const t = desde.getTime() + (j * cada + k * cada / n + azar) * 60e3;
      f.cuando = new Date(Math.max(t, Date.now() + MIN_PROG));
      f.cuando.setSeconds(0, 0);
    }));
    nota("Horarios repartidos. Podés cambiar cualquiera a mano.");
    pintar();
  }

  // ---------- Publicar ----------
  async function publicar() {
    const lista = filas.filter(f => f.sel && paginaDe(f.medio));
    if (!lista.length) return nota("No hay placas elegidas con página asignada.", true);
    if (!cuenta || Date.now() > cuenta.vence - 60e3) { cuenta = null; pintar(); return nota("Conectá Facebook (o volvé a conectar: el permiso venció).", true); }
    if (modo !== "ahora") {
      const mal = lista.find(f => !f.cuando || f.cuando - Date.now() < MIN_PROG - 60e3 || f.cuando - Date.now() > MAX_PROG);
      if (mal) return nota(`Revisá el horario de ${window.Generar.estado.medios.find(m => m.id === mal.medio)?.nombre} (noticia ${mal.pl.noticia + 1}): tiene que ser entre 10 minutos y 29 días desde ahora.`, true);
    }
    const vacio = lista.find(f => !textos[f.pl.noticia]?.trim());
    if (vacio && !confirm(`La noticia ${vacio.pl.noticia + 1} no tiene texto. ¿Publicar solo con la imagen?`)) return;
    if (!confirm(modo === "ahora" ? `¿Publicar AHORA ${plural(lista.length, "placa", "placas")} en Facebook?` : `¿Programar ${plural(lista.length, "placa", "placas")} en Facebook?`)) return;
    publicando = true; pintar();
    let ok = 0;
    await Promise.all(lista.map(f => f.pl.redibujo));
    for (const f of lista) {
      const pag = paginaDe(f.medio);
      f.estado = "Subiendo…"; f.mal = false; pintarEstado(f);
      try {
        if (!pag.access_token) throw new Error("Tu Facebook no administra la página " + pag.name + ".");
        const fd = new FormData();
        fd.append("source", f.pl.blob, "placa.jpg");
        const texto = textos[f.pl.noticia]?.trim();
        if (texto) fd.append("message", texto);
        if (modo === "ahora") fd.append("published", "true");
        else {
          fd.append("published", "false");
          fd.append("scheduled_publish_time", String(Math.floor(f.cuando.getTime() / 1000)));
          fd.append("unpublished_content_type", "SCHEDULED");
        }
        await graph(`/${pag.id}/photos`, pag.access_token, { body: fd });
        f.estado = modo === "ahora" ? "Publicada ✓" : "Programada ✓ " + hora(f.cuando);
        f.sel = false; hechas.set(f.pl, f.estado); ok++;
      } catch (e) {
        f.mal = true; f.estado = "Error: " + e.message;
        if (e.codigo === 190) { cuenta = null; f.estado = "Error: el permiso de Facebook venció. Volvé a conectar."; pintarEstado(f); break; }
      }
      pintarEstado(f);
      await new Promise(r => setTimeout(r, 600)); // sin apurar a Facebook
    }
    publicando = false;
    const fallas = lista.filter(f => f.mal).length;
    nota(`${modo === "ahora" ? "Publicadas" : "Programadas"}: ${ok} de ${lista.length}.${fallas ? " Las que fallaron quedaron marcadas en rojo." : ""}`, !!fallas);
    pintar();
  }

  // ---------- Pantalla ----------
  function pintar() {
    const g = G(), c = config();
    const medios = [...new Set(g.placas.map(p => p.medio))].map(id => g.medios.find(m => m.id === id)).filter(Boolean);
    $("#fb-cuenta").innerHTML = !c.META_APP_ID
      ? '<p class="error">Falta configurar la app de Meta. El administrador tiene que seguir la guía (docs/guia-facebook.md).</p>'
      : cuenta ? `<p>Conectado como <strong>${esc(cuenta.nombre || "tu cuenta")}</strong> · ${plural(paginas.length, "página", "páginas")} <button type="button" class="btn btn-chico btn-borde" data-fb="conectar">Volver a conectar</button></p>`
      : '<button type="button" class="btn btn-fb" data-fb="conectar">Conectar con Facebook</button><p class="suave">Se abre una ventana de Facebook. Nada de tu cuenta se guarda acá: al cerrar la página hay que volver a conectar.</p>';

    $("#fb-medios").innerHTML = medios.map(m => {
      const a = asignadas.get(m.id);
      const opciones = cuenta
        ? `<select data-medio="${esc(m.id)}"${publicando ? " disabled" : ""}><option value="">— No publicar —</option>${paginas.map(p => `<option value="${esc(p.id)}"${a?.pagina_id === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}${a && !paginas.some(p => p.id === a.pagina_id) ? `<option value="${esc(a.pagina_id)}" selected>${esc(a.pagina_nombre)} (no la administrás)</option>` : ""}</select>`
        : `<span class="${a ? "" : "suave"}">${a ? esc(a.pagina_nombre) : "Sin página"}</span>`;
      return `<div class="fb-medio"><strong>${esc(m.nombre)}</strong>${opciones}</div>`;
    }).join("");

    document.querySelectorAll("#fb-modo [data-modo]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.modo === modo)));
    $("#fb-auto").hidden = modo !== "auto";
    if (!$("#fb-desde").value) $("#fb-desde").value = aLocal(inicioSugerido());

    $("#fb-lista").innerHTML = g.noticias.map((n, k) => {
      const suyas = filas.filter(f => f.pl.noticia === k && paginaDe(f.medio));
      const sinPagina = filas.filter(f => f.pl.noticia === k && !paginaDe(f.medio)).map(f => g.medios.find(x => x.id === f.medio)?.nombre).filter(Boolean);
      return `<section class="fb-noticia">
        <h3>Noticia ${k + 1}: ${esc(n.titulos[0] || "")}</h3>
        <label>Texto de la publicación<textarea rows="4" data-texto="${k}"${publicando ? " disabled" : ""}>${esc(textos[k] || "")}</textarea></label>
        ${suyas.map(f => {
          const m = g.medios.find(x => x.id === f.medio), pag = paginaDe(f.medio);
          return `<div class="fb-fila${pag ? "" : " fb-sin"}" data-fila="${f.i}">
            <input type="checkbox" data-sel aria-label="Publicar la placa de ${esc(m?.nombre)}"${f.sel && pag ? " checked" : ""}${pag && !publicando ? "" : " disabled"}>
            <img src="${esc(f.pl.url || "")}" alt="">
            <div class="fb-dato"><strong>${esc(m?.nombre)}</strong><span class="suave">${pag ? "→ " + esc(pag.name) : "sin página asignada"}</span>
              ${modo !== "ahora" && pag ? `<input type="datetime-local" data-cuando value="${aLocal(f.cuando)}"${publicando ? " disabled" : ""}>` : ""}
              <span class="fb-estado${f.mal ? " mal" : ""}">${esc(f.estado)}</span></div>
          </div>`;
        }).join("")}
        ${sinPagina.length ? `<p class="suave fb-sin-pagina">Sin página asignada (no se publican): ${esc(sinPagina.join(", "))}.</p>` : ""}
      </section>`;
    }).join("");

    const n = filas.filter(f => f.sel && paginaDe(f.medio)).length;
    const b = $("#fb-publicar");
    b.disabled = publicando || !n || !cuenta;
    b.textContent = publicando ? "Publicando…" : !n ? "Elegí placas para publicar" : `${modo === "ahora" ? "Publicar ahora" : "Programar"} ${plural(n, "placa", "placas")}`;
  }
  function pintarEstado(f) {
    const el = document.querySelector(`#fb-lista [data-fila="${f.i}"] .fb-estado`);
    if (el) { el.textContent = f.estado; el.classList.toggle("mal", f.mal); }
  }

  function alClic(e) {
    const b = e.target.closest("[data-fb], [data-modo]"); if (!b || publicando) return;
    if (b.dataset.modo) {
      modo = b.dataset.modo;
      if (modo === "elegir") filas.forEach(f => { f.cuando ||= inicioSugerido(); });
      if (modo === "auto") repartir(); else pintar();
      return;
    }
    const acc = b.dataset.fb;
    if (acc === "cerrar") $("#dlg-fb").close();
    else if (acc === "conectar") conectar();
    else if (acc === "repartir") repartir();
    else if (acc === "publicar") publicar();
  }
  function alCambiar(e) {
    const t = e.target;
    if (t.matches("select[data-medio]")) return asignar(t.dataset.medio, t.value);
    const fila = t.closest("[data-fila]"); if (!fila) return;
    const f = filas.find(x => x.i === +fila.dataset.fila);
    if (t.matches("[data-sel]")) { f.sel = t.checked; pintar(); }
    else if (t.matches("[data-cuando]")) { f.cuando = t.value ? new Date(t.value) : null; }
  }
  function alEscribir(e) { const t = e.target; if (t.matches("[data-texto]")) textos[+t.dataset.texto] = t.value; }

  window.Facebook = { abrir, puede };
})();
