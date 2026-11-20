// Generador de Placas · pestaña "Plantillas" (versión mínima de la Etapa 2: subir la capa PNG de cada medio).
// En la Etapa 4 se suma ajustar las zonas de foto y título arrastrando, y subir tipografías.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const P = window.Placas;
  let medios = [], conectado = false;

  function aviso(t, mal) { const a = $("#aviso"); a.textContent = t; a.classList.toggle("mal", !!mal); a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => a.hidden = true, 3500); }

  async function iniciar() {
    const sb = window.sb, ul = $("#p-lista");
    if (!conectado) { ul.addEventListener("change", subir); conectado = true; }
    ul.innerHTML = '<li class="suave">Cargando…</li>';
    medios = await P.cargarMedios(sb);
    await P.prepararMedios(medios, sb);
    ul.innerHTML = medios.map(m => `
      <li data-id="${m.id}">
        <canvas class="p-vista" width="1080" height="1350"></canvas>
        <div class="u-datos">
          <strong>${esc(m.nombre)}</strong>
          ${m._capa ? '<span class="etiqueta etq-productor">Con capa</span>' : '<span class="etiqueta etq-pausado">Sin capa (boceto)</span>'}
          <div class="suave">${esc(m.config.titulo.fuente)} ${m.config.titulo.peso} · ${m.config.titulo.tam}px</div>
          <label class="btn btn-chico btn-borde p-subir">${m._capa ? "Cambiar capa PNG" : "Subir capa PNG"}
            <input type="file" accept="image/png" hidden>
          </label>
        </div>
      </li>`).join("");
    // Vista previa de cada medio con un título de ejemplo
    ul.querySelectorAll("li[data-id]").forEach(li => {
      const m = medios.find(x => x.id === li.dataset.id);
      P.componer({ medio: m, foto: null, titulo: "El Gobierno provincial inauguró una nueva escuela en Candelaria", canvas: $("canvas", li) });
    });
  }

  async function subir(e) {
    const input = e.target; if (input.type !== "file" || !input.files[0]) return;
    const archivo = input.files[0], id = input.closest("li").dataset.id, sb = window.sb;
    if (archivo.type !== "image/png") return aviso("La capa tiene que ser un PNG con fondo transparente.", true);
    const img = await createImageBitmap(archivo);
    if (img.width * 1350 !== img.height * 1080) return aviso(`La capa mide ${img.width}×${img.height}. Tiene que ser 4:5 (1080×1350).`, true);
    aviso("Subiendo capa…");
    const path = id + ".png";
    const up = await sb.storage.from("capas").upload(path, archivo, { upsert: true, contentType: "image/png", cacheControl: "60" });
    if (up.error) return aviso("No se pudo subir: " + up.error.message, true);
    const { error } = await sb.from("medios").update({ capa_path: path, actualizado_en: new Date().toISOString() }).eq("id", id);
    if (error) return aviso("Se subió pero no se guardó: " + error.message, true);
    aviso("Capa guardada.");
    if (window.Generar) window.Generar.estado.medios = null; // que Generar recargue los diseños
    iniciar();
  }

  window.Plantillas = { iniciar };
})();
