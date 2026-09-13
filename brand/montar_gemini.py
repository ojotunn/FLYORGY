# Monta os arquivos finais da marca a partir das duas imagens geradas no Gemini
# (scripts/gerar-gemini.py do agent-arena, modelo gemini-3-pro-image, com um render do nosso
# modelo 3D como referencia para a mosca sair parecida com a do site).
#
# Entra:  gemini/ticker.png (2048x2048)  e  gemini/capa.png (6336x2688, 21:9)
# Sai:    brand/ticker-*.png, brand/x-capa-*.png, brand/x-avatar-1024.png,
#         site/logo.png, site/favicon.png, site/og.png
#
# Regra da capa do X: no celular ele corta ~18% de cada lado. Titulo e multidao ficam entre
# 18% e 82% da largura, e o canto de baixo a esquerda fica vazio para o avatar redondo.
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BRAND = r'C:\Higgsfield Games\flyorgy\brand'
GEM = os.path.join(BRAND, 'gemini')
SITE = r'C:\Higgsfield Games\flyorgy\site'
PIX = r'C:\Higgsfield Games\sexfly\brand\fontes\PressStart2P-Regular.ttf'
BAHN = 'C:/Windows/Fonts/bahnschrift.ttf'
BRASA = (224, 57, 44)
OURO = (216, 166, 87)


def brilho(img, desenhar, raio=18, ganho=1.0):
    W, H = img.size
    cam = Image.new('RGB', (W, H), (0, 0, 0))
    desenhar(ImageDraw.Draw(cam))
    cam = cam.filter(ImageFilter.GaussianBlur(raio))
    a = np.asarray(img.convert('RGB')).astype(int) + (np.asarray(cam).astype(int) * ganho).astype(int)
    return Image.fromarray(np.clip(a, 0, 255).astype('uint8'))


def salvar_quadrado(im, nome, tamanhos=(1024, 512, 256, 128, 64)):
    for t in tamanhos:
        im.resize((t, t), Image.LANCZOS).save(os.path.join(BRAND, f'{nome}-{t}.png'))
    im.save(os.path.join(BRAND, f'{nome}.png'))
    print(' ', nome, '+', ', '.join(str(t) for t in tamanhos))


# ---------------- ticker ----------------
tk = Image.open(os.path.join(GEM, 'ticker.png')).convert('RGB')
L = tk.width
# aberto: a foto inteira. O casal ja ocupa o meio do quadro.
salvar_quadrado(tk.resize((1024, 1024), Image.LANCZOS), 'ticker-aberto')
# fechado: recorte em cima do casal, para ainda ler a 32 px na lista de tokens
c = tk.crop((int(L * 0.10), int(L * 0.14), int(L * 0.86), int(L * 0.90))).resize((1024, 1024), Image.LANCZOS)
salvar_quadrado(c, 'ticker-fechado')

# ---------------- a orgia: varios casais, para o perfil e para o ticker ----------------
# Duas tomadas. O 'monte' e mais saturado e continua sendo um bloco vermelho reconhecivel a 32 px;
# o 'lado a lado' mostra mais bicho mas lava no tamanho minimo.
for arq, nome in (('orgia-monte.png', 'ticker-orgia-monte'), ('orgia-lado-a-lado.png', 'ticker-orgia-lado')):
    caminho = os.path.join(GEM, arq)
    if not os.path.exists(caminho):
        continue
    im = Image.open(caminho).convert('RGB')
    salvar_quadrado(im.resize((1024, 1024), Image.LANCZOS), nome)

# ---------------- avatar do X: a orgia (e o perfil, tem que ter mais de um casal) ----------------
perfil = os.path.join(GEM, 'orgia-monte.png')
Image.open(perfil).convert('RGB').resize((1024, 1024), Image.LANCZOS).save(os.path.join(BRAND, 'x-avatar-1024.png'))
print('  x-avatar-1024 (a orgia)')

# ---------------- capa do X ----------------
cp = Image.open(os.path.join(GEM, 'capa.png')).convert('RGB')
alvo_h = int(cp.width / 3)                       # 3:1, o formato da capa do X
topo = int(cp.height * 0.075)                    # tira um pouco do teto, guarda o reflexo
capa = cp.crop((0, topo, cp.width, topo + alvo_h))
capa = capa.resize((3000, 1000), Image.LANCZOS)
f1 = ImageFont.truetype(PIX, 118)
f2 = ImageFont.truetype(BAHN, 60)
f3 = ImageFont.truetype(BAHN, 50)
capa = brilho(capa, lambda d: d.text((600, 330), 'FLY ORGY', font=f1, fill=BRASA), 38, 1.0)
d = ImageDraw.Draw(capa)
d.text((600, 330), 'FLY ORGY', font=f1, fill=(255, 246, 242))
d.text((606, 520), 'thirty-two real fly brains. one back room.', font=f2, fill=(238, 222, 224))
d.text((608, 614), 'flyorgy.com', font=f3, fill=OURO)
capa.save(os.path.join(BRAND, 'x-capa-3000x1000.png'))
capa.resize((1500, 500), Image.LANCZOS).save(os.path.join(BRAND, 'x-capa-1500x500.png'))
print('  x-capa 3000x1000 + 1500x500')

# ---------------- site: logo, favicon e imagem de compartilhamento ----------------
# O logo do cabecalho aparece a 28 px e o favicon a 16: ali fica o CASAL, que ainda se
# reconhece. A orgia com varios casais e para o perfil do X e para o ticker, que sao maiores.
c.resize((256, 256), Image.LANCZOS).save(os.path.join(SITE, 'logo.png'))
c.resize((64, 64), Image.LANCZOS).save(os.path.join(SITE, 'favicon.png'))
# 1200x630 e mais alto que a capa: corta na LARGURA (a fonte tem altura de sobra), senao
# sobra tarja preta embaixo. Mantem a esquerda vazia para o titulo.
og_w = int(cp.height * 1200 / 630)
og = cp.crop((0, 0, min(og_w, cp.width), cp.height)).resize((1200, 630), Image.LANCZOS)
fo1 = ImageFont.truetype(PIX, 58)
og = brilho(og, lambda d2: d2.text((88, 190), 'FLY ORGY', font=fo1, fill=BRASA), 22, 1.0)
d = ImageDraw.Draw(og)
d.text((88, 190), 'FLY ORGY', font=fo1, fill=(255, 246, 242))
d.text((92, 300), 'thirty-two real fly brains', font=ImageFont.truetype(BAHN, 40), fill=(238, 222, 224))
d.text((92, 350), 'one back room', font=ImageFont.truetype(BAHN, 40), fill=(255, 95, 158))
d.text((94, 424), 'flyorgy.com', font=ImageFont.truetype(BAHN, 30), fill=OURO)
og.save(os.path.join(SITE, 'og.png'))
og.save(os.path.join(BRAND, 'og-1200x630.png'))
print('  site/logo.png, site/favicon.png, site/og.png')
