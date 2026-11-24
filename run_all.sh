#!/bin/sh
# 전체 파이프라인. 3단계(임베딩)는 중단돼도 다시 실행하면 이어서 함.
set -e
cd "$(dirname "$0")"
PY=.venv/bin/python
[ -f data/pages.done ] || { $PY pipeline/1_parse.py dump/kowiki.xml.bz2 && touch data/pages.done; }
[ -f data/edges.npy ] || $PY pipeline/2_graph.py
$PY pipeline/3_embed.py
$PY pipeline/4_brain.py 30000
echo ALL DONE
