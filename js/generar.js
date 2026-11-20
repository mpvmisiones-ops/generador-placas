// Generador de Placas · pantalla del productor (Etapa 3).
// Tres pasos, uno por vez y pensados primero para el celular:
//   1. Pegar el punteo  ·  2. Cargar fotos por noticia  ·  3. Revisar, corregir y descargar.
// En el paso 3 se toca una placa para cambiarle el título (o escribir uno propio) o la foto.
// "Volver a mezclar" cambia el reparto pero respeta las placas cambiadas a mano.
// El botón "atrás" del celular vuelve al paso anterior (o cierra el editor) en vez de salir de la página.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const P = window.Placas;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  const estado = {
    paso: 1, pila: [1],   // pila = pasos que hay en el historial del navegador (para el botón atrás)
    noticias: [],         // [{ titulos: [], aviso, fotos: [{ id, bmp, url, nombre }] }]
    medios: null, placas: [], semilla: 0,
    firma: "",            // qué punteo + fotos se usó para armar las placas actuales
    armando: false, listo: false,
    editando: -1,         // placa abierta en el editor
  };
  let proximoId = 1;

  function aviso(t, mal) { const a = $("#aviso"); a.textContent = t; a.classList.toggle("mal", !!mal); a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => a.hidden = true, 3500); }

  function iniciar() {
    if (estado.listo) return;
    estado.listo = true;
    $("#g-punteo").addEventListener("input", leer);
    $("#g-pegar").addEventListener("click", pegar);
    $("#g-borrar").addEventListener("click", () => { $("#g-punteo").value = ""; leer(); $("#g-punteo").focus(); });
    $("#g-fotos").addEventListener("change", fotosElegidas);
    $("#g-fotos").addEventListener("click", quitarFoto);
    $("#g-pasos").addEventListener("click", (e) => { const b = e.target.closest("[data-ir]"); if (b && !b.disabled) navegar(+b.dataset.ir); });
    $("#g-pie").addEventListener("click", accionPie);
    $("#g-placas").addEventListener("click", (e) => { const f = e.target.closest("[data-i]"); if (f && !estado.armando) abrirEditor(+f.dataset.i); });
    $("#g-corregir").addEventListener("click", () => { const i = estado.placas.findIndex(p => !p.entra); if (i >= 0) abrirEditor(i); });
    prepararEditor();
    window.addEventListener("popstate", alVolver);
    window.addEventListener("beforeunload", (e) => { if (estado.noticias.some(n => n.fotos.length)) { e.preventDefault(); e.returnValue = ""; } });
    history.replaceState({ ...(history.state || {}), paso: 1, d: 0, dlg: false }, "");
    leer();
    mostrar(1);
  }

  // ---------- Navegación entre pasos ----------
  const faltanFotos = () => estado.noticias.map((n, i) => n.fotos.length ? null : i + 1).filter(Boolean);
  const puedeIr = (n) => n === 1 || (n === 2 && estado.noticias.length > 0) || (n === 3 && estado.noticias.length > 0 && !faltanFotos().length);

  // Ir a un paso desde un botón: adelante agrega una entrada al historial; atrás reusa la que ya está.
  function navegar(n) {
    if (n === estado.paso || !puedeIr(n)) return;
    if (n < estado.paso) {
      const k = estado.pila.lastIndexOf(n);
      if (k >= 0) { history.go(k - (estado.pila.length - 1)); return; } // alVolver() muestra el paso
      estado.pila[estado.pila.length - 1] = n;
      history.replaceState({ paso: n, d: estado.pila.length - 1, dlg: false }, "");
    } else {
      estado.pila.push(n);
      history.pushState({ paso: n, d: estado.pila.length - 1, dlg: false }, "");
    }
    mostrar(n);
  }
  function alVolver(e) {
    const st = e.state || {};
    const dlg = $("#dlg-placa");
    if (dlg.open && !st.dlg) dlg.close();
    if (st.paso) {
      estado.pila.length = (st.d ?? 0) + 1;
      estado.pila[estado.pila.length - 1] = st.paso;
      mostrar(st.paso);
    }
  }
  function mostrar(n) {
    while (n > 1 && !puedeIr(n)) n--;
    const cambia = n !== estado.paso;
    estado.paso = n;
    document.querySelectorAll(".g-paso").forEach(s => s.hidden = +s.dataset.paso !== n);
    document.querySelectorAll("#g-pasos [data-ir]").forEach(b => {
      const k = +b.dataset.ir;
      b.disabled = !puedeIr(k);
      b.classList.toggle("hecho", k < n);
      if (k === n) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    pintarPie();
    if (cambia) window.scrollTo({ top: 0 });
    if (n === 3 && firma() !== estado.firma) armar(false);
  }

  function pintarPie() {
    const pie = $("#g-pie"), n = estado.paso, dis = estado.armando ? " disabled" : "";
    if (n === 1) {
      const c = estado.noticias.length;
      pie.innerHTML = `<button class="btn btn-grande btn-principal" data-acc="ir2"${c ? "" : " disabled"}>${c ? `Siguiente: fotos (${plural(c, "noticia", "noticias")})` : "Pegá el punteo para seguir"}</button>`;
    } else if (n === 2) {
      const f = faltanFotos();
      pie.innerHTML = `${f.length ? `<p class="g-pie-nota">Falta cargar fotos en: noticia ${f.join(", ")}</p>` : ""}
        <div class="g-pie-fila">
          <button class="btn btn-borde" data-acc="atras" aria-label="Volver al punteo">←</button>
          <button class="btn btn-grande btn-principal" data-acc="ir3"${f.length ? " disabled" : ""}>Armar placas</button>
        </div>`;
    } else {
      pie.innerHTML = `<div class="g-pie-fila g-pie-3">
          <button class="btn btn-borde" data-acc="atras" aria-label="Volver a las fotos"${dis}>←</button>
          <button class="btn btn-borde" data-acc="mezclar"${dis}>Volver a mezclar</button>
          <button class="btn btn-principal" data-acc="zip"${dis || (estado.placas.length ? "" : " disabled")}>Descargar ZIP</button>
        </div>`;
    }
  }
  function accionPie(e) {
    const b = e.target.closest("[data-acc]"); if (!b || b.disabled) return;
    const acc = b.dataset.acc;
    if (acc === "ir2") navegar(2);
    else if (acc === "ir3") navegar(3);
    else if (acc === "atras") navegar(estado.paso - 1);
    else if (acc === "mezclar") armar(true);
    else if (acc === "zip") descargarZip(b);
  }

  // ---------- Paso 1: punteo ----------
  async function pegar() {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return aviso("El portapapeles está vacío.", true);
      $("#g-punteo").value = t; leer();
    } catch {
      $("#g-punteo").focus();
      aviso("Mantené apretado el cuadro y elegí «Pegar».");
    }
  }
  function leer() {
    const viejas = estado.noticias;
    estado.noticias = P.leerPunteo($("#g-punteo").value);
    // Si se edita el texto, cada noticia conserva las fotos que ya tenía.
    estado.noticias.forEach((n, i) => n.fotos = viejas[i]?.fotos || []);
    viejas.slice(estado.noticias.length).forEach(n => n.fotos.forEach(soltarFoto)); // noticias borradas
    const res = $("#g-resumen");
    res.innerHTML = estado.noticias.length
      ? `<p class="g-cuenta"><strong>${plural(estado.noticias.length, "noticia encontrada", "noticias encontradas")}</strong></p>` +
        estado.noticias.map((n, i) => `<div class="g-noticia"><span class="g-num">${i + 1}</span><div>${n.aviso ? `<p class="error">${esc(n.aviso)}</p>` : ""}<ol>${n.titulos.map(t => `<li>${esc(t)}</li>`).join("")}</ol></div></div>`).join("")
      : "";
    pintarFotos();
    mostrar(estado.paso);
  }

  // ---------- Paso 2: fotos por noticia ----------
  function soltarFoto(f) { URL.revokeObjectURL(f.url); f.bmp.close?.(); }
  async function agregarFotos(n, archivos) {
    let ultima = null;
    for (const a of archivos) {
      try { ultima = { id: proximoId++, bmp: await P.leerFoto(a), url: URL.createObjectURL(a), nombre: a.name }; n.fotos.push(ultima); }
      catch { aviso(`No pude abrir "${a.name}". ¿Es una imagen?`, true); }
    }
    return ultima;
  }
  function pintarFotos() {
    const cont = $("#g-fotos");
    cont.innerHTML = estado.noticias.map((n, i) => `
      <div class="g-noticia g-fn${n.fotos.length ? "" : " g-falta"}" data-n="${i}">
        <span class="g-num">${n.fotos.length ? "✓" : i + 1}</span>
        <div class="g-fn-datos">
          <strong>${esc(n.titulos[0])}</strong>
          <span class="suave">${plural(n.titulos.length, "título", "títulos")} · ${n.fotos.length ? plural(n.fotos.length, "foto", "fotos") : "sin fotos"}</span>
          <div class="g-miniaturas">
            ${n.fotos.map((f, j) => `<button type="button" class="g-mini" data-quitar="${j}" aria-label="Quitar foto ${j + 1}"><img src="${f.url}" alt=""><span>✕</span></button>`).join("")}
            <label class="g-mas"><input type="file" accept="image/*" multiple hidden><b>＋</b>${n.fotos.length ? "Más" : "Fotos"}</label>
          </div>
        </div>
      </div>`).join("") || '<p class="suave">Primero pegá el punteo.</p>';
  }
  async function fotosElegidas(e) {
    const input = e.target; if (input.type !== "file") return;
    const n = estado.noticias[+input.closest("[data-n]").dataset.n];
    await agregarFotos(n, [...input.files]);
    pintarFotos(); mostrar(estado.paso);
  }
  function quitarFoto(e) {
    const b = e.target.closest("[data-quitar]"); if (!b) return;
    const n = estado.noticias[+b.closest("[data-n]").dataset.n];
    soltarFoto(n.fotos.splice(+b.dataset.quitar, 1)[0]);
    pintarFotos(); mostrar(estado.paso);
  }

  // ---------- Paso 3: armar y revisar ----------
  const firma = () => JSON.stringify(estado.noticias.map(n => [n.titulos, n.fotos.map(f => f.id)]));
  const medioDe = (pl) => estado.medios.find(m => m.id === pl.medio);
  const fotoDe = (pl) => estado.noticias[pl.noticia]?.fotos.find(f => f.id === pl.fotoId);
  const tituloDe = (pl) => pl.texto ?? estado.noticias[pl.noticia].titulos[pl.titulo];
  const esOriginal = (pl) => pl.texto == null && pl.titulo === pl.orig.titulo && pl.fotoId === pl.orig.fotoId;

  async function armar(mezclar) {
    if (estado.armando) return;
    estado.armando = true; pintarPie();
    const prog = $("#g-progreso");
    try {
      if (!estado.medios) {
        prog.textContent = "Cargando diseños de los medios…";
        estado.medios = await P.prepararMedios(await P.cargarMedios(window.sb), window.sb);
      }
      const medios = estado.medios.filter(m => m.en_rotacion);
      if (mezclar || !estado.semilla) estado.semilla = Math.floor(Math.random() * 2 ** 31);

      // Las placas cambiadas a mano se conservan (si su título y su foto todavía existen).
      const aMano = new Map(estado.placas.filter(p => !esOriginal(p)).map(p => [p.noticia + "|" + p.medio, p]));
      let conservadas = 0;
      estado.placas.forEach(p => p.url && URL.revokeObjectURL(p.url));
      estado.placas = P.repartir(estado.noticias, medios, estado.semilla).map(p => {
        const n = estado.noticias[p.noticia];
        const pl = { noticia: p.noticia, medio: p.medio, titulo: p.titulo, fotoId: n.fotos[p.foto]?.id, texto: null };
        pl.orig = { titulo: pl.titulo, fotoId: pl.fotoId };
        const v = aMano.get(p.noticia + "|" + p.medio);
        if (v && v.titulo < n.titulos.length && n.fotos.some(f => f.id === v.fotoId)) {
          Object.assign(pl, { titulo: v.titulo, fotoId: v.fotoId, texto: v.texto });
          if (!esOriginal(pl)) conservadas++;
        }
        return pl;
      });
      estado.firma = firma();

      pintarGrilla();
      const canvas = document.createElement("canvas");
      for (let i = 0; i < estado.placas.length; i++) {
        prog.textContent = `Armando placa ${i + 1} de ${estado.placas.length}…`;
        await dibujarPlaca(i, canvas);
        if (i % 4 === 3) await new Promise(r => setTimeout(r)); // deja respirar a la pantalla
      }
      prog.textContent = `${plural(estado.placas.length, "placa lista", "placas listas")}.`;
      if (mezclar && conservadas) aviso(`Mezclado. Se mantuvieron ${plural(conservadas, "placa cambiada", "placas cambiadas")} a mano.`);
    } catch (e) {
      console.error(e); prog.textContent = "Error: " + e.message;
    }
    estado.armando = false;
    pintarPie(); pintarProblemas();
  }

  function pintarGrilla() {
    const porNoticia = estado.noticias.map(() => []);
    estado.placas.forEach((pl, i) => porNoticia[pl.noticia].push(i));
    $("#g-placas").innerHTML = porNoticia.map((idx, ni) => `
      <section class="g-grupo">
        <h3><span class="g-num">${ni + 1}</span> ${esc(estado.noticias[ni].titulos[0])}</h3>
        <div class="g-placas">${idx.map(i => `
          <figure class="g-placa" data-i="${i}">
            <button type="button" class="g-placa-btn" aria-label="Cambiar la placa de ${esc(medioDe(estado.placas[i]).nombre)}, noticia ${ni + 1}">
              <img alt=""><span class="g-lapiz" aria-hidden="true">✎</span>
            </button>
            <figcaption><strong>${esc(medioDe(estado.placas[i]).nombre)}</strong><span class="g-marcas"></span></figcaption>
          </figure>`).join("")}
        </div>
      </section>`).join("");
  }

  // Dibuja una placa, guarda su JPG y actualiza su miniatura en la grilla.
  async function dibujarPlaca(i, canvas) {
    const pl = estado.placas[i];
    P.componer({ medio: medioDe(pl), foto: fotoDe(pl)?.bmp, titulo: tituloDe(pl), canvas });
    pl.entra = canvas.dataset.entra === "1";
    pl.blob = await P.aBlob(canvas);
    if (pl.url) URL.revokeObjectURL(pl.url);
    pl.url = URL.createObjectURL(pl.blob);
    const fig = $(`#g-placas [data-i="${i}"]`); if (!fig) return;
    fig.querySelector("img").src = pl.url;
    fig.classList.toggle("g-larga", !pl.entra);
    fig.querySelector(".g-marcas").innerHTML =
      (pl.entra ? "" : '<span class="g-tag g-tag-mal">No entra</span>') + (esOriginal(pl) ? "" : '<span class="g-tag">Cambiada</span>');
  }

  function pintarProblemas() {
    const malas = estado.placas.filter(p => p.entra === false).length;
    $("#g-problemas").hidden = !malas;
    $("#g-problemas-txt").textContent = `${plural(malas, "placa tiene", "placas tienen")} el título demasiado largo.`;
  }

  // ---------- Editor de una placa ----------
  function prepararEditor() {
    const dlg = $("#dlg-placa");
    $("#e-listo").addEventListener("click", () => dlg.close());
    $("#e-ant").addEventListener("click", () => moverEditor(-1));
    $("#e-sig").addEventListener("click", () => moverEditor(1));
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); // tocar afuera (escritorio)
    dlg.addEventListener("close", () => {
      const i = estado.editando; estado.editando = -1;
      if (history.state?.dlg) history.back();
      confirmar(i);
    });
    $("#e-titulos").addEventListener("click", (e) => {
      const b = e.target.closest("[data-t]"); if (!b) return;
      const pl = estado.placas[estado.editando];
      pl.titulo = +b.dataset.t; pl.texto = null;
      $("#e-texto").value = tituloDe(pl);
      cambiado();
    });
    $("#e-texto").addEventListener("input", (e) => {
      const pl = estado.placas[estado.editando];
      const v = e.target.value.replace(/\s+/g, " ").trim();
      const igual = estado.noticias[pl.noticia].titulos.indexOf(v);
      if (igual >= 0) { pl.titulo = igual; pl.texto = null; } else pl.texto = v;
      cambiado();
    });
    $("#e-fotos").addEventListener("click", (e) => {
      const b = e.target.closest("[data-f]"); if (!b) return;
      estado.placas[estado.editando].fotoId = +b.dataset.f;
      cambiado();
    });
    $("#e-fotos").addEventListener("change", async (e) => {
      if (e.target.type !== "file") return;
      const pl = estado.placas[estado.editando];
      const nueva = await agregarFotos(estado.noticias[pl.noticia], [...e.target.files]);
      estado.firma = firma(); // agregar fotos no invalida las placas ya armadas
      pintarFotos();
      if (nueva) { pl.fotoId = nueva.id; cambiado(); } else pintarEditor();
    });
    $("#e-original").addEventListener("click", () => {
      const pl = estado.placas[estado.editando];
      Object.assign(pl, { titulo: pl.orig.titulo, fotoId: pl.orig.fotoId, texto: null });
      $("#e-texto").value = tituloDe(pl);
      cambiado();
    });
    $("#e-guardar").addEventListener("click", guardarUna);
  }

  function abrirEditor(i) {
    const dlg = $("#dlg-placa");
    estado.editando = i;
    $("#e-texto").value = tituloDe(estado.placas[i]);
    pintarEditor();
    if (!dlg.open) {
      dlg.showModal();
      history.pushState({ ...history.state, dlg: true }, "");
      $("#e-listo").focus(); // que el celular no abra el teclado solo
    }
  }
  function moverEditor(delta) {
    const i = estado.editando, total = estado.placas.length;
    abrirEditor((i + delta + total) % total);
    confirmar(i); // la anterior se redibuja mientras tanto
  }
  function cambiado() { estado.placas[estado.editando].sucia = true; pintarEditor(); }

  function pintarEditor() {
    const i = estado.editando, pl = estado.placas[i], n = estado.noticias[pl.noticia], m = medioDe(pl);
    $("#e-medio").textContent = m.nombre;
    $("#e-noticia").textContent = `Noticia ${pl.noticia + 1} · ${i + 1} de ${estado.placas.length}`;
    $("#e-titulos").innerHTML = n.titulos.map((t, k) =>
      `<button type="button" class="e-op" data-t="${k}" aria-pressed="${pl.texto == null && pl.titulo === k}"><span>${k + 1}</span>${esc(t)}</button>`).join("") +
      (pl.texto != null ? '<p class="suave e-propio">Usando un texto propio (escrito abajo).</p>' : "");
    $("#e-fotos").innerHTML = n.fotos.map((f, k) =>
      `<button type="button" class="e-foto" data-f="${f.id}" aria-pressed="${f.id === pl.fotoId}" aria-label="Foto ${k + 1}"><img src="${f.url}" alt=""></button>`).join("") +
      '<label class="g-mas"><input type="file" accept="image/*" multiple hidden><b>＋</b>Subir</label>';
    $("#e-original").hidden = esOriginal(pl);
    previa();
  }
  function previa() {
    cancelAnimationFrame(previa.r);
    previa.r = requestAnimationFrame(() => {
      const pl = estado.placas[estado.editando]; if (!pl) return;
      const c = $("#e-canvas");
      P.componer({ medio: medioDe(pl), foto: fotoDe(pl)?.bmp, titulo: tituloDe(pl), canvas: c });
      $("#e-entra").textContent = c.dataset.entra === "1" ? "" : "El título no entra: acortalo un poco o elegí otro.";
    });
  }
  // Si la placa cambió, se vuelve a generar su JPG y su miniatura.
  async function confirmar(i) {
    const pl = estado.placas[i];
    if (!pl?.sucia) return;
    pl.sucia = false;
    pl.redibujo = dibujarPlaca(i, document.createElement("canvas")); // el ZIP espera a que termine
    await pl.redibujo;
    pintarProblemas();
  }
  async function guardarUna() {
    const i = estado.editando, pl = estado.placas[i];
    await confirmar(i); await pl.redibujo;
    const nombre = `${P.nombreArchivo(medioDe(pl).nombre)}-noticia-${pl.noticia + 1}.jpg`;
    const archivo = new File([pl.blob], nombre, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo] }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    descargar(archivo, nombre);
  }
  function descargar(blob, nombre) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // ---------- ZIP e historial ----------
  async function descargarZip(b) {
    b.disabled = true; b.textContent = "Armando ZIP…";
    try {
      await Promise.all(estado.placas.map(pl => pl.redibujo));
      const items = estado.placas.map(pl => {
        const m = medioDe(pl);
        return { carpeta: m.nombre, archivo: `noticia-${pl.noticia + 1}-${P.nombreArchivo(m.nombre)}.jpg`, blob: pl.blob };
      });
      const zip = await P.armarZip(items);
      descargar(zip, `placas-${new Date().toLocaleDateString("sv-SE")}.zip`); // AAAA-MM-DD
      guardarHistorial();
    } catch (e) { aviso(e.message, true); }
    pintarPie();
  }

  // Historial: solo textos y qué le tocó a cada medio (sin fotos, para no llenar el espacio gratis).
  async function guardarHistorial() {
    const resultado = {
      noticias: estado.noticias.map(n => ({ titulos: n.titulos, fotos: n.fotos.map(f => f.nombre) })),
      placas: estado.placas.map(pl => ({
        noticia: pl.noticia, medio: pl.medio, titulo: pl.titulo,
        foto: estado.noticias[pl.noticia].fotos.findIndex(f => f.id === pl.fotoId),
        ...(pl.texto != null ? { texto: pl.texto } : {}), ...(esOriginal(pl) ? {} : { a_mano: true }),
      })),
    };
    const clave = JSON.stringify(resultado);
    if (!window.sb || estado.guardado === clave) return; // no repetir si se descarga dos veces lo mismo
    estado.guardado = clave;
    const { error } = await window.sb.from("historial").insert({ punteo: $("#g-punteo").value, resultado });
    if (error) console.warn("[placas] no se guardó el historial:", error.message);
  }

  window.Generar = { iniciar, estado };
})();
