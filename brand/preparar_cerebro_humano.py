# Prepara o cerebro humano em 3D para o navegador, no mesmo padrao da mosca: geometria real,
# exportada em binario compacto, e um JSON dizendo o que cada coisa e.
#
# O QUE E REAL AQUI
#   * a casca: superficie pial do fsaverage (FreeSurfer), media de 40 cerebros humanos de ressonancia.
#     Giro e sulco de verdade, 10.242 vertices por hemisferio.
#   * as regioes: atlas de Destrieux, 75 regioes por hemisferio, rotulo por vertice.
#   * a contagem e a densidade do H01: 57.000 corpos celulares num milimetro cubico de cortex
#     temporal de uma pessoa real (Shapson-Coe et al., Science 2024).
#
# O QUE NAO E
#   * a POSICAO de cada um dos 57.000 corpos celulares. O H01 publica a segmentacao como volume de
#     imagem (1,4 petabyte); nao ha tabela de coordenadas. Aqui os pontos sao sorteados dentro do
#     cubo respeitando a densidade por camada cortical, que e conhecida. A pagina diz isso na cara.
#   * o lugar exato de onde a amostra saiu. Sabe-se que foi do lobo temporal esquerdo, numa cirurgia
#     de epilepsia. O cubo e posto no giro temporal superior, pelo proprio atlas. E aproximado.
import json
import os
import struct

import numpy as np
from nilearn import datasets, surface

SITE = r'C:\Higgsfield Games\flyorgy\site'
N_CELULAS = 57000          # H01: ~57 mil corpos celulares em 1 mm3
LADO_MM = 1.0              # o cubo do H01

# Densidade relativa de corpos celulares por camada do cortex (I no topo, VI no fundo).
# A camada I e quase vazia de neuronio; a IV e a mais densa. Fracao da espessura e peso.
CAMADAS = [('I', 0.08, 0.15), ('II', 0.10, 1.35), ('III', 0.26, 1.05),
           ('IV', 0.12, 1.75), ('V', 0.22, 0.90), ('VI', 0.22, 1.10)]


def malha_hemisferio(caminho):
    m = surface.load_surf_mesh(caminho)
    v = np.asarray(getattr(m, 'coordinates', None) if hasattr(m, 'coordinates') else m[0], dtype=np.float32)
    f = np.asarray(getattr(m, 'faces', None) if hasattr(m, 'faces') else m[1], dtype=np.int32)
    return v, f


def main():
    fs = datasets.fetch_surf_fsaverage('fsaverage5')
    atlas = datasets.fetch_atlas_surf_destrieux()
    rotulos = [l.decode() if isinstance(l, bytes) else str(l) for l in atlas['labels']]

    vs, fs_, rs, off = [], [], [], 0
    for lado, chave, mapa in (('L', 'pial_left', 'map_left'), ('R', 'pial_right', 'map_right')):
        v, f = malha_hemisferio(fs[chave])
        r = np.asarray(atlas[mapa], dtype=np.int32)
        assert len(r) == len(v), f'{lado}: {len(r)} rotulos para {len(v)} vertices'
        vs.append(v)
        fs_.append(f + off)
        rs.append(r)
        off += len(v)
        print(f'  hemisferio {lado}: {len(v)} vertices, {len(f)} faces')

    V = np.concatenate(vs).astype(np.float32)
    F = np.concatenate(fs_).astype(np.uint32)
    R = np.concatenate(rs).astype(np.uint8)
    centro = (V.min(0) + V.max(0)) / 2.0
    V = V - centro                                   # centra na origem, em milimetros

    # ---- onde entra o cubo do H01: giro temporal superior esquerdo ----
    alvo = 'G_temp_sup-Lateral'
    idx = rotulos.index(alvo) if alvo in rotulos else None
    if idx is None:
        raise SystemExit('nao achei a regiao ' + alvo)
    esq = np.zeros(len(V), bool)
    esq[:len(vs[0])] = True
    sel = (R == idx) & esq
    print(f'  {alvo} (esquerdo): {int(sel.sum())} vertices')
    cubo = V[sel].mean(0)
    # 4% para dentro: o cortex tem 2 a 4 mm de espessura, entao a amostra fica logo abaixo da
    # superficie. Com 12% o cubo afundava 6 mm, ja na substancia branca.
    cubo = cubo + (V[esq].mean(0) - cubo) * 0.04

    # ---- os 57 mil corpos celulares dentro do milimetro cubico ----
    rng = np.random.default_rng(7)
    pesos = np.array([c[1] * c[2] for c in CAMADAS], float)
    pesos /= pesos.sum()
    quantos = np.round(pesos * N_CELULAS).astype(int)
    quantos[-1] += N_CELULAS - quantos.sum()
    zs, camada = [], []
    topo = 0.0
    for (nome, esp, _), n in zip(CAMADAS, quantos):
        base = topo + esp
        zs.append(rng.uniform(topo, base, n))
        camada.append(np.full(n, CAMADAS.index(next(c for c in CAMADAS if c[0] == nome)), np.uint8))
        topo = base
    z = np.concatenate(zs) * LADO_MM
    cam = np.concatenate(camada)
    x = rng.uniform(0, LADO_MM, N_CELULAS)
    y = rng.uniform(0, LADO_MM, N_CELULAS)
    pts = np.stack([x, y, z], 1).astype(np.float32) - LADO_MM / 2.0

    # ---- binario: vertices | faces | regiao por vertice | pontos | camada por ponto ----
    caminho_bin = os.path.join(SITE, 'humano.bin')
    with open(caminho_bin, 'wb') as fh:
        fh.write(V.tobytes())
        fh.write(F.tobytes())
        fh.write(R.tobytes())
        fh.write(pts.tobytes())
        fh.write(cam.tobytes())
    meta = {
        'nv': int(len(V)), 'nf': int(len(F)), 'ncel': int(N_CELULAS),
        'off_v': 0,
        'off_f': int(V.nbytes),
        'off_r': int(V.nbytes + F.nbytes),
        'off_p': int(V.nbytes + F.nbytes + R.nbytes),
        'off_c': int(V.nbytes + F.nbytes + R.nbytes + pts.nbytes),
        'regioes': rotulos,
        'cubo': [float(c) for c in cubo], 'lado_mm': LADO_MM,
        'camadas': [c[0] for c in CAMADAS],
        'caixa': [float(x) for x in np.concatenate([V.min(0), V.max(0)])],
        'fonte': {
            'casca': 'fsaverage5 pial surface (FreeSurfer) - media de 40 cerebros de ressonancia',
            'regioes': 'Destrieux atlas, 75 por hemisferio',
            'celulas': 'H01, Shapson-Coe et al., Science 2024 - 57.000 corpos celulares em 1 mm3 '
                       'de cortex temporal humano. A CONTAGEM e a DENSIDADE POR CAMADA sao reais; '
                       'as coordenadas de cada celula nao foram publicadas em tabela.',
        },
    }
    with open(os.path.join(SITE, 'humano.json'), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, separators=(',', ':'))
    print(f'  humano.bin {os.path.getsize(caminho_bin)/1e6:.2f} MB | {len(V)} vertices, {len(F)} faces, '
          f'{N_CELULAS} celulas')
    print(f'  cubo do H01 em {np.round(cubo,1)} mm')


if __name__ == '__main__':
    main()
