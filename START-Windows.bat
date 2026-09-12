@echo off
cd /d "%~dp0"
rem FLY ORGY - o enxame inteiro (16 cerebros em lote) num processo so, + o corpo 3D + o mercado.
rem Porta 8438 (a fly usa 8435, o loop 8437, o flypad 8440).
set FLY_PORT=8438
set FLY_MOSCAS=32
set FLY_SERVIDOR=http://localhost:8438
rem Plasticidade OFF: as sinapses sao compartilhadas pelas 16, aprender seria do enxame e nao de cada uma.
set FLY_PLASTICIDADE=0
rem Teto de passos por segundo (poupa a placa). Medido: 16 moscas aguentam 161; o arquivo
rem brain\data\passos_s.txt manda nisto e pode mudar sem reiniciar.
set FLY_PASSOS_S=120
rem Piso e cores do corpo, e saida em pose (a mosca e desenhada no navegador; leve para internet).
set FLY_CORPO_PISO=preto
set FLY_CORPO_CORES=real
set FLY_CORPO_SAIDA=pose
rem Site publico no Railway. O token fica em relay.token (fora do git); o MESMO valor vai na
rem variavel FLY_RELAY_TOKEN do servico la.
if exist relay.dominio set /p FLY_RELAY_URL=<relay.dominio
if exist relay.token set /p FLY_RELAY_TOKEN=<relay.token
rem Mercado: real (carteira em mercado\carteira.json) ou papel.
set FLY_MERCADO_MODO=papel
echo ==== FLY ORGY - 16 cerebros + corpo 3D + mercado ====
echo Abra http://localhost:8438 no navegador. Ctrl+C aqui encerra o enxame.
start "FLY ORGY corpo 3D" "py\Scripts\python.exe" "corpo\corpo.py"
start "FLY ORGY mercado" "py\Scripts\python.exe" "mercado\mercado.py"
"py\Scripts\python.exe" "brain\servidor.py"
pause
