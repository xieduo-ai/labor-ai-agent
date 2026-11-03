"""把 data/raw 下的法规 txt 切成「条」，输出 data/processed/chunks.jsonl。

用法：
    python -m src.ingest

约定（很重要，不符合约定会切错）：
1. 一个法一个 txt，文件名就是法律名，例如 中华人民共和国劳动合同法.txt
2. 章标题独占一行，以「第X章」开头
3. 每一条以「第X条」开头，条与条之间换行
4. 去掉 PDF 复制来的目录页（那些带 "......" 的行）
"""
import json
import re
import sys
from pathlib import Path

import config

NUM = "一二三四五六七八九十百千零〇两"

ART_RE = re.compile(rf"^\s*第([{NUM}]+)条[\s　]*(.*)$")
CHAP_RE = re.compile(rf"^\s*第([{NUM}]+)章[\s　]*(.*)$")
SECT_RE = re.compile(rf"^\s*第([{NUM}]+)节[\s　]*(.*)$")
DOTTED = re.compile(r"[.．·]{3,}")

CN_DIGIT = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
            "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
CN_UNIT = {"十": 10, "百": 100, "千": 1000}


def cn2int(s: str):
    """三十九 -> 39，一百零五 -> 105。失败返回 None。"""
    total, num = 0, 0
    for ch in s:
        if ch in CN_DIGIT:
            num = CN_DIGIT[ch]
        elif ch in CN_UNIT:
            total += (num or 1) * CN_UNIT[ch]
            num = 0
        else:
            return None
    return total + num


def read_text(path: Path) -> str:
    """法规 txt 有 utf-8 也有 gb18030，依次尝试。"""
    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return path.read_text(encoding=enc)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="ignore")


def parse_file(path: Path):
    law_name = path.stem
    lines = [ln.strip() for ln in read_text(path).splitlines()]

    chunks = []
    chapter = ""
    cur_no = None
    cur_parts = []

    def flush():
        nonlocal cur_no, cur_parts
        if cur_no is not None and cur_parts:
            body = "\n".join(p for p in cur_parts if p).strip()
            if len(body) >= 4:
                chunks.append({
                    "doc_id": f"{law_name}#第{cur_no}条",
                    "law_name": law_name,
                    "chapter": chapter,
                    "article_no": f"第{cur_no}条",
                    "article_num": cn2int(cur_no),
                    "text": body,
                })
        cur_no, cur_parts = None, []

    for line in lines:
        if not line or DOTTED.search(line):
            continue

        m = CHAP_RE.match(line)
        if m:
            flush()
            chapter = f"第{m.group(1)}章 {m.group(2)}".strip()
            continue

        m = SECT_RE.match(line)
        if m:
            flush()
            chapter = (chapter + f" 第{m.group(1)}节 {m.group(2)}").strip()
            continue

        m = ART_RE.match(line)
        if m:
            flush()
            cur_no = m.group(1)
            cur_parts = [m.group(2)]
            continue

        if cur_no is not None:
            cur_parts.append(line)
        # 条文之前的序言（标题、通过日期）直接丢弃

    flush()
    return chunks


def main():
    files = sorted(config.DATA_RAW.glob("*.txt"))
    if not files:
        raise SystemExit(f"{config.DATA_RAW} 里没有 txt 文件，先把法规放进去。")

    all_chunks, report = [], []
    for f in files:
        cs = parse_file(f)
        report.append((f.name, len(cs)))
        if not cs:
            print(f"[警告] {f.name} 解析出 0 条，检查格式")
        all_chunks.extend(cs)

    # 去重检查
    seen, dups = set(), []
    for c in all_chunks:
        if c["doc_id"] in seen:
            dups.append(c["doc_id"])
        seen.add(c["doc_id"])
    if dups:
        print(f"[警告] 重复条文 {len(dups)} 个，例如：{dups[:5]}")

    out = config.DATA_PROCESSED / "chunks.jsonl"
    with open(out, "w", encoding="utf-8") as fh:
        for c in all_chunks:
            fh.write(json.dumps(c, ensure_ascii=False) + "\n")

    print(f"\n共 {len(files)} 个文件，{len(all_chunks)} 条")
    for name, n in report:
        print(f"  {name:<45} {n:>4} 条")
    print(f"\n已写入 {out}")
    if all_chunks:
        s = all_chunks[0]
        print(f"\n首条样例：{s['law_name']} {s['chapter']} {s['article_no']}\n{s['text'][:120]}...")


if __name__ == "__main__":
    sys.exit(main())
