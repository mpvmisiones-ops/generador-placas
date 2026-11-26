// Generador de Placas · pantalla del productor (Etapa 3).
// Tres pasos, uno por vez y pensados primero para el celular:
//   1. Pegar el punteo  ·  2. Cargar fotos por noticia  ·  3. Revisar, corregir y descargar.
// En el paso 3 se toca una placa para cambiarle el título (o escribir uno propio) o la foto.
// "Volver a mezclar" cambia el reparto pero respeta las placas cambiadas a mano.
// El botón "atrás" del celular vuelve al paso anterior (o cierra el editor) en vez de salir de la página.
// Historial: al descargar, la tanda (textos, fotos y qué le tocó a cada medio) se guarda en Supabase;
// desde la pestaña Historial cualquiera la reabre con abrirTanda() para corregir y volver a descargar.
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
    historialId: null,    // fila del historial de esta tanda (se actualiza al volver a descargar)
    historialInfo: null,  // { fecha, autor } si se abrió desde el historial
    guardado: null,       // clave de lo último guardado en el historial
  };
  let proximoId = 1;

  function aviso(t, mal) { const a = $("#aviso"); a.textContent = t; a.classList.toggle("mal", !!mal); a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => a.hidden = true, 3500); }

  function iniciar() {
    if (estado.listo) return;
    estado.listo = true;
    $("#g-punteo").addEventListener("input", leer);
    $("#g-pegar").addEventListener("click", pegar);
    $("#g-borrar").addEventListener("click", () => { $("#g-punteo").value = ""; olvidarTanda(); leer(); $("#g-punteo").focus(); });
    $("#g-nueva").addEventListener("click", nuevaTanda);
    $("#g-ver-historial").addEventListener("click", () => window.irA?.("historial"));
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
        </div>${window.Facebook?.puede() ? `
        <button class="btn btn-fb g-pie-fb" data-acc="fb"${dis || (estado.placas.length ? "" : " disabled")}>Publicar en Facebook</button>` : ""}`;
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
    else if (acc === "fb") window.Facebook.abrir();
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
  // Títulos de la tanda guardada que está en pantalla: sirven para darse cuenta de que se pegó
  // un punteo NUEVO encima (entonces se guarda como tanda aparte y no pisa la anterior).
  const clavesTitulos = (ns) => ns.flatMap(n => n.titulos || []).map(t => String(t).trim().toUpperCase()).filter(Boolean);
  function recordarTitulos() { estado.titulosTanda = new Set(clavesTitulos(estado.noticias)); }
  function esOtraTanda(ns) {
    if (!estado.historialId || !estado.titulosTanda?.size || !ns.length) return false;
    const siguen = ns.filter(n => clavesTitulos([n]).some(t => estado.titulosTanda.has(t))).length;
    return siguen < ns.length / 2; // menos de la mitad de las noticias coincide: es otra tanda
  }
  function leer() {
    const viejas = estado.noticias;
    estado.noticias = P.leerPunteo($("#g-punteo").value);
    if (esOtraTanda(estado.noticias)) {
      olvidarTanda();
      aviso("Punteo nuevo: se va a guardar como otra tanda en el historial (la anterior no se toca).");
    }
    // Si se edita el texto, cada noticia conserva las fotos que ya tenía.
    estado.noticias.forEach((n, i) => { n.fotos = viejas[i]?.fotos || []; if (viejas[i]?.usadas) n.usadas = viejas[i].usadas; });
    viejas.slice(estado.noticias.length).forEach(n => n.fotos.forEach(soltarFoto)); // noticias borradas
    pintarResumen();
    pintarFotos();
    mostrar(estado.paso);
  }
  function pintarResumen() {
    const res = $("#g-resumen");
    res.innerHTML = estado.noticias.length
      ? `<p class="g-cuenta"><strong>${plural(estado.noticias.length, "noticia encontrada", "noticias encontradas")}</strong></p>` +
        estado.noticias.map((n, i) => `<div class="g-noticia"><span class="g-num">${i + 1}</span><div>${n.aviso ? `<p class="error">${esc(n.aviso)}</p>` : ""}<ol>${n.titulos.map(t => `<li>${esc(t)}</li>`).join("")}</ol></div></div>`).join("")
      : "";
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
          ${!n.fotos.length && n.usadas?.length ? `<span class="g-usadas">Esa vez se usaron: ${n.usadas.map(esc).join(", ")}</span>` : ""}
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
  const esOriginal = (pl) => pl.texto == null && pl.titulo === pl.orig.titulo && pl.fotoId === pl.orig.fotoId && !P.hayAjuste(pl.ajuste);

  async function armar(mezclar) {
    if (estado.armando) return;
    estado.armando = true; pintarPie();
    const prog = $("#g-progreso");
    try {
      await cargarMedios();
      const medios = estado.medios.filter(m => m.en_rotacion);
      if (mezclar || !estado.semilla) estado.semilla = Math.floor(Math.random() * 2 ** 31);

      // Las placas cambiadas a mano se conservan (si su título y su foto todavía existen).
      const aMano = new Map(estado.placas.filter(p => !esOriginal(p)).map(p => [p.noticia + "|" + p.medio, p]));
      let conservadas = 0;
      estado.placas.forEach(p => p.url && URL.revokeObjectURL(p.url));
      if (estado.pendientes && !mezclar) {
        estado.placas = placasGuardadas(estado.pendientes, []);
        estado.pendientes = null;
      } else estado.placas = P.repartir(estado.noticias, medios, estado.semilla).map(p => {
        const n = estado.noticias[p.noticia];
        const pl = { noticia: p.noticia, medio: p.medio, titulo: p.titulo, fotoId: n.fotos[p.foto]?.id, texto: null };
        pl.orig = { titulo: pl.titulo, fotoId: pl.fotoId };
        const v = aMano.get(p.noticia + "|" + p.medio);
        if (v && v.titulo < n.titulos.length && n.fotos.some(f => f.id === v.fotoId)) {
          Object.assign(pl, { titulo: v.titulo, fotoId: v.fotoId, texto: v.texto, ajuste: v.ajuste });
          if (!esOriginal(pl)) conservadas++;
        }
        return pl;
      });
      estado.firma = firma();
      await dibujarTodas();
      if (mezclar && conservadas) aviso(`Mezclado. Se mantuvieron ${plural(conservadas, "placa cambiada", "placas cambiadas")} a mano.`);
    } catch (e) {
      console.error(e); prog.textContent = "Error: " + e.message;
    }
    estado.armando = false;
    pintarPie(); pintarProblemas();
  }

  async function cargarMedios() {
    if (!estado.medios) {
      $("#g-progreso").textContent = "Cargando diseños de los medios…";
      estado.medios = await P.prepararMedios(await P.cargarMedios(window.sb), window.sb);
    }
    return estado.medios;
  }
  async function dibujarTodas() {
    const prog = $("#g-progreso");
    pintarGrilla();
    const canvas = document.createElement("canvas");
    for (let i = 0; i < estado.placas.length; i++) {
      prog.textContent = `Armando placa ${i + 1} de ${estado.placas.length}…`;
      await dibujarPlaca(i, canvas);
      if (i % 4 === 3) await new Promise(r => setTimeout(r)); // deja respirar a la pantalla
    }
    prog.textContent = `${plural(estado.placas.length, "placa lista", "placas listas")}.`;
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
    P.componer({ medio: medioDe(pl), foto: fotoDe(pl)?.bmp, titulo: tituloDe(pl), canvas, ajuste: pl.ajuste });
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
      Object.assign(pl, { titulo: pl.orig.titulo, fotoId: pl.orig.fotoId, texto: null, ajuste: null });
      $("#e-texto").value = tituloDe(pl);
      cambiado();
    });
    $("#e-guardar").addEventListener("click", guardarUna);
    // Acomodar texto: tamaño, ancho y posición de la caja del título en esta placa.
    const ajustar = (k, v) => {
      const pl = estado.placas[estado.editando];
      pl.ajuste = { ...(pl.ajuste || P.SIN_AJUSTE), [k]: v };
      pl.sucia = true; pintarAjustes(); $("#e-original").hidden = esOriginal(pl); previa();
    };
    $("#e-ajustes").addEventListener("input", (e) => {
      const r = e.target.closest("[data-a]"); if (!r) return;
      ajustar(r.dataset.a, r.type === "color" ? r.value : +r.value);
    });
    $("#e-ajustes").addEventListener("click", (e) => { // alineación y mayúsculas
      const b = e.target.closest(".e-segm [data-val]"); if (!b) return;
      const v = b.dataset.val;
      ajustar(b.parentElement.dataset.g, v === "true" ? true : v === "false" ? false : v);
    });
    $("#e-aj-cero").addEventListener("click", () => { estado.placas[estado.editando].ajuste = null; cambiado(); });
    $("#e-aj-todas").addEventListener("click", aplicarATodas);
    $("#e-aj-guardar").addEventListener("click", guardarDiseno);
  }

  function nota(t, mal) { const p = $("#e-nota"); p.textContent = t; p.classList.toggle("mal", !!mal); }
  function pintarAjustes() {
    const pl = estado.placas[estado.editando], a = { ...P.SIN_AJUSTE, ...(pl.ajuste || {}) };
    const t = medioDe(pl).config.titulo;
    // Lo absoluto que no se tocó muestra el valor del diseño del medio.
    const DEF = { color: t.color, resalte: t.resalte || "#ffd400", contornoColor: t.contornoColor || "#000000", alinear: t.alinear || "left",
                  valinear: t.valinear || "top", mayus: !!t.mayus, sombra: t.sombra || 0, contorno: t.contorno || 0 };
    const val = (k) => a[k] ?? DEF[k];
    document.querySelectorAll("#e-ajustes [data-a]").forEach(r => { r.value = val(r.dataset.a); });
    document.querySelectorAll("#e-ajustes .e-segm").forEach(g => {
      g.querySelectorAll("[data-val]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.val === String(val(g.dataset.g)))));
    });
    document.querySelectorAll("#e-ajustes [data-v]").forEach(o => {
      const k = o.dataset.v, v = val(k);
      o.textContent = k === "dx" || k === "dy" || k === "espaciado" ? (v > 0 ? "+" : "") + v
        : k === "contorno" ? v + " px" : v + " %";
    });
  }
  // Copia el ajuste de esta placa a todas las placas del mismo medio.
  function aplicarATodas() {
    const i = estado.editando, pl = estado.placas[i];
    let n = 0;
    estado.placas.forEach((o, k) => {
      if (k === i || o.medio !== pl.medio) return;
      o.ajuste = pl.ajuste ? { ...pl.ajuste } : null; o.sucia = true; n++;
      confirmar(k);
    });
    nota(n ? `Listo: se aplicó a ${plural(n, "placa más", "placas más")} de ${medioDe(pl).nombre}.` : "No hay otras placas de este medio.", !n);
  }
  // Solo admin: guarda la caja ajustada como diseño del medio (tabla "medios"), para todas las tandas.
  async function guardarDiseno() {
    const i = estado.editando, pl = estado.placas[i], m = medioDe(pl), b = $("#e-aj-guardar");
    if (!P.hayAjuste(pl.ajuste)) return nota("Primero acomodá el texto o el fondo con los controles.", true);
    if (!confirm(`¿Guardar este texto y esta opacidad del fondo como diseño fijo de ${m.nombre}? Se va a usar en todas las placas de ahora en adelante.`)) return;
    const titulo = P.cajaAjustada(m.config.titulo, pl.ajuste);
    const capa = { ...(m.config.capa || {}), opacidad: P.opacidadDe(m, pl.ajuste) };
    b.disabled = true;
    let error;
    try { ({ error } = await window.sb.from("medios").update({ config: { ...m.config, titulo, capa }, actualizado_en: new Date().toISOString() }).eq("id", m.id)); }
    catch (e) { error = e; }
    b.disabled = false;
    if (error) return nota("No se pudo guardar: " + error.message, true);
    m.config = { ...m.config, titulo, capa };
    // El ajuste ya quedó dentro del diseño: se quita de todas las placas de este medio.
    estado.placas.forEach((o, k) => {
      if (o.medio !== m.id) return;
      o.ajuste = null; o.sucia = true; if (k !== i) confirmar(k);
    });
    pintarEditor();
    nota(`Guardado: ${m.nombre} usa este diseño de ahora en adelante.`);
  }

  function abrirEditor(i) {
    const dlg = $("#dlg-placa");
    estado.editando = i;
    nota("");
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
    document.querySelectorAll(".e-medio-nombre").forEach(s => s.textContent = m.nombre);
    $("#e-aj-guardar").hidden = window.perfil?.rol !== "admin" || !window.sb;
    pintarAjustes();
    previa();
  }
  function previa() {
    cancelAnimationFrame(previa.r);
    previa.r = requestAnimationFrame(() => {
      const pl = estado.placas[estado.editando]; if (!pl) return;
      const c = $("#e-canvas");
      P.componer({ medio: medioDe(pl), foto: fotoDe(pl)?.bmp, titulo: tituloDe(pl), canvas: c, ajuste: pl.ajuste });
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
    if (estado.historialId) guardarHistorial(); // corrección de una tanda guardada: se actualiza
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
      // Nombre: número de noticia + 1-2 palabras clave (las mismas en todos los medios) + medio.
      const claves = estado.noticias.map(n => P.palabrasClave(n.titulos).join("-"));
      const items = estado.placas.map(pl => {
        const m = medioDe(pl), clave = claves[pl.noticia] ? claves[pl.noticia] + "-" : "";
        return { carpeta: m.nombre, archivo: `noticia-${pl.noticia + 1}-${clave}${P.nombreArchivo(m.nombre)}.jpg`, blob: pl.blob };
      });
      const zip = await P.armarZip(items);
      descargar(zip, `placas-${new Date().toLocaleDateString("sv-SE")}.zip`); // AAAA-MM-DD
      guardarHistorial();
    } catch (e) { aviso(e.message, true); }
    pintarPie();
  }

  // ---------- Historial general ----------
  // Se guarda al descargar: textos, fotos (achicadas, en el Storage "historial") y qué le tocó a cada medio.
  // Si la tanda ya estaba guardada (o se abrió desde el historial), se actualiza la misma fila.
  const claveTanda = () => JSON.stringify([
    estado.noticias.map(n => [n.titulos, n.fotos.map(f => f.id)]),
    estado.placas.map(pl => [pl.noticia, pl.medio, pl.titulo, pl.fotoId, pl.texto, pl.ajuste, pl.facebook]),
  ]);
  function guardarHistorial() {
    if (!window.sb || estado.guardado === claveTanda()) return; // no repetir si no cambió nada
    if (estado.guardando) return estado.guardando.then(guardarHistorial);
    estado.guardando = (async () => {
      const clave = claveTanda();
      try {
        let sinSubir = 0;
        for (const n of estado.noticias) for (const f of n.fotos) {
          if (f.path) continue;
          try { await subirFoto(f); } catch (e) { sinSubir++; console.warn("[placas] foto sin subir:", e.message); }
        }
        const resultado = { // autor, corrector y fechas los pone la base (no se confía en el navegador)
          version: 2, semilla: estado.semilla,
          noticias: estado.noticias.map(n => ({ titulos: n.titulos, fotos: n.fotos.map(f => ({ nombre: f.nombre, path: f.path || null })) })),
          placas: estado.placas.map(pl => ({
            noticia: pl.noticia, medio: pl.medio, titulo: pl.titulo,
            foto: estado.noticias[pl.noticia].fotos.findIndex(f => f.id === pl.fotoId),
            ...(pl.texto != null ? { texto: pl.texto } : {}), ...(P.hayAjuste(pl.ajuste) ? { ajuste: pl.ajuste } : {}), ...(esOriginal(pl) ? {} : { a_mano: true }),
            ...(pl.facebook ? { facebook: pl.facebook } : {}), // ya publicada o programada (ver js/facebook.js)
          })),
        };
        const punteo = $("#g-punteo").value;
        let error;
        if (estado.historialId) ({ error } = await window.sb.from("historial").update({ punteo, resultado }).eq("id", estado.historialId));
        else {
          const r = await window.sb.from("historial").insert({ punteo, resultado }).select("id").single();
          error = r.error; if (!error) estado.historialId = r.data.id;
        }
        if (error) throw error;
        estado.guardado = clave; recordarTitulos();
        aviso(sinSubir ? `Guardado en el historial, pero ${plural(sinSubir, "foto no se pudo subir", "fotos no se pudieron subir")}.` : "Guardado en el historial.", !!sinSubir);
      } catch (e) {
        console.warn("[placas] no se guardó el historial:", e.message);
        aviso("No se pudo guardar en el historial: " + e.message, true);
      } finally { estado.guardando = null; }
    })();
    return estado.guardando;
  }
  // Foto achicada (1600 px de lado mayor) para no llenar el espacio gratis de Supabase.
  async function subirFoto(f) {
    const k = Math.min(1, 1600 / Math.max(f.bmp.width, f.bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(f.bmp.width * k); c.height = Math.round(f.bmp.height * k);
    c.getContext("2d").drawImage(f.bmp, 0, 0, c.width, c.height);
    const blob = await P.aBlob(c, "image/jpeg", 0.85);
    const path = `${new Date().toLocaleDateString("sv-SE")}/${crypto.randomUUID()}.jpg`;
    const { error } = await window.sb.storage.from("historial").upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw error;
    f.path = path;
  }

  // Borra todo lo que hay en pantalla (fotos, placas) y desvincula la tanda del historial.
  function limpiarTodo() {
    estado.noticias.forEach(n => n.fotos.forEach(soltarFoto));
    estado.placas.forEach(p => p.url && URL.revokeObjectURL(p.url));
    Object.assign(estado, { noticias: [], placas: [], firma: "", semilla: 0, pendientes: null });
    $("#g-placas").innerHTML = ""; $("#g-progreso").textContent = "";
    olvidarTanda();
  }
  function olvidarTanda() {
    Object.assign(estado, { historialId: null, historialInfo: null, guardado: null, titulosTanda: null });
    pintarTanda();
  }
  function pintarTanda() {
    const i = estado.historialInfo;
    $("#g-tanda").hidden = !i;
    if (i) $("#g-tanda-txt").textContent = `Corrigiendo la tanda del ${i.fecha}${i.autor ? ` (${i.autor})` : ""}. Al descargar se actualiza en el historial.`;
  }
  function irPaso(n) { // salto directo (sin apilar en el historial del navegador)
    estado.pila[estado.pila.length - 1] = n;
    history.replaceState({ paso: n, d: estado.pila.length - 1, dlg: false }, "");
    mostrar(n);
  }
  function nuevaTanda() {
    if (estado.noticias.some(n => n.fotos.length) && !confirm("¿Empezar una tanda nueva? Lo que está en pantalla se borra (lo ya descargado queda en el historial).")) return;
    limpiarTodo(); $("#g-punteo").value = ""; leer(); irPaso(1);
  }

  // Placas de una tanda guardada: mismo medio, título, texto propio y ajuste. La foto se busca por su
  // número en la noticia (porIndice: fotos bajadas del historial; si no, las cargadas en ese orden).
  function placasGuardadas(guardadas, porIndice) {
    const ids = new Set(estado.medios.map(m => m.id));
    return guardadas.filter(p => ids.has(p.medio) && estado.noticias[p.noticia]).map(p => {
      const n = estado.noticias[p.noticia];
      const fotoId = (porIndice[p.noticia]?.[p.foto] || n.fotos[p.foto] || n.fotos[0])?.id;
      const pl = { noticia: p.noticia, medio: p.medio, titulo: Math.max(0, Math.min(p.titulo ?? 0, n.titulos.length - 1)), fotoId, texto: p.texto ?? null, ajuste: p.ajuste || null,
        facebook: p.facebook && typeof p.facebook === "object" ? p.facebook : null };
      pl.orig = { titulo: pl.titulo, fotoId };
      return pl;
    });
  }

  // Abre una tanda guardada: baja sus fotos y rearma las placas tal como quedaron.
  async function abrirTanda(fila) {
    if (estado.armando) return false;
    if (estado.historialId !== fila.id && estado.noticias.some(n => n.fotos.length) &&
        !confirm("Se va a reemplazar lo que estás armando ahora. ¿Abrir la tanda del historial?")) return false;
    const lista = (x) => Array.isArray(x) ? x : [];
    const r0 = fila.resultado && typeof fila.resultado === "object" ? fila.resultado : {};
    const r = { ...r0, noticias: lista(r0.noticias).filter(n => n && typeof n === "object").map(n => ({ ...n, titulos: lista(n.titulos).map(String), fotos: lista(n.fotos) })), placas: lista(r0.placas).filter(p => p && typeof p === "object") };
    limpiarTodo();
    estado.armando = true; pintarPie();
    aviso("Abriendo la tanda…");
    let faltan = 0;
    try {
      $("#g-punteo").value = fila.punteo || "";
      estado.noticias = (r.noticias || []).map(n => ({
        titulos: n.titulos || [], aviso: "", fotos: [],
        // nombres de las fotos que se usaron esa vez (las tandas viejas solo guardaban el nombre)
        usadas: (n.fotos || []).map(f => typeof f === "string" ? f : f?.nombre).filter(Boolean),
      }));
      if (!estado.noticias.length) estado.noticias = P.leerPunteo(fila.punteo).map(n => ({ ...n, fotos: [] }));
      const porIndice = estado.noticias.map(() => []); // índice guardado → foto nueva
      for (const [ni, n] of (r.noticias || []).entries()) {
        for (const [k, f] of (n.fotos || []).entries()) {
          if (!f?.path) { faltan++; continue; }
          try {
            const { data: blob, error } = await window.sb.storage.from("historial").download(f.path);
            if (error) throw error;
            const foto = { id: proximoId++, bmp: await P.leerFoto(blob), url: URL.createObjectURL(blob), nombre: f.nombre, path: f.path };
            estado.noticias[ni].fotos.push(foto); porIndice[ni][k] = foto;
          } catch (e) { faltan++; console.warn("[placas] foto del historial:", e.message); }
        }
      }
      await cargarMedios();
      estado.placas = placasGuardadas(r.placas || [], porIndice);
      estado.semilla = r.semilla || 0;
      estado.historialId = fila.id;
      estado.historialInfo = { fecha: new Date(fila.creado_en).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), autor: fila._autor || "" };
      estado.firma = firma();
      estado.guardado = claveTanda(); recordarTitulos();
    } catch (e) {
      console.error(e); aviso("No se pudo abrir la tanda: " + e.message, true);
    }
    estado.armando = false;
    pintarResumen(); pintarFotos(); pintarTanda();
    if (faltanFotos().length || !estado.placas.length) {
      estado.pendientes = r.placas?.length ? r.placas : null; // al cargar las fotos se rearma igual que la original
      estado.placas = []; estado.firma = "";
      irPaso(estado.noticias.length ? 2 : 1);
      const vieja = !(r.noticias || []).some(n => (n.fotos || []).some(f => f?.path));
      aviso(vieja ? "Esta tanda es de antes de que se guardaran las fotos: cargalas una vez y al descargar quedan guardadas."
        : faltan ? "Esta tanda no tiene todas sus fotos guardadas: cargalas de nuevo." : "Revisá la tanda y armá las placas.", !!faltan || vieja);
      return true;
    }
    irPaso(3);
    estado.armando = true; pintarPie();
    await dibujarTodas();
    estado.armando = false; pintarPie(); pintarProblemas();
    if (faltan) aviso(`${plural(faltan, "foto no se pudo recuperar", "fotos no se pudieron recuperar")}; esas placas usan otra foto de la noticia.`, true);
    return true;
  }

  window.Generar = { iniciar, estado, abrirTanda, guardarHistorial };
})();
