# Arma las 11 capas PNG (1080x1350) a partir de tres exportaciones gratuitas de Canva de la copia
# del diseño (sin foto, sin título y sin las 7 imágenes prémium):
#   A = fondo original · B = fondo negro · C = fondo blanco
# Dentro de la zona de foto de cada medio la transparencia se calcula comparando B y C
# (alfa = 1 - (C - B)/255; color = B / alfa). Afuera se usa A tal cual.
# Después se redibujan con código las texturas que eran prémium (dibujo propio, mismo estilo).
# Uso: python -I armar_capas.py <A.zip> <B.zip> <C.zip> <carpeta_salida>
import sys, io, zipfile, pathlib, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1080, 1350
MEDIOS = [  # (id, nombre del PNG en el zip, zona de foto x, y, w, h) — igual que js/placas.js
    ("muy-temprano", "Muy Temprano", (0, 0, 1080, 1350)),
    ("interesante", "Interesante", (0, 0, 1080, 1350)),
    ("extensiones", "Extensiones", (0, 0, 1080, 1172)),
    ("radar-legislativo", "Radar Legislativo", (0, 0, 1080, 826)),
    ("misiones-biodiversidad", "Misiones Biodiversidad", (0, 0, 1080, 846)),
    ("central-de-noticias", "Central de Noticias", (0, 108, 1080, 821)),
    ("zona-random", "Zona Random", (0, 0, 914, 1350)),
    ("misiones-digital", "Misiones Digital", (229, 0, 851, 1350)),
    ("hola-misiones", "Hola Misiones", (0, 0, 1080, 801)),
    ("canal-12", "Canal 12", (0, 0, 1080, 801)),
    ("neutra", "NEUTRA", (0, 0, 1080, 1350)),
]

def leer_zip(ruta):
    z = zipfile.ZipFile(ruta)
    return {pathlib.Path(n).stem: np.asarray(Image.open(io.BytesIO(z.read(n))).convert("RGB"), dtype=np.float32)
            for n in z.namelist() if n.lower().endswith(".png")}

def combinar(a, b, c, zona):
    x, y, w, h = zona
    out = np.dstack([a, np.full((H, W), 255.0, np.float32)])
    bb, cc = b[y:y+h, x:x+w], c[y:y+h, x:x+w]
    alfa = np.clip(1.0 - (cc - bb).mean(axis=2) / 255.0, 0, 1)
    color = np.where(alfa[..., None] > 0.004, bb / np.maximum(alfa[..., None], 1e-3), 0)
    alfa = np.where(alfa < 0.01, 0, alfa)  # ruido de compresión → transparente
    out[y:y+h, x:x+w, :3] = np.clip(color, 0, 255)
    out[y:y+h, x:x+w, 3] = alfa * 255
    return Image.fromarray(out.round().astype(np.uint8), "RGBA")

# ---------- Texturas dibujadas con código (reemplazan a las prémium) ----------
def capa_vacia(): return Image.new("RGBA", (W, H), (0, 0, 0, 0))

def ruido_suave(w, h, semilla, escalas=((180, 1.0), (90, .5), (45, .25))):
    r = np.random.default_rng(semilla); campo = np.zeros((h, w), np.float32)
    for esc, peso in escalas:
        g = r.random((h // esc + 3, w // esc + 3)).astype(np.float32)
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((w + 3 * esc, h + 3 * esc), Image.BICUBIC)
        campo += np.asarray(img, np.float32)[esc:esc+h, esc:esc+w] / 255 * peso
    return campo

def topografico(caja, color, opacidad, semilla, ancho=0.07, niveles=9):
    x, y, w, h = caja
    f = ruido_suave(w, h, semilla); f = (f - f.min()) / (f.max() - f.min())
    banda = np.abs(((f * niveles) % 1.0) - 0.5) < ancho
    a = (banda * 255 * opacidad).astype(np.uint8)
    t = Image.new("RGBA", (w, h), color + (0,)); t.putalpha(Image.fromarray(a).filter(ImageFilter.GaussianBlur(1.2)))
    lienzo = capa_vacia(); lienzo.paste(t, (x, y)); return lienzo

def red_de_puntos(caja, color, semilla, angulo=0, n=34):
    x, y, w, h = caja; r = random.Random(semilla)
    t = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(t)
    pts = [(r.uniform(0, w), h - abs(r.gauss(0, h * 0.45)) ) for _ in range(n)]
    pts = [(px, min(h - 2, max(2, py))) for px, py in pts]
    for i, p in enumerate(pts):
        vecinos = sorted(pts, key=lambda q: (q[0]-p[0])**2 + (q[1]-p[1])**2)[1:4]
        for q in vecinos[:r.choice((2, 3))]:
            d.line([p, q], fill=color + (120,), width=2)
    for px, py in pts:
        rad = r.choice((3, 3, 4, 5, 7, 9))
        d.ellipse([px-rad, py-rad, px+rad, py+rad], fill=color + (235,))
    if angulo: t = t.rotate(-angulo, resample=Image.BICUBIC, expand=False)
    lienzo = capa_vacia(); lienzo.alpha_composite(t, (max(0, x), y), (max(0, -x), 0)); return lienzo

def circuitos(color, semilla):
    r = random.Random(semilla); t = capa_vacia(); d = ImageDraw.Draw(t)
    def traza(x0, alto, jogs):
        px, py = x0, H + 5
        tramos = [py - alto * f for f in sorted(r.uniform(.2, .85) for _ in range(jogs))] + [py - alto]
        for objetivo in tramos:
            d.line([(px, py), (px, objetivo)], fill=color + (255,), width=3); py = objetivo
            if objetivo != tramos[-1]:
                dx = r.choice((-1, 1)) * r.randint(14, 30)
                d.line([(px, py), (px + dx, py - abs(dx))], fill=color + (255,), width=3); px, py = px + dx, py - abs(dx)
        d.ellipse([px-8, py-16, px+8, py], outline=color + (255,), width=3)
    for x0 in range(10, 160, 22): traza(x0, r.randint(140, 270), r.randint(1, 2))      # grupo izquierdo alto
    for x0 in range(930, 1075, 22): traza(x0, r.randint(140, 270), r.randint(1, 2))    # grupo derecho alto
    for x0 in range(180, 920, 34): traza(x0 + r.randint(-6, 6), r.randint(25, 120), 0) # zócalo bajo
    return t

def guardas_bauhaus(semilla):
    # Dos bloques de 5x2 baldosas de 86 px (cuartos de círculo, medios círculos, rombos y puntos).
    r = random.Random(semilla); t = capa_vacia()
    colores = [(255, 107, 53), (245, 197, 24), (30, 122, 52), (255, 255, 255)]
    c = 86; y0 = 1350 - 2 * c
    for x0 in (108, 540):
        for fila in range(2):
            for col in range(5):
                b = Image.new("RGBA", (c, c), (0, 0, 0, 0)); d = ImageDraw.Draw(b)
                forma, col1 = r.choice(("cuarto", "cuarto", "medio", "rombo", "punto")), r.choice(colores)
                if forma == "cuarto":
                    ex, ey = r.choice(((0, 0), (c, 0), (0, c), (c, c)))
                    d.ellipse([ex - c, ey - c, ex + c, ey + c], fill=col1 + (255,))
                elif forma == "medio":
                    d.ellipse([0, c / 2 if r.random() < .5 else -c / 2, c, c * 1.5 if r.random() < .5 else c / 2], fill=col1 + (255,))
                elif forma == "rombo":
                    d.rectangle([0, 0, c, c], fill=col1 + (255,))
                    d.polygon([(c/2, 0), (c, c/2), (c/2, c), (0, c/2)], outline=(120, 120, 120, 255), width=2)
                else:
                    d.ellipse([c/2 - 12, c/2 - 12, c/2 + 12, c/2 + 12], fill=(255, 255, 255, 255))
                t.alpha_composite(b, (x0 + col * c, y0 + fila * c))
    return t

def rombos(caja, excluir, semilla):
    x, y, w, h = caja; t = capa_vacia(); d = ImageDraw.Draw(t); paso = 74
    for k in range(-h, w + h, paso):
        d.line([(x + k, y), (x + k + h, y + h)], fill=(255, 255, 255, 70), width=2)
        d.line([(x + k, y + h), (x + k + h, y)], fill=(255, 255, 255, 70), width=2)
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.hypot((xx - (x + w/2)) / (w/2), (yy - (y + h/2)) / (h/2))
    fade = np.clip(1.1 - dist, 0, 1)
    a = np.asarray(t.getchannel("A"), np.float32) * fade
    ex, ey, ew, eh = excluir; a[ey:ey+eh, ex:ex+ew] = 0
    t.putalpha(Image.fromarray(a.astype(np.uint8))); return t

def triangulos_lima(semilla):
    r = random.Random(semilla); t = capa_vacia(); d = ImageDraw.Draw(t); lima = (204, 246, 36)
    for _ in range(170):
        yb = 545 + (1350 - 545) * (r.random() ** 0.45)          # más densos abajo
        prof = 20 + 140 * ((yb - 545) / 805) ** 2               # se abren hacia abajo
        xb = 1080 - r.random() * prof
        if xb < 995 and 670 < yb < 1020: continue                # no tapar la caja lima
        s = r.uniform(6, 22) * (1 + (yb - 545) / 600)
        ang = r.uniform(0, 2 * math.pi)
        pts = [(xb + s * math.cos(ang + k * 2.1 + r.uniform(-.3, .3)), yb + s * math.sin(ang + k * 2.1)) for k in range(3)]
        d.polygon(pts, fill=lima + (r.choice((255, 255, 200, 150)),))
    return t

def mosaico_triangulos(semilla):
    r = random.Random(semilla); t = capa_vacia(); d = ImageDraw.Draw(t)
    cols = [(29, 17, 80), (58, 111, 176), (47, 143, 157), (224, 111, 180), (227, 49, 60), (107, 79, 187)]
    c = 24
    for fila in range(260 // c, H // c + 1):
        for col in range(4):
            if r.random() < 0.18: continue
            x0, y0 = col * c, fila * c
            esq = r.choice((((x0, y0), (x0 + c, y0), (x0, y0 + c)), ((x0 + c, y0), (x0 + c, y0 + c), (x0, y0)),
                             ((x0, y0 + c), (x0 + c, y0 + c), (x0, y0)), ((x0, y0), (x0 + c, y0 + c), (x0 + c, y0))))
            d.polygon(esq, fill=r.choice(cols) + (255,))
    return t

def manchas_olivo(semilla):
    f = ruido_suave(W, H, semilla, ((120, 1.0), (60, .4)))
    f = (f - f.min()) / (f.max() - f.min())
    m = (f > 0.55).astype(np.float32)
    m[:886] = 0
    a = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))
    t = Image.new("RGBA", (W, H), (96, 84, 24, 0)); t.putalpha(a)
    lineas = capa_vacia(); d = ImageDraw.Draw(lineas)
    for k in range(-H, W + H, 120):
        d.line([(k, 886), (k + 464, 1350)], fill=(70, 60, 15, 90), width=2)
        d.line([(k + 464, 886), (k, 1350)], fill=(70, 60, 15, 90), width=2)
    la = np.asarray(lineas.getchannel("A")).copy(); la[:886] = 0; lineas.putalpha(Image.fromarray(la))
    t.alpha_composite(lineas); return t

def solo_sobre_color(t, capa, rgb, tol=22):
    # La textura solo se ve donde la capa tiene el color de fondo (no tapa textos ni logos).
    c = np.asarray(capa, np.int16)
    ok = (np.abs(c[..., :3] - np.array(rgb)).max(axis=2) <= tol) & (c[..., 3] == 255)
    a = np.asarray(t.getchannel("A")) * ok
    t.putalpha(Image.fromarray(a.astype(np.uint8))); return t

def texturas(mid, capa):
    if mid == "muy-temprano":
        t = topografico((107, 967, 864, 864), (74, 29, 5), 0.16, 11, ancho=0.055)
        a = np.asarray(t.getchannel("A")).copy(); a[:, 978:] = 0; a[:, :114] = 0; t.putalpha(Image.fromarray(a)); return [t]
    if mid == "interesante":
        t1 = red_de_puntos((-145, 973, 685, 377), (63, 208, 240), 21)
        t2 = red_de_puntos((655, 1011, 425, 339), (63, 208, 240), 22, angulo=-9.7, n=22)
        t = capa_vacia(); t.alpha_composite(t1); t.alpha_composite(t2)
        a = np.asarray(t.getchannel("A")).copy(); yy, xx = np.ogrid[0:H, 0:W]
        a[(xx - 950) ** 2 + (yy - 1195) ** 2 < 58 ** 2] = 0   # no tapar el logo del globo
        t.putalpha(Image.fromarray(a)); return [t]
    if mid == "extensiones": return [circuitos((200, 100, 30), 31)]
    if mid == "misiones-biodiversidad": return [guardas_bauhaus(41)]
    if mid == "zona-random": return [rombos((412, 513, 658, 656), (300, 665, 700, 360), 51), triangulos_lima(52)]
    if mid == "misiones-digital": return [mosaico_triangulos(61)]
    if mid == "hola-misiones":
        fondo = tuple(int(v) for v in np.asarray(capa)[1100, 540, :3])
        return [solo_sobre_color(manchas_olivo(71), capa, fondo)]
    return []

A, B, C = leer_zip(sys.argv[1]), leer_zip(sys.argv[2]), leer_zip(sys.argv[3])
salida = pathlib.Path(sys.argv[4]); salida.mkdir(parents=True, exist_ok=True)
for mid, nombre, zona in MEDIOS:
    capa = combinar(A[nombre], B[nombre], C[nombre], zona)
    for t in texturas(mid, capa): capa = Image.alpha_composite(capa, t)
    capa.save(salida / f"{mid}.png", optimize=True)
    al = np.asarray(capa.getchannel("A"))
    print(f"{mid:24s} transparente {np.mean(al == 0)*100:5.1f}%  semitransp {np.mean((al > 0) & (al < 255))*100:5.1f}%")
