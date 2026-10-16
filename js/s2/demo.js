/* 試玩模式（網址加 ?demo）：假資料＋時光機，用來預覽第二季每一種畫面。
   所有動作只存在這個分頁的記憶體裡，不會寫進雲端。 */
(function () {
  if (!/[?&]demo\b/.test(location.search)) return;
  const CFG = globalThis.APP_CONFIG;
  const S = CFG.season2;
  const KEY = "squat-s2-demo";
  const FIRST = "2026-10-12", LAST = "2026-12-01";

  /* 網址加 &reset：清掉所有試玩紀錄，回到開季第一天晚上（先看規則、再蓋章） */
  if (/[?&]reset\b/.test(location.search)) {
    try {
      Object.keys(localStorage)
        .filter((k) => k.indexOf("squat-s2-demo") === 0 || k.indexOf("squat-s2-letter-demo") === 0)
        .forEach((k) => localStorage.removeItem(k));
      history.replaceState(null, "", location.pathname + "?demo");
    } catch (e) {}
  }

  let st = { date: "2026-10-19", time: "21:30", me: "azhong", seed: 1, missY: false, open: false };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  /* 撥時鐘：凌晨 0～3 點屬於前一天，所以日曆日要 +1 */
  const [hh, mm] = st.time.split(":").map(Number);
  const cal = hh < CFG.dayStartHour ? S2.addDays(st.date, 1) : st.date;
  S2.Clock.set(Date.parse(`${cal}T${st.time}:00+08:00`));
  const nowMins = (hh * 60 + mm - CFG.dayStartHour * 60 + 1440) % 1440;

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

  /* 每個人的蹲法（從第一季的習慣抓）：p＝平日蹲的機率、wk＝週末打折、t0～t1＝凌晨 3 點起算的分鐘 */
  const PERSONA = {
    guantou: { p: 0.8, wk: 0.85, t0: 1140, t1: 1430 },
    azhong:  { p: 0.86, wk: 0.9, t0: 1080, t1: 1370 },
    xiaobai: { p: 0.95, wk: 1, t0: 1140, t1: 1190 },
    vicky:   { p: 0.9, wk: 0.9, t0: 990, t1: 1170 },
    xiaoj:   { p: 0.86, wk: 0.85, t0: 900, t1: 1110 },
    dami:    { p: 0.74, wk: 0.7, t0: 360, t1: 1260 }
  };
  const LINES = ["今天你們死定了", "蹲完了，換你們", "腿在抖但心很穩", "三點前我一定到", "隊伍分靠我撐著", "誰還沒蹲，舉手", "已蹲，勿念", "今天腿很聽話", "今天的 40 下是為了雞排", "老婆我先蹲了"];

  const dayTs = (d, mins) => Date.parse(`${d}T03:00:00+08:00`) + mins * 60000;

  function generate() {
    const ck = {}, msgs = {};
    const today = st.date;
    const used = {};
    const yesterday = S2.addDays(today, -1);
    for (let d = S.start; d <= today && d <= S2.END; d = S2.addDays(d, 1)) {
      CFG.members.forEach((m) => {
        const P = PERSONA[m.id];
        const r = rng(hash(d + m.id + st.seed));
        const isToday = d === today;
        if (isToday && m.id === st.me) return;
        if (m.id === st.me && d === yesterday && st.missY) return;
        if (r() >= P.p * (S2.wd(d) >= 5 ? P.wk : 1)) return;
        const mins = P.t0 + Math.floor(r() * (P.t1 - P.t0));
        if (isToday && mins > nowMins) return;
        const body = { ts: dayTs(d, mins) };
        const y = S2.addDays(d, -1);
        const wk = S2.weekIdx(d) + m.id;
        if (m.id !== st.me && y >= S.start && S2.wd(d) !== 0 && !(ck[y] && ck[y][m.id]) && !used[wk] && r() < 0.6) {
          body.makeup = true; used[wk] = 1;
        }
        (ck[d] = ck[d] || {})[m.id] = body;
      });
    }
    const r = rng(hash(today + "say" + st.seed));
    CFG.members.forEach((m) => {
      if (m.id !== st.me && r() < 0.45) (msgs[today] = msgs[today] || {})[m.id] = { text: LINES[Math.floor(r() * LINES.length)], ts: dayTs(today, 600) };
    });
    const likes = {};
    Object.keys(msgs[today] || {}).forEach((target) => {
      CFG.members.forEach((m) => {
        if (m.id === target || m.id === st.me || r() >= 0.5) return;
        const day = (likes[today] = likes[today] || {});
        (day[target] = day[target] || {})[m.id] = true;
      });
    });
    return { checkins: ck, messages: msgs, members: {}, subs: {}, likes };
  }

  let notify = () => {};
  const data = generate();
  const set = (root, date, id, v) => {
    if (v === null) { if (data[root][date]) delete data[root][date][id]; }
    else (data[root][date] = data[root][date] || {})[id] = v;
    notify(data);
    return Promise.resolve();
  };

  window.Store = {
    mode: "demo",
    get data() { return data; },
    async init(cb) { notify = cb; cb(data); },
    stamp(date, id, makeup) { const b = { ts: S2.Clock.now() }; if (makeup) b.makeup = true; return set("checkins", date, id, b); },
    async markMakeup(date, id) { if (data.checkins[date] && data.checkins[date][id]) { data.checkins[date][id].makeup = true; notify(data); } },
    uncheck(date, id) { return set("checkins", date, id, null); },
    say(date, id, text) { return set("messages", date, id, { text, ts: S2.Clock.now() }); },
    unsay(date, id) { return set("messages", date, id, null); },
    async like(date, target, liker, on) {
      const day = (data.likes[date] = data.likes[date] || {});
      const who = (day[target] = day[target] || {});
      if (on) who[liker] = true; else delete who[liker];
      notify(data);
    },
    async setMember() {},
    resync() { return Promise.resolve(); },
    async saveSub() { throw new Error("demo"); },
    async removeSub() {}
  };

  globalThis.S2Demo = {
    me: st.me,
    /* 示範全員蹲完：先捲到排行，我們這隊先蹲完（看抽換卡），其他人再一個個蹲，最後是全員達成 */
    allStamp() {
      const today = S2.dateKey();
      const done = (id) => (data.checkins[today] || {})[id];
      const mine = S.teams.find((t) => t.members.indexOf(st.me) >= 0);
      const partner = mine.members.find((x) => x !== st.me);
      const order = [partner, st.me]
        .concat(S.teams.filter((t) => t !== mine).reduce((a, t) => a.concat(t.members), []))
        .filter((id) => !done(id));
      const league = document.querySelector(".league");
      if (league) league.scrollIntoView({ behavior: "smooth", block: "start" });
      order.forEach((id, i) => setTimeout(() => set("checkins", today, id, { ts: S2.Clock.now() }), 900 + i * 1400));
      return order.length;
    },
    /* 示範別人按你的嗆聲愛心 */
    someoneLikes() {
      const today = S2.dateKey();
      if (!(data.messages[today] || {})[st.me]) return false;
      const who = (data.likes[today] || {})[st.me] || {};
      const m = CFG.members.find((x) => x.id !== st.me && !who[x.id]);
      if (!m) return false;
      window.Store.like(today, st.me, m.id, true);
      return true;
    },
    /* 示範別人即時蓋章：挑一個今天還沒蹲的人幫他蓋 */
    someoneStamps() {
      const today = S2.dateKey();
      const left = CFG.members.filter((m) => m.id !== st.me && !(data.checkins[today] || {})[m.id]);
      if (!left.length) return false;
      const m = left[Math.floor(Math.random() * left.length)];
      set("checkins", today, m.id, { ts: S2.Clock.now() });
      return true;
    }
  };

  /* ---------- 控制面板 ---------- */
  const WD = ["一", "二", "三", "四", "五", "六", "日"];
  const span = S2.diff(FIRST, LAST);
  const JUMPS = [["預告", "2026-10-18"], ["開季", "2026-10-19"], ["週一結算", "2026-10-26"], ["最後一天", "2026-11-29"], ["完賽", "2026-11-30"]];
  const label = (d) => `${S2.md(d)}（${WD[S2.wd(d)]}）`;

  const el = document.createElement("aside");
  el.className = "demo-panel" + (st.open ? " open" : "");
  el.innerHTML = `
    <button class="dp-toggle" type="button">試玩模式</button>
    <div class="dp-body">
      <div class="dp-row dp-date">
        <button type="button" data-step="-1" aria-label="前一天">◀</button>
        <b>${label(st.date)}</b>
        <button type="button" data-step="1" aria-label="後一天">▶</button>
      </div>
      <input class="dp-range" type="range" min="0" max="${span}" value="${S2.diff(FIRST, st.date)}" aria-label="日期">
      <div class="dp-row dp-chips">${JUMPS.map(([t, d]) => `<button type="button" data-jump="${d}" class="${d === st.date ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="dp-row dp-chips">${["09:00", "21:30", "01:40"].map((t) => `<button type="button" data-time="${t}" class="${t === st.time ? "on" : ""}">${t}</button>`).join("")}</div>
      <div class="dp-row">
        <label>我是 <select class="dp-me">${CFG.members.map((m) => `<option value="${m.id}" ${m.id === st.me ? "selected" : ""}>${m.name}</option>`).join("")}</select></label>
        <label class="dp-check"><input type="checkbox" class="dp-miss" ${st.missY ? "checked" : ""}> 我昨天漏蹲</label>
      </div>
      <div class="dp-row dp-chips">
        <button type="button" data-act="someone">有人蓋章</button>
        <button type="button" data-act="replay">重看動畫</button>
        <button type="button" data-act="seed">換資料</button>
        <button type="button" data-act="reset">全部重設</button>
        <button type="button" data-act="all">全員蹲完</button>
        <button type="button" data-act="like">有人按愛心</button>
      </div>
      <p class="dp-note">假資料・只存在這個分頁</p>
    </div>`;
  document.body.appendChild(el);

  const go = (patch) => { Object.assign(st, patch); save(); location.reload(); };
  el.querySelector(".dp-toggle").onclick = () => { st.open = !st.open; save(); el.classList.toggle("open", st.open); };
  el.querySelectorAll("[data-step]").forEach((b) => b.onclick = () => {
    const d = S2.addDays(st.date, Number(b.dataset.step));
    if (d >= FIRST && d <= LAST) go({ date: d });
  });
  el.querySelector(".dp-range").onchange = (e) => go({ date: S2.addDays(FIRST, Number(e.target.value)) });
  el.querySelector(".dp-range").oninput = (e) => { el.querySelector(".dp-date b").textContent = label(S2.addDays(FIRST, Number(e.target.value))); };
  el.querySelectorAll("[data-jump]").forEach((b) => b.onclick = () => go({ date: b.dataset.jump }));
  el.querySelectorAll("[data-time]").forEach((b) => b.onclick = () => go({ time: b.dataset.time }));
  el.querySelector(".dp-me").onchange = (e) => go({ me: e.target.value });
  el.querySelector(".dp-miss").onchange = (e) => go({ missY: e.target.checked });
  el.querySelector('[data-act="seed"]').onclick = () => go({ seed: st.seed + 1 });
  el.querySelector('[data-act="like"]').onclick = (e) => {
    if (!S2Demo.someoneLikes()) e.target.textContent = "先嗆一句才有";
  };
  el.querySelector('[data-act="all"]').onclick = (e) => {
    st.open = false; save(); el.classList.remove("open");
    if (!S2Demo.allStamp()) e.target.textContent = "大家都蹲了";
  };
  el.querySelector('[data-act="reset"]').onclick = () => { location.href = location.pathname + "?demo&reset"; };
  el.querySelector('[data-act="replay"]').onclick = () => {
    Object.keys(localStorage).filter((k) => k.indexOf("squat-s2-demo-") === 0).forEach((k) => localStorage.removeItem(k));
    location.reload();
  };
  el.querySelector('[data-act="someone"]').onclick = (e) => {
    if (!S2Demo.someoneStamps()) e.target.textContent = "大家都蹲了";
  };
})();
