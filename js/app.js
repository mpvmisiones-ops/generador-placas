// Generador de Placas · login, roles, pestañas y gestión de usuarios (Etapa 1).
// El motor de placas está en js/placas.js; las pestañas Generar y Plantillas en js/generar.js y js/plantillas.js.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const C = window.CONFIG || {};

  const vistas = ["vista-config", "vista-inicio", "vista-login", "vista-panel"];
  const mostrar = (id) => { vistas.forEach(v => $("#" + v).hidden = v !== id); $("#barra").hidden = id !== "vista-panel"; };

  let avisoTimer;
  function aviso(texto, mal = false) {
    const a = $("#aviso");
    a.textContent = texto; a.classList.toggle("mal", mal); a.hidden = false;
    clearTimeout(avisoTimer); avisoTimer = setTimeout(() => a.hidden = true, 3500);
  }
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Contraseña aleatoria fácil de dictar (sin letras confusas)
  function generarPassword() {
    const abc = "abcdefghjkmnpqrstuvwxyz23456789";
    const r = crypto.getRandomValues(new Uint32Array(10));
    return [...r].map(n => abc[n % abc.length]).join("");
  }
  $$("[data-generar]").forEach(b => b.addEventListener("click", () => {
    const input = b.parentElement.querySelector("input"); input.value = generarPassword(); input.type = "text";
  }));

  // ---------- Arranque ----------
  if (!C.SUPABASE_URL || C.SUPABASE_URL.startsWith("PEGAR") || !window.supabase) { mostrar("vista-config"); return; }
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  window.sb = sb; // lo usan las próximas etapas
  let perfil = null;

  async function entrarConSesion() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const { data: hay } = await sb.rpc("hay_usuarios");
      mostrar(hay === false ? "vista-inicio" : "vista-login");
      return;
    }
    const { data, error } = await sb.from("perfiles").select("*").eq("id", session.user.id).single();
    if (error || !data) { await sb.auth.signOut(); mostrar("vista-login"); $("#login-error").textContent = "Tu usuario no tiene perfil. Avisale al administrador."; return; }
    if (!data.activo) { await sb.auth.signOut(); mostrar("vista-login"); $("#login-error").textContent = "Tu usuario está pausado. Avisale al administrador."; return; }
    perfil = data; window.perfil = data;
    $("#barra-nombre").textContent = (data.nombre || data.usuario) + (data.rol === "admin" ? " · Admin" : "");
    armarPestanas();
    mostrar("vista-panel");
  }

  // ---------- Login ----------
  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, btn = $("button[type=submit]", f), err = $("#login-error");
    err.textContent = ""; btn.disabled = true; btn.textContent = "Entrando…";
    const usuario = f.usuario.value.trim().toLowerCase();
    const { error } = await sb.auth.signInWithPassword({ email: `${usuario}@${C.DOMINIO_USUARIOS}`, password: f.password.value });
    btn.disabled = false; btn.textContent = "Entrar";
    if (error) {
      err.textContent = /banned/i.test(error.message) ? "Tu usuario está pausado. Avisale al administrador."
        : /invalid/i.test(error.message) ? "Usuario o contraseña incorrectos."
        : "No se pudo entrar: " + error.message;
      return;
    }
    f.password.value = "";
    entrarConSesion();
  });

  // ---------- Primera configuración ----------
  $("#form-inicio").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, btn = $("button[type=submit]", f), err = $("#inicio-error");
    err.textContent = "";
    if (f.password.value !== f.password2.value) { err.textContent = "Las contraseñas no coinciden."; return; }
    btn.disabled = true; btn.textContent = "Creando…";
    const usuario = f.usuario.value.trim().toLowerCase();
    const { data, error } = await sb.functions.invoke("admin-usuarios", {
      body: { accion: "inicializar", usuario, nombre: f.nombre.value, password: f.password.value },
    });
    let msg = data?.error;
    if (error) { try { msg = (await error.context.json()).error; } catch { msg = error.message; } }
    if (msg) { err.textContent = msg; btn.disabled = false; btn.textContent = "Crear administrador"; return; }
    const r = await sb.auth.signInWithPassword({ email: `${usuario}@${C.DOMINIO_USUARIOS}`, password: f.password.value });
    f.reset(); btn.disabled = false; btn.textContent = "Crear administrador";
    if (r.error) { mostrar("vista-login"); return; }
    aviso("¡Listo! Ya sos administrador.");
    entrarConSesion();
  });

  $("#btn-salir").addEventListener("click", async () => { await sb.auth.signOut(); perfil = null; mostrar("vista-login"); });

  // ---------- Pestañas ----------
  // La pantalla principal es "Generar placas". La rueda de la barra abre la configuración
  // (Usuarios, Plantillas, Historial) si sos admin; si no, ofrece entrar con un usuario admin.
  function armarPestanas() {
    const nav = $("#pestanas");
    nav.innerHTML = '<button data-tab="generar" class="pestana-volver">← Generar placas</button>' +
      [["usuarios", "Usuarios"], ["plantillas", "Plantillas"], ["historial", "Historial"]].map(([id, t]) => `<button data-tab="${id}">${t}</button>`).join("");
    $$("button", nav).forEach(b => b.addEventListener("click", () => irA(b.dataset.tab)));
    irA("generar");
  }
  $("#btn-config").addEventListener("click", () => {
    if (perfil?.rol === "admin") irA($("#btn-config").getAttribute("aria-pressed") === "true" ? "generar" : "usuarios");
    else { $("#dlg-config").returnValue = ""; $("#dlg-config").showModal(); }
  });
  $("#dlg-config").addEventListener("close", async () => {
    if ($("#dlg-config").returnValue !== "admin") return;
    await sb.auth.signOut(); perfil = null; mostrar("vista-login");
    $("#login-error").textContent = "Entrá con tu usuario administrador.";
    $("#form-login").usuario.focus();
  });
  function irA(tab) {
    const config = tab !== "generar" && perfil?.rol === "admin";
    if (!config) tab = "generar";
    $("#pestanas").hidden = !config;
    $("#btn-config").setAttribute("aria-pressed", config);
    $("#btn-config").title = config ? "Volver a generar placas" : "Configuración";
    $$("#pestanas button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
    $$(".seccion").forEach(s => s.hidden = s.dataset.seccion !== tab);
    window.scrollTo({ top: 0 });
    if (tab === "usuarios") cargarUsuarios();
    if (tab === "generar") window.Generar?.iniciar();
    if (tab === "plantillas") window.Plantillas?.iniciar();
  }

  // ---------- Usuarios (solo admin) ----------
  async function llamarAdmin(body) {
    const { data, error } = await sb.functions.invoke("admin-usuarios", { body });
    if (error) {
      let msg = error.message;
      try { msg = (await error.context.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function cargarUsuarios() {
    const ul = $("#lista-usuarios");
    try {
      const { usuarios } = await llamarAdmin({ accion: "listar" });
      ul.innerHTML = usuarios.map(u => `
        <li data-id="${u.id}" data-usuario="${esc(u.usuario)}">
          <div class="u-datos">
            <strong>${esc(u.usuario)}</strong>
            <span class="etiqueta ${u.rol === "admin" ? "etq-admin" : "etq-productor"}">${u.rol === "admin" ? "Admin" : "Productor"}</span>
            ${u.activo ? "" : '<span class="etiqueta etq-pausado">Pausado</span>'}
            <div class="suave">${esc(u.nombre) || "&nbsp;"}</div>
          </div>
          ${u.id === perfil.id ? '<span class="suave">(vos)</span>' : `
          <div class="u-acciones">
            <button class="btn btn-chico btn-borde" data-acc="password">Contraseña</button>
            <button class="btn btn-chico btn-borde" data-acc="rol" data-rol="${u.rol === "admin" ? "productor" : "admin"}">${u.rol === "admin" ? "Hacer productor" : "Hacer admin"}</button>
            <button class="btn btn-chico ${u.activo ? "btn-peligro" : "btn-borde"}" data-acc="${u.activo ? "pausar" : "reactivar"}">${u.activo ? "Pausar" : "Reactivar"}</button>
          </div>`}
        </li>`).join("") || '<li class="suave">Todavía no hay usuarios.</li>';
    } catch (e) { ul.innerHTML = `<li class="error">${esc(e.message)}</li>`; }
  }

  $("#lista-usuarios").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-acc]"); if (!b) return;
    const li = b.closest("li"), id = li.dataset.id, usuario = li.dataset.usuario, acc = b.dataset.acc;
    if (acc === "password") return abrirPassword(id, usuario);
    if (acc === "pausar" && !confirm(`¿Pausar a "${usuario}"? No va a poder entrar hasta que lo reactives.`)) return;
    b.disabled = true;
    try {
      if (acc === "rol") await llamarAdmin({ accion: "cambiar_rol", id, rol: b.dataset.rol });
      else await llamarAdmin({ accion: acc, id });
      aviso(acc === "pausar" ? "Usuario pausado." : acc === "reactivar" ? "Usuario reactivado." : "Rol actualizado.");
      cargarUsuarios();
    } catch (err) { aviso(err.message, true); b.disabled = false; }
  });

  $("#form-nuevo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, btn = $("button[type=submit]", f), err = $("#nuevo-error");
    err.textContent = ""; btn.disabled = true;
    try {
      await llamarAdmin({ accion: "crear", usuario: f.usuario.value, nombre: f.nombre.value, password: f.password.value, rol: f.rol.value });
      aviso(`Usuario "${f.usuario.value.trim().toLowerCase()}" creado. Pasale la contraseña.`);
      f.reset(); f.password.type = "text";
      cargarUsuarios();
    } catch (x) { err.textContent = x.message; }
    btn.disabled = false;
  });

  // Diálogo de contraseña
  const dlg = $("#dlg-password"); let dlgId = null;
  function abrirPassword(id, usuario) {
    dlgId = id; $("#dlg-usuario").textContent = "Usuario: " + usuario;
    $("#form-password").reset(); $("#password-error").textContent = ""; dlg.showModal();
  }
  $("#form-password").addEventListener("submit", async (e) => {
    if (e.submitter?.value !== "ok") return;
    e.preventDefault();
    const pw = e.target.password.value;
    try {
      await llamarAdmin({ accion: "cambiar_password", id: dlgId, password: pw });
      dlg.close(); aviso("Contraseña cambiada.");
    } catch (x) { $("#password-error").textContent = x.message; }
  });

  sb.auth.onAuthStateChange((evento) => { if (evento === "SIGNED_OUT") mostrar("vista-login"); });
  entrarConSesion();
})();
