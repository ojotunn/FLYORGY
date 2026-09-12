# Arte do FLY ORGY a partir dos RENDERS DO PROPRIO MODELO 3D (sexfly/brand/render): o casal montado,
# repetido em varias profundidades para virar uma sala cheia. Nada gerado por IA - e a mesma mosca que
# esta no site, so que renderizada fora do navegador.
# Saidas: site/logo.png, site/favicon.png, site/og.png, brand/x-avatar-1024.png, brand/x-capa-*.png
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

R = r'C:\Higgsfield Games\sexfly\brand\render'
SITE = r'C:\Higgsfield Games\flyorgy\site'
BRAND = r'C:\Higgsfield Games\flyorgy\brand'
PIX = r'C:\Higgsfield Games\sexfly\brand\fontes\PressStart2P-Regular.ttf'
BAHN = 'C:/Windows/Fonts/bahnschrift.ttf'
CUT = (10, 7, 9)
QUENTE = (255, 61, 46)
ROSA = (255, 95, 158)


def fundo(W, H, focos):
    """Fundo escuro com manchas de luz borradas (a sala)."""
    base = np.full((H, W, 3), CUT, dtype=float)
    g = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(g)
    for (x, y, r, cor) in focos:
        d.ellipse((x - r, y - r * 0.72, x + r, y + r * 0.72), fill=cor)
    g = np.asarray(g.filter(ImageFilter.GaussianBlur(max(8, min(W, H) // 5)))).astype(float)
    return Image.fromarray(np.clip(base + g * 0.42, 0, 255).astype('uint8'))


def recortar(im, limiar=10):
    """O render vem em fundo preto: transforma o brilho em alfa e corta a caixa do bicho."""
    a = np.asarray(im.convert('RGB')).astype(float)
    alfa = np.clip(a.max(axis=2) / 26.0, 0, 1)
    rgba = np.dstack([a, alfa * 255]).astype('uint8')
    out = Image.fromarray(rgba, 'RGBA')
    cx = out.getchannel('A').point(lambda v: 255 if v > limiar else 0).getbbox()
    return out.crop(cx) if cx else out


def colar(base, casal, x, y, larg, tom=1.0, desfoque=0.0, virar=False):
    """Um casal na sala: escala, tom (profundidade) e desfoque (fora de foco)."""
    im = casal.copy()
    if virar:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    h = max(1, int(im.height * larg / im.width))
    im = im.resize((larg, h), Image.LANCZOS)
    if tom != 1.0:
        a = np.asarray(im).astype(float)
        a[..., :3] *= tom
        im = Image.fromarray(np.clip(a, 0, 255).astype('uint8'), 'RGBA')
    if desfoque > 0:
        im = im.filter(ImageFilter.GaussianBlur(desfoque))
    base.alpha_composite(im, (int(x - larg / 2), int(y - h)))
    return base


def brilho_texto(img, texto, xy, fonte, cor, raio=16):
    W, H = img.size
    cam = Image.new('RGB', (W, H), (0, 0, 0))
    ImageDraw.Draw(cam).text(xy, texto, font=fonte, fill=cor)
    cam = cam.filter(ImageFilter.GaussianBlur(raio))
    return Image.fromarray(np.clip(np.asarray(img.convert('RGB')).astype(int) + np.asarray(cam).astype(int), 0, 255).astype('uint8')).convert('RGBA')


# os quatro angulos do casal que ja foram renderizados
casais = [recortar(Image.open(os.path.join(R, f'perfil-{k}.png'))) for k in 'abcd']
largos = [recortar(Image.open(os.path.join(R, f'banner-{k}.png'))) for k in 'abcd']


def sala(W, H, n, semente=7, chao=0.86):
    """Uma sala com n casais: os do fundo menores, mais escuros e desfocados."""
    rng = np.random.default_rng(semente)
    base = fundo(W, H, [(W * 0.58, H * 0.88, W * 0.46, (185, 44, 28)),
                        (W * 0.16, H * 0.70, W * 0.26, (86, 20, 38)),
                        (W * 0.88, H * 0.62, W * 0.24, (34, 22, 78))]).convert('RGBA')
    postos = []
    for i in range(n):
        z = (i + 0.5) / n                       # 0 = fundo, 1 = frente
        larg = int(W * (0.065 + 0.155 * z ** 2))
        x = rng.uniform(0.04, 0.96) * W
        y = (0.60 + 0.40 * z) * H * chao
        postos.append((z, x, y, larg, rng.integers(0, 4), bool(rng.integers(0, 2))))
    for z, x, y, larg, k, virar in sorted(postos):
        colar(base, casais[k], x, y, larg, tom=0.35 + 0.65 * z, desfoque=(1 - z) * 3.2, virar=virar)
    return base


# ---------------- logo do cabecalho ----------------
logo = fundo(256, 256, [(128, 168, 158, (210, 52, 32))]).convert('RGBA')
colar(logo, casais[1], 128, 218, 226, tom=1.05)
logo.convert('RGB').save(os.path.join(SITE, 'logo.png'))
logo.convert('RGB').resize((64, 64), Image.LANCZOS).save(os.path.join(SITE, 'favicon.png'))
print('logo.png e favicon.png')

# ---------------- og 1200x630 ----------------
og = sala(1200, 630, 11, semente=11, chao=0.99)
f1 = ImageFont.truetype(PIX, 62)
og = brilho_texto(og, 'FLY ORGY', (66, 118), f1, QUENTE, 20)
d = ImageDraw.Draw(og)
d.text((66, 118), 'FLY ORGY', font=f1, fill=(255, 246, 242))
d.text((70, 236), '32 whole fly brains', font=ImageFont.truetype(BAHN, 44), fill=(243, 232, 235))
d.text((70, 286), 'in one room', font=ImageFont.truetype(BAHN, 44), fill=ROSA)
d.text((72, 366), '138,639 neurons each - live on one GPU', font=ImageFont.truetype(BAHN, 26), fill=(158, 138, 148))
og.convert('RGB').save(os.path.join(SITE, 'og.png'))
og.convert('RGB').save(os.path.join(BRAND, 'og-1200x630.png'))
print('og.png')

# ---------------- X: avatar 1024 ----------------
av = fundo(1024, 1024, [(512, 760, 600, (200, 48, 30)), (280, 480, 280, (66, 22, 50))]).convert('RGBA')
colar(av, casais[3], 290, 700, 520, tom=0.55, desfoque=2.2, virar=True)
colar(av, casais[2], 780, 780, 470, tom=0.7, desfoque=1.2)
colar(av, casais[0], 540, 1010, 760, tom=1.05)
av.convert('RGB').save(os.path.join(BRAND, 'x-avatar-1024.png'))
print('x-avatar-1024.png')

# ---------------- X: capa 3000x1000 e 1500x500 ----------------
capa = sala(3000, 1000, 16, semente=5, chao=1.0)
f2 = ImageFont.truetype(PIX, 118)
capa = brilho_texto(capa, 'FLY ORGY', (140, 210), f2, QUENTE, 34)
d = ImageDraw.Draw(capa)
d.text((140, 210), 'FLY ORGY', font=f2, fill=(255, 246, 242))
d.text((146, 400), 'thirty-two real fruit-fly connectomes, one room, one GPU',
       font=ImageFont.truetype(BAHN, 60), fill=(226, 210, 216))
capa.convert('RGB').save(os.path.join(BRAND, 'x-capa-3000x1000.png'))
capa.convert('RGB').resize((1500, 500), Image.LANCZOS).save(os.path.join(BRAND, 'x-capa-1500x500.png'))
print('x-capa-3000x1000.png e 1500x500')
