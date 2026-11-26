// Generador de Placas · pestaña "Historial" (general: la ven todos los usuarios).
// Lista las tandas descargadas (las más nuevas primero). "Abrir y corregir" las carga en Generar
// con sus fotos para cambiar una placa y volver a descargar; el admin además puede borrarlas.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const fecha = (s) => s ? new Date(s).toLocaleString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const POR_PAGINA = 20;
  const lista = (x) => Array.isArray(x) ? x : []; // defensa ante datos rotos
  let filas = [], conectado = false, autores = new Map();

  function aviso(t, mal) { const a = $("#aviso"); a.textContent = t; a.classList.toggle("mal", !!mal); a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => a.hidden = true, 3500); }

  async function iniciar() {
    if (!conectado) {
      $("#h-lista").addEventListener("click", accion);
      $("#h-mas").addEventListener("click", () => cargar(true));
      $("#h-volver").addEventListener("click", () => window.irA?.("generar"));
      conectado = true;
    }
    filas = [];
    $("#h-lista").innerHTML = '<p class="suave">Cargando…</p>';
    // Nombres reales de autor y corrector (los fija la base, no el navegador).
    try { const { data } = await window.sb.rpc("autores"); autores = new Map((data || []).map(a => [a.id, a.nombre])); } catch { autores = new Map(); }
    await cargar(false);
  }

  async function cargar(mas) {
    const desde = mas ? filas.length : 0;
    const consulta = (campos) => window.sb.from("historial").select(campos)
      .order("creado_en", { ascending: false }).range(desde, desde + POR_PAGINA - 1);
    let { data, error } = await consulta("id, creado_en, punteo, resultado, usuario_id, editado_por, editado_en");
    // Si la base todavía no tiene las columnas de "quién corrigió" (seguridad.sql sin correr), sigue igual.
    if (error && /editado_/.test(error.message)) ({ data, error } = await consulta("id, creado_en, punteo, resultado, usuario_id"));
    if (error) { $("#h-lista").innerHTML = `<p class="error">No se pudo cargar el historial: ${esc(error.message)}</p>`; return; }
    filas = mas ? filas.concat(data) : data;
    pintar();
    $("#h-mas").hidden = data.length < POR_PAGINA;
  }

  function pintar() {
    const admin = window.perfil?.rol === "admin";
    $("#h-lista").innerHTML = filas.length ? filas.map(f => { try {
      const r = f.resultado && typeof f.resultado === "object" ? f.resultado : {};
      const ns = lista(r.noticias).filter(n => n && typeof n === "object");
      const fotos = ns.reduce((s, n) => s + lista(n.fotos).filter(x => x?.path).length, 0);
      const fb = lista(r.placas).filter(p => p && typeof p.facebook === "object" && p.facebook);
      const autor = autores.get(f.usuario_id) || "", corrector = f.editado_por ? (autores.get(f.editado_por) || "alguien") : "";
      f._autor = autor;
      return `
        <article class="h-item" data-id="${f.id}">
          <div class="h-cab">
            <strong>${esc(fecha(f.creado_en))}</strong>
            <span class="suave">${esc(autor)}${corrector ? ` · corregida por ${esc(corrector)} el ${esc(fecha(f.editado_en))}` : ""}</span>
          </div>
          <ol class="h-titulos">${ns.map(n => `<li>${esc(String(lista(n.titulos)[0] ?? ""))}</li>`).join("")}</ol>
          ${fb.length ? `<p class="h-fb">Facebook: ${fb.length} de ${plural(lista(r.placas).length, "placa", "placas")} ya ${fb.some(p => p.facebook.estado === "programada") ? "publicadas o programadas" : "publicadas"}</p>` : ""}
          <p class="suave h-datos">${plural(ns.length, "noticia", "noticias")} · ${plural(lista(r.placas).length, "placa", "placas")} · ${fotos ? plural(fotos, "foto guardada", "fotos guardadas") : "sin fotos guardadas (es de antes del 23/11: hay que volver a cargarlas)"}</p>
          <div class="h-acciones">
            <button type="button" class="btn btn-chico btn-principal" data-acc="abrir">Abrir y corregir</button>
            ${admin ? '<button type="button" class="btn btn-chico btn-peligro" data-acc="borrar">Borrar</button>' : ""}
          </div>
        </article>`;
    } catch (e) { console.warn("[historial] fila con datos rotos:", f.id, e); return `<article class="h-item" data-id="${Number(f.id) || 0}"><p class="error">Tanda con datos dañados (#${Number(f.id) || "?"}).</p></article>`; }
    }).join("") : '<p class="suave">Todavía no hay tandas. Se guardan solas al descargar el ZIP.</p>';
  }

  async function accion(e) {
    const b = e.target.closest("[data-acc]"); if (!b) return;
    const id = +b.closest("[data-id]").dataset.id, fila = filas.find(f => f.id === id);
    if (!fila) return;
    if (b.dataset.acc === "abrir") {
      window.irA?.("generar");
      await window.Generar?.abrirTanda(fila);
      return;
    }
    if (b.dataset.acc === "borrar") {
      if (!confirm(`¿Borrar del historial la tanda del ${fecha(fila.creado_en)}? Se borran también sus fotos guardadas. No se puede deshacer.`)) return;
      b.disabled = true;
      // La base decide qué fotos borrar: solo las de esta tanda que ninguna otra usa.
      const { data: paths, error: errFotos } = await window.sb.rpc("fotos_solo_de", { tanda: id });
      if (errFotos) console.warn("[historial] no se pudieron calcular las fotos:", errFotos.message);
      if (paths?.length) {
        const r = await window.sb.storage.from("historial").remove(paths);
        if (r.error) console.warn("[historial] fotos sin borrar:", r.error.message);
      }
      const { error } = await window.sb.from("historial").delete().eq("id", id);
      if (error) { b.disabled = false; return aviso("No se pudo borrar: " + error.message, true); }
      filas = filas.filter(f => f.id !== id);
      pintar();
      aviso("Tanda borrada.");
    }
  }

  window.Historial = { iniciar };
})();
