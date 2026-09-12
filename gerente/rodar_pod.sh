#!/usr/bin/env bash
# Sobe o FLY ORGY dentro do pod alugado (RunPod). Roda como root, a partir de /workspace/flyorgy.
#   bash gerente/rodar_pod.sh          # sobe tudo em segundo plano
#   bash gerente/rodar_pod.sh parar    # derruba tudo
# Logs em /workspace/*.log. O site fica em https://<podid>-8438.proxy.runpod.net
set -u
cd /workspace/flyorgy

if [ "${1:-}" = "parar" ]; then
  pkill -f 'brain/servidor.py' ; pkill -f 'corpo/corpo.py' ; pkill -f 'mercado/mercado.py'
  sleep 2; echo "parado"; exit 0
fi

export FLY_PORT=8438
export FLY_MOSCAS="${FLY_MOSCAS:-32}"          # 16 casais; medido na 4090: 127 passos/s cada, 1,03 GB
export FLY_SERVIDOR=http://localhost:8438
export FLY_PLASTICIDADE=0                      # sinapses compartilhadas: aprender seria do enxame
export FLY_PASSOS_S="${FLY_PASSOS_S:-120}"
export FLY_CORPO_PISO=preto FLY_CORPO_CORES=real FLY_CORPO_SAIDA=pose
export FLY_CEREBRO_AFINIDADE=0 FLY_CORPO_AFINIDADE=0
export MUJOCO_GL=egl PYOPENGL_PLATFORM=egl
export FLY_MERCADO_MODO="${FLY_MERCADO_MODO:-papel}"
export FLY_MERCADO_ORDENS="${FLY_MERCADO_ORDENS:-off}"   # o FLY ORGY nao opera: o mercado so vira estimulo
export PYTHONUNBUFFERED=1

# reinicia sozinho se cair (o mesmo padrao do FLY PAD)
laco() {
  local nome="$1"; shift
  while true; do
    "$@" >> "/workspace/$nome.log" 2>&1
    echo "[$(date -u +%H:%M:%S)] $nome caiu, subindo de novo" >> "/workspace/$nome.log"
    sleep 5
  done
}
export -f laco

pkill -f 'brain/servidor.py' 2>/dev/null; pkill -f 'corpo/corpo.py' 2>/dev/null; pkill -f 'mercado/mercado.py' 2>/dev/null
sleep 2
nohup bash -c 'laco enxame python brain/servidor.py' >/dev/null 2>&1 &
echo "enxame subindo (carrega o conectoma, leva ~1 min)"
for i in $(seq 1 60); do
  if curl -sf -m 2 http://localhost:8438/api/estado >/dev/null 2>&1; then echo "enxame de pe"; break; fi
  sleep 5
done
nohup bash -c 'laco corpo python corpo/corpo.py' >/dev/null 2>&1 &
nohup bash -c 'laco mercado python mercado/mercado.py' >/dev/null 2>&1 &
sleep 5
echo "corpo e mercado subindo. logs: /workspace/enxame.log /workspace/corpo.log /workspace/mercado.log"
