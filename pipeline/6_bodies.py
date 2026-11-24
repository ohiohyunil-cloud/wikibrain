"""RAG 원문: 덤프에서 문서 본문을 평문으로 뽑아 SQLite(FTS5)에 넣는다. (설계서 v2 Phase 4)
출력: data/bodies.db  table docs(i INTEGER PRIMARY KEY, t, body) + FTS5 docs_fts(t, body)
i는 pages.jsonl의 i와 같다(1_parse.py와 같은 순서·같은 조건으로 센다). 오프라인 1회.
사용: .venv/bin/python pipeline/6_bodies.py dump/kowiki.xml.bz2
"""
import bz2, json, os, re, sqlite3, sys
import xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(__file__))
from wikitext import norm, clean_body, localname, plain



titles = [json.loads(l)["t"] for l in open("data/pages.jsonl")]
tmp = "data/bodies.db.tmp"
if os.path.exists(tmp):
    os.remove(tmp)
db = sqlite3.connect(tmp)
db.execute("CREATE TABLE docs(i INTEGER PRIMARY KEY, t TEXT, body TEXT)")
idx, rows = 0, []
title = ns = redirect = None
for ev, el in ET.iterparse(bz2.open(sys.argv[1]), events=("end",)):
    name = localname(el.tag)
    if name == "title":
        title = el.text
    elif name == "ns":
        ns = el.text
    elif name == "redirect":
        redirect = el.get("title")
    elif name == "text" and ns == "0" and not redirect:
        t = norm(title)
        assert t == titles[idx], (idx, t, titles[idx])  # pages.jsonl 순서와 어긋나면 중단
        rows.append((idx, t, plain(clean_body(el.text or ""))))
        idx += 1
        if len(rows) == 5000:
            db.executemany("INSERT INTO docs VALUES(?,?,?)", rows); db.commit(); rows = []
            if idx % 50000 == 0:
                print(idx, flush=True)
    elif name == "page":
        title = ns = redirect = None
        el.clear()
    if name != "page" and name not in ("title", "ns", "redirect"):
        el.clear()
db.executemany("INSERT INTO docs VALUES(?,?,?)", rows)
assert idx == len(titles), (idx, len(titles))
db.execute("CREATE VIRTUAL TABLE docs_fts USING fts5(t, body, content='docs', content_rowid='i')")
db.execute("INSERT INTO docs_fts(docs_fts) VALUES('rebuild')")
db.commit(); db.close()
os.replace(tmp, "data/bodies.db")
print("bodies", idx)
