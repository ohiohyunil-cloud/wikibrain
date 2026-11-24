"""덤프 파싱: 일반 문서의 제목·첫 문단·본문 링크·넘겨주기를 뽑는다.
출력: data/pages.jsonl (idx, title, intro, game), data/redirects.json, data/links.tsv (src_idx, dst 제목)
사용: .venv/bin/python pipeline/1_parse.py dump/kowiki.xml.bz2
"""
import bz2, json, os, re, sys
import xml.etree.ElementTree as ET

SRC = sys.argv[1]
sys.path.insert(0, os.path.dirname(__file__))
from wikitext import SKIP_NS, LINK, DISAMBIG, CATEGORY, norm, clean_body, intro_of, localname

pages = open("data/pages.jsonl", "w")
links = open("data/links.tsv", "w")
redirects = {}
idx = 0
title = ns = redirect = None
for ev, el in ET.iterparse(bz2.open(SRC), events=("end",)):
    name = localname(el.tag)
    if name == "title":
        title = el.text
    elif name == "ns":
        ns = el.text
    elif name == "redirect":
        redirect = el.get("title")
    elif name == "text" and ns == "0":
        if redirect:
            redirects[norm(title)] = norm(redirect)
        else:
            raw = el.text or ""
            body = clean_body(raw)
            intro = intro_of(body)
            game = not DISAMBIG.search(raw) and "목록" not in title and len(intro) >= 40
            cats = [c.strip() for c in CATEGORY.findall(raw)][:8]
            pages.write(json.dumps({"i": idx, "t": norm(title), "intro": intro, "cats": cats, "game": game}, ensure_ascii=False) + "\n")
            seen = set()
            for m in LINK.finditer(body):
                dst = m.group(1)
                if SKIP_NS.match(dst):
                    continue
                dst = norm(dst)
                if dst and dst not in seen:
                    seen.add(dst)
                    links.write(f"{idx}\t{dst}\n")
            idx += 1
            if idx % 20000 == 0:
                print(idx, title, flush=True)
    elif name == "page":
        title = ns = redirect = None
        el.clear()
    if name != "page" and name not in ("title", "ns", "redirect"):
        el.clear()

json.dump(redirects, open("data/redirects.json", "w"), ensure_ascii=False)
print("pages", idx, "redirects", len(redirects))
