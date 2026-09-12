# Teste de centavos do modo real: compra ETH_TESTE na curva mais movimentada da Pons e vende tudo em seguida.
# Com --seco so cota e simula a compra (estimate_gas), sem enviar nada. Rodar uma vez antes de ligar o modo real.
#   py\Scripts\python.exe mercado\teste_real.py --seco
#   py\Scripts\python.exe mercado\teste_real.py 0.0002
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import carteira as mod_carteira   # noqa: E402
import mercado                    # noqa: E402
import pons                       # noqa: E402

sys.stdout.reconfigure(errors='replace')   # nome de token com emoji nao pode derrubar o console cp1252
SECO = '--seco' in sys.argv
valores = [a for a in sys.argv[1:] if not a.startswith('--')]
ETH_TESTE = float(valores[0]) if valores else 0.0002

chain = pons.Pons()
conta = mod_carteira.carregar()
saldo_inicial = chain.saldo_eth(conta.address)
print(f'carteira {conta.address}: {saldo_inicial:.6f} ETH; gas price {chain.w3.eth.gas_price / 1e9:.4f} gwei')

escolha = None
for cand in mercado.listar_pools():
    if not cand['token']:
        continue
    l = chain.lancamento(cand['token'])
    print(f'  {cand["nome"]:>10} token {cand["token"]} fase {l["phase"]} curva {l["curva"]} na_curva={l["na_curva"]}')
    if l['na_curva'] and escolha is None:
        escolha = (cand, l)
if not escolha:
    sys.exit('nenhuma curva ativa na Pons agora')
cand, l = escolha
print(f'escolhido: {cand["nome"]} ({cand["par"]})')

e = chain.estado_curva(l['curva'], conta.address)
print(f'curva: R {e["R"] / 1e18:.5f} ETH, T {e["T"] / 1e18:,.0f}, sellable {e["sellable"] / 1e18:,.0f}, fee {e["feeBps"]} bps, '
      f'tax {e["taxBps"]} bps, snipe {e["snipeBps"]} bps, graduated {e["graduated"]}, nativo {e["nativo"]}')
wei = int(ETH_TESTE * 1e18)
cot = chain.cotar_compra(wei, e['R'], e['T'], e['sellable'], e['feeBps'], e['taxBps'], e['snipeBps'])
min_out = int(cot * (1 - mercado.SLIPPAGE))
print(f'compra de {ETH_TESTE} ETH: cotacao {cot / 1e18:,.2f} tokens (minimo aceito {min_out / 1e18:,.2f})')
gas = chain.simular_compra(conta, l['curva'], ETH_TESTE, min_out)
print(f'simulacao OK: gas estimado {gas:,} (~{gas * chain.w3.eth.gas_price / 1e18:.8f} ETH)')
if SECO:
    print('modo seco: nada enviado')
    sys.exit(0)

t0 = time.time()
h, rec = chain.comprar(conta, l['curva'], ETH_TESTE, min_out)
print(f'COMPRA {h} em {time.time() - t0:.1f} s, gas usado {rec["gasUsed"]:,}')
tokens = chain.saldo_token(cand['token'], conta.address)
print(f'tokens na carteira: {tokens / 1e18:,.2f} (cotacao era {cot / 1e18:,.2f})')

e = chain.estado_curva(l['curva'], conta.address)
cotv = chain.cotar_venda(tokens, e['R'], e['T'], e['feeBps'], e['taxBps'])
min_q = int(cotv * (1 - mercado.SLIPPAGE))
print(f'venda de tudo: cotacao {cotv / 1e18:.6f} ETH (minimo aceito {min_q / 1e18:.6f})')
antes = chain.saldo_eth(conta.address)
t0 = time.time()
h2, rec2 = chain.vender(conta, l['curva'], cand['token'], tokens, min_q)
depois = chain.saldo_eth(conta.address)
print(f'VENDA {h2} em {time.time() - t0:.1f} s, gas usado {rec2["gasUsed"]:,}')
print(f'recebido liquido {depois - antes:.6f} ETH; tokens restantes {chain.saldo_token(cand["token"], conta.address)}')
print(f'saldo final {depois:.6f} ETH; custo total do teste (taxas + gas) {saldo_inicial - depois:.6f} ETH')
