# FERRAMENTA DO DONO, fora do programa da mosca (o programa dela nao tem funcao de saque, e continua sem ter).
# Vende TODOS os tokens que ela segura na curva da Pons e manda o ETH (menos o gas) para o endereco que voce passar.
# Roda so na mao, no seu terminal, com o seu endereco publico:
#   py\Scripts\python.exe mercado\encerrar.py 0xSUA_CARTEIRA
#   py\Scripts\python.exe mercado\encerrar.py 0xSUA_CARTEIRA --so-vender      (vende e deixa o ETH na carteira dela)
#   py\Scripts\python.exe mercado\encerrar.py 0xSUA_CARTEIRA --token 0x...     (outro token que nao o de ultimo_token.txt)
# Pede confirmacao digitada antes de cada transacao. A chave nunca aparece na tela.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import carteira as mod_carteira   # noqa: E402
import pons                       # noqa: E402
from web3 import Web3             # noqa: E402

AQUI = Path(__file__).resolve().parent
SLIPPAGE = 0.03


def confirmar(pergunta):
    resposta = input(pergunta + ' [digite SIM para continuar] ').strip()
    if resposta != 'SIM':
        sys.exit('cancelado')


def main():
    args = sys.argv[1:]
    if not args or not args[0].startswith('0x') or len(args[0]) != 42:
        sys.exit('uso: encerrar.py 0xSEU_ENDERECO [--so-vender] [--token 0x...]')
    destino = Web3.to_checksum_address(args[0])
    so_vender = '--so-vender' in args
    token = args[args.index('--token') + 1] if '--token' in args else (AQUI / 'ultimo_token.txt').read_text().strip()

    chain = pons.Pons()
    conta = mod_carteira.carregar()
    w3 = chain.w3
    print(f'carteira dela: {conta.address}')
    print(f'destino:       {destino}')
    if destino.lower() == conta.address.lower():
        sys.exit('destino e a propria carteira dela')

    # 1) vende tudo do token na curva
    lanc = chain.lancamento(token)
    erc = chain.erc20(lanc['token'])
    simbolo = erc.functions.symbol().call()
    decimais = int(erc.functions.decimals().call())
    saldo_tok = int(erc.functions.balanceOf(conta.address).call())
    print(f'{simbolo}: {saldo_tok / 10 ** decimais:,.2f} tokens; curva {lanc["curva"]}; fase {lanc["phase"]}')
    if saldo_tok > 0:
        if not lanc['na_curva']:
            sys.exit(f'{simbolo} nao esta mais na curva (graduou): vender na mao pela interface da Pons')
        e = chain.estado_curva(lanc['curva'], conta.address)
        cot = chain.cotar_venda(saldo_tok, e['R'], e['T'], e['feeBps'], e['taxBps'])
        print(f'venda de tudo: cotacao {cot / 1e18:.6f} ETH')
        confirmar(f'Vender {saldo_tok / 10 ** decimais:,.2f} {simbolo} por ~{cot / 1e18:.6f} ETH?')
        h, rec = chain.vender(conta, lanc['curva'], lanc['token'], saldo_tok, int(cot * (1 - SLIPPAGE)))
        print(f'VENDA {h} (gas {rec["gasUsed"]:,})')
    else:
        print('nenhum token para vender')
    saldo = w3.eth.get_balance(conta.address)
    print(f'ETH na carteira dela agora: {saldo / 1e18:.6f}')
    if so_vender:
        return

    # 2) manda o ETH (menos o gas da transferencia) para o destino
    preco_gas = int(w3.eth.gas_price)
    max_fee = preco_gas * 2 + 1
    # gas estimado pela chain (em L2 uma transferencia pode passar de 21000) com folga de 30%;
    # a chain exige saldo >= valor + gas * maxFeePerGas, entao a reserva e exatamente isso (+ uma migalha)
    try:
        gas = int(w3.eth.estimate_gas({'from': conta.address, 'to': destino, 'value': saldo // 2}) * 1.3)
    except Exception:
        gas = 60000
    custo = gas * max_fee + 10 ** 12
    valor = saldo - custo
    if valor <= 0:
        sys.exit('nao sobra ETH para transferir depois do gas')
    print(f'transferencia: {valor / 1e18:.6f} ETH para {destino} (gas {gas:,} x {max_fee / 1e9:.4f} gwei reservado = {custo / 1e18:.8f} ETH)')
    confirmar('Enviar?')
    tx = {'from': conta.address, 'to': destino, 'value': int(valor), 'gas': gas, 'chainId': pons.CHAIN_ID,
          'nonce': w3.eth.get_transaction_count(conta.address),
          'maxFeePerGas': max_fee, 'maxPriorityFeePerGas': preco_gas}
    assinada = conta.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(assinada.raw_transaction)
    rec = w3.eth.wait_for_transaction_receipt(h, timeout=120)
    print(f'ENVIADO {Web3.to_hex(h)}; status {rec["status"]}; sobrou {w3.eth.get_balance(conta.address) / 1e18:.8f} ETH na carteira dela')


if __name__ == '__main__':
    main()
