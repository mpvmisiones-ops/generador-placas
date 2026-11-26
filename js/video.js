// Generador de Placas · videos de las placas.
// Anima cada placa (zoom lento de la foto, entrada de la capa y del título renglón por renglón) y la
// guarda como MP4 en el navegador: sin servidores ni costos. Formatos: placa 4:5 y Reel 9:16.
// MP4 con WebCodecs + mp4-muxer (js/vendor, se carga solo al usarlo); si el navegador no puede,
// se graba en tiempo real con MediaRecorder (más lento).
(() => {
  const FPS = 30;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const P = () => window.Placas, G = () => window.Generar.estado;

  let conectado = false, opciones = { formato: "reel", estilo: "suave", duracion: 8 };
  let elegida = 0, anim = null, rafId = 0, inicio = 0, trabajando = false, cancelar = false;

  // ---------- Datos de una placa ----------
  const medioDe = (pl) => G().medios.find(m => m.id === pl.medio);
  const fotoDe = (pl) => G().noticias[pl.noticia]?.fotos.find(f => f.id === pl.fotoId)?.bmp;
  const tituloDe = (pl) => pl.texto ?? G().noticias[pl.noticia].titulos[pl.titulo];
  const armar = (pl) => P().prepararAnimacion({ medio: medioDe(pl), foto: fotoDe(pl), titulo: tituloDe(pl), ajuste: pl.ajuste, ...opciones });

  // ---------- Codificar ----------
  let cargaMuxer = null;
  function cargarMuxer() {
    if (window.Mp4Muxer) return Promise.resolve();
    return cargaMuxer ||= new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = "js/vendor/mp4-muxer.js?v=1"; s.onload = ok; s.onerror = () => { cargaMuxer = null; mal(new Error("No se pudo cargar el armador de MP4.")); };
      document.head.appendChild(s);
    });
  }
  let configOk = null;
  async function configH264(w, h) {
    if (!("VideoEncoder" in window)) return null;
    for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.640032", "avc1.4d4028"]) {
      const cfg = { codec, width: w, height: h, bitrate: h > 1400 ? 8e6 : 6e6, framerate: FPS, avc: { format: "avc" } };
      try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch {}
    }
    return null;
  }
  const pausa = () => new Promise(r => setTimeout(r, 0));
  async function codificar(a, avance) {
    const cfg = await configH264(a.ancho, a.alto);
    if (cfg) {
      await cargarMuxer();
      const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: "avc", width: a.ancho, height: a.alto, frameRate: FPS }, fastStart: "in-memory" });
      let fallo = null;
      const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { fallo = e; } });
      enc.configure(cfg);
      const c = document.createElement("canvas"); c.width = a.ancho; c.height = a.alto;
      const ctx = c.getContext("2d");
      const total = Math.round(a.duracion * FPS);
      for (let i = 0; i < total; i++) {
        if (cancelar) { try { enc.close(); } catch {} throw new Error("cancelado"); }
        if (fallo) throw fallo;
        a.cuadro(ctx, i / FPS);
        const frame = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
        enc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
        frame.close();
        while (enc.encodeQueueSize > 6) await pausa();
        if (i % 8 === 0) { avance?.(i / total); await pausa(); }
      }
      await enc.flush(); enc.close();
      if (fallo) throw fallo;
      muxer.finalize();
      return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), ext: "mp4" };
    }
    // Plan B: grabar el canvas en tiempo real (tarda lo que dura el video).
    const tipo = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(t => window.MediaRecorder?.isTypeSupported?.(t));
    if (!tipo) throw new Error("Este navegador no puede armar videos. Probá con Chrome actualizado.");
    const c = document.createElement("canvas"); c.width = a.ancho; c.height = a.alto;
    const ctx = c.getContext("2d"); a.cuadro(ctx, 0);
    const rec = new MediaRecorder(c.captureStream(FPS), { mimeType: tipo, videoBitsPerSecond: 6e6 });
    const partes = []; rec.ondataavailable = (e) => e.data.size && partes.push(e.data);
    const fin = new Promise(r => rec.onstop = r);
    rec.start();
    const t0 = performance.now();
    await new Promise((ok) => {
      const paso = () => {
        const t = (performance.now() - t0) / 1000;
        if (cancelar || t >= a.duracion) return ok();
        a.cuadro(ctx, t); avance?.(t / a.duracion); requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    });
    rec.stop(); await fin;
    if (cancelar) throw new Error("cancelado");
    return { blob: new Blob(partes, { type: tipo.split(";")[0] }), ext: tipo.includes("mp4") ? "mp4" : "webm" };
  }

  // ---------- Nombres (los mismos que las imágenes del ZIP) ----------
  function nombre(pl, ext) {
    const m = medioDe(pl), clave = P().palabrasClave(G().noticias[pl.noticia].titulos).join("-");
    return { carpeta: m.nombre, archivo: `noticia-${pl.noticia + 1}-${clave ? clave + "-" : ""}${P().nombreArchivo(m.nombre)}${opciones.formato === "reel" ? "-reel" : ""}.${ext}` };
  }
  function bajar(blob, archivo) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = archivo;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60e3);
  }

  // ---------- Vista previa ----------
  function previa() {
    cancelAnimationFrame(rafId);
    const pl = G().placas[elegida]; if (!pl) return;
    anim = armar(pl);
    const c = $("#v-canvas"); c.width = anim.ancho; c.height = anim.alto;
    c.classList.toggle("v-reel", opciones.formato === "reel");
    const ctx = c.getContext("2d");
    inicio = performance.now();
    const paso = () => {
      const t = ((performance.now() - inicio) / 1000) % (anim.duracion + 0.8); // se repite con una pausa
      anim.cuadro(ctx, Math.min(t, anim.duracion));
      rafId = requestAnimationFrame(paso);
    };
    paso();
  }

  // ---------- Generar ----------
  function estado(t, mal) { const p = $("#v-estado"); p.textContent = t; p.classList.toggle("mal", !!mal); }
  async function generar(cuales) {
    if (trabajando) return;
    trabajando = true; cancelar = false; pintarBotones();
    const placas = cuales === "una" ? [G().placas[elegida]] : G().placas;
    const items = [];
    try {
      await Promise.all(placas.map(pl => pl.redibujo));
      for (const [k, pl] of placas.entries()) {
        const base = `Video ${k + 1} de ${placas.length} (${medioDe(pl).nombre})`;
        estado(base + "…");
        const r = await codificar(armar(pl), (x) => estado(`${base}: ${Math.round(x * 100)} %`));
        pl.video = { blob: r.blob, ext: r.ext, ...opciones }; // queda listo para publicar más adelante
        items.push({ ...nombre(pl, r.ext), blob: r.blob });
      }
      if (cuales === "una") { bajar(items[0].blob, items[0].archivo); estado("Listo: se descargó el video."); }
      else {
        estado("Armando el ZIP…");
        const zip = await P().armarZip(items);
        bajar(zip, `videos-${opciones.formato}-${new Date().toLocaleDateString("sv-SE")}.zip`);
        estado(`Listo: ${plural(items.length, "video", "videos")} en el ZIP.`);
      }
    } catch (e) {
      estado(e.message === "cancelado" ? "Cancelado." : "No se pudo armar el video: " + e.message, e.message !== "cancelado");
      console.error(e);
    }
    trabajando = false; pintarBotones();
  }

  // ---------- Pantalla ----------
  function pintarBotones() {
    document.querySelectorAll("#dlg-video [data-v]").forEach(b => { b.setAttribute("aria-pressed", String(String(opciones[b.parentElement.dataset.g]) === b.dataset.v)); b.disabled = trabajando; });
    $("#v-una").disabled = $("#v-todas").disabled = $("#v-placa").disabled = trabajando;
    $("#v-cancelar").hidden = !trabajando;
    $("#v-todas").textContent = `Hacer los ${G().placas.length} videos (ZIP)`;
  }
  function abrir() {
    const dlg = $("#dlg-video");
    if (!conectado) {
      dlg.addEventListener("click", (e) => {
        const b = e.target.closest("[data-v]");
        if (b && !trabajando) { const g = b.parentElement.dataset.g; opciones[g] = g === "duracion" ? +b.dataset.v : b.dataset.v; pintarBotones(); return previa(); }
        if (e.target.closest("#v-cerrar")) { if (trabajando) cancelar = true; cancelAnimationFrame(rafId); dlg.close(); }
        else if (e.target.closest("#v-una")) generar("una");
        else if (e.target.closest("#v-todas")) generar("todas");
        else if (e.target.closest("#v-cancelar")) cancelar = true;
      });
      $("#v-placa").addEventListener("change", (e) => { elegida = +e.target.value; previa(); });
      dlg.addEventListener("close", () => { cancelAnimationFrame(rafId); if (trabajando) cancelar = true; });
      window.addEventListener("popstate", () => { if (dlg.open) dlg.close(); });
      conectado = true;
    }
    const g = G();
    if (elegida >= g.placas.length) elegida = 0;
    $("#v-placa").innerHTML = g.placas.map((pl, i) => `<option value="${i}"${i === elegida ? " selected" : ""}>Noticia ${pl.noticia + 1} · ${esc(medioDe(pl)?.nombre)}</option>`).join("");
    const lento = !("VideoEncoder" in window);
    $("#v-aviso").textContent = lento ? "Este navegador arma los videos en tiempo real (cada uno tarda lo que dura). Con Chrome o Edge actualizados es mucho más rápido." : "";
    estado("");
    dlg.showModal();
    pintarBotones();
    previa();
  }

  window.Videos = { abrir, codificar };
})();
