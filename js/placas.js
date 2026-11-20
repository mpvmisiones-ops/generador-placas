// Generador de Placas · Etapa 2: motor de placas.
// Lee el punteo, reparte títulos y fotos entre medios y arma cada placa en canvas (1080 × 1350):
// fondo → foto recortada a su zona → capa PNG del medio (o boceto si todavía no hay capa) → título.
// Uso: window.Placas (lo usa js/generar.js). No depende de la interfaz.
(() => {
  const ANCHO = 1080, ALTO = 1350;

  // ---------- Medios por defecto (copia de supabase/esquema.sql) ----------
  // Se usan si la tabla "medios" no responde, y para completar campos que falten.
  const M = (id, nombre, orden, titulo, foto, es_neutra = false) => ({ id, nombre, orden, en_rotacion: true, es_neutra, capa_path: null, fuente_path: null, config: { titulo, foto } });
  const T = (x, y, w, h, fuente, peso, tam, color, interlineado, espaciado) => ({ x, y, w, h, fuente, peso, tam, color, interlineado, espaciado, mayus: true, alinear: "left" });
  const MEDIOS_DEFECTO = [
    M("muy-temprano", "Muy Temprano", 1, T(177, 1011, 728, 321, "Montserrat", 800, 56, "#ffffff", 1.15, 0), { x: 0, y: 0, w: 1080, h: 1350 }),
    M("interesante", "Interesante", 2, T(114, 934, 852, 428, "Oak Sans", 800, 58, "#fdfdfd", 1.11, -0.052), { x: 0, y: 0, w: 1080, h: 1350 }),
    M("extensiones", "Extensiones", 3, T(177, 921, 775, 352, "Montserrat", 800, 56, "#ffffff", 1.15, 0), { x: 0, y: 0, w: 1080, h: 1172 }),
    M("radar-legislativo", "Radar Legislativo", 4, T(134, 854, 838, 404, "Open Sans", 800, 50, "#cee6e9", 1.11, -0.052), { x: 0, y: 0, w: 1080, h: 826 }),
    M("misiones-biodiversidad", "Misiones Biodiversidad", 5, T(174, 829, 728, 375, "Poppins", 700, 50, "#6c0c0b", 1.11, -0.052), { x: 0, y: 0, w: 1080, h: 846 }),
    M("central-de-noticias", "Central de Noticias", 6, T(78, 958, 949, 364, "Lato", 900, 58, "#ffffff", 1.11, -0.052), { x: 0, y: 108, w: 1080, h: 821 }),
    M("zona-random", "Zona Random", 7, T(404, 729, 633, 326, "Bebas Neue", 700, 73, "#000000", 1.09, -0.01), { x: 0, y: 0, w: 914, h: 1350 }),
    M("misiones-digital", "Misiones Digital", 8, T(160, 855, 665, 420, "Archivo Black", 400, 44, "#ffffff", 1.11, -0.052), { x: 229, y: 0, w: 851, h: 1350 }),
    M("hola-misiones", "Hola Misiones", 9, T(82, 926, 916, 291, "Archivo Black", 400, 44, "#ffffff", 1.11, -0.052), { x: 0, y: 0, w: 1080, h: 801 }),
    M("canal-12", "Canal 12", 10, T(108, 887, 916, 294, "Inter", 900, 65, "#ffffff", 1.11, 0), { x: 0, y: 0, w: 1080, h: 801 }),
    M("neutra", "NEUTRA", 11, T(46, 875, 1014, 491, "Montserrat", 800, 56, "#ffffff", 1.15, 0), { x: 0, y: 0, w: 1080, h: 1350 }, true),
  ];

  // Tipografías: las de Google Fonts se cargan solas. Oak Sans es exclusiva de Canva:
  // mientras el admin no suba el archivo (fuente_path), se reemplaza por una parecida.
  const REEMPLAZOS = { "Oak Sans": "Plus Jakarta Sans" };
  const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bebas+Neue&family=Inter:wght@900&family=Lato:wght@900&family=Montserrat:wght@800&family=Open+Sans:wght@800&family=Plus+Jakarta+Sans:wght@800&family=Poppins:wght@700&display=swap";

  // ---------- 1. Leer el punteo ----------
  // Las noticias se separan con /// y los títulos van entre *asteriscos* (negrita de WhatsApp).
  function limpiarTitulo(t) {
    return t.replace(/[_~`]/g, "")                 // otros formatos de WhatsApp
      .replace(/^[\s\-–—•·▪►✅👉🔹🔸\d.)]+(?=\D)/u, "") // viñetas y numeración al principio
      .replace(/\s+/g, " ").trim();
  }
  function leerPunteo(texto) {
    const bloques = String(texto || "").replace(/\r/g, "").split(/\/{3,}/);
    const noticias = [];
    for (const b of bloques) {
      if (!b.trim()) continue;
      const titulos = [];
      for (const m of b.matchAll(/\*([^*\n]+)\*/g)) {
        const t = limpiarTitulo(m[1]);
        if (t.length > 3 && !titulos.includes(t)) titulos.push(t);
      }
      let aviso = "";
      if (!titulos.length) { // sin asteriscos: tomo la primera línea con texto
        const linea = b.split("\n").map(limpiarTitulo).find(l => l.length > 3);
        if (!linea) continue;
        titulos.push(linea); aviso = "Esta noticia no tenía títulos entre *asteriscos*: usé la primera línea.";
      }
      noticias.push({ titulos, aviso });
    }
    return noticias;
  }

  // ---------- 2. Repartir títulos y fotos entre medios ----------
  // Para cada noticia, cada medio recibe una combinación (título, foto). Se equilibra el uso de cada
  // título y cada foto, y se evita que dos medios seguidos repitan título o foto.
  function azar(semilla) { // mulberry32: mismo número → mismo reparto
    let a = semilla >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function repartir(noticias, medios, semilla = Date.now()) {
    const r = azar(semilla), placas = [];
    noticias.forEach((n, ni) => {
      const nt = n.titulos.length, nf = Math.max(1, n.fotos?.length || 0);
      const usoT = Array(nt).fill(0), usoF = Array(nf).fill(0), usoC = {};
      let prev = null;
      // Los empates se desempatan al azar: así no siempre el primer medio recibe el título 1.
      medios.forEach((m) => {
        let mejor = null, mejorPuntos = Infinity;
        for (let t = 0; t < nt; t++) for (let f = 0; f < nf; f++) {
          const p = (usoC[t + "-" + f] || 0) * 100 + usoT[t] * 10 + usoF[f] * 10
            + (prev && prev.t === t ? 20 : 0) + (prev && prev.f === f ? 15 : 0) + r();
          if (p < mejorPuntos) { mejorPuntos = p; mejor = { t, f }; }
        }
        usoT[mejor.t]++; usoF[mejor.f]++; usoC[mejor.t + "-" + mejor.f] = (usoC[mejor.t + "-" + mejor.f] || 0) + 1;
        prev = mejor;
        placas.push({ noticia: ni, medio: m.id, titulo: mejor.t, foto: mejor.f });
      });
    });
    return placas;
  }

  // ---------- 3. Recursos: medios, tipografías, capas ----------
  function completarMedio(m) {
    const d = MEDIOS_DEFECTO.find(x => x.id === m.id);
    const c = m.config || {};
    return { ...d, ...m, config: { titulo: { ...(d?.config.titulo), ...(c.titulo || {}) }, foto: { ...(d?.config.foto), ...(c.foto || {}) } } };
  }
  async function cargarMedios(sb) {
    if (!sb) return MEDIOS_DEFECTO.map(completarMedio);
    const { data, error } = await sb.from("medios").select("*").order("orden");
    if (error || !data?.length) { console.warn("[placas] uso medios por defecto:", error?.message); return MEDIOS_DEFECTO.map(completarMedio); }
    return data.map(completarMedio);
  }

  let cssFuentes = null;
  function cargarCssFuentes() {
    if (cssFuentes) return cssFuentes;
    cssFuentes = new Promise((ok) => {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = GOOGLE_FONTS; l.onload = ok; l.onerror = () => { console.warn("[placas] no cargó Google Fonts"); ok(); };
      document.head.appendChild(l);
    });
    return cssFuentes;
  }
  const familiaDe = (m) => m.fuente_path ? "medio-" + m.id : (REEMPLAZOS[m.config.titulo.fuente] || m.config.titulo.fuente);

  const cacheImg = new Map();
  function cargarImagen(url) {
    if (!cacheImg.has(url)) cacheImg.set(url, new Promise((ok, mal) => {
      const i = new Image(); i.crossOrigin = "anonymous"; i.decoding = "async";
      i.onload = () => ok(i); i.onerror = () => { cacheImg.delete(url); mal(new Error("No se pudo cargar " + url)); };
      i.src = url;
    }));
    return cacheImg.get(url);
  }

  // Deja todo listo para dibujar: tipografías cargadas y capas descargadas.
  async function prepararMedios(medios, sb) {
    await cargarCssFuentes();
    const urlPublica = (bucket, path) => sb?.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    await Promise.all(medios.map(async (m) => {
      const t = m.config.titulo;
      if (m.fuente_path && sb) {
        try { const f = new FontFace("medio-" + m.id, `url("${urlPublica("tipografias", m.fuente_path)}")`); document.fonts.add(await f.load()); }
        catch (e) { console.warn("[placas] tipografía de", m.id, e); m.fuente_path = null; }
      }
      try { await document.fonts.load(`${t.peso} ${t.tam}px "${familiaDe(m)}"`, "ÁÉÍÓÚÑ"); } catch {}
      m._capa = null;
      if (m.capa_path && sb) {
        const v = m.actualizado_en ? "?v=" + encodeURIComponent(m.actualizado_en) : "";
        try { m._capa = await cargarImagen(urlPublica("capas", m.capa_path) + v); } catch (e) { console.warn("[placas]", e.message); }
      }
    }));
    return medios;
  }

  // Fotos: se decodifican una sola vez y se achican si son enormes (ahorra memoria en el celular).
  async function leerFoto(archivo) {
    const MAX = 2400;
    let bmp;
    try { bmp = await createImageBitmap(archivo, { imageOrientation: "from-image" }); }
    catch { bmp = await createImageBitmap(await cargarImagen(URL.createObjectURL(archivo))); }
    const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    if (k === 1) return bmp;
    const c = new OffscreenCanvasOr(Math.round(bmp.width * k), Math.round(bmp.height * k));
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return await createImageBitmap(c);
  }
  function OffscreenCanvasOr(w, h) {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
  }

  // ---------- 4. Dibujar ----------
  // Foto tipo "cover": llena la zona sin deformarse, recortando lo que sobra (centrada).
  function dibujarFoto(ctx, foto, z) {
    ctx.save();
    ctx.beginPath(); ctx.rect(z.x, z.y, z.w, z.h); ctx.clip();
    if (foto) {
      const k = Math.max(z.w / foto.width, z.h / foto.height);
      const w = foto.width * k, h = foto.height * k;
      const fx = z.focoX ?? 0.5, fy = z.focoY ?? 0.5;
      ctx.drawImage(foto, z.x + (z.w - w) * fx, z.y + (z.h - h) * fy, w, h);
    } else {
      ctx.fillStyle = "#3a3a40"; ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.font = "700 40px system-ui"; ctx.textAlign = "center";
      ctx.fillText("SIN FOTO", z.x + z.w / 2, z.y + z.h / 2);
    }
    ctx.restore();
  }

  // Boceto aproximado de cada diseño (cajas y colores del Canva) mientras no esté la capa PNG.
  const BOCETOS = {
    "muy-temprano": (c) => { grad(c, 0, 260, .6, 0); grad(c, 700, 1350, 0, .85); caja(c, "#fd6c2e", 114, 967, 864, 471); },
    "interesante": (c) => { grad(c, 650, 1350, 0, .9); },
    "extensiones": (c) => { grad(c, 850, 1172, 0, 1); caja(c, "#000", 0, 1172, 1080, 178); },
    "radar-legislativo": (c) => { caja(c, "#163a5c", 0, 826, 1080, 524); caja(c, "#7caeca", 0, 826, 1080, 14); caja(c, "#cee6e9", 0, 840, 1080, 6); },
    "misiones-biodiversidad": (c) => { caja(c, "#2f5d34", 0, 846, 1080, 504); caja(c, "#fdfdfd", 108, 686, 864, 494); },
    "central-de-noticias": (c) => { caja(c, "#0b2a4a", 0, 0, 1080, 108); caja(c, "#0b2a4a", 0, 929, 1080, 421); },
    "zona-random": (c) => { caja(c, "#000", 914, 0, 166, 1350); caja(c, "#ccf624", 341, 675, 649, 338); },
    "misiones-digital": (c) => { caja(c, "#1a1a1a", 0, 0, 229, 1350); caja(c, "#e3313c", 108, 811, 827, 439); },
    "hola-misiones": (c) => { caja(c, "#111", 0, 801, 1080, 549); },
    "canal-12": (c) => { caja(c, "#0f1b2d", 0, 801, 1080, 549); caja(c, "#fff", 79, 1217, 922, 3); },
    "neutra": (c) => { grad(c, 560, 716, 0, 1); caja(c, "#000", 0, 716, 1080, 634); },
  };
  function caja(c, color, x, y, w, h) { c.fillStyle = color; c.fillRect(x, y, w, h); }
  function grad(c, y0, y1, a0, a1) { // degradé negro vertical de opacidad a0 → a1
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(0,0,0,${a0})`); g.addColorStop(1, `rgba(0,0,0,${a1})`);
    c.fillStyle = g; c.fillRect(0, Math.min(y0, y1), ANCHO, Math.abs(y1 - y0));
  }
  function dibujarBoceto(ctx, m) {
    (BOCETOS[m.id] || (() => {}))(ctx);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(24, 24, 560, 64);
    ctx.fillStyle = "#fff"; ctx.font = "700 30px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("BOCETO · " + m.nombre.toUpperCase(), 44, 57);
    ctx.restore();
  }

  // Título: se parte en renglones según el ancho de la caja y se achica la letra hasta que entre.
  const soportaEspaciado = (() => { try { return "letterSpacing" in CanvasRenderingContext2D.prototype; } catch { return false; } })();
  function prepararLetra(ctx, m, tam) {
    const t = m.config.titulo;
    ctx.font = `${t.peso} ${tam}px "${familiaDe(m)}", sans-serif`;
    if (soportaEspaciado) ctx.letterSpacing = ((t.espaciado || 0) * tam).toFixed(2) + "px";
  }
  function partirRenglones(ctx, texto, ancho) {
    const palabras = texto.split(" "), renglones = [];
    let linea = "";
    for (const p of palabras) {
      const prueba = linea ? linea + " " + p : p;
      if (!linea || ctx.measureText(prueba).width <= ancho) linea = prueba;
      else { renglones.push(linea); linea = p; }
    }
    if (linea) renglones.push(linea);
    return renglones;
  }
  function medirTitulo(ctx, m, texto) {
    const t = m.config.titulo;
    if (t.mayus) texto = texto.toLocaleUpperCase("es");
    const minimo = Math.max(16, Math.round(t.tam * 0.55));
    for (let tam = t.tam; tam >= minimo; tam--) {
      prepararLetra(ctx, m, tam);
      const renglones = partirRenglones(ctx, texto, t.w);
      const alto = renglones.length * tam * t.interlineado;
      if (alto <= t.h && renglones.every(r => ctx.measureText(r).width <= t.w)) return { tam, renglones, entra: true };
    }
    prepararLetra(ctx, m, minimo);
    return { tam: minimo, renglones: partirRenglones(ctx, texto, t.w), entra: false };
  }
  function dibujarTitulo(ctx, m, texto) {
    const t = m.config.titulo;
    const med = medirTitulo(ctx, m, texto);
    prepararLetra(ctx, m, med.tam);
    ctx.fillStyle = t.color; ctx.textBaseline = "alphabetic"; ctx.textAlign = t.alinear || "left";
    const lh = med.tam * t.interlineado;
    const mt = ctx.measureText("ÁH");
    const asc = mt.fontBoundingBoxAscent ?? med.tam * 0.93, desc = mt.fontBoundingBoxDescent ?? med.tam * 0.24;
    const x = t.alinear === "center" ? t.x + t.w / 2 : t.alinear === "right" ? t.x + t.w : t.x;
    const altoTotal = med.renglones.length * lh;
    const y0 = t.valinear === "bottom" ? t.y + t.h - altoTotal : t.valinear === "middle" ? t.y + (t.h - altoTotal) / 2 : t.y;
    med.renglones.forEach((r, i) => ctx.fillText(r, x, y0 + i * lh + (lh - (asc + desc)) / 2 + asc));
    if (soportaEspaciado) ctx.letterSpacing = "0px";
    return med;
  }

  // Arma una placa completa en el canvas dado (o en uno nuevo) y lo devuelve.
  function componer({ medio, foto, titulo, canvas }) {
    const c = canvas || document.createElement("canvas");
    c.width = ANCHO; c.height = ALTO;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#111"; ctx.fillRect(0, 0, ANCHO, ALTO);
    dibujarFoto(ctx, foto, medio.config.foto);
    if (medio._capa) ctx.drawImage(medio._capa, 0, 0, ANCHO, ALTO); else dibujarBoceto(ctx, medio);
    const med = dibujarTitulo(ctx, medio, titulo || "");
    c.dataset.entra = med.entra ? "1" : "0";
    return c;
  }

  const aBlob = (c, tipo = "image/jpeg", calidad = 0.92) => new Promise((ok) => c.toBlob(ok, tipo, calidad));
  const nombreArchivo = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

  // ZIP con una carpeta por medio: "Muy Temprano/noticia-1.jpg", etc.
  async function armarZip(items) { // items: [{ carpeta, archivo, blob }]
    if (!window.JSZip) throw new Error("No cargó la librería del ZIP. Revisá la conexión.");
    const zip = new JSZip();
    items.forEach(i => zip.folder(i.carpeta).file(i.archivo, i.blob));
    return zip.generateAsync({ type: "blob", compression: "STORE" }); // los JPG ya vienen comprimidos
  }

  window.Placas = { ANCHO, ALTO, MEDIOS_DEFECTO, leerPunteo, repartir, cargarMedios, prepararMedios, leerFoto, componer, medirTitulo, aBlob, armarZip, nombreArchivo };
})();
