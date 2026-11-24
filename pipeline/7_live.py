"""세계 창 실시간 사건: GDELT 2.0 공개 15분 파일(키 없음)을 받아 주요 사건만 site/data/live/events.json에 누적.
사건 파일(export) = 위치·기사 수·영향도, GKG 파일 = 기사 제목·주제. 같은 기사 주소로 잇는다.
사용: .venv/bin/python pipeline/7_live.py [백필할 15분 묶음 수, 기본 1]
"""
import csv, html, io, json, math, os, re, sys, time, urllib.request, zipfile
from datetime import datetime, timedelta, timezone

BASE = "https://data.gdeltproject.org/gdeltv2/"
OUT = "site/data/live/events.json"
KEEP_H, TOP_PER_BATCH, SHOW, PER_CC = 48, 25, 200, 15
MAX_ZIP = 60 * 2**20
csv.field_size_limit(2**31 - 1)


def get(url):
    assert url.startswith(BASE), url  # GDELT 공개 파일만
    with urllib.request.urlopen(url, timeout=60) as r:
        b = r.read(MAX_ZIP + 1)
    assert len(b) <= MAX_ZIP, "파일이 너무 큼"
    return b


def rows(name):
    z = zipfile.ZipFile(io.BytesIO(get(BASE + name)))
    assert z.infolist()[0].file_size < 400 * 2**20, "압축 해제 크기 초과"  # 압축 폭탄 방지
    return csv.reader(io.TextIOWrapper(z.open(z.namelist()[0]), "utf-8", errors="replace"), delimiter="\t")


# 하드뉴스 주제(GKG 테마). 하나도 없으면 연예·생활 기사로 보고 버린다
HARD = re.compile(r"(^|;)(ECON_|EPU_|GENERAL_GOVERNMENT|LEADER|ELECTION|LEGISLATION|SANCTIONS|ARMEDCONFLICT|MILITARY|KILL|TERROR|PROTEST|"
                  r"NATURAL_DISASTER|CRISISLEX_|TAX_FNCACT_PRESIDENT|TAX_FNCACT_PRIME_MINISTER|DIPLOMACY|NEGOTIATIONS|TRADE_DISPUTE|CENTRAL_BANK)")


def kind(themes, quad, root):
    if re.search(r"(^|;)(ECON_|EPU_ECONOMY|CENTRAL_BANK)", themes):
        return "economy"
    if quad in ("3", "4") or root in {"14", "15", "17", "18", "19", "20"}:
        return "conflict"
    return "politics"


def batch(stamp):
    """한 15분 묶음 → 기사 주소별 사건 하나(기사 수가 가장 큰 것)."""
    gkg = {}
    for r in rows(f"{stamp}.gkg.csv.zip"):
        if len(r) > 26:
            m = re.search(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", r[26])
            if m:
                gkg[r[4]] = (html.unescape(m.group(1)).replace("\u200c", "").strip()[:200], r[7])
    best = {}
    for r in rows(f"{stamp}.export.CSV.zip"):
        if len(r) < 61 or r[25] != "1" or not r[56] or r[60] not in gkg:
            continue
        n, gold = int(r[33] or 0), float(r[30] or 0)
        url = r[60]
        if not url.startswith("https://"):
            continue  # 화면에서 http 링크는 열지 않는다
        if url in best and best[url]["articles"] >= n:
            continue
        title, themes = gkg[url]
        if not HARD.search(themes):
            continue
        best[url] = {"id": r[0], "title": title, "link": url, "lat": round(float(r[56]), 3), "lon": round(float(r[57]), 3),
                     "place": r[52][:80], "cc": r[53], "articles": n, "sources": int(r[32] or 0), "goldstein": gold,
                     "tone": round(float(r[34] or 0), 2), "kind": kind(themes, r[29], r[28])}
    born = int(datetime.strptime(stamp, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc).timestamp())
    out, seen = [], set()
    for e in sorted(best.values(), key=lambda e: -(math.log1p(e["articles"]) * (1 + abs(e["goldstein"]) / 10))):
        key = re.sub(r"\W+", "", e["title"].lower())[:60]
        if key in seen:
            continue
        seen.add(key); e["born"] = born; out.append(e)
        if len(out) >= TOP_PER_BATCH:
            break
    return out


def score(e, now):
    return math.log1p(e["articles"]) * (1 + abs(e["goldstein"]) / 10) * 0.5 ** ((now - e["born"]) / 3600 / 24)


def main(back=1):
    last = get(BASE + "lastupdate.txt").decode().split()
    stamp = re.search(r"/(\d{14})\.export", " ".join(last)).group(1)
    t = datetime.strptime(stamp, "%Y%m%d%H%M%S")
    old = json.load(open(OUT)) if os.path.exists(OUT) else {"events": [], "batches": []}
    done = set(old["batches"]); ev = old["events"]
    for k in range(back):
        s = (t - timedelta(minutes=15 * k)).strftime("%Y%m%d%H%M%S")
        if s in done:
            continue
        try:
            ev += batch(s); done.add(s)
        except Exception as x:  # 빠진 묶음은 건너뛰고 다음 실행 때 다시
            print("skip", s, x)
    now = time.time()
    ev = [e for e in ev if now - e["born"] < KEEP_H * 3600]
    uniq = {}
    for e in ev:
        uniq.setdefault(re.sub(r"\W+", "", e["title"].lower())[:60], e)
    ranked, per = [], {}
    for e in sorted(uniq.values(), key=lambda e: -score(e, now)):
        if per.get(e["cc"], 0) < PER_CC:
            per[e["cc"]] = per.get(e["cc"], 0) + 1; ranked.append(e)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    keep = sorted(done)[-KEEP_H * 4:]
    tmp = OUT + ".tmp"
    json.dump({"now": int(now), "batches": keep, "events": ranked[:SHOW * 3], "show": SHOW}, open(tmp, "w"), ensure_ascii=False)
    os.replace(tmp, OUT)
    print("events", len(ranked), "shown", min(len(ranked), SHOW), "batches", len(keep))


if __name__ == "__main__":
    assert HARD.search("TAX_X;ECON_STOCKMARKET;") and not HARD.search("TAX_FNCACT_ACTOR;MEDIA_MSM;")
    assert kind("ECON_INFLATION;", "1", "04") == "economy" and kind("", "4", "19") == "conflict" and kind("", "1", "04") == "politics"
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 1)
