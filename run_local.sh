#!/bin/sh
# 로컬 전체 실행: MLX 브리지(127.0.0.1:8001) + 화면 서버(127.0.0.1:8000). Ctrl+C 한 번으로 둘 다 내려간다.
# 토큰은 data/lora/token에 한 번 만들어 두고 계속 쓴다(공개 사이트에서 내 Mac에 연결할 때 붙여 넣는 값).
set -e
cd "$(dirname "$0")"
[ -f data/bodies.db ] || { echo "data/bodies.db 없음: .venv/bin/python pipeline/6_bodies.py dump/kowiki.xml.bz2 먼저"; exit 1; }
mkdir -p data/lora
[ -f web/dist/index.html ] || { echo "화면 빌드 중 (web/)"; (cd web && npm install --no-audit --no-fund && npx vite build); }
if [ ! -s data/lora/token ]; then (umask 077; openssl rand -hex 24 > data/lora/token); fi
chmod 600 data/lora/token
BRIDGE_TOKEN="$(cat data/lora/token)"; export BRIDGE_TOKEN
.venv/bin/python backend/mlx_bridge.py > data/lora/bridge.log 2>&1 &
BRIDGE=$!
trap 'kill $BRIDGE 2>/dev/null; pkill -f mlx_lm.server 2>/dev/null; exit 0' INT TERM EXIT
echo "브리지 기동 중 (로그: data/lora/bridge.log). 공개 사이트 연결 토큰: data/lora/token"
.venv/bin/python server.py
