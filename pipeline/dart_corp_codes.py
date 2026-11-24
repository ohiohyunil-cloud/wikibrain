"""DART corpCode.xml(zip) → site/api/_corp_codes.json (상장사 이름→corp_code).
사용: DART_API_KEY=... .venv/bin/python pipeline/dart_corp_codes.py
키는 환경변수로만 받는다. 결과 파일에는 키가 들어가지 않는다.
"""
import io, json, os, urllib.request, zipfile
import xml.etree.ElementTree as ET

key = os.environ["DART_API_KEY"]
with urllib.request.urlopen(f"https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key={key}", timeout=60) as r:
    z = zipfile.ZipFile(io.BytesIO(r.read()))
root = ET.fromstring(z.read(z.namelist()[0]))
# shortcut: 비상장사 제외(파일 크기), 비상장 필요해지면 조건 제거
out = {e.findtext("corp_name").strip(): e.findtext("corp_code").strip()
       for e in root.iter("list") if (e.findtext("stock_code") or "").strip()}
assert len(out) > 1000, len(out)
json.dump(out, open("site/api/_corp_codes.json", "w"), ensure_ascii=False)
print(len(out), "companies")
