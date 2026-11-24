#!/bin/sh
# n8n 네이티브 실행 (8GB: Docker 대신). 127.0.0.1에만 바인딩, 버전 고정.
# n8n 1.x는 Basic Auth가 폐지됨 → 첫 접속 때 소유자 계정을 만들어 로그인으로 보호한다.
# 사용: BRIDGE_TOKEN=... backend/run_n8n.sh   (워크플로 가져오기: backend/n8n_workflow.json)
set -e
: "${BRIDGE_TOKEN:?BRIDGE_TOKEN 필요}"
export N8N_HOST=127.0.0.1 N8N_LISTEN_ADDRESS=127.0.0.1 N8N_PORT=5678 \
       N8N_DIAGNOSTICS_ENABLED=false N8N_VERSION_NOTIFICATIONS_ENABLED=false \
       N8N_BLOCK_ENV_ACCESS_IN_NODE=false BRIDGE_TOKEN
cd "$(dirname "$0")"
npx --yes n8n@1.123.100 import:workflow --input=n8n_workflow.json && npx --yes n8n@1.123.100 update:workflow --id=wikibrainAugment1 --active=true || true
exec npx --yes n8n@1.123.100 start
