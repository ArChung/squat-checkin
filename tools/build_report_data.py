# -*- coding: utf-8 -*-
"""八週結案報告資料產生器
用法：python tools/build_report_data.py [db.json]
  不給參數會直接從 Firebase 抓最新快照；產出 data/report.json 給 report.js 渲染。
"""
import json, sys, re, datetime as dt, statistics as st, urllib.request
from collections import Counter, defaultdict
from zoneinfo import ZoneInfo
from pathlib import Path

TZ = ZoneInfo("Asia/Taipei")
DB = "https://squat-club-default-rtdb.asia-southeast1.firebasedatabase.app"
ROOT = Path(__file__).resolve().parent.parent

MEMBERS = [  # 固定順序＝圖表色序（已通過色盲／對比驗證）。插班成員 join＝首次蓋章日
    {"id": "guantou", "name": "罐頭",  "color": "#b5432f", "join": "2026-08-09"},
    {"id": "azhong",  "name": "阿忠",  "color": "#1f7d5a", "join": "2026-08-09"},
    {"id": "xiaobai", "name": "小白",  "color": "#3a6fc2", "join": "2026-08-09"},
    {"id": "vicky",   "name": "Vicky", "color": "#c67b3b", "join": "2026-08-09"},
    {"id": "xiaoj",   "name": "小J",   "color": "#7d5ba6", "join": "2026-08-15"},
    {"id": "dami",    "name": "大瞇",  "color": "#c9477e", "join": "2026-09-08"},
]
START, END = dt.date(2026, 8, 9), dt.date(2026, 10, 3)
DRAW_START = "2026-09-09"
DAY_START_HOUR = 3
CHAIN_WINDOW_MIN = 30
RANK_RE = re.compile(r"第[一二三四五六1-6](名|個|☝)|第一(?![天週周次])|銅牌|金牌|銀牌|NO\.?\s?1|冠軍|最後一個|殿後|墊底")

def is_emoji(ch):
    c = ord(ch)
    return 0x1F000 <= c <= 0x1FAFF or 0x2600 <= c <= 0x27BF

def load():
    if len(sys.argv) > 1:
        return json.load(open(sys.argv[1], encoding="utf-8"))
    with urllib.request.urlopen(f"{DB}/.json", timeout=30) as r:
        return json.load(r)

def local(ts): return dt.datetime.fromtimestamp(ts / 1000, TZ)
def shifted_min(t):  # 凌晨 3 點前算前一天的延長時段 → 24:00+
    m = t.hour * 60 + t.minute
    return m + 1440 if t.hour < DAY_START_HOUR else m
def hhmm(m): m %= 1440; return f"{m // 60:02d}:{m % 60:02d}"
def bucket(t):
    h = t.hour
    if h < 5: return "night"
    if h < 12: return "morning"
    if h < 18: return "afternoon"
    return "evening"
def phase_of(i): return 0 if i < 21 else (1 if i < 35 else 2)

def main():
    d = load()
    ck, msg, draws = d.get("checkins", {}), d.get("messages", {}), d.get("draws", {})
    days = [(START + dt.timedelta(i)).isoformat() for i in range(56)]
    ids = [m["id"] for m in MEMBERS]
    name = {m["id"]: m["name"] for m in MEMBERS}
    join = {m["id"]: m["join"] for m in MEMBERS}
    elig = {p: [k for k in days if k >= join[p]] for p in ids}

    # ---------- 熱力圖 / 時鐘原始資料 ----------
    heat = {}
    for k in days:
        row = {}
        for p in ids:
            rec = ck.get(k, {}).get(p)
            if not rec: continue
            t = local(rec["ts"])
            row[p] = {"t": t.strftime("%H:%M"), "m": shifted_min(t), "b": bucket(t), "g": bool(rec.get("plank"))}
        heat[k] = row

    # ---------- 個人 ----------
    members = []
    for m in MEMBERS:
        p = m["id"]
        done = [k for k in elig[p] if p in heat[k]]
        ph = [[0, 0], [0, 0], [0, 0]]
        for k in elig[p]:
            i = days.index(k); ph[phase_of(i)][1] += 1
            if p in heat[k]: ph[phase_of(i)][0] += 1
        best = cur = gap = worst = 0
        for k in elig[p]:
            if p in heat[k]: cur += 1; best = max(best, cur); gap = 0
            else: cur = 0; gap += 1; worst = max(worst, gap)
        mins = [heat[k][p]["m"] for k in done]
        buckets = Counter(heat[k][p]["b"] for k in done)
        wk = {"weekday": [0, 0], "weekend": [0, 0]}
        for k in elig[p]:
            key = "weekend" if dt.date.fromisoformat(k).weekday() >= 5 else "weekday"
            wk[key][1] += 1
            if p in heat[k]: wk[key][0] += 1
        texts = [msg[k][p]["text"] for k in days if msg.get(k, {}).get(p)]
        members.append({
            "id": p, "name": m["name"], "color": m["color"], "join": m["join"],
            "done": len(done), "eligible": len(elig[p]), "rate": round(len(done) / len(elig[p]), 3),
            "phases": ph, "bestStreak": best, "worstGap": worst,
            "medianTime": hhmm(int(st.median(mins))) if mins else None,
            "timeStd": round(st.pstdev(mins), 1) if len(mins) > 1 else None,
            "earliest": hhmm(min(mins)) if mins else None, "latest": hhmm(max(mins)) if mins else None,
            "buckets": {b: buckets.get(b, 0) for b in ("morning", "afternoon", "evening", "night")},
            "weekday": wk["weekday"], "weekend": wk["weekend"],
            "msgCount": len(texts),
            "msgAvgLen": round(st.mean(len(t) for t in texts), 1) if texts else 0,
            "exclaims": sum(t.count("!") + t.count("！") for t in texts),
            "rankMsgs": sum(1 for t in texts if RANK_RE.search(t)),
            "emojis": sum(1 for t in texts for ch in t if is_emoji(ch)),
            "squatOnly": sum(1 for t in texts if re.fullmatch(r"[蹲 ]+(棒棒)?", t)),
        })

    # ---------- 團隊 ----------
    daily = [sum(1 for p in ids if p in heat[k]) for k in days]
    full = [k for k in days if all(p in heat[k] for p in ids if k >= join[p])]
    bestFull = cur = 0
    for k in days:
        cur = cur + 1 if k in full else 0; bestFull = max(bestFull, cur)
    weekly = []
    for w in range(8):
        wd = days[w * 7:(w + 1) * 7]
        tot = sum(1 for k in wd for p in ids if k >= join[p])
        dn = sum(1 for k in wd for p in ids if p in heat[k])
        weekly.append({"week": w + 1, "done": dn, "total": tot, "rate": round(dn / tot, 3),
                       "label": f"{wd[0][5:].replace('-', '/')}–{wd[-1][5:].replace('-', '/')}"})
    def rate_of(sel):
        dn = sum(1 for k in sel for p in ids if p in heat[k])
        el = sum(1 for k in sel for p in ids if k >= join[p])
        return round(dn / el, 3)
    before = [k for k in days if k < DRAW_START]
    after = [k for k in days if k >= DRAW_START]
    first = Counter(); last = Counter()
    for k in days:
        row = {p: heat[k][p]["m"] for p in heat[k]}
        if len(row) >= 2:
            first[min(row, key=row.get)] += 1; last[max(row, key=row.get)] += 1
    stamps = sum(daily)
    team = {
        "stamps": stamps, "squats": stamps * 40, "days": 56,
        "fullDays": len(full), "fullDates": full, "bestFullStreak": bestFull,
        "dailyCounts": daily, "weekly": weekly,
        "drawEffect": {"before": rate_of(before), "after": rate_of(after),
                       "beforeDays": len(before), "afterDays": len(after)},
        "golden": {"from": "2026-09-08", "to": "2026-09-16",
                   "full": sum(1 for k in full if "2026-09-08" <= k <= "2026-09-16")},
        "firstOfDay": dict(first), "lastOfDay": dict(last),
        "msgTotal": sum(mm["msgCount"] for mm in members),
        "rankMsgs": sum(mm["rankMsgs"] for mm in members),
        "nightStamps": sum(mm["buckets"]["night"] for mm in members),
        "bestDay": max(zip(daily, days))[1], "activeMembers": len(ids),
    }

    # ---------- 互動鏈：A 蓋章後 30 分鐘內 B 跟著蓋 ----------
    leaders = Counter(); followers = Counter(); pairs = Counter(); delays = defaultdict(list)
    for k in days:
        seq = sorted(((heat[k][p]["m"], p) for p in heat[k]))
        for i in range(1, len(seq)):
            gapm = seq[i][0] - seq[i - 1][0]
            if 0 <= gapm <= CHAIN_WINDOW_MIN:
                a, b = seq[i - 1][1], seq[i][1]
                leaders[a] += 1; followers[b] += 1; pairs[(a, b)] += 1; delays[b].append(gapm)
    chain = {
        "window": CHAIN_WINDOW_MIN,
        "leaders": dict(leaders), "followers": dict(followers),
        "pairs": [{"a": a, "b": b, "n": n} for (a, b), n in pairs.most_common()],
        "medianDelay": {p: int(st.median(v)) for p, v in delays.items()},
    }

    # ---------- 嗆聲全文 ----------
    quotes = {p: [{"d": k, "t": msg[k][p]["text"]} for k in days if msg.get(k, {}).get(p)] for p in ids}

    # ---------- 天選 ----------
    drawn = Counter(); stamped = Counter(); gold = Counter(); react = defaultdict(list); drawDays = {}
    for k, v in sorted(draws.items()):
        if not (DRAW_START <= k <= END.isoformat()): continue
        drawDays[k] = v.get("ids", [])
        for p in v.get("ids", []):
            drawn[p] += 1
            rec = ck.get(k, {}).get(p)
            if rec: stamped[p] += 1
            if rec and rec.get("plank"):
                gold[p] += 1
                reveal = dt.datetime.fromisoformat(k + "T09:00:00+08:00").timestamp() * 1000
                react[p].append(max(0, int((rec["plank"] - reveal) / 60000)))
    draw = {
        "start": DRAW_START, "days": len(drawDays), "total": sum(drawn.values()),
        "byDay": drawDays,
        "perMember": {p: {"drawn": drawn[p], "stamped": stamped[p], "gold": gold[p],
                          "medianReactMin": int(st.median(react[p])) if react[p] else None} for p in ids},
    }

    out = {
        "generatedAt": dt.datetime.now(TZ).isoformat(timespec="minutes"),
        "period": {"start": START.isoformat(), "end": END.isoformat(), "days": days, "dayStartHour": DAY_START_HOUR},
        "members": members, "team": team, "heat": heat, "chain": chain, "quotes": quotes, "draw": draw,
    }
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "report.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("wrote data/report.json", len(json.dumps(out, ensure_ascii=False)), "bytes")
    return out

if __name__ == "__main__":
    out = main()
    if "--dump" in sys.argv:
        for p, qs in out["quotes"].items():
            print(f"\n## {p}")
            for q in qs: print(q["d"][5:], q["t"])
        print("\nchain:", json.dumps(out["chain"], ensure_ascii=False))
        print("draw:", json.dumps(out["draw"]["perMember"], ensure_ascii=False))
        print("team:", json.dumps({k: v for k, v in out["team"].items() if k not in ("dailyCounts", "fullDates")}, ensure_ascii=False))
