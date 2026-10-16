# -*- coding: utf-8 -*-
"""檢查 data/horoscope.json，並輸出給提案文件用的 Markdown 對照表。

用法：python tools/check_horoscope.py [--md 輸出路徑]
檢查項目：
  - 每人剛好 42 則（10/19～11/29）、星等 1～5
  - 不能出現「今天／今晚」（運勢是「明天」的，前一晚解鎖）
  - 同一個人的幸運色、幸運小物不重複
  - 提到星期或節日的那則，日期要對得上
  - 幸運色要在 js/s2/colors.js 有色票（第二季頁面要畫色塊）
"""
import datetime as dt
import io
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DAYS = 42
WD = "一二三四五六日"
NAMES = {"azhong": "阿忠", "xiaobai": "小白", "guantou": "罐頭", "vicky": "Vicky", "xiaoj": "小J", "dami": "大瞇"}

# 關鍵字 → 合法日期（月日）或合法星期幾（0=週一）
DATE_RULES = [
    ("萬聖節", {"10-31"}),
    ("雙十一", {"11-11"}),
    ("立冬", {"11-07"}),
    ("小雪", {"11-22"}),
    ("太陽進", {"10-23"}),
    ("天秤季最後一天", {"10-22"}),
    ("天秤季的尾聲", {"10-19", "10-20", "10-21", "10-22"}),
    ("第一份週報", {"10-26"}),
    ("第一週最後一天", {"10-25"}),
    ("第一週收尾", {"10-25"}),
    ("第三週", {"11-02"}),
    ("過半", {"11-09", "11-15"}),
    ("第四週最後一天", {"11-15"}),
    ("第四週收尾", {"11-15"}),
    ("最後兩週開始", {"11-16"}),
    ("倒數第二天", {"11-28"}),
    ("第二季最後一天", {"11-29"}),
]
WEEKDAY_RULES = [
    ("週五", {4}),
    ("週三", {2}),
    ("週日漏了不能補", {6}),
    ("週末", {4, 5, 6}),
    ("最後一週", {0, 1, 2, 3, 4, 5, 6}),  # 只要在最後一週內
]


def main():
    data = json.load(open(ROOT / "data" / "horoscope.json", encoding="utf-8"))
    swatches = set(re.findall(r'"([^"]+)":\s*"#', (ROOT / "js" / "s2" / "colors.js").read_text(encoding="utf-8")))
    start = dt.date.fromisoformat(data["start"])
    problems = []
    md = []

    for pid, entries in data["people"].items():
        name = NAMES.get(pid, pid)
        sign = data["signs"].get(pid, "")
        if len(entries) != DAYS:
            problems.append(f"{name}：有 {len(entries)} 則，應為 {DAYS}")
        for field, label in (("c", "幸運色"), ("i", "幸運小物")):
            dup = [k for k, n in Counter(e[field] for e in entries).items() if n > 1]
            if dup:
                problems.append(f"{name}：{label}重複 {dup}")

        md.append(f"## {name}・{sign}\n")
        md.append("| 日期 | 整體運 | 明天的運勢 | 深蹲一句 | 幸運色・小物 |")
        md.append("|---|---|---|---|---|")
        for idx, e in enumerate(entries):
            day = start + dt.timedelta(days=idx)
            mmdd = day.strftime("%m-%d")
            wd = day.weekday()
            tag = f"{day.month}/{day.day}（{WD[wd]}）"
            text = e["t"] + e["q"]
            if not 1 <= e["s"] <= 5:
                problems.append(f"{name} {tag}：星等 {e['s']} 超出 1～5")
            if e["c"] not in swatches:
                problems.append(f"{name} {tag}：幸運色「{e['c']}」在 js/s2/colors.js 沒有色票")
            if re.search("今天|今晚", text):
                problems.append(f"{name} {tag}：出現「今天／今晚」")
            for kw, ok in DATE_RULES:
                if kw in text and mmdd not in ok:
                    problems.append(f"{name} {tag}：提到「{kw}」但日期不對")
            for kw, ok in WEEKDAY_RULES:
                if kw in text and wd not in ok:
                    problems.append(f"{name} {tag}：提到「{kw}」但不是對的星期")
            if "最後一週" in text and day < dt.date(2026, 11, 23):
                problems.append(f"{name} {tag}：提到「最後一週」但還沒到最後一週")
            stars = "★" * e["s"] + "☆" * (5 - e["s"])
            md.append(f"| {tag} | {stars} | {e['t']} | {e['q']} | {e['c']}・{e['i']} |")
        md.append("")

    total = sum(len(v) for v in data["people"].values())
    print(f"共 {len(data['people'])} 人、{total} 則")
    if problems:
        print(f"發現 {len(problems)} 個問題：")
        for p in problems:
            print("  -", p)
    else:
        print("全部通過")

    if "--md" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--md") + 1])
        io.open(out, "w", encoding="utf-8").write("\n".join(md))
        print("Markdown 已輸出：", out)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
