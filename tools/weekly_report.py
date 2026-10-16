# -*- coding: utf-8 -*-
"""第二季週報產生器（本機 Claude 排程每週一 09:00 跑）

數字由這支程式從 Firebase 算，信由 Claude 寫，程式只給它事實清單。
  python tools/weekly_report.py prepare            看現在該做哪一週；要寫信就產生事實清單
  python tools/weekly_report.py publish N          檢查信 → 寫 data/reports/wN.json → push → 等網站更新 → 推播
測試用選項：--today YYYY-MM-DD（假裝今天）、--db 檔案（用本機快照代替 Firebase）、--dry-run（只寫檔，不 push、不推播）

工作檔放在 .weekly/（git 忽略）：wN.facts.json（事實清單）、wN.letters.json（Claude 寫的信）、announced.json（已推播的週）。
"""
import argparse, json, re, subprocess, sys, time, urllib.request
import datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / ".weekly"
REPORTS = ROOT / "data" / "reports"
SITE = "https://archung.github.io/squat-checkin/"
TZ = dt.timezone(dt.timedelta(hours=8))  # 台北，沒有日光節約
DAY_START_HOUR = 3

# 跟 js/config.js 的 season2 一致
START = dt.date(2026, 10, 19)
WEEKS = 6
PENALTY = 10
TEAMS = [("zv", ["azhong", "vicky"]), ("gb", ["guantou", "xiaobai"]), ("jd", ["xiaoj", "dami"])]
NAMES = {"azhong": "阿忠", "vicky": "Vicky", "guantou": "罐頭", "xiaobai": "小白", "xiaoj": "小J", "dami": "大瞇"}
IDS = [m for _, ms in TEAMS for m in ms]
WD = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"]

# 信裡不准出現的字：不做身體、健康、投資判斷
BANNED = ["健康", "受傷", "膝蓋", "體重", "減肥", "瘦身", "體脂", "投資", "股票", "生病"]

for s in (sys.stdout, sys.stderr):
    try: s.reconfigure(encoding="utf-8")
    except Exception: pass


def config_value(key):
    m = re.search(key + r':\s*"([^"]+)"', (ROOT / "js" / "config.js").read_text(encoding="utf-8"))
    return m.group(1) if m else ""


def say(*a):
    print(*a, flush=True)


def die(msg):
    say("ERROR:", msg)
    sys.exit(1)


# ---------- 日期 ----------
def day_key(ts_ms):
    return (dt.datetime.fromtimestamp(ts_ms / 1000, TZ) - dt.timedelta(hours=DAY_START_HOUR)).date()


def week_days(w):  # w 從 1 起算
    s = START + dt.timedelta(days=7 * (w - 1))
    return [s + dt.timedelta(days=i) for i in range(7)]


def due_weeks(today):  # 已經結束（週日深夜 3 點過了）的週
    return [w for w in range(1, WEEKS + 1) if week_days(w)[-1] < today]


def hm(ts_ms):
    return dt.datetime.fromtimestamp(ts_ms / 1000, TZ).strftime("%H:%M")


def clock_min(ts_ms):  # 晚上的時間軸：凌晨 0–3 點記成 24:00 之後，方便比早晚
    t = dt.datetime.fromtimestamp(ts_ms / 1000, TZ)
    m = t.hour * 60 + t.minute
    return m + 1440 if t.hour < DAY_START_HOUR else m


def fmt_min(m):
    return f"{(m // 60) % 24:02d}:{m % 60:02d}"


# ---------- 資料 ----------
def load_db(path):
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    db = config_value("databaseURL")
    out = {}
    for node in ("checkins", "messages", "likes"):
        with urllib.request.urlopen(f"{db}/{node}.json", timeout=30) as r:
            out[node] = json.loads(r.read().decode("utf-8")) or {}
    return out


def rec(db, day, pid):
    return ((db.get("checkins") or {}).get(day.isoformat()) or {}).get(pid)


# ---------- 計分（跟 js/s2/score.js 的 personWeek 一樣） ----------
def person_week(db, pid, w):
    days = week_days(w)
    states, missed = [], 0
    for i, d in enumerate(days):
        if rec(db, d, pid):
            states.append("done"); continue
        nxt = rec(db, days[i + 1], pid) if i < 6 else None
        if nxt and nxt.get("makeup"):
            states.append("fixed")
        else:
            states.append("missed"); missed += 1
    used = any((rec(db, d, pid) or {}).get("makeup") for d in days)
    return {"states": states, "score": -PENALTY * missed, "cardUsed": used}


def ranking(db, w):
    teams = []
    for tid, ms in TEAMS:
        teams.append({"id": tid, "members": ms, "score": sum(person_week(db, m, w)["score"] for m in ms)})
    teams.sort(key=lambda t: -t["score"])
    for i, t in enumerate(teams):
        t["rank"] = teams[i - 1]["rank"] if i and t["score"] == teams[i - 1]["score"] else i + 1
    return teams


# ---------- 事實清單 ----------
def partner(pid):
    for _, ms in TEAMS:
        if pid in ms:
            return ms[1] if ms[0] == pid else ms[0]


def team_of(pid):
    return next(tid for tid, ms in TEAMS if pid in ms)


def time_stats(mins):
    if not mins:
        return None
    s = sorted(mins)
    mid = s[len(s) // 2] if len(s) % 2 else (s[len(s) // 2 - 1] + s[len(s) // 2]) // 2
    return {
        "最早": fmt_min(s[0]), "最晚": fmt_min(s[-1]), "中位數": fmt_min(mid),
        "午夜後才蓋（0–3 點）": sum(1 for m in s if m >= 1440),
        "晚上 9 點前蓋": sum(1 for m in s if m < 21 * 60),
    }


def person_facts(db, pid, w, signs, prev_report):
    days = week_days(w)
    pw = person_week(db, pid, w)
    mate = partner(pid)
    day_rows, mins = [], []
    first_in_team = 0
    for i, d in enumerate(days):
        r = rec(db, d, pid)
        row = {"日期": f"{d.month}/{d.day}", "星期": WD[i], "狀態": {"done": "有蹲", "missed": "漏掉（扣 10）", "fixed": "漏掉但隔天用補蹲卡補回"}[pw["states"][i]]}
        if r and isinstance(r.get("ts"), (int, float)):
            row["蓋章時間"] = hm(r["ts"]) + ("（隔天凌晨，還算這天）" if clock_min(r["ts"]) >= 1440 else "")
            mins.append(clock_min(r["ts"]))
            m = rec(db, d, mate)
            if m and isinstance(m.get("ts"), (int, float)) and r["ts"] < m["ts"]:
                first_in_team += 1
        if r and r.get("makeup"):
            row["這天用了補蹲卡"] = "蹲 80 下補前一天"
        day_rows.append(row)

    done = [i for i, s in enumerate(pw["states"]) if s == "done"]
    msgs = []
    for i, d in enumerate(days):
        m = ((db.get("messages") or {}).get(d.isoformat()) or {}).get(pid)
        if m and m.get("text"):
            likers = list((((db.get("likes") or {}).get(d.isoformat()) or {}).get(pid) or {}).keys())
            msgs.append({"日期": f"{d.month}/{d.day} {WD[i]}", "內容": m["text"], "愛心": len(likers), "按愛心的人": [NAMES.get(x, x) for x in likers]})

    facts = {
        "名字": NAMES[pid],
        "星座": signs.get(pid, ""),
        "隊友（另一半）": NAMES[mate],
        "本週個人分數": pw["score"],
        "有蹲天數（含補回的）": sum(1 for s in pw["states"] if s in ("done", "fixed")),
        "實際蓋章天數": len(done),
        "漏掉": [WD[i] for i, s in enumerate(pw["states"]) if s == "missed"] or "沒有，全勤",
        "補蹲卡": "已使用" if pw["cardUsed"] else "未使用",
        "平日有蹲（週一到週五）": f"{sum(1 for i in done if i < 5)}/5",
        "週末有蹲（週六、週日）": f"{sum(1 for i in done if i >= 5)}/2",
        "比隊友先蓋章的天數": first_in_team,
        "蓋章時間統計": time_stats(mins),
        "每天": day_rows,
        "自己這週的嗆聲": msgs,
    }
    if prev_report and pid in prev_report.get("people", {}):
        p = prev_report["people"][pid]
        facts["上週"] = {
            "個人分數": p["score"],
            "有蹲天數": sum(1 for s in p["days"] if s in ("done", "fixed")),
            "上週顧問給的小目標": p.get("goal", ""),
        }
    return facts


def build_facts(db, w):
    signs = json.loads((ROOT / "data" / "horoscope.json").read_text(encoding="utf-8")).get("signs", {})
    prev = None
    if w > 1 and (REPORTS / f"w{w - 1}.json").exists():
        prev = json.loads((REPORTS / f"w{w - 1}.json").read_text(encoding="utf-8"))
    days = week_days(w)
    teams = ranking(db, w)
    all_done = sum(1 for d in days if all(rec(db, d, p) for p in IDS))
    season = {}
    for pid in IDS:
        season[NAMES[pid]] = [person_week(db, pid, x)["score"] for x in range(1, w + 1)]
    team_season = {"＋".join(NAMES[m] for m in ms): sum(person_week(db, m, x)["score"] for m in ms for x in range(1, w + 1)) for _, ms in TEAMS}

    people, whisper = {}, {}
    for pid in IDS:
        people[pid] = person_facts(db, pid, w, signs, prev)
        mate = partner(pid)
        whisper[pid] = [m["內容"] for m in person_facts(db, mate, w, signs, None)["自己這週的嗆聲"]]

    return {
        "週": w,
        "期間": f"{days[0].month}/{days[0].day}（一）～{days[-1].month}/{days[-1].day}（日）",
        "是最後一週": w == WEEKS,
        "隊伍排名": [{"名次": t["rank"], "隊伍": "＋".join(NAMES[m] for m in t["members"]), "本週分數": t["score"]} for t in teams],
        "六人全員達成的天數": f"{all_done}/7",
        "本季到目前每週個人分數": season,
        "本季到目前隊伍累計": team_season,
        "每個人": people,
        "悄悄話候選（另一半這週的嗆聲，原文）": whisper,
        "_teams": teams,
        "_people": {pid: person_week(db, pid, w) for pid in IDS},
        "_dates": [days[0].isoformat(), days[-1].isoformat()],
    }


# ---------- 檢查 Claude 寫的信 ----------
def check_letters(facts, letters):
    errs = []
    for pid in IDS:
        L = letters.get(pid)
        name = NAMES[pid]
        if not isinstance(L, dict):
            errs.append(f"{pid}（{name}）：缺"); continue
        letter, goal, wh = (L.get("letter") or "").strip(), (L.get("goal") or "").strip(), L.get("whisper")
        if not 90 <= len(letter) <= 400:
            errs.append(f"{pid}：信 {len(letter)} 字，要 90～400 字")
        n = len(re.findall(r"[。！？!?]", letter))
        if not 4 <= n <= 8:
            errs.append(f"{pid}：信 {n} 句，要 4～6 句左右")
        if not 4 <= len(goal) <= 30:
            errs.append(f"{pid}：小目標 {len(goal)} 字，要 4～30 字")
        for b in BANNED:
            if b in letter or b in goal:
                errs.append(f"{pid}：出現「{b}」，信裡不談身體、健康、投資")
        if "{" in letter or "TODO" in letter or "TODO" in goal:
            errs.append(f"{pid}：還有沒填完的地方")
        cands = facts["悄悄話候選（另一半這週的嗆聲，原文）"][pid]
        if wh is not None and wh not in cands:
            errs.append(f"{pid}：悄悄話必須是 null 或另一半這週嗆聲的原文其中一句：{cands}")
        if wh is None and cands:
            errs.append(f"{pid}：另一半這週有嗆聲，要挑一句當悄悄話")
    return errs


# ---------- git、網站、推播 ----------
def git(*args, check=True):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    if check and r.returncode != 0:
        die(f"git {' '.join(args)} 失敗：{r.stderr.strip() or r.stdout.strip()}")
    return r.stdout.strip()


def announced():
    p = WORK / "announced.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def mark_announced(w, how):
    a = announced()
    a[str(w)] = {"at": dt.datetime.now(TZ).isoformat(timespec="minutes"), "how": how}
    (WORK / "announced.json").write_text(json.dumps(a, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_json(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def wait_live(w, minutes=10):
    url = f"{SITE}data/reports/w{w}.json"
    for _ in range(minutes * 4):
        try:
            req = urllib.request.Request(f"{url}?t={time.time()}", headers={"Cache-Control": "no-cache", "User-Agent": "squat-weekly/1.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                if r.status == 200 and json.loads(r.read().decode("utf-8")).get("week") == w:
                    return True
        except Exception:
            pass
        time.sleep(15)
    return False


def announce(w):
    key = (ROOT / "worker-private" / "announce-key.txt").read_text(encoding="utf-8").strip()
    req = urllib.request.Request(
        config_value("notifyEndpoint").rstrip("/") + "/announce",
        data=json.dumps({"kind": "report", "week": w}).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Key": key, "User-Agent": "squat-weekly/1.0"},
        method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read().decode("utf-8"))
    sent = res.get("sent") or []
    ok = [s["person"] for s in sent if s.get("status") in (200, 201)]
    return ok, sent


# ---------- 指令 ----------
def cmd_prepare(a):
    today = dt.date.fromisoformat(a.today) if a.today else day_key(time.time() * 1000)
    due = due_weeks(today)
    if not due:
        say(f"NOTHING_TO_DO 第 1 週週報 {week_days(1)[-1] + dt.timedelta(days=1)} 才要寫（今天 {today}）")
        return
    done = announced()
    for w in due:
        if str(w) in done:
            continue
        if (REPORTS / f"w{w}.json").exists():
            say(f"FINISH {w} 第 {w} 週週報已經寫好，還沒推播完成：接著執行 publish {w}")
            return
        WORK.mkdir(exist_ok=True)
        facts = build_facts(load_db(a.db), w)
        public = {k: v for k, v in facts.items() if not k.startswith("_")}
        write_json(WORK / f"w{w}.facts.json", public)
        tpl = WORK / f"w{w}.letters.json"  # 每次都重新給空白範本，不沿用舊的信
        write_json(tpl, {pid: {"name": NAMES[pid], "letter": "", "goal": "", "whisper": None} for pid in IDS})
        say(f"WRITE {w} 第 {w} 週（{public['期間']}）要寫信")
        say(f"事實清單：{WORK / f'w{w}.facts.json'}")
        say(f"把信寫進：{tpl}")
        say(f"寫法：{ROOT / 'tools' / 'weekly_letter_guide.md'}")
        return
    say(f"NOTHING_TO_DO 第 {due[-1]} 週以前的週報都做完了")


def cmd_publish(a):
    w = a.week
    if not 1 <= w <= WEEKS:
        die(f"週數 {w} 不對")
    today = dt.date.fromisoformat(a.today) if a.today else day_key(time.time() * 1000)
    due = due_weeks(today)
    if w not in due:
        die(f"第 {w} 週還沒結束，不能出週報")
    if str(w) in announced():
        say(f"DONE 第 {w} 週已經推播過了"); return

    out = REPORTS / f"w{w}.json"
    lt = WORK / f"w{w}.letters.json"
    if lt.exists():
        letters = json.loads(lt.read_text(encoding="utf-8"))
        facts = build_facts(load_db(a.db), w)
        errs = check_letters(facts, letters)
        if errs:
            say("LETTER_ERRORS 信要修改後再 publish：")
            for e in errs: say(" -", e)
            sys.exit(2)
        people = {}
        for pid in IDS:
            pw, L = facts["_people"][pid], letters[pid]
            people[pid] = {"score": pw["score"], "days": pw["states"], "makeup": "used" if pw["cardUsed"] else "unused",
                           "letter": L["letter"].strip(), "goal": L["goal"].strip()}
            if L.get("whisper"):
                people[pid]["whisper"] = {"from": partner(pid), "text": L["whisper"]}
        write_json(out, {"week": w, "start": facts["_dates"][0], "end": facts["_dates"][1],
                         "teams": [{"id": t["id"], "score": t["score"], "rank": t["rank"]} for t in facts["_teams"]],
                         "people": people})
    elif not out.exists():
        die(f"找不到 {lt.name}，先 prepare 再寫信")

    idx_path = REPORTS / "index.json"
    idx = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else {"weeks": []}
    weeks = sorted({x["week"] for x in idx.get("weeks", [])} | {w})
    write_json(idx_path, {"weeks": [{"week": x} for x in weeks], "latest": {"week": weeks[-1]}})
    say(f"寫好 {out.relative_to(ROOT)}、data/reports/index.json")
    if a.dry_run:
        say("DRY_RUN 不 push、不推播"); return

    # 只 commit 週報兩個檔；本機有別的還沒推的 commit 就停下來，避免把沒確認的東西一起推上去
    git("fetch", "-q", "origin")
    if git("rev-parse", "--abbrev-ref", "HEAD") != "main":
        die("目前不在 main 分支")
    unpushed = git("log", "origin/main..HEAD", "--format=%s").splitlines()
    if any(s != f"第 {w} 週週報" for s in unpushed):
        die("本機有還沒推上去的其他 commit，請阿忠先處理，週報先不推")
    if git("rev-list", "--count", "HEAD..origin/main") != "0":
        git("pull", "-q", "--rebase", "--autostash", "origin", "main")
    paths = [f"data/reports/w{w}.json", "data/reports/index.json"]
    git("add", *paths)
    if subprocess.run(["git", "diff", "--cached", "--quiet", "--", *paths], cwd=ROOT).returncode != 0:
        git("commit", "-q", "-m", f"第 {w} 週週報", "-m", "Co-Authored-By: Claude <noreply@anthropic.com>", "--", *paths)
    if git("rev-list", "--count", "origin/main..HEAD") != "0":
        git("push", "-q", "origin", "main")
    say("已推上 GitHub，等網站更新…")
    if not wait_live(w):
        die("等了 10 分鐘網站還沒更新，下次排程會再試推播")

    latest_due = due[-1]
    if w < latest_due:
        mark_announced(w, "補跑，不推播")
        say(f"DONE 第 {w} 週是補跑的舊週報，只上架不推播")
        return
    ok, sent = announce(w)
    mark_announced(w, f"推播 {len(ok)}/{len(sent)} 支手機")
    who = "、".join(sorted({NAMES.get(p, p) for p in ok})) or "沒有人"
    say(f"DONE 第 {w} 週週報上線，推播成功 {len(ok)}/{len(sent)} 支手機（{who}）")


def main():
    ap = argparse.ArgumentParser(description="第二季週報產生器")
    ap.add_argument("cmd", choices=["prepare", "publish"])
    ap.add_argument("week", nargs="?", type=int)
    ap.add_argument("--today")
    ap.add_argument("--db")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.cmd == "publish" and not a.week:
        die("publish 要給週數，例如 publish 1")
    (cmd_prepare if a.cmd == "prepare" else cmd_publish)(a)


if __name__ == "__main__":
    main()
