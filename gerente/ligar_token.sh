#!/usr/bin/env bash
# Liga o token do FLY ORGY na hora do lancamento, sem reiniciar nada.
#
#   bash gerente/ligar_token.sh 0xSEUCONTRATO [https://x.com/SEUPERFIL]
#   bash gerente/ligar_token.sh --limpar          # volta a olhar a curva mais movimentada da Pons
#
# O que ele faz, nesta ordem:
#   1. mercado/sentidos.txt  -> as 32 moscas passam a sentir CADA trade do nosso token, direto da
#      chain (o mercado rele este arquivo sozinho, em segundos)
#   2. mercado/ignorar.txt   -> o token da casa nunca e operado, caso as ordens sejam ligadas um dia
#   3. limpa o feed do site e o do relay, para os cards do lancamento comecarem do zero
#   4. /api/config           -> o CA e o link do X aparecem no topo da pagina para quem ja esta olhando
#      e sao injetados na pagina de quem chegar depois
set -u
cd /workspace/flyorgy
S=http://localhost:8438

if [ "${1:-}" = "--limpar" ]; then
  : > mercado/sentidos.txt
  curl -sf -m 5 -X POST "$S/api/mercado" -H 'Content-Type: application/json' -d '{"classe":"limpar"}' >/dev/null
  curl -sf -m 5 -X POST "$S/api/mercado/limpar" >/dev/null
  echo "voltei a olhar a curva mais movimentada da Pons"
  exit 0
fi

CA="${1:-}"
X="${2:-}"
case "$CA" in
  0x*) ;;
  *) echo "uso: bash gerente/ligar_token.sh 0xCONTRATO [https://x.com/perfil]"; exit 1;;
esac

echo "$CA" > mercado/sentidos.txt
grep -qix "$CA" mercado/ignorar.txt 2>/dev/null || echo "$CA" >> mercado/ignorar.txt

curl -sf -m 5 -X POST "$S/api/mercado" -H 'Content-Type: application/json' -d '{"classe":"limpar"}' >/dev/null \
  && echo "feed do relay limpo"
curl -sf -m 5 -X POST "$S/api/mercado/limpar" >/dev/null && echo "feed local limpo"

if [ -n "$X" ]; then
  curl -sf -m 8 -X POST "$S/api/config" -H 'Content-Type: application/json' \
       -d "{\"ca\":\"$CA\",\"x\":\"$X\"}" >/dev/null && echo "CA e X no ar na pagina"
else
  curl -sf -m 8 -X POST "$S/api/config" -H 'Content-Type: application/json' \
       -d "{\"ca\":\"$CA\"}" >/dev/null && echo "CA no ar na pagina"
fi

echo
echo "token: $CA"
echo "esperando o mercado pegar o feed da chain (ate ~30 s)..."
for i in $(seq 1 12); do
  sleep 5
  if grep -q "sentidos: .* direto da chain" /workspace/mercado.log 2>/dev/null; then
    tail -3 /workspace/mercado.log | grep "sentidos:" && exit 0
  fi
  if tail -5 /workspace/mercado.log 2>/dev/null | grep -q "feed da chain falhou"; then
    tail -2 /workspace/mercado.log; echo "-> ainda tentando; o mercado repete sozinho a cada 30 s"; exit 0
  fi
done
echo "sem confirmacao ainda; olhe /workspace/mercado.log"
