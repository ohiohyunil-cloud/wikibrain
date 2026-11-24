"""위키텍스트 정리 규칙. 1_parse.py, 6_bodies.py가 같이 쓴다."""
import re

SKIP_NS = re.compile(r"^\s*(파일|그림|File|Image|분류|Category|틀|Template|위키백과|Wikipedia|포털|Portal|도움말|Help|사용자|User|위키낱말사전|wikt|w|s|q|[a-z]{2,3}(-[a-z]+)?)\s*:", re.I)
LINK = re.compile(r"\[\[([^\[\]|#]+)(?:#[^\[\]|]*)?(?:\|([^\[\]]*))?\]\]")
TEMPLATE = re.compile(r"\{\{[^{}]*\}\}")
TABLE = re.compile(r"\{\|.*?\|\}", re.S)
REF = re.compile(r"<ref[^>/]*/>|<ref[^>]*>.*?</ref>", re.S)
COMMENT = re.compile(r"<!--.*?-->", re.S)
TAG = re.compile(r"<[^>]+>")
DISAMBIG = re.compile(r"\{\{\s*(동음이의|disambig|지명 동음이의)\s*[|}]", re.I)
CATEGORY = re.compile(r"\[\[\s*(?:분류|Category)\s*:\s*([^\]|]+)", re.I)
FILELINK = re.compile(r"\[\[\s*(?:파일|그림|File|Image)\s*:(?:[^\[\]]|\[\[[^\[\]]*\]\])*\]\]", re.I)


def norm(t):
    t = re.sub(r"[\s_]+", " ", t).strip()
    return t[:1].upper() + t[1:]


def strip_templates(s):
    for _ in range(6):  # 중첩 틀 안쪽부터 제거
        s, n = TEMPLATE.subn("", s)
        if not n:
            break
    return s


def clean_body(text):
    text = COMMENT.sub("", text)
    text = REF.sub("", text)
    text = strip_templates(text)
    return TABLE.sub("", text)


def intro_of(body):
    head = FILELINK.sub("", body.split("\n==", 1)[0])
    head = LINK.sub(lambda m: m.group(2) or m.group(1), head)
    head = re.sub(r"\[\[[^\]]*\]\]", "", head)  # 남은 파일 링크 찌꺼기
    head = TAG.sub("", head).replace("'''", "").replace("''", "")
    head = re.sub(r"\s+", " ", head).strip()
    return head[:600]


def localname(tag):
    return tag.rsplit("}", 1)[-1]


MAX = 4000  # shortcut: 문서당 앞 4000자만 저장(RAG는 앞 2000자 사용). 긴 문서 뒷부분 필요하면 늘림


def plain(body):
    s = FILELINK.sub("", body)
    s = LINK.sub(lambda m: m.group(2) or m.group(1), s)
    s = re.sub(r"\[\[[^\]]*\]\]", "", s)
    s = re.sub(r"^=+\s*(.*?)\s*=+\s*$", r"\n\1\n", s, flags=re.M)  # 문단 제목은 줄로 남김
    s = TAG.sub("", s).replace("'''", "").replace("''", "")
    s = re.sub(r"[ \t]+", " ", s)
    return re.sub(r"\n\s*\n+", "\n", s).strip()[:MAX]
