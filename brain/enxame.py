# Enxame: N cerebros de mosca no MESMO processo, rodando como um LOTE na placa.
#
# A diferenca para o motor de uma mosca so (fly/sexfly, brain/motor.py) e que a matriz de sinapses
# do conectoma - 15.091.983 sinapses, o pedaco caro - e UMA SO, compartilhada, e cada mosca e uma
# linha do tensor de estado. Medido na RX 7900 XT em 12/09/2026:
#
#   lote  1     800 passos/s  | 0,20 GB
#   lote 16     161 passos/s  | 0,60 GB   <- 16 moscas mais rapido que as 2 do SEX FLY (teto 120)
#   lote 32      85 passos/s  | 1,03 GB
#
# Ou seja: o custo por mosca desaba (27 MB de estado cada) e a placa faz 2.500 passos-mosca/s
# em vez dos 800 de uma mosca sozinha. O que NAO da para fingir: as sinapses sao compartilhadas,
# entao a plasticidade hebbiana, se ligada, e do ENXAME, nao de cada mosca. Por isso ela vem
# desligada por padrao aqui (FLY_PLASTICIDADE=1 liga, e o site tem que dizer que o aprendizado
# e coletivo).
#
# Cada mosca tem: estado de membrana proprio, estimulos proprios, deteccao de crise propria
# (o apagao reinicia so a linha dela) e contagem de disparos propria.
import json
import os
import queue
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from vendor.modelo import TorchModel, MODEL_PARAMS, DT, get_weights, get_hash_tables
from vendor.neuronios import DN_NEURONS, DN_GROUPS, STIMULI
import estimulos_extra

HEBB_BATCH = 10
HEBB_ETA = 1e-4
HEBB_ALPHA = 1e-7

MS_MIN, MS_MAX = 50.0, 5000.0
JANELA_QUADROS = 8

CRISE_SPIKES_S = 100_000.0
CRISE_MS = 200.0
ESTADO_QUIETO_SPIKES_S = 300.0
ESTIMULOS_BLOQUEADOS = {'or56a'} | estimulos_extra.BLOQUEADOS


class Enxame:
    def __init__(self, n_moscas, dir_dados, dir_estado, meta_parquet, device='cuda',
                 plasticidade=False, intervalo_quadro=0.1, salvar_a_cada_s=600):
        self.B = int(n_moscas)
        self.device = device if torch.cuda.is_available() else 'cpu'
        self.dir_estado = Path(dir_estado)
        self.dir_estado.mkdir(parents=True, exist_ok=True)
        self.intervalo_quadro = intervalo_quadro
        self.salvar_a_cada_s = salvar_a_cada_s
        self.plasticidade = plasticidade

        dir_dados = Path(dir_dados)
        comp = dir_dados / '2025_Completeness_783.csv'
        conn = dir_dados / '2025_Connectivity_783.parquet'
        self.flyid2i, self.i2flyid = get_hash_tables(str(comp))
        self.n = len(self.flyid2i)
        pesos = get_weights(str(conn), str(comp), str(dir_dados), csr=True).to(self.device)
        self.n_sinapses = int(pesos.values().numel())
        self.model = TorchModel(self.B, self.n, DT, MODEL_PARAMS, pesos, device=self.device)
        self.state = self.model.state_init()
        self.rates = torch.zeros(self.B, self.n, device=self.device)

        extras_in, extras_out = estimulos_extra.montar(meta_parquet)
        todos = dict(STIMULI)
        todos.update(extras_in)
        self.stim_idx = {
            k: torch.tensor([self.flyid2i[i] for i in v['neurons'] if i in self.flyid2i],
                            device=self.device, dtype=torch.long)
            for k, v in todos.items()
        }
        self.stim_rate = {k: float(v['rate']) for k, v in todos.items()}
        self.stim_desc = {k: v.get('description', k) for k, v in todos.items()}
        self.dn_names = [nm for nm in DN_NEURONS if DN_NEURONS[nm] in self.flyid2i]
        dn_ids = [DN_NEURONS[nm] for nm in self.dn_names]
        self.grupos = {g: [self.dn_names.index(nm) for nm in nomes if nm in self.dn_names]
                       for g, nomes in DN_GROUPS.items()}
        for g, ids in extras_out.items():
            ini = len(dn_ids)
            ids = [i for i in ids if i in self.flyid2i]
            self.dn_names += [f'{g}_{k}' for k in range(len(ids))]
            dn_ids += ids
            self.grupos[g] = list(range(ini, ini + len(ids)))
        self.dn_idx = torch.tensor([self.flyid2i[i] for i in dn_ids], device=self.device, dtype=torch.long)
        self.grupo_idx = {g: torch.tensor(ii, device=self.device, dtype=torch.long)
                          for g, ii in self.grupos.items() if ii}

        meta = pd.read_parquet(meta_parquet)
        assert len(meta) == self.n, 'neuronios.parquet nao bate com o modelo; rode preparar_dados.py'
        self.regiao = torch.tensor(meta['regiao'].to_numpy(np.int64), device=self.device)
        self.n_regioes = int(self.regiao.max().item()) + 1

        self.acc = torch.zeros(self.B, self.n, device=self.device)
        self.passos = 0
        self.passos_quadro = 0
        self.janela = deque(maxlen=JANELA_QUADROS)
        self.ativos = [{} for _ in range(self.B)]        # por mosca: estimulo -> passo em que expira
        self._mudou_estimulo = True
        self._proximo_fim = None
        self.lock = threading.Lock()
        self.fila = queue.Queue(maxsize=3)
        self.rodando = False
        self.info = {'sinapses_mudadas': 0, 'passos_por_s': 0.0}
        self.eventos = deque(maxlen=200)
        self.crises = [0] * self.B
        self._crise_passos = [0] * self.B
        self.estado = ['quiet'] * self.B

        self._init_plasticidade()
        self._carregar_vida()
        print(f'[enxame] {self.B} moscas x {self.n} neuronios, {self.n_sinapses} sinapses '
              f'COMPARTILHADAS em {self.device}; plasticidade={"coletiva" if plasticidade else "off"}')

    # ----- plasticidade: os pesos sao os mesmos para todas, entao ela e do enxame -----
    def _init_plasticidade(self):
        w = self.model.weights
        self._syn = w.values()
        self._w0 = self._syn.abs().clone()
        if not self.plasticidade:
            return
        self._col_idx = w.col_indices()
        row_ptr = w.crow_indices()
        self._sinal = torch.sign(self._syn)
        self._base = self._syn.clone()
        row_len = row_ptr[1:] - row_ptr[:-1]
        self._post_idx = torch.repeat_interleave(torch.arange(self.n, device=self.device), row_len)
        self._spike_acc = torch.zeros(self.n, device=self.device)
        self._hebb_count = 0
        maxm = 3.0 * self._w0
        self._cmin = torch.where(self._sinal < 0, -maxm, torch.zeros_like(maxm))
        self._cmax = torch.where(self._sinal > 0, maxm, torch.zeros_like(maxm))
        arq = self.dir_estado / 'sinapses.pt'
        if arq.exists():
            salvo = torch.load(arq, map_location=self.device, weights_only=True)
            if salvo.shape == self._syn.shape:
                self._syn.copy_(salvo)
                print('[enxame] sinapses carregadas de', arq)

    @torch.no_grad()
    def _hebb(self):
        avg = self._spike_acc / (HEBB_BATCH * self.B)
        self._spike_acc.zero_()
        dW = HEBB_ETA * avg[self._col_idx] * avg[self._post_idx] * self._sinal - HEBB_ALPHA * (self._syn - self._base)
        self._syn.add_(dW)
        self._syn.clamp_(min=self._cmin, max=self._cmax)

    @torch.no_grad()
    def _contar_mudadas(self):
        if not self.plasticidade:
            return 0
        return int(((self._syn.abs() - self._w0).abs() > 0.01 * self._w0).sum().item())

    # ----- vida -----
    def _carregar_vida(self):
        arq = self.dir_estado / 'vida.json'
        if arq.exists():
            v = json.loads(arq.read_text())
            self.passos_total = int(v.get('passos_total', 0))
            self.nascimento = v.get('nascimento')
        else:
            self.passos_total = 0
            self.nascimento = datetime.now(timezone.utc).isoformat()

    def salvar(self):
        if self.plasticidade:
            torch.save(self._syn.detach().cpu(), self.dir_estado / 'sinapses.pt')
        (self.dir_estado / 'vida.json').write_text(json.dumps({
            'nascimento': self.nascimento,
            'moscas': self.B,
            'passos_total': self.passos_total,
            'segundos_vividos': self.passos_total * DT / 1000.0,
            'salvo_em': datetime.now(timezone.utc).isoformat(),
        }, indent=1))

    # ----- estimulos, por mosca (i = -1 estimula todas) -----
    def estimular(self, i, nome, ms, origem='site'):
        if nome not in self.stim_idx or nome in ESTIMULOS_BLOQUEADOS:
            return False
        try:
            ms = float(ms)
        except (TypeError, ValueError):
            ms = 500.0
        ms = max(MS_MIN, min(MS_MAX, ms))
        alvos = range(self.B) if i is None or i < 0 else [int(i)]
        with self.lock:
            for k in alvos:
                if 0 <= k < self.B:
                    self.ativos[k][nome] = self.passos + int(ms / DT)
            fins = [f for d in self.ativos for f in d.values()]
            self._proximo_fim = min(fins) if fins else None
            self._mudou_estimulo = True
        self.eventos.append({'t': time.time(), 'tipo': 'stimulus', 'mosca': i,
                             'estimulo': nome, 'ms': ms, 'origem': origem})
        return True

    def _recalc_rates(self):
        self.rates.zero_()
        for k in range(self.B):
            for nome in self.ativos[k]:
                idx = self.stim_idx[nome]
                taxa = self.stim_rate[nome]
                self.rates[k, idx] = torch.clamp(self.rates[k, idx], min=taxa)

    # ----- um passo de 0,1 ms de cerebro, para TODAS as moscas de uma vez -----
    @torch.no_grad()
    def passo(self):
        if self._mudou_estimulo or (self._proximo_fim is not None and self.passos >= self._proximo_fim):
            with self.lock:
                for k in range(self.B):
                    for nome in [n for n, fim in self.ativos[k].items() if self.passos >= fim]:
                        del self.ativos[k][nome]
                fins = [f for d in self.ativos for f in d.values()]
                self._proximo_fim = min(fins) if fins else None
                self._recalc_rates()
                self._mudou_estimulo = False
        c, d, s, v, r = self.state
        self.state = self.model(self.rates, c, d, s, v, r)
        spk = self.state[2]
        self.acc += spk
        self.passos += 1
        self.passos_quadro += 1
        self.passos_total += 1
        if self.plasticidade:
            self._spike_acc += spk.sum(0)
            self._hebb_count += 1
            if self._hebb_count >= HEBB_BATCH:
                self._hebb()
                self._hebb_count = 0

    @torch.no_grad()
    def _quadro(self, foco=0, amostra=220, teto_foco=3500):
        """Fecha um quadro. Manda a nuvem INTEIRA de disparos da mosca em foco e uma amostra
        das outras (o cerebrinho de cada uma na tela) - senao seriam 16 nuvens por quadro."""
        passos = self.passos_quadro
        self.passos_quadro = 0
        if passos == 0:
            return None
        seg_q = passos * DT / 1000.0
        dn = self.acc[:, self.dn_idx]                                    # [B, n_dn]
        reg = torch.zeros(self.B, self.n_regioes, device=self.device)
        reg.index_add_(1, self.regiao, self.acc)
        total = self.acc.sum(1)                                          # [B]
        nz = torch.nonzero(self.acc)                                     # [K, 2] (mosca, neuronio)
        nz = nz.cpu().numpy()
        dn_cpu = dn.cpu().numpy()
        reg_cpu = reg.cpu().numpy().astype(np.int32)
        total_cpu = total.cpu().numpy()
        self.acc.zero_()

        self.janela.append((dn_cpu, passos))
        soma = sum(d for d, _ in self.janela)
        p = sum(pp for _, pp in self.janela)
        seg = p * DT / 1000.0

        rng = np.random.default_rng()
        moscas = []
        nuvens = []
        with self.lock:
            ativos_todos = [list(d) for d in self.ativos]
        for k in range(self.B):
            spikes_s = float(total_cpu[k] / seg_q) if seg_q > 0 else 0.0
            if spikes_s > CRISE_SPIKES_S:
                self._crise_passos[k] += passos
                self.estado[k] = 'seizure'
                if not ativos_todos[k] and self._crise_passos[k] * DT >= CRISE_MS:
                    self.apagar(k, spikes_s)
            else:
                self._crise_passos[k] = 0
                self.estado[k] = 'quiet' if spikes_s < ESTADO_QUIETO_SPIKES_S else 'active'
            taxas = {g: (float(soma[k][ii].sum() / (len(ii) * seg)) if ii and seg > 0 else 0.0)
                     for g, ii in self.grupos.items()}
            idx = nz[nz[:, 0] == k][:, 1].astype(np.uint32)
            teto = teto_foco if k == foco else amostra
            if len(idx) > teto:
                idx = rng.choice(idx, teto, replace=False)
            nuvens.append(np.sort(idx))
            moscas.append({
                'i': k,
                'spikes': int(total_cpu[k]),
                'spikes_per_s': round(spikes_s, 1),
                'state': self.estado[k],
                'seizures': self.crises[k],
                'stimuli': ativos_todos[k],
                'dn': {g: round(v, 1) for g, v in taxas.items()},
                'regions': reg_cpu[k].tolist(),
            })
        self.info['spikes_por_mosca'] = [m['spikes_per_s'] for m in moscas]
        return {
            'moscas': moscas, 'nuvens': nuvens, 'foco': foco,
            'passos': passos, 'seg_cerebro': seg_q,
            't_cerebro': self.passos * DT / 1000.0,
            'vivo_s': self.passos_total * DT / 1000.0,
            'total': float(total_cpu.sum()),
        }

    @torch.no_grad()
    def apagar(self, k, spikes_s=0.0):
        """Apagao de UMA mosca: reinicia a membrana so da linha dela; as outras nao sentem."""
        for t in self.state:
            t[k].zero_()
        c, d, s, v, r = self.state
        v[k] += MODEL_PARAMS['v0']
        r[k] += int(MODEL_PARAMS['tRefrac'] / DT)
        self.acc[k].zero_()
        self.crises[k] += 1
        self._crise_passos[k] = 0
        self.estado[k] = 'quiet'
        self.eventos.append({'t': time.time(), 'tipo': 'seizure', 'mosca': k,
                             'spikes_s': round(spikes_s)})
        print(f'[enxame] crise da mosca {k} (#{self.crises[k]}): {spikes_s:,.0f} spikes/s; apaguei e religuei')

    # ----- thread -----
    def iniciar(self):
        self.rodando = True
        self.thread = threading.Thread(target=self._loop, name='enxame', daemon=True)
        self.thread.start()

    def parar(self):
        self.rodando = False
        if hasattr(self, 'thread'):
            self.thread.join(timeout=10)
        self.salvar()

    def _ler_teto(self):
        teto = float(os.environ.get('FLY_PASSOS_S', '0') or 0)
        try:
            arq = Path(__file__).resolve().parent / 'data' / 'passos_s.txt'
            if arq.exists():
                teto = float(arq.read_text().strip() or 0)
        except Exception:
            pass
        return max(0.0, teto)

    def _loop(self):
        t_quadro = t_salvo = t_mudadas = t_taxa = time.time()
        passos_taxa = 0
        teto = self._ler_teto()
        lote = 8
        t_lote = time.time()
        n_lote = 0
        foco = 0
        t_foco = time.time()
        while self.rodando:
            self.passo()
            passos_taxa += 1
            if teto > 0:
                n_lote += 1
                if n_lote >= lote:
                    t_lote += lote / teto
                    atraso = t_lote - time.time()
                    if atraso > 0:
                        time.sleep(atraso)
                    elif atraso < -1.0:
                        t_lote = time.time()
                    n_lote = 0
            agora = time.time()
            if agora - t_foco >= 12.0:
                # a nuvem inteira vai para a mosca que esta disparando mais (nao adianta focar numa
                # calada); se todas estiverem quietas, roda na ordem para nao ficar parada numa so
                q_ult = self.info.get('spikes_por_mosca') or []
                if q_ult and max(q_ult) > 0:
                    foco = int(max(range(len(q_ult)), key=lambda i: q_ult[i]))
                else:
                    foco = (foco + 1) % self.B
                t_foco = agora
            if agora - t_quadro >= self.intervalo_quadro:
                t_quadro = agora
                q = self._quadro(foco=foco)
                if q is not None:
                    q['passos_por_s'] = self.info['passos_por_s']
                    q['sinapses_mudadas'] = self.info['sinapses_mudadas']
                    if self.fila.full():
                        try:
                            self.fila.get_nowait()
                        except queue.Empty:
                            pass
                    self.fila.put_nowait(q)
            if agora - t_taxa >= 2.0:
                self.info['passos_por_s'] = passos_taxa / (agora - t_taxa)
                passos_taxa = 0
                t_taxa = agora
                novo = self._ler_teto()
                if novo != teto:
                    teto = novo
                    t_lote = time.time()
                    n_lote = 0
            if self.plasticidade and agora - t_mudadas >= 30.0:
                self.info['sinapses_mudadas'] = self._contar_mudadas()
                t_mudadas = agora
            if agora - t_salvo >= self.salvar_a_cada_s:
                self.salvar()
                t_salvo = agora
