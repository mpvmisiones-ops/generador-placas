// Generador de Placas · pestaña "Historial" (general: la ven todos los usuarios).
// Lista las tandas descargadas (las más nuevas primero). "Abrir y corregir" las carga en Generar
// con sus fotos para cambiar una placa y volver a descargar; el admin además puede borrarlas.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const fecha = (s) => s ? new Date(s).toLocaleString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const POR_PAGINA = 20;
  let filas = [], conectado = false;

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
    await cargar(false);
  }

  async function cargar(mas) {
    const desde = mas ? filas.length : 0;
    const { data, error } = await window.sb.from("historial")
      .select("id, creado_en, punteo, resultado")
      .order("creado_en", { ascending: false })
      .range(desde, desde + POR_PAGINA - 1);
    if (error) { $("#h-lista").innerHTML = `<p class="error">No se pudo cargar el historial: ${esc(error.message)}</p>`; return; }
    filas = mas ? filas.concat(data) : data;
    pintar();
    $("#h-mas").hidden = data.length < POR_PAGINA;
  }

  function pintar() {
    const admin = window.perfil?.rol === "admin";
    $("#h-lista").innerHTML = filas.length ? filas.map(f => {
      const r = f.resultado || {}, ns = r.noticias || [];
      const fotos = ns.reduce((s, n) => s + (n.fotos || []).filter(x => x?.path).length, 0);
      return `
        <article class="h-item" data-id="${f.id}">
          <div class="h-cab">
            <strong>${esc(fecha(f.creado_en))}</strong>
            <span class="suave">${esc(r.autor || "")}${r.editado_por ? ` · corregida por ${esc(r.editado_por)} el ${esc(fecha(r.editado_en))}` : ""}</span>
          </div>
          <ol class="h-titulos">${ns.map(n => `<li>${esc(n.titulos?.[0] || "")}</li>`).join("")}</ol>
          <p class="suave h-datos">${plural(ns.length, "noticia", "noticias")} · ${plural((r.placas || []).length, "placa", "placas")} · ${fotos ? plural(fotos, "foto guardada", "fotos guardadas") : "sin fotos guardadas (es de antes del 23/11: hay que volver a cargarlas)"}</p>
          <div class="h-acciones">
            <button type="button" class="btn btn-chico btn-principal" data-acc="abrir">Abrir y corregir</button>
            ${admin ? '<button type="button" class="btn btn-chico btn-peligro" data-acc="borrar">Borrar</button>' : ""}
          </div>
        </article>`;
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
      const paths = (fila.resultado?.noticias || []).flatMap(n => (n.fotos || []).map(f => f?.path).filter(Boolean));
      if (paths.length) {
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
