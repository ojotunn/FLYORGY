# Imagem de ticker e capa do X do FLY ORGY, a partir dos RENDERS DO PROPRIO MODELO 3D
# (sexfly/brand/render: o casal montado, quatro angulos, 1600x1600 e 3000x1000, fundo preto).
# Nada de IA e nada baixado - e a mesma mosca que esta no site, renderizada fora do navegador.
#
# Paleta nova, a do clube: oxblood, ouro e rosa. Tres opcoes de ticker porque ele escolhe uma:
#   A  o casal      - um casal montado, grande, enquadrado apertado (le bem a 64 px)
#   B  a sala       - varios casais em profundidade: parece orgia mesmo pequeno
#   C  neon         - o casal recortado contra um anel de neon; o de maior contraste no tamanho minimo
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

R = r'C:\Higgsfield Games\sexfly\brand\render'
BRAND = r'C:\Higgsfield Games\flyorgy\brand'
SITE = r'C:\Higgsfield Games\flyorgy\site'
PIX = r'C:\Higgsfield Games\sexfly\brand\fontes\PressStart2P-Regular.ttf'
BAHN = 'C:/Windows/Fonts/bahnschrift.ttf'

TINTA = (13, 4, 7)          # oxblood quase preto, o fundo do site
BRASA = (224, 57, 44)
ROSA = (255, 95, 158)
OURO = (216, 166, 87)


def fundo(W, H, focos, forca=0.55):
    base = np.full((H, W, 3), TINTA, dtype=float)
    g = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(g)
    for (x, y, r, cor) in focos:
        d.ellipse((x - r, y - r * 0.78, x + r, y + r * 0.78), fill=cor)
    g = np.asarray(g.filter(ImageFilter.GaussianBlur(max(10, min(W, H) // 4)))).astype(float)
    return Image.fromarray(np.clip(base + g * forca, 0, 255).astype('uint8')).convert('RGBA')


def recortar(caminho, limiar=10):
    """O render vem em fundo preto: brilho vira alfa e corta a caixa do bicho."""
    a = np.asarray(Image.open(caminho).convert('RGB')).astype(float)
    alfa = np.clip(a.max(axis=2) / 26.0, 0, 1)
    out = Image.fromarray(np.dstack([a, alfa * 255]).astype('uint8'), 'RGBA')
    cx = out.getchannel('A').point(lambda v: 255 if v > limiar else 0).getbbox()
    return out.crop(cx) if cx else out


def tingir(im, cor, forca):
    """Puxa a cor do bicho para a luz da sala, sem lavar o desenho."""
    a = np.asarray(im).astype(float)
    rgb, al = a[..., :3], a[..., 3:]
    luz = rgb.mean(axis=2, keepdims=True) / 255.0
    alvo = np.array(cor, dtype=float) * luz
    rgb = rgb * (1 - forca) + alvo * forca
    return Image.fromarray(np.clip(np.dstack([rgb, al]), 0, 255).astype('uint8'), 'RGBA')


def colar(base, im, cx, baixo, larg, tom=1.0, desfoque=0.0, virar=False, reflexo=0.0, cor=None, forca=0.0, alt=None):
    """Poe o casal CABENDO na caixa larg x alt (se alt vier), apoiado em 'baixo' e centrado em 'cx'.
    Escalar so pela largura cortava a asa e a cabeca fora do quadro - foi o que aconteceu na 1a leva."""
    o = im.copy()
    if virar:
        o = o.transpose(Image.FLIP_LEFT_RIGHT)
    esc = larg / o.width if alt is None else min(larg / o.width, alt / o.height)
    larg = max(1, int(o.width * esc))
    h = max(1, int(o.height * esc))
    o = o.resize((larg, h), Image.LANCZOS)
    if cor is not None and forca:
        o = tingir(o, cor, forca)
    if tom != 1.0:
        a = np.asarray(o).astype(float); a[..., :3] *= tom
        o = Image.fromarray(np.clip(a, 0, 255).astype('uint8'), 'RGBA')
    if desfoque > 0:
        o = o.filter(ImageFilter.GaussianBlur(desfoque))
    x0, y0 = int(cx - larg / 2), int(baixo - h)
    if reflexo > 0:      # chao molhado
        r = o.transpose(Image.FLIP_TOP_BOTTOM)
        a = np.asarray(r).astype(float)
        a[..., 3] *= reflexo * np.linspace(1.0, 0.0, a.shape[0])[:, None]
        r = Image.fromarray(np.clip(a, 0, 255).astype('uint8'), 'RGBA').filter(ImageFilter.GaussianBlur(2.2))
        base.alpha_composite(r, (x0, int(baixo)))
    base.alpha_composite(o, (x0, y0))
    return base


def brilho(img, desenhar, raio=18, ganho=1.0):
    """Camada aditiva borrada por cima (neon, halo de texto)."""
    W, H = img.size
    cam = Image.new('RGB', (W, H), (0, 0, 0))
    desenhar(ImageDraw.Draw(cam))
    cam = cam.filter(ImageFilter.GaussianBlur(raio))
    a = np.asarray(img.convert('RGB')).astype(int) + (np.asarray(cam).astype(int) * ganho).astype(int)
    return Image.fromarray(np.clip(a, 0, 255).astype('uint8')).convert('RGBA')


def salvar(im, nome, tamanhos):
    for t in tamanhos:
        im.convert('RGB').resize((t, t) if im.width == im.height else
                                 (t, int(im.height * t / im.width)), Image.LANCZOS
                                 ).save(os.path.join(BRAND, f'{nome}-{t}.png'))
    im.convert('RGB').save(os.path.join(BRAND, f'{nome}.png'))
    print(' ', nome, '+', ', '.join(str(t) for t in tamanhos))


casais = [recortar(os.path.join(R, f'perfil-{k}.png')) for k in 'abcd']

# ---------------- A: o casal ----------------
W = 1024
a = fundo(W, W, [(W * 0.5, W * 0.66, W * 0.52, (190, 44, 30)),
                 (W * 0.24, W * 0.34, W * 0.26, (86, 26, 62)),
                 (W * 0.80, W * 0.30, W * 0.22, (40, 30, 96))], 0.6)
colar(a, casais[0], W * 0.50, W * 0.80, int(W * 0.90), alt=int(W * 0.62), tom=1.08, reflexo=0.26,
      cor=(255, 170, 150), forca=0.22)
a = brilho(a, lambda d: d.ellipse((W * 0.08, W * 0.52, W * 0.92, W * 0.98), fill=(70, 12, 8)), 90, 0.9)
salvar(a, 'ticker-A-casal', [512, 256, 128])

# ---------------- B: a sala ----------------
b = fundo(W, W, [(W * 0.5, W * 0.80, W * 0.58, (170, 40, 28)),
                 (W * 0.18, W * 0.52, W * 0.24, (92, 22, 56)),
                 (W * 0.86, W * 0.46, W * 0.22, (36, 26, 92))], 0.5)
postos = [(0.17, 0.50, 0.26, 3, True), (0.83, 0.53, 0.28, 2, False),
          (0.34, 0.66, 0.38, 1, False), (0.70, 0.72, 0.42, 0, True),
          (0.50, 0.90, 0.54, 0, False)]
for cx, baixo, larg, k, virar in postos:
    z = larg / 0.54
    colar(b, casais[k], W * cx, W * baixo, int(W * larg), alt=int(W * larg * 0.62),
          tom=0.42 + 0.62 * z, desfoque=(1 - z) * 3.4, virar=virar, reflexo=0.18 * z,
          cor=(255, 160, 140), forca=0.20)
salvar(b, 'ticker-B-sala', [512, 256, 128])

# ---------------- C: neon ----------------
c = fundo(W, W, [(W * 0.5, W * 0.5, W * 0.30, (60, 14, 26))], 0.5)
c = brilho(c, lambda d: d.ellipse((W * 0.14, W * 0.14, W * 0.86, W * 0.86), outline=(255, 60, 120), width=26), 26, 1.0)
d = ImageDraw.Draw(c)
d.ellipse((W * 0.14, W * 0.14, W * 0.86, W * 0.86), outline=(255, 220, 235, 235), width=7)
colar(c, casais[2], W * 0.50, W * 0.70, int(W * 0.62), alt=int(W * 0.42), tom=1.14,
      cor=(255, 150, 190), forca=0.30)
c = brilho(c, lambda d2: d2.ellipse((W * 0.30, W * 0.34, W * 0.70, W * 0.72), fill=(60, 10, 26)), 60, 0.8)
salvar(c, 'ticker-C-neon', [512, 256, 128])

# ---------------- capa do X ----------------
CW, CH = 3000, 1000
capa = fundo(CW, CH, [(CW * 0.62, CH * 1.02, CW * 0.40, (190, 46, 30)),
                      (CW * 0.20, CH * 0.86, CW * 0.20, (96, 24, 58)),
                      (CW * 0.90, CH * 0.70, CW * 0.18, (38, 28, 96))], 0.5)
rng = np.random.default_rng(4)
fila = []
for i in range(16):
    z = (i + 0.5) / 16
    # os grandes ficam da metade para a direita, para nao brigar com o letreiro; os pequenos e
    # desfocados podem ir para qualquer lado. Chao em 0,84 da altura: ninguem corta na borda de baixo.
    x = rng.uniform(0.50, 0.90) if z > 0.55 else rng.uniform(0.30, 1.00)
    fila.append((z, x * CW, (0.52 + 0.32 * z) * CH,
                 int(CW * (0.048 + 0.095 * z ** 1.6)), int(rng.integers(0, 4)), bool(rng.integers(0, 2))))
for z, x, y, larg, k, virar in sorted(fila):
    colar(capa, casais[k], x, y, larg, alt=int(larg * 0.62), tom=0.34 + 0.68 * z,
          desfoque=(1 - z) * 3.6, virar=virar, reflexo=0.16 * z, cor=(255, 160, 140), forca=0.20)
f1 = ImageFont.truetype(PIX, 120)
capa = brilho(capa, lambda d2: d2.text((610, 250), 'FLY ORGY', font=f1, fill=BRASA), 36, 1.0)
d = ImageDraw.Draw(capa)
d.text((610, 250), 'FLY ORGY', font=f1, fill=(255, 246, 242))
d.text((616, 442), 'thirty-two real fly brains. one back room.',
       font=ImageFont.truetype(BAHN, 62), fill=(232, 214, 218))
d.text((618, 538), 'flyorgy.com', font=ImageFont.truetype(BAHN, 52), fill=OURO)
capa.convert('RGB').save(os.path.join(BRAND, 'x-capa-3000x1000.png'))
capa.convert('RGB').resize((1500, 500), Image.LANCZOS).save(os.path.join(BRAND, 'x-capa-1500x500.png'))
print('  x-capa 3000x1000 + 1500x500')

# ---------------- avatar do X = o ticker A, sem sangrar nas bordas do circulo ----------------
av = fundo(W, W, [(W * 0.5, W * 0.70, W * 0.50, (190, 44, 30)), (W * 0.26, W * 0.36, W * 0.24, (86, 26, 62))], 0.6)
colar(av, casais[0], W * 0.50, W * 0.78, int(W * 0.84), alt=int(W * 0.56), tom=1.08, reflexo=0.22,
      cor=(255, 170, 150), forca=0.22)
av.convert('RGB').save(os.path.join(BRAND, 'x-avatar-1024.png'))
print('  x-avatar-1024')
