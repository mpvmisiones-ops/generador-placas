// Generador de Placas · pestaña "Generar placas" (versión Etapa 2: punteo → fotos → placas → ZIP).
// La Etapa 3 la convierte en la pantalla final del productor (tocar una placa para cambiarla, etc.).
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const P = window.Placas;

  const estado = { noticias: [], medios: null, placas: [], semilla: 0, urls: [], listo: false };

  function aviso(t, mal) { const a = $("#aviso"); a.textContent = t; a.classList.toggle("mal", !!mal); a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => a.hidden = true, 3500); }

  async function iniciar() {
    if (estado.listo) return;
    estado.listo = true;
    $("#g-punteo").addEventListener("input", leer);
    $("#g-fotos").addEventListener("change", fotosElegidas);
    $("#g-fotos").addEventListener("click", quitarFoto);
    $("#g-armar").addEventListener("click", () => armar(false));
    $("#g-mezclar").addEventListener("click", () => armar(true));
    $("#g-zip").addEventListener("click", descargarZip);
    leer();
  }

  // ---------- Paso 1: punteo ----------
  function leer() {
    const viejas = estado.noticias;
    estado.noticias = P.leerPunteo($("#g-punteo").value);
    // Si se edita el texto, cada noticia conserva las fotos que ya tenía.
    estado.noticias.forEach((n, i) => n.fotos = viejas[i]?.fotos || []);
    const res = $("#g-resumen");
    res.innerHTML = estado.noticias.length
      ? `<p><strong>${estado.noticias.length} ${estado.noticias.length === 1 ? "noticia" : "noticias"}</strong> encontradas.</p>` +
        estado.noticias.map((n, i) => `<div class="g-noticia"><strong>Noticia ${i + 1}</strong>${n.aviso ? `<p class="error">${esc(n.aviso)}</p>` : ""}<ol>${n.titulos.map(t => `<li>${esc(t)}</li>`).join("")}</ol></div>`).join("")
      : '<p class="suave">Pegá el punteo: las noticias se separan con /// y los títulos van entre *asteriscos*.</p>';
    pintarFotos();
  }

  // ---------- Paso 2: fotos por noticia ----------
  function pintarFotos() {
    const cont = $("#g-fotos");
    cont.innerHTML = estado.noticias.map((n, i) => `
      <div class="g-noticia" data-n="${i}">
        <strong>Noticia ${i + 1}</strong> <span class="suave">· ${esc(n.titulos[0])}</span>
        <div class="g-miniaturas">${n.fotos.map((f, j) => `<button class="g-mini" data-quitar="${j}" title="Quitar foto"><img src="${f.url}" alt="Foto ${j + 1}"><span>✕</span></button>`).join("")}</div>
        <label class="btn btn-borde g-subir">${n.fotos.length ? "Agregar más fotos" : "Elegir fotos"}
          <input type="file" accept="image/*" multiple hidden>
        </label>
      </div>`).join("") || '<p class="suave">Primero pegá el punteo.</p>';
    actualizarBoton();
  }
  async function fotosElegidas(e) {
    const input = e.target; if (input.type !== "file") return;
    const n = estado.noticias[+input.closest("[data-n]").dataset.n];
    const archivos = [...input.files];
    for (const a of archivos) {
      try { n.fotos.push({ bmp: await P.leerFoto(a), url: URL.createObjectURL(a), nombre: a.name }); }
      catch { aviso(`No pude abrir "${a.name}". ¿Es una imagen?`, true); }
    }
    pintarFotos();
  }
  function quitarFoto(e) {
    const b = e.target.closest("[data-quitar]"); if (!b) return;
    const n = estado.noticias[+b.closest("[data-n]").dataset.n];
    const [f] = n.fotos.splice(+b.dataset.quitar, 1);
    URL.revokeObjectURL(f.url); f.bmp.close?.();
    pintarFotos();
  }
  function actualizarBoton() {
    const faltan = estado.noticias.map((n, i) => n.fotos.length ? null : i + 1).filter(Boolean);
    const b = $("#g-armar");
    b.disabled = !estado.noticias.length || faltan.length > 0;
    $("#g-falta").textContent = !estado.noticias.length ? "" : faltan.length ? `Falta cargar fotos en: noticia ${faltan.join(", ")}.` : "";
  }

  // ---------- Paso 3: armar, revisar y descargar ----------
  async function armar(mezclar) {
    const btns = [$("#g-armar"), $("#g-mezclar"), $("#g-zip")];
    btns.forEach(b => b.disabled = true);
    const prog = $("#g-progreso"); prog.hidden = false;
    try {
      if (!estado.medios) {
        prog.textContent = "Cargando diseños de los medios…";
        estado.medios = await P.prepararMedios(await P.cargarMedios(window.sb), window.sb);
      }
      const medios = estado.medios.filter(m => m.en_rotacion);
      estado.semilla = mezclar || !estado.semilla ? Math.floor(Math.random() * 2 ** 31) : estado.semilla;
      estado.placas = P.repartir(estado.noticias, medios, estado.semilla);
      estado.urls.forEach(u => URL.revokeObjectURL(u)); estado.urls = [];

      const canvas = document.createElement("canvas");
      const grilla = $("#g-placas"); grilla.innerHTML = "";
      let i = 0, noEntran = 0;
      for (const pl of estado.placas) {
        prog.textContent = `Armando placa ${++i} de ${estado.placas.length}…`;
        const n = estado.noticias[pl.noticia], m = medios.find(x => x.id === pl.medio);
        P.componer({ medio: m, foto: n.fotos[pl.foto]?.bmp, titulo: n.titulos[pl.titulo], canvas });
        pl.entra = canvas.dataset.entra === "1"; if (!pl.entra) noEntran++;
        pl.blob = await P.aBlob(canvas);
        const url = URL.createObjectURL(pl.blob); estado.urls.push(url);
        grilla.insertAdjacentHTML("beforeend", `
          <figure class="g-placa${pl.entra ? "" : " g-larga"}">
            <img src="${url}" alt="${esc(m.nombre)} · noticia ${pl.noticia + 1}" loading="lazy">
            <figcaption><strong>${esc(m.nombre)}</strong> · N${pl.noticia + 1} · título ${pl.titulo + 1} · foto ${pl.foto + 1}${pl.entra ? "" : '<br><span class="error">El título no entra: acortalo</span>'}</figcaption>
          </figure>`);
        if (i % 4 === 0) await new Promise(r => setTimeout(r)); // deja respirar a la pantalla
      }
      prog.textContent = `${estado.placas.length} placas listas.` + (noEntran ? ` ${noEntran} con títulos demasiado largos.` : "");
      $("#g-revisar").hidden = false;
    } catch (e) {
      console.error(e); prog.textContent = "Error: " + e.message;
    }
    btns.forEach(b => b.disabled = false);
    actualizarBoton();
  }

  async function descargarZip() {
    const b = $("#g-zip"); b.disabled = true; b.textContent = "Armando ZIP…";
    try {
      const items = estado.placas.map(pl => {
        const m = estado.medios.find(x => x.id === pl.medio);
        return { carpeta: m.nombre, archivo: `noticia-${pl.noticia + 1}-${P.nombreArchivo(m.nombre)}.jpg`, blob: pl.blob };
      });
      const zip = await P.armarZip(items);
      const fecha = new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD
      const a = document.createElement("a");
      a.href = URL.createObjectURL(zip); a.download = `placas-${fecha}.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      guardarHistorial();
    } catch (e) { aviso(e.message, true); }
    b.disabled = false; b.textContent = "Descargar todo (ZIP)";
  }

  // Historial: solo textos y qué le tocó a cada medio (sin fotos, para no llenar el espacio gratis).
  async function guardarHistorial() {
    if (!window.sb || estado.guardado === estado.semilla) return; // una vez por reparto
    estado.guardado = estado.semilla;
    const resultado = {
      noticias: estado.noticias.map(n => ({ titulos: n.titulos, fotos: n.fotos.map(f => f.nombre) })),
      placas: estado.placas.map(({ noticia, medio, titulo, foto }) => ({ noticia, medio, titulo, foto })),
    };
    const { error } = await window.sb.from("historial").insert({ punteo: $("#g-punteo").value, resultado });
    if (error) console.warn("[placas] no se guardó el historial:", error.message);
  }

  window.Generar = { iniciar, estado };
})();
