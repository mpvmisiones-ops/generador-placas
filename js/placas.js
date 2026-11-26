// Generador de Placas · Etapa 2: motor de placas.
// Lee el punteo, reparte títulos y fotos entre medios y arma cada placa en canvas (1080 × 1350):
// fondo → foto recortada a su zona → capa PNG del medio → título.
// Capa: la subida por el admin (Storage) o, si no hay, la de la carpeta capas/ del sitio; si falla, un boceto.
// Uso: window.Placas (lo usa js/generar.js). No depende de la interfaz.
(() => {
  const ANCHO = 1080, ALTO = 1350;
  const VERSION_CAPAS = 1; // subir si se reemplazan los PNG de la carpeta capas/

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
    M("zona-random", "Zona Random", 7, T(405, 705, 555, 280, "Bebas Neue", 700, 73, "#000000", 1.09, -0.01), { x: 0, y: 0, w: 914, h: 1350 }),
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
  // Las noticias se separan con ///. Los títulos van entre *asteriscos* (negrita de WhatsApp)
  // o escritos en MAYÚSCULA (por si se olvidan de los asteriscos).
  function limpiarTitulo(t) {
    return t.replace(/[_~`]/g, "")                 // otros formatos de WhatsApp
      .replace(/^[\s\-–—•·▪►✅👉🔹🔸\d.)]+(?=\D)/u, "") // viñetas y numeración al principio
      .replace(/\s+/g, " ").trim();
  }
  // Una línea es título si está casi toda en mayúscula y tiene al menos 3 palabras.
  function esMayuscula(l) {
    const letras = l.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
    if (letras.length < 10 || l.split(/\s+/).length < 3) return false;
    return letras.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, "").length / letras.length >= 0.85;
  }
  function leerPunteo(texto) {
    const bloques = String(texto || "").replace(/\r/g, "").split(/\/{3,}/);
    const noticias = [];
    for (const b of bloques) {
      if (!b.trim()) continue;
      const titulos = [], cuerpo = [];
      const sumar = (t) => { t = limpiarTitulo(t); if (t.length > 3 && !titulos.includes(t)) titulos.push(t); };
      for (const linea of b.split("\n")) { // en el orden en que aparecen
        const conAsteriscos = [...linea.matchAll(/\*([^*\n]+)\*/g)];
        if (conAsteriscos.length) conAsteriscos.forEach(m => sumar(m[1]));
        else if (esMayuscula(limpiarTitulo(linea))) sumar(linea);
        else cuerpo.push(linea.replace(/[*_~`]/g, "").trim()); // el resto es el texto de la noticia
      }
      let aviso = "";
      if (!titulos.length) { // sin asteriscos ni mayúsculas: tomo la primera línea con texto
        const linea = b.split("\n").map(limpiarTitulo).find(l => l.length > 3);
        if (!linea) continue;
        titulos.push(linea); aviso = "Esta noticia no tenía títulos en MAYÚSCULA ni entre *asteriscos*: usé la primera línea.";
      }
      // Texto de la noticia (para la publicación de Facebook): sin renglones vacíos repetidos.
      const texto = cuerpo.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      noticias.push({ titulos, aviso, cuerpo: aviso ? texto.split("\n").slice(1).join("\n").trim() : texto });
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
      // Si el admin no subió una capa propia, se usa la que viene con el sitio (carpeta capas/).
      if (!m._capa) { try { m._capa = await cargarImagen(`capas/${m.id}.png?v=${VERSION_CAPAS}`); } catch {} }
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
  // Palabras del título. Lo que va entre _guiones bajos_ se marca para pintarlo con el color de resaltado.
  function palabrasDe(texto, mayus) {
    texto = String(texto || "").replace(/\s+/g, " ").trim();
    if (mayus) texto = texto.toLocaleUpperCase("es");
    const marcar = (texto.match(/_/g) || []).length >= 2;
    const palabras = [];
    let resaltando = false;
    for (const cruda of texto.split(" ")) {
      let t = "", hl = false;
      for (const ch of cruda) {
        if (ch === "_" && marcar) { resaltando = !resaltando; continue; }
        t += ch; if (resaltando && /[\p{L}\p{N}]/u.test(ch)) hl = true;
      }
      if (t) palabras.push({ t, hl });
    }
    return palabras;
  }
  const unir = (ps) => ps.map(p => p.t).join(" ");
  function partirRenglones(ctx, palabras, ancho) {
    const renglones = [];
    let linea = [];
    for (const p of palabras) {
      if (!linea.length || ctx.measureText(unir([...linea, p])).width <= ancho) linea.push(p);
      else { renglones.push(linea); linea = [p]; }
    }
    if (linea.length) renglones.push(linea);
    return renglones;
  }
  function medirTitulo(ctx, m, texto) {
    const t = m.config.titulo;
    const palabras = palabrasDe(texto, t.mayus);
    const minimo = Math.max(16, Math.round(t.tam * 0.55));
    for (let tam = t.tam; tam >= minimo; tam--) {
      prepararLetra(ctx, m, tam);
      const renglones = partirRenglones(ctx, palabras, t.w);
      const alto = renglones.length * tam * t.interlineado;
      if (alto <= t.h && renglones.every(r => ctx.measureText(unir(r)).width <= t.w)) return { tam, renglones, entra: true };
    }
    prepararLetra(ctx, m, minimo);
    return { tam: minimo, renglones: partirRenglones(ctx, palabras, t.w), entra: false };
  }
  function dibujarTitulo(ctx, m, texto) {
    const t = m.config.titulo;
    const med = medirTitulo(ctx, m, texto);
    prepararLetra(ctx, m, med.tam);
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    const lh = med.tam * t.interlineado;
    const mt = ctx.measureText("ÁH");
    const asc = mt.fontBoundingBoxAscent ?? med.tam * 0.93, desc = mt.fontBoundingBoxDescent ?? med.tam * 0.24;
    const altoTotal = med.renglones.length * lh;
    const y0 = t.valinear === "bottom" ? t.y + t.h - altoTotal : t.valinear === "middle" ? t.y + (t.h - altoTotal) / 2 : t.y;
    const espacio = ctx.measureText(" ").width;
    // Cada renglón se parte en tramos del mismo color (normal / resaltado).
    const tramos = [];
    med.renglones.forEach((r, i) => {
      const ancho = ctx.measureText(unir(r)).width;
      let x = t.alinear === "center" ? t.x + (t.w - ancho) / 2 : t.alinear === "right" ? t.x + t.w - ancho : t.x;
      const y = y0 + i * lh + (lh - (asc + desc)) / 2 + asc;
      let grupo = [];
      const cerrar = () => { if (!grupo.length) return; const txt = unir(grupo); tramos.push({ txt, x, y, hl: grupo[0].hl }); x += ctx.measureText(txt).width + espacio; grupo = []; };
      r.forEach(p => { if (grupo.length && grupo[0].hl !== p.hl) cerrar(); grupo.push(p); });
      cerrar();
    });
    const contorno = +t.contorno || 0, sombra = +t.sombra || 0;
    const colorDe = (tr) => tr.hl ? (t.resalte || "#ffd400") : t.color;
    ctx.save();
    ctx.lineJoin = "round"; ctx.miterLimit = 2;
    if (sombra > 0) { // primera pasada: solo la sombra
      ctx.shadowColor = `rgba(0,0,0,${(0.25 + 0.6 * sombra / 100).toFixed(2)})`;
      ctx.shadowBlur = 4 + med.tam * 0.35 * sombra / 100;
      ctx.shadowOffsetY = 2 + med.tam * 0.08 * sombra / 100;
      tramos.forEach(tr => {
        if (contorno > 0) { ctx.lineWidth = contorno * 2; ctx.strokeStyle = t.contornoColor || "#000"; ctx.strokeText(tr.txt, tr.x, tr.y); }
        else { ctx.fillStyle = colorDe(tr); ctx.fillText(tr.txt, tr.x, tr.y); }
      });
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }
    if (contorno > 0) { ctx.lineWidth = contorno * 2; ctx.strokeStyle = t.contornoColor || "#000"; tramos.forEach(tr => ctx.strokeText(tr.txt, tr.x, tr.y)); }
    tramos.forEach(tr => { ctx.fillStyle = colorDe(tr); ctx.fillText(tr.txt, tr.x, tr.y); });
    ctx.restore();
    if (soportaEspaciado) ctx.letterSpacing = "0px";
    return med;
  }

  // Ajuste de una placa sobre el diseño del medio.
  // Relativos: escala % (agranda letra y caja), ancho %, dx/dy px, opacidad % del fondo, interlineado %, espaciado (milésimas).
  // Absolutos (null = el del medio): color, alinear, valinear, mayus, sombra 0–100, contorno px, contornoColor, resalte.
  const RELATIVOS = { escala: 100, ancho: 100, dx: 0, dy: 0, opacidad: 100, interlineado: 100, espaciado: 0 };
  const ABSOLUTOS = ["color", "alinear", "valinear", "mayus", "sombra", "contorno", "contornoColor", "resalte"];
  const SIN_AJUSTE = { ...RELATIVOS, ...Object.fromEntries(ABSOLUTOS.map(k => [k, null])) };
  const hayAjuste = (a) => !!a && (Object.keys(RELATIVOS).some(k => a[k] != null && a[k] !== RELATIVOS[k]) || ABSOLUTOS.some(k => a[k] != null));
  const opacidadDe = (m, a) => Math.round((m.config.capa?.opacidad ?? 100) * (a?.opacidad ?? 100) / 100);
  function cajaAjustada(t, a) {
    if (!hayAjuste(a)) return t;
    const escala = (a.escala ?? 100) / 100;
    const h = Math.round(t.h * escala);
    const valinear = a.valinear ?? t.valinear;
    // La caja crece con la letra, desde el lado donde está anclado el texto.
    const corrY = valinear === "bottom" ? t.h - h : valinear === "middle" ? (t.h - h) / 2 : 0;
    const r = {
      ...t,
      x: Math.round(t.x + (a.dx ?? 0)), y: Math.round(t.y + (a.dy ?? 0) + corrY),
      w: Math.round(t.w * (a.ancho ?? 100) / 100), h, tam: Math.max(8, Math.round(t.tam * escala)),
      interlineado: +(t.interlineado * (a.interlineado ?? 100) / 100).toFixed(3),
      espaciado: +((t.espaciado || 0) + (a.espaciado ?? 0) / 1000).toFixed(3),
    };
    ABSOLUTOS.forEach(k => { if (a[k] != null) r[k] = a[k]; });
    return r;
  }
  function medioAjustado(m, a) {
    return hayAjuste(a) ? { ...m, config: { ...m.config, titulo: cajaAjustada(m.config.titulo, a) } } : m;
  }

  // La capa se separa una vez en "veladura" (píxeles semitransparentes: degradés) y "sólido"
  // (píxeles 100 % opacos: logos, cajas, texturas), para poder cambiar la opacidad del fondo sin tocar el logo.
  const partesCapa = new WeakMap();
  function partesDe(img) {
    if (partesCapa.has(img)) return partesCapa.get(img);
    let partes = null;
    try {
      const lienzo = () => { const c = document.createElement("canvas"); c.width = ANCHO; c.height = ALTO; return c; };
      const base = lienzo(), bx = base.getContext("2d", { willReadFrequently: true });
      bx.drawImage(img, 0, 0, ANCHO, ALTO);
      const d = bx.getImageData(0, 0, ANCHO, ALTO);
      const vel = new ImageData(ANCHO, ALTO), sol = new ImageData(ANCHO, ALTO);
      const o = new Uint32Array(d.data.buffer), v = new Uint32Array(vel.data.buffer), s = new Uint32Array(sol.data.buffer);
      for (let i = 0; i < o.length; i++) { const a = d.data[i * 4 + 3]; if (a === 255) s[i] = o[i]; else if (a) v[i] = o[i]; }
      const cv = lienzo(), cs = lienzo();
      cv.getContext("2d").putImageData(vel, 0, 0); cs.getContext("2d").putImageData(sol, 0, 0);
      partes = { veladura: cv, solido: cs };
    } catch (e) { console.warn("[placas] no se pudo separar la capa:", e.message); }
    partesCapa.set(img, partes);
    return partes;
  }
  function dibujarCapa(ctx, capa, opacidad) {
    if (opacidad === 100) return ctx.drawImage(capa, 0, 0, ANCHO, ALTO);
    const p = partesDe(capa);
    ctx.save();
    if (!p) { ctx.globalAlpha = Math.min(1, opacidad / 100); ctx.drawImage(capa, 0, 0, ANCHO, ALTO); ctx.restore(); return; }
    ctx.globalAlpha = Math.min(1, opacidad / 100); ctx.drawImage(p.veladura, 0, 0);
    if (opacidad > 100) { ctx.globalAlpha = Math.min(1, (opacidad - 100) / 100); ctx.drawImage(p.veladura, 0, 0); }
    ctx.globalAlpha = 1; ctx.drawImage(p.solido, 0, 0);
    ctx.restore();
  }

  // Arma una placa completa en el canvas dado (o en uno nuevo) y lo devuelve.
  function componer({ medio, foto, titulo, canvas, ajuste }) {
    const opacidad = opacidadDe(medio, ajuste);
    medio = medioAjustado(medio, ajuste);
    const c = canvas || document.createElement("canvas");
    c.width = ANCHO; c.height = ALTO;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#111"; ctx.fillRect(0, 0, ANCHO, ALTO);
    dibujarFoto(ctx, foto, medio.config.foto);
    if (medio._capa) dibujarCapa(ctx, medio._capa, opacidad); else dibujarBoceto(ctx, medio);
    const med = dibujarTitulo(ctx, medio, titulo || "");
    c.dataset.entra = med.entra ? "1" : "0";
    return c;
  }

  const aBlob = (c, tipo = "image/jpeg", calidad = 0.92) => new Promise((ok) => c.toBlob(ok, tipo, calidad));
  const nombreArchivo = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

  // 1 o 2 palabras clave de una noticia para el nombre del archivo (así la IA que arma la distribución
  // empareja cada imagen con su copy). Se eligen las palabras con contenido que más se repiten entre
  // los títulos de la noticia; a igual cantidad, las más largas. Quedan en el orden en que aparecen.
  const VACIAS = new Set(("a al algo ante antes como con contra cual cuando de del desde donde durante el ella ellos en entre era es esa ese esta este esto fue han hay hasta la las le les lo los mas muy nos o para pero por que se ser si sin sobre son su sus tambien tiene tras un una uno unos unas ya y " +
    "anuncio anuncian anunciaron dijo dicen afirmo aseguro sera seran habra hubo hace hacen tienen puede pueden nuevo nueva nuevos nuevas otro otra otros otras todo toda todos todas cada mismo misma segun luego ahora hoy ayer manana dias semana " +
    "mientras porque aunque desde cuales quien quienes despues donde sigue siguen hasta tener estar estan esta estas estos esos esas " +
    "misiones misionero misionera misioneros misioneras provincia provincial").split(/\s+/));
  function palabrasClave(titulos, cuantas = 2) {
    const limpia = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const lista = (Array.isArray(titulos) ? titulos : [titulos]).map(limpia);
    const cuenta = new Map(), orden = new Map();
    lista.forEach((t, k) => (t.match(/[a-z0-9ñ]+/g) || []).forEach((w, i) => {
      if (w.length < 4 || /^\d+$/.test(w) || VACIAS.has(w)) return;
      cuenta.set(w, (cuenta.get(w) || 0) + 1);
      if (!orden.has(w)) orden.set(w, k * 1000 + i);
    }));
    return [...cuenta.keys()]
      .sort((x, y) => cuenta.get(y) - cuenta.get(x) || y.length - x.length || orden.get(x) - orden.get(y))
      .slice(0, cuantas)
      .sort((x, y) => orden.get(x) - orden.get(y));
  }

  // ZIP con una carpeta por medio: "Muy Temprano/noticia-1.jpg", etc.
  async function armarZip(items) { // items: [{ carpeta, archivo, blob }]
    if (!window.JSZip) throw new Error("No cargó la librería del ZIP. Revisá la conexión.");
    const zip = new JSZip();
    items.forEach(i => zip.folder(i.carpeta).file(i.archivo, i.blob));
    return zip.generateAsync({ type: "blob", compression: "STORE" }); // los JPG ya vienen comprimidos
  }

  window.Placas = { ANCHO, ALTO, MEDIOS_DEFECTO, SIN_AJUSTE, RELATIVOS, ABSOLUTOS, hayAjuste, cajaAjustada, opacidadDe, leerPunteo, repartir, cargarMedios, prepararMedios, leerFoto, componer, medirTitulo, aBlob, armarZip, nombreArchivo, palabrasClave };
})();
