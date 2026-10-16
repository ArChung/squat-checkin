/* 第二季計分：分數全部從蓋章紀錄即時算出來，不另外存。
   規則：每週一凌晨 3 點歸零；某天沒蓋章，隔天凌晨 3 點扣 10（分數是 0 或負的，扣最少的贏）；
   補蹲卡＝隔天蓋章時帶 makeup:true，把「昨天」扣的 10 分還回來，每人每週一張、週一不能補週日。 */
(function () {
  const CFG = globalThis.APP_CONFIG;
  const S = CFG.season2;
  const SHIFT = CFG.dayStartHour * 3600000;
  const fmtKey = new Intl.DateTimeFormat("en-CA", { timeZone: CFG.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const fmtHour = new Intl.DateTimeFormat("en-US", { timeZone: CFG.timeZone, hour: "numeric", hour12: false });
  const fmtHM = new Intl.DateTimeFormat("en-GB", { timeZone: CFG.timeZone, hour: "2-digit", minute: "2-digit", hour12: false });

  /* 時鐘：平常就是現在；試玩模式可以把時間撥到任何一天 */
  const Clock = {
    fixed: null,
    fixedAt: 0,
    now() { return this.fixed == null ? Date.now() : this.fixed + (Date.now() - this.fixedAt); },
    set(ts) { this.fixed = ts; this.fixedAt = Date.now(); }
  };

  const dateKey = (ts) => fmtKey.format(new Date((ts == null ? Clock.now() : ts) - SHIFT));
  const hourNow = () => Number(fmtHour.format(new Date(Clock.now()))) % 24;
  const hm = (ts) => fmtHM.format(new Date(ts));
  const utc = (key) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d, 12); };
  const addDays = (key, n) => new Date(utc(key) + n * 86400000).toISOString().slice(0, 10);
  const diff = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
  const wd = (key) => (new Date(utc(key)).getUTCDay() + 6) % 7; // 0＝週一 … 6＝週日
  const md = (key) => { const [, m, d] = key.split("-").map(Number); return `${m}/${d}`; };

  const END = addDays(S.start, S.weeks * 7 - 1);
  const phase = (today) => (today < S.start ? "pre" : today > END ? "post" : "on");
  const weekIdx = (key) => Math.floor(diff(S.start, key) / 7);
  const weekStart = (w) => addDays(S.start, w * 7);
  const weekDays = (w) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekStart(w), i));
  const rec = (ck, key, id) => (ck[key] && ck[key][id]) || null;

  /* 某人某週：每天的狀態＋分數。
     done＝有蹲、today＝今天還沒蹲（還沒扣）、missed＝漏了已扣、fixed＝漏了但隔天用補蹲卡補回、future＝還沒到 */
  function personWeek(ck, id, w, today) {
    const days = weekDays(w);
    let missed = 0;
    const out = days.map((k, i) => {
      const r = rec(ck, k, id);
      if (k > today) return { key: k, state: "future" };
      if (r) return { key: k, state: "done", rec: r };
      if (k === today) return { key: k, state: "today" };
      const next = days[i + 1];
      const nr = next && next <= today ? rec(ck, next, id) : null;
      if (nr && nr.makeup) return { key: k, state: "fixed", fixedBy: next };
      missed++;
      return { key: k, state: "missed" };
    });
    const usedOn = days.find((k) => k <= today && rec(ck, k, id) && rec(ck, k, id).makeup) || null;
    return {
      id, days: out, missed,
      score: -S.missPenalty * missed,
      cardUsed: !!usedOn, usedOn
    };
  }

  /* 隊伍：兩人加總，外加週六／週日「週末雙蹲」 */
  function teamWeek(ck, team, w, today) {
    const people = team.members.map((id) => personWeek(ck, id, w, today));
    const days = weekDays(w);
    const both = (k) => k <= today && team.members.every((id) => rec(ck, k, id));
    return {
      id: team.id, color: team.color, members: team.members, people,
      score: people.reduce((s, p) => s + p.score, 0),
      weekend: { sat: both(days[5]), sun: both(days[6]) }
    };
  }

  /* 排名：分數高的在前，同分同名次 */
  function ranking(ck, w, today) {
    const list = S.teams.map((t) => teamWeek(ck, t, w, today)).sort((a, b) => b.score - a.score);
    list.forEach((t, i) => { t.rank = i > 0 && t.score === list[i - 1].score ? list[i - 1].rank : i + 1; });
    return list;
  }

  /* 補蹲卡今天能不能用：ok／none（昨天有蹲或還沒開季）／monday（週一不能補週日）／used（本週用過）／done（今天已經用來補昨天） */
  function makeupStatus(ck, id, today) {
    if (phase(today) !== "on") return "none";
    const y = addDays(today, -1);
    if (y < S.start || rec(ck, y, id)) return "none";
    if (wd(today) === 0) return "monday";
    const pw = personWeek(ck, id, weekIdx(today), today);
    if (pw.usedOn === today) return "done";
    if (pw.cardUsed) return "used";
    return "ok";
  }

  const teamOf = (id) => S.teams.find((t) => t.members.indexOf(id) >= 0) || null;
  const partnerOf = (id) => { const t = teamOf(id); return t ? t.members.find((x) => x !== id) : null; };

  globalThis.S2 = {
    Clock, dateKey, hourNow, hm, addDays, diff, wd, md, END, phase,
    weekIdx, weekStart, weekDays, rec, personWeek, teamWeek, ranking, makeupStatus,
    teamOf, partnerOf,
    horoIndex: (key) => diff(S.start, key)
  };
})();
