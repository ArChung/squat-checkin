/* 深蹲俱樂部第二季：黑底朱印（首頁 index.html）
   畫面：頂部（日期、今日幾人）→ 我（本週分數、七格、按住蓋章、朱印）→ 三隊排行；蓋完章直接給明日運勢 */
(function () {
  const CFG = globalThis.APP_CONFIG;
  const S = CFG.season2;
  const $ = (s) => document.querySelector(s);
  const DEMO = !!globalThis.S2Demo;
  const ME_KEY = "squat-club-me";
  const WD = ["一", "二", "三", "四", "五", "六", "日"];
  const M = {};
  CFG.members.forEach((m) => { M[m.id] = m; });
  const ORDER = S.teams.reduce((a, t) => a.concat(t.members), []);
  const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const HOLD_MS = 900;
  const HH = String(CFG.dayStartHour).padStart(2, "0");

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = () => window.Store;
  const ck = () => store().data.checkins || {};
  const msgs = () => store().data.messages || {};
  const likes = () => store().data.likes || {};
  const name = (id) => (M[id] ? M[id].name : "");
  const teamName = (t) => t.members.map(name).join("＋");
  const dayLabel = (k) => `${S2.md(k)}（${WD[S2.wd(k)]}）`;
  const dayStartTs = (k) => Date.parse(`${k}T${HH}:00:00+08:00`);
  const fmt = (n) => (n < 0 ? "−" + Math.abs(n) : String(n)); // 扣分用全形減號
  const neg = (n) => (n < 0 ? "neg" : "");

  /* ---------- 這支手機記得的事（看過哪些動畫、戳過哪些格子） ---------- */
  const LS = {
    k: (k) => "squat-s2-" + (DEMO ? "demo-" : "") + k,
    get(k, d) { try { const v = localStorage.getItem(LS.k(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(LS.k(k), JSON.stringify(v)); } catch (e) {} }
  };
  const seenGet = (id) => LS.get("seen-" + id, {});
  const seenSet = (id, keys) => { const s = seenGet(id); [].concat(keys).forEach((k) => { s[k] = 1; }); LS.set("seen-" + id, s); };
  const readGet = (id) => LS.get("read-" + id, {});

  /* ---------- 身分（沿用第一季的裝置綁定） ---------- */
  const authOn = () => !DEMO && !!CFG.webApiKey && store().mode === "cloud";
  const memberInfo = (id) => (store().data.members || {})[id];
  const claimedByMe = (id) => { const m = memberInfo(id); return !!(m && m.claimedBy && m.claimedBy === DeviceAuth.cachedUid()); };
  const canOperate = (id) => DEMO || !authOn() || claimedByMe(id);
  const iAmAdmin = () => authOn() && claimedByMe("azhong");
  function me() {
    if (DEMO) return S2Demo.me;
    let id = "";
    try { id = localStorage.getItem(ME_KEY) || ""; } catch (e) {}
    return M[id] ? id : "";
  }

  /* ---------- 狀態 ---------- */
  let today = S2.dateKey();
  let horo = null;
  let reports = null;
  let fresh = false;
  let firstRender = true;
  let prevDone = {};
  let prevWeekend = {};
  let prevFixed = {};
  const prevScore = {};
  let shownOrder = [];       // 排行目前畫在畫面上的順序（看不到時先不換，等滑到再換給你看）
  let shownToday = {};
  let pendingReorder = false;
  let holdReorder = false;
  let likeBurst = null;      // 剛按了誰的嗆聲（那顆愛心要噴像素）
  const prevLikes = {};
  let prevMyLikers = null;   // 正在幫你捲到排行，捲停之前先不換
  let stampFlow = false;     // 蓋章後「捲到排行 → 抽換 → 升起運勢」進行中，先別跳其他儀式
  let selfStamp = false;
  let relightPending = false;
  let ceremonyBusy = false;
  let autoClaimTried = false;

  /* ---------- 小零件 ---------- */
  const DAY_LABEL = { done: "有蹲", future: "還沒到", today: "今天還沒蹲", missed: "漏了，扣 10 分", fixed: "補回來了" };
  const GLYPH = { "牡羊座": "♈", "金牛座": "♉", "雙子座": "♊", "巨蟹座": "♋", "獅子座": "♌", "處女座": "♍", "天秤座": "♎", "天蠍座": "♏", "射手座": "♐", "摩羯座": "♑", "水瓶座": "♒", "雙魚座": "♓" };
  const two = (n) => String(n).padStart(2, "0");
  const dot = (k) => S2.md(k).replace("/", ".");

  function bulbsHTML(pw, o) {
    return `<ol class="days ${o.cls || ""}">${pw.days.map((d, i) => {
      const fixing = o.fixAnim && d.key === o.fixAnim ? " d-fixing" : "";
      return `<li class="d d-${d.state}${fixing}" style="--i:${i}" aria-label="週${WD[i]}：${DAY_LABEL[d.state]}"><i></i><span>${WD[i]}</span></li>`;
    }).join("")}</ol>`;
  }

  /* 像素愛心（7×6 格） */
  const HEART = (() => {
    const rows = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];
    let r = "";
    rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === "X") r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
    return `<svg class="px-heart" viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  })();
  /* 按愛心時噴出來的像素方塊 */
  const pixels = () => Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
    const r = 16 + Math.random() * 12;
    return `<i style="--dx:${(Math.cos(a) * r).toFixed(0)}px;--dy:${(Math.sin(a) * r).toFixed(0)}px"></i>`;
  }).join("");

  const sealHTML = (text, cls) => `<span class="seal ${cls || ""}${text.length > 1 ? " v" : ""}" aria-hidden="true"><b>${text}</b></span>`;

  const fmtDur = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  /* 下一格動畫：requestAnimationFrame 為主，畫面暫停繪製時用計時器補上，動畫不會卡住 */
  function nextFrame(fn) {
    let done = false;
    const go = () => { if (!done) { done = true; fn(performance.now()); } };
    requestAnimationFrame(go);
    return setTimeout(go, 32);
  }

  let toastTimer;
  function toast(html, ms) {
    const t = $("#toast");
    t.innerHTML = html;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), ms || 2800);
  }

  function countUp(el, from, to, ms, tick) {
    const t0 = performance.now();
    let last = from;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const val = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (val !== last) {
        el.textContent = fmt(val);
        if (tick && Math.floor(val / 10) !== Math.floor(last / 10)) Sfx.countTick();
        last = val;
      }
      if (p < 1) nextFrame(step);
    };
    nextFrame(step);
  }

  /* ---------- 組資料：這一次畫面要用的全部狀態 ---------- */
  function buildView() {
    const id = me();
    const ph = S2.phase(today);
    const todayCk = ck()[today] || {};
    const lit = {}, just = {};
    ORDER.forEach((x) => {
      lit[x] = ph === "post" ? true : !!todayCk[x];
      just[x] = !firstRender && ph === "on" && lit[x] && !prevDone[x];
    });

    let rank;
    if (ph === "pre") {
      rank = S.teams.map((t) => ({
        id: t.id, color: t.color, members: t.members, rank: 0, weekend: {},
        score: 0,
        people: t.members.map((m) => ({ id: m, score: 0, days: [0, 1, 2, 3, 4, 5, 6].map(() => ({ state: "future" })) }))
      }));
    } else if (ph === "post") {
      rank = S2.ranking(ck(), S.weeks - 1, S2.addDays(S2.END, 1));
    } else {
      rank = S2.ranking(ck(), S2.weekIdx(today), today);
    }
    const weekOf = {};
    rank.forEach((t) => t.people.forEach((p) => { weekOf[p.id] = p; }));

    const justWeekend = {};
    if (ph === "on") rank.forEach((t) => ["sat", "sun"].forEach((k) => {
      const key = t.id + k;
      if (t.weekend[k] && !prevWeekend[key] && !firstRender) justWeekend[key] = t;
      prevWeekend[key] = t.weekend[k];
    }));

    let fixAnim = null;
    if (id && ph === "on") weekOf[id].days.forEach((d) => {
      const fixed = d.state === "fixed";
      if (fixed && !prevFixed[d.key] && !firstRender) fixAnim = d.key;
      prevFixed[d.key] = fixed;
    });

    const lkDay = likes()[today] || {};
    const justLike = {};
    ORDER.forEach((x) => {
      const n = Object.keys(lkDay[x] || {}).length;
      if (!firstRender && n > (prevLikes[x] || 0)) justLike[x] = true;
      prevLikes[x] = n;
    });
    const myLikers = Object.keys((id && lkDay[id]) || {});
    const newLikers = !firstRender && prevMyLikers ? myLikers.filter((x) => prevMyLikers.indexOf(x) < 0) : [];
    prevMyLikers = myLikers;

    let order = rank;
    if (ph === "on") {
      const tsOf = (x) => { const r = todayCk[x]; return r ? Number(r.ts) || 1 : 0; };
      rank.forEach((t) => {
        const times = t.members.map(tsOf);
        t.doneN = times.filter(Boolean).length;
        t.doneAt = t.doneN === t.members.length ? Math.max(...times) : Infinity;
        t.firstAt = t.doneN ? Math.min(...times.filter(Boolean)) : Infinity;
        t.idx = S.teams.findIndex((x) => x.id === t.id);
      });
      order = rank.slice().sort((a, b) =>
        (a.doneAt - b.doneAt) || (b.doneN - a.doneN) || (a.firstAt - b.firstAt) || (b.score - a.score) || (a.idx - b.idx));
      let n = 0;
      order.forEach((t) => { t.today = t.doneAt < Infinity ? ++n : 0; });
    }

    return {
      me: id, ph, lit, just, rank, order, weekOf, fixAnim, justWeekend, justLike, newLikers,
      doneCount: ORDER.filter((x) => todayCk[x]).length,
      relight: relightPending
    };
  }

  /* ---------- 招牌：燈串＋日期 ---------- */
  function renderHeader(v) {
    const n = ORDER.length;
    let left;
    if (v.ph === "pre") left = `<span><b>${dot(S.start)}</b>開蹲・共 ${S.weeks} 週</span>`;
    else if (v.ph === "post") left = `<span><b>${S.weeks}/${S.weeks}</b>第二季完賽</span>`;
    else left = `<span><b>${dot(today)}</b>週${WD[S2.wd(today)]}・第 ${S2.weekIdx(today) + 1}/${S.weeks} 週</span>`;
    const dots = ORDER.map((id) => `<li class="${v.lit[id] ? "on" : ""} ${v.just[id] ? "pop" : ""}"></li>`).join("");
    $("#mqDate").innerHTML = left + (v.ph === "on" ? `<span class="today">今日 ${v.doneCount}/${n}<ol aria-hidden="true">${dots}</ol></span>` : "");
    $("#allDone").classList.toggle("hidden", !(v.ph === "on" && v.doneCount === n));
  }

  function tickClock() {
    const late = $("#mqLate");
    if (S2.phase(today) === "on" && S2.hourNow() < CFG.dayStartHour) {
      late.classList.remove("hidden");
      late.innerHTML = `3 點換日・還剩 <b>${fmtDur(dayStartTs(S2.addDays(today, 1)) - S2.Clock.now())}</b>`;
    } else {
      late.classList.add("hidden");
    }
    const pc = $("#preCount");
    if (pc) {
      const ms = dayStartTs(S.start) - S2.Clock.now();
      const days = Math.floor(ms / 86400000);
      pc.innerHTML = days >= 1 ? `${days}<small>天</small>${fmtDur(ms - days * 86400000)}` : fmtDur(ms);
    }
  }

  /* ---------- 我的攤位 ---------- */
  function fortuneCTA(id) {
    if (!horo || !horo.people[id]) return "";
    if (today === S2.END) return `<p class="last-day">第二季最後一蹲！</p>`;
    return `<button class="btn-line" type="button" data-act="fortune" data-date="${S2.addDays(today, 1)}">明日運勢</button>`;
  }

  function claimHTML() {
    return `<p class="claim-q">這支手機<br>是誰的？</p><ul class="claim-list">${ORDER.map((id) => {
      const taken = authOn() && memberInfo(id) && !claimedByMe(id);
      return `<li><button type="button" data-claim="${id}" ${taken ? "disabled" : ""}>${esc(name(id))}</button></li>`;
    }).join("")}</ul>`;
  }

  function renderHero(v) {
    const el = $("#hero");
    const id = v.me;
    el.className = "hero";
    if (!id) { el.innerHTML = claimHTML(); return; }

    if (v.ph === "pre") {
      el.innerHTML = `
        <div class="me-head"><h2 class="me-name">${esc(name(id))}</h2></div>
        <p class="kicker count-label">開季倒數</p>
        <span class="count" id="preCount"></span>
        ${bulbsHTML(v.weekOf[id], { cls: "days-lg" })}
        <div class="act">${horo && horo.people[id]
          ? `<button class="btn-line" type="button" data-act="fortune" data-date="${S.start}">偷看開季日運勢</button>` : ""}</div>`;
      return;
    }

    if (v.ph === "post") {
      const end = S2.addDays(S2.END, 1);
      const scores = Array.from({ length: S.weeks }, (_, w) => S2.personWeek(ck(), id, w, end).score);
      const total = scores.reduce((a, b) => a + b, 0);
      el.innerHTML = `
        <div class="me-head"><h2 class="me-name">${esc(name(id))}</h2></div>
        <p class="me-label">六週合計</p>
        <div class="me-score"><span class="me-num ${neg(total)}">${fmt(total)}</span><span class="me-unit">分</span></div>
        <ol class="wk-list">${scores.map((sc, i) => `<li><span>第 ${i + 1} 週</span><b>${fmt(sc)}</b></li>`).join("")}</ol>`;
      return;
    }

    const pw = v.weekOf[id];
    const r = S2.rec(ck(), today, id);
    const mk = S2.makeupStatus(ck(), id, today);
    const partner = S2.partnerOf(id);
    const h = S2.hourNow();
    if (!r && (h < CFG.dayStartHour || h >= 23)) el.classList.add("is-late");

    let act;
    if (r) {
      act = `<div class="done-row"><span class="t"><b>${S2.hm(r.ts)}</b>已蓋章</span>` +
        `<button class="link" type="button" data-act="undo">取消</button></div>` +
        (mk === "ok" ? `<button class="btn-ghost-sm" type="button" data-act="makeup-after">補昨天（再蹲 ${CFG.squats} 下）→</button>` : "") +
        fortuneCTA(id);
    } else {
      act = `<button class="btn-stamp" type="button" data-act="stamp"><b>蓋章</b><span>深蹲 ${CFG.squats} 下</span></button>` +
        (partner && S2.rec(ck(), today, partner) ? `<p class="nudge">${esc(name(partner))} 已經蹲了，就差你</p>` : "");
    }

    el.innerHTML = `
      <div class="me-head"><h2 class="me-name">${esc(name(id))}</h2>
        ${mk === "ok" && !r ? `<button class="chip-makeup" type="button" data-act="ticket">補蹲卡・補昨天</button>` : ""}</div>
      ${r ? sealHTML("蹲", "seal-me" + (v.just[id] ? " press" : "")) : ""}
      <p class="me-label">本週分數</p>
      <div class="me-score"><span class="me-num ${neg(pw.score)}" data-count="me" data-val="${pw.score}">${fmt(pw.score)}</span><span class="me-unit">分</span></div>
      ${bulbsHTML(pw, { cls: "days-lg" + (v.relight ? " relight" : ""), fixAnim: v.fixAnim })}
      <div class="act">${act}</div>`;
  }

  /* ---------- 今日排行 ---------- */
  const overlayOpen = () => !$("#sheet").classList.contains("hidden") || !$("#fortune").classList.contains("hidden") || !$("#stage").classList.contains("hidden");
  function leagueVisible() {
    const r = $("#stalls").getBoundingClientRect();
    return r.top < window.innerHeight * 0.8 && r.bottom > 60;
  }
  /* 排行換位時你沒在看（被蓋住、或還沒滑到），就先維持原順序，等看得到再抽換給你看 */
  function maybeReorder() {
    if (!holdReorder && pendingReorder && !overlayOpen() && leagueVisible()) renderAll();
  }

  /* 捲到排行，停穩了才換位置給你看；done(有沒有換位) */
  function revealLeague(done) {
    holdReorder = true;
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const target = Math.max(0, Math.min(max, Math.round($(".league").getBoundingClientRect().top + window.scrollY - 14)));
    window.scrollTo({ top: target, behavior: REDUCE ? "auto" : "smooth" });
    const t0 = Date.now();
    const iv = setInterval(() => {
      const arrived = Math.abs(window.scrollY - target) < 3;
      if (!arrived && Date.now() - t0 < 1400) return;
      clearInterval(iv);
      if (!arrived) window.scrollTo(0, target); // 有些瀏覽器不做平滑捲動：直接跳到位
      holdReorder = false;
      const changed = pendingReorder;
      renderAll();
      done(changed);
    }, 60);
  }


  function renderStalls(v) {
    $("#stallsTitle").innerHTML = v.ph === "on" ? `<span>今日排行</span><span class="sec-right">本週分</span>`
      : v.ph === "pre" ? `<span>夫妻三隊</span>` : `<span>最後一週</span><span class="sec-right">分數</span>`;
    const dow = S2.wd(today);

    let list = v.order;
    const ids = list.map((t) => t.id);
    let todayRank = {};
    list.forEach((t) => { todayRank[t.id] = t.today; });
    if (v.ph === "on" && !firstRender && shownOrder.length && ids.join() !== shownOrder.join() && (overlayOpen() || !leagueVisible())) {
      list = shownOrder.map((tid) => list.find((t) => t.id === tid));
      todayRank = shownToday;
      pendingReorder = true;
    } else {
      pendingReorder = false;
      shownOrder = ids;
      shownToday = todayRank;
    }

    $("#stalls").innerHTML = list.map((t) => {
      const mine = t.members.indexOf(v.me) >= 0;
      const people = t.people.map((p) => {
        const msg = (msgs()[today] || {})[p.id];
        const editable = p.id === v.me && canOperate(p.id) && v.ph === "on";
        const lk = (likes()[today] || {})[p.id] || {};
        const n = Object.keys(lk).length;
        const liked = !!(v.me && lk[v.me]);
        const canLike = !editable && v.me && v.ph === "on";
        const heart = `<span class="likes ${n ? "has" : ""} ${liked ? "on" : ""} ${likeBurst === p.id ? "burst" : ""} ${v.justLike[p.id] ? "pop" : ""}">` +
          `${HEART}${n ? `<b>×${n}</b>` : ""}${likeBurst === p.id ? pixels() : ""}</span>`;
        const act = editable ? `data-act="say"` : canLike ? `data-act="like" data-target="${p.id}" aria-pressed="${liked}"` : `tabindex="-1"`;
        const quote = msg && v.ph !== "post"
          ? `<button class="t-quote ${editable ? "mine" : ""}" type="button" ${act} aria-label="${esc(name(p.id))}的嗆聲，${n} 顆愛心">「${esc(msg.text)}」${heart}</button>` : "";
        const seal = v.ph === "on" && v.lit[p.id] ? `<i class="mini-seal on ${v.just[p.id] ? "pop" : ""}" aria-label="今天蹲了"></i>` : "";
        return `<div class="t-member"><span class="t-who">${esc(name(p.id))}${seal}</span>${bulbsHTML(p, { cls: "days-sm" })}${quote}</div>`;
      }).join("");
      const day = (k, lbl) => `<i class="${t.weekend[k] ? "on" : ""} ${v.justWeekend[t.id + k] ? "pop" : ""}">${lbl}</i>`;
      const weekend = v.ph === "on" && dow >= 5 ? `<div class="t-weekend">週末雙蹲 ${day("sat", "六")}${day("sun", "日")}</div>` : "";
      const r = v.ph === "on" ? todayRank[t.id] : v.ph === "post" ? t.rank : 0;
      const rankCell = v.ph === "pre" ? "" : r ? two(r) : "—";
      return `<article class="team ${mine ? "mine" : ""} ${r === 1 ? "rank-1" : ""} ${v.ph === "on" && !r ? "pending" : ""}" data-team="${t.id}" style="--tint:${t.color}">
        <div class="t-rank">${rankCell}</div>
        <div class="t-body">${people}${weekend}</div>
        ${v.ph === "pre" ? `<div class="t-score"></div>` : `<div class="t-score" data-count="team:${t.id}" data-val="${t.score}">${fmt(t.score)}</div>`}
      </article>`;
    }).join("");
  }

  /* ---------- 明日運勢：蓋完章直接整頁跳出來 ---------- */
  function openFortune(D) {
    const id = me();
    const e = horo && horo.people[id] && horo.people[id][S2.horoIndex(D)];
    if (!e) return;
    const fx = $("#fortune");
    const first = !readGet(id)[D];
    const sign = horo.signs[id] || "";
    $("#ftKicker").textContent = S2.phase(today) === "pre" ? "開季日運勢"
      : D === S2.addDays(today, 1) ? "明日運勢" : `${S2.md(D)} 的運勢`;
    $("#ftDate").textContent = `${dot(D)} 週${WD[S2.wd(D)]}`;
    const star = (on, pop) => `<svg viewBox="0 0 24 24" class="${on ? "on" : ""} ${pop ? "pop" : ""}"><path d="M12 2.8l2.7 6 6.5.6-4.9 4.3 1.5 6.4L12 16.8l-5.8 3.3 1.5-6.4L2.8 9.4l6.5-.6z"/></svg>`;
    $("#ftSlip").innerHTML = `
      <span class="sl-glyph" aria-hidden="true">${GLYPH[sign] ? GLYPH[sign] + "\uFE0E" : ""}</span>
      <div class="sl-who"><p class="sl-sign">${esc(sign)}・${esc(name(id))}</p>
        <div class="sl-stars" role="img" aria-label="整體運 ${e.s} 顆星">${[0, 1, 2, 3, 4].map((k) => star(k < e.s, !first && k < e.s)).join("")}</div></div>
      <p class="sl-text">${esc(e.t)}</p>
      <div class="sl-q"><span>深蹲一句</span><p>${esc(e.q)}</p></div>
      <div class="sl-lucky">
        <div><small>幸運色</small><b><i class="sw" style="--sw:${(globalThis.LUCKY_COLORS || {})[e.c] || "#cfc6b4"}"></i>${esc(e.c)}</b></div>
        <div><small>幸運小物</small><b>${esc(e.i)}</b></div>
      </div>`;
    fx.className = "fortune";
    nextFrame(() => fx.classList.add("open"));
    Sfx.unroll();
    if (!first) return;
    const seen = readGet(id);
    seen[D] = 1;
    LS.set("read-" + id, seen);
    fx.querySelectorAll(".sl-stars svg.on").forEach((st, k) => setTimeout(() => { st.classList.add("pop"); Sfx.star(k); }, 600 + k * 180));
    if (e.s === 5) setTimeout(() => { fx.classList.add("jackpot"); Sfx.jackpot(); }, 600 + 5 * 180 + 60);
  }

  /* 蓋完章：等招牌亮完，直接給明天的運勢 */
  /* 蓋完章：先讓朱印壓下去；排行會變的話捲下去看抽換，換完才升起明日運勢 */
  /* 科技感地框一下自己這隊：角框鎖定＋慢掃描＋名次閃一下 */
  function highlightMine() {
    const el = document.querySelector(".team.mine");
    if (!el) return;
    Fx.lock(el, { long: true });
    el.classList.remove("landed", "focus");
    void el.offsetWidth;
    el.classList.add("focus");
    Sfx.focus();
  }

  function afterStamp(id) {
    stampFlow = true;
    const t0 = Date.now();
    const finish = () => {
      stampFlow = false;
      if (S2.phase(today) !== "on" || !horo || !horo.people[id]) { runCeremonies(); return; }
      if (today === S2.END) { toast("第二季最後一蹲！明天沒有運勢，只有結算", 4000); runCeremonies(); return; }
      openFortune(S2.addDays(today, 1));
    };
    /* 等蓋章真的寫進去、面板收好、朱印也壓完（雲端慢的話最多等 4 秒） */
    const iv = setInterval(() => {
      const ready = S2.rec(ck(), today, id) && $("#sheet").classList.contains("hidden") && Date.now() - t0 > 950;
      if (!ready && Date.now() - t0 < 4000 && stampFlow) return;
      clearInterval(iv);
      if (!stampFlow || !S2.rec(ck(), today, id)) { stampFlow = false; return; } // 蓋章失敗：整段停下
      /* 一律捲到排行：有換位就先看抽換，換完再鎖定自己這隊；沒換位就直接鎖定 */
      revealLeague((changed) => setTimeout(() => {
        highlightMine();
        setTimeout(finish, 1300);
      }, changed ? 1050 : 150));
    }, 80);
  }

  function closeFortune() {
    const fx = $("#fortune");
    fx.classList.remove("open");
    setTimeout(() => { fx.className = "fortune hidden"; maybeReorder(); }, 260);
  }

  /* ---------- 規則（第一次開季跳出、之後按「規則」看） ---------- */
  function rulesHTML() {
    const rules = [
      ["每天 40 下", "凌晨 3 點前蓋章，都算當天。"],
      ["漏一天扣 10 分", "每週一歸零。"],
      ["補蹲卡", "每週一張：漏了隔天蹲 80 下補回來。"],
      ["夫妻同隊", "兩人加起來，扣最少的贏。"]
    ];
    return `<div class="rules-title"><span class="kicker">Season 2</span><b>第二季規則</b><span>${dayLabel(S.start)} 開蹲・共 ${S.weeks} 週</span></div>
      <ol class="rules">${rules.map(([h, line], i) => `<li><span class="no">${two(i + 1)}</span><div><h4>${h}</h4><p>${line}</p></div></li>`).join("")}</ol>`;
  }

  /* ---------- 儀式：規則、扣分、週一結算、完賽 ---------- */
  function stage(html, cls) {
    const s = $("#stage");
    $("#stageInner").innerHTML = html;
    Fx.wipe(() => { s.className = "stage open " + (cls || ""); s.scrollTop = 0; });
  }
  function closeStage() {
    Fx.wipe(() => { $("#stage").className = "stage hidden"; }, maybeReorder);
  }
  /* 一段儀式結束：還有下一段就直接切過去（同一個轉場），沒有就關掉 */
  function finishCeremony(id, keys, wait) {
    if (id && keys) seenSet(id, keys);
    ceremonyBusy = false;
    const next = wait ? null : nextCeremony();
    if (next) { ceremonyBusy = true; next(); return; }
    closeStage();
    setTimeout(runCeremonies, wait || 900);
  }

  function showRules(id, first) {
    stage(`<div class="cer">${rulesHTML()}<div class="cer-btns"><button class="btn-primary" type="button" data-cer="rules-ok">了解，開蹲</button></div></div>`, "s-rules");
    $("#stageInner").querySelector('[data-cer="rules-ok"]').onclick = () => {
      if (first) finishCeremony(id, "rules"); else closeStage();
    };
  }

  function showDeduct(id, y) {
    const pw = S2.personWeek(ck(), id, S2.weekIdx(today), today);
    const mk = S2.makeupStatus(ck(), id, today);
    stage(`<div class="cer cer-deduct">
      <p class="cer-kicker">${dot(y)} 週${WD[S2.wd(y)]}</p>
      <div class="loss-cell" aria-hidden="true"></div>
      <h2 class="cer-title cer-line">昨天沒蹲</h2>
      <div class="cer-after">
        <p class="cer-minus">−${S.missPenalty}</p>
        <p class="cer-text">本週 ${fmt(pw.score)} 分</p>
        ${mk === "ok" ? `<p class="cer-sub">今天蹲 80 下可以補回來</p>` : ""}
      </div>
      <div class="cer-btns"><button class="btn-primary" type="button" data-cer="face">面對現實</button></div>
    </div>`, "s-deduct");
    const inner = $("#stageInner");
    inner.querySelector('[data-cer="face"]').onclick = () => {
      $("#stage").classList.add("burst");
      Sfx.burst();
      if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
      setTimeout(() => {
        $("#stage").classList.add("after");
        inner.querySelector(".cer-btns").innerHTML =
          (mk === "ok" ? `<button class="btn-primary" type="button" data-cer="use">補回來</button><button class="btn-text" type="button" data-cer="ok">知道了</button>`
            : `<button class="btn-primary paper" type="button" data-cer="ok">知道了</button>`);
        const use = inner.querySelector('[data-cer="use"]');
        if (use) use.onclick = () => {
          finishCeremony(id, "miss" + y);
          setTimeout(() => (S2.rec(ck(), today, id) ? openMakeupAfter(id) : openStamp(id, true)), 380);
        };
        inner.querySelector('[data-cer="ok"]').onclick = () => finishCeremony(id, "miss" + y);
      }, 650);
    };
  }

  function showSettle(id, w) {
    const end = S2.addDays(S2.weekStart(w), 7);
    const rk = S2.ranking(ck(), w, end);
    const last = w === S.weeks - 1;
    stage(`<div class="cer cer-settle">
      <p class="cer-kicker">Week ${two(w + 1)} Final</p>
      <h2 class="cer-title">誰是第一？</h2>
      <ol class="podium">${rk.map((t, i) => `
        <li class="pd" data-rank="${t.rank}" data-step="${rk.length - 1 - i}" style="--tint:${t.color}">
          <span class="pd-rank">${two(t.rank)}</span>
          <span class="pd-name">${esc(teamName(t))}<small>${t.people.map((p) => `${esc(name(p.id))} ${fmt(p.score)}`).join("・")}</small></span>
          <span class="pd-score"><b data-to="${t.score}">?</b></span>
        </li>`).join("")}</ol>
      <div class="cer-btns"><button class="btn-primary" type="button" data-cer="reveal">揭曉</button></div>
    </div>`, "s-settle");
    const inner = $("#stageInner");
    const seenKeys = Array.from({ length: w + 1 }, (_, i) => "settle" + i);
    inner.querySelector('[data-cer="reveal"]').onclick = (ev) => {
      ev.currentTarget.disabled = true;
      Sfx.drumroll(1.3);
      const rows = [...inner.querySelectorAll(".pd")].sort((a, b) => a.dataset.step - b.dataset.step);
      rows.forEach((row, k) => setTimeout(() => {
        row.classList.add("in");
        const b = row.querySelector("[data-to]");
        countUp(b, 0, Number(b.dataset.to), 650, true);
        if (k === rows.length - 1) {
          setTimeout(() => {
            inner.querySelectorAll('.pd[data-rank="1"]').forEach((r) => { r.classList.add("champ"); r.insertAdjacentHTML("beforeend", sealHTML("冠", "press")); });
            Sfx.thump();
            Sfx.fanfare();
            confetti(90, 200);
            $("#stage").classList.add("after");
            inner.querySelector(".cer-btns").innerHTML = `<button class="btn-primary paper" type="button" data-cer="next">${last ? "看第二季總結" : `開始第 ${w + 2} 週`}</button>`;
            inner.querySelector('[data-cer="next"]').onclick = () => {
              finishCeremony(id, seenKeys, last ? 450 : 2200);
              if (!last) { relightPending = true; setTimeout(renderAll, 350); }
            };
          }, 700);
        }
      }, 1300 + k * 750));
    };
  }

  function showFinal(id) {
    const rows = S.teams.map((t) => {
      const ws = Array.from({ length: S.weeks }, (_, w) =>
        S2.ranking(ck(), w, S2.addDays(S2.weekStart(w), 7)).find((x) => x.id === t.id));
      return { t, ws, total: ws.reduce((s, x) => s + x.score, 0) };
    }).sort((a, b) => b.total - a.total);
    stage(`<div class="cer cer-final">
      <p class="cer-kicker">Season 2 Final</p>
      <h2 class="cer-title">六週總分</h2>
      <div class="final-table" role="table">
        <div class="ft-row ft-headrow" role="row"><span></span>${Array.from({ length: S.weeks }, (_, i) => `<span>${i + 1}</span>`).join("")}<span>合計</span></div>
        ${rows.map((r) => `<div class="ft-row tinted" role="row" style="--tint:${r.t.color}">
          <span class="ft-team">${esc(teamName(r.t))}</span>
          ${r.ws.map((x) => `<span class="ft-w r${x.rank}">${fmt(x.score)}</span>`).join("")}
          <span class="ft-total">${fmt(r.total)}</span></div>`).join("")}
      </div>
      <div class="cer-btns"><button class="btn-primary paper" type="button" data-cer="ok">收下</button></div>
    </div>`, "s-final after");
    Sfx.fanfare();
    confetti(120, 300);
    $("#stageInner").querySelector('[data-cer="ok"]').onclick = () => finishCeremony(id, "final");
  }

  function showAllDone(id) {
    const tc = ck()[today] || {};
    const recs = ORDER.map((x) => ({ id: x, ts: Number((tc[x] || {}).ts) || 0 })).sort((a, b) => a.ts - b.ts);
    const STEP = 260, FIRST = 450;
    stage(`<div class="cer cer-all">
      <p class="cer-kicker">${dot(today)} 週${WD[S2.wd(today)]}</p>
      <h2 class="cer-title">全員達成</h2>
      <ol class="all-seals">${recs.map((r, i) => `<li style="--d:${FIRST + i * STEP}ms">${sealHTML("蹲", "press")}<b>${esc(name(r.id))}</b><small>${r.ts > 1 ? S2.hm(r.ts) : ""}</small></li>`).join("")}</ol>
      <div class="cer-btns"><button class="btn-primary paper" type="button" data-cer="ok">明天見</button></div>
    </div>`, "s-all");
    const WIPE = 340;
    recs.forEach((r, i) => setTimeout(() => Sfx.thump(), WIPE + FIRST + i * STEP + 120));
    setTimeout(() => { Sfx.allDone(); confetti(120, 0); $("#stage").classList.add("after"); }, WIPE + FIRST + recs.length * STEP + 260);
    $("#stageInner").querySelector('[data-cer="ok"]').onclick = () => finishCeremony(id, "all" + today);
  }

  function runCeremonies() {
    if (!fresh || ceremonyBusy || stampFlow) return;
    if (!$("#sheet").classList.contains("hidden") || !$("#fortune").classList.contains("hidden")) return;
    const run = nextCeremony();
    if (run) { ceremonyBusy = true; run(); }
  }

  function nextCeremony() {
    const id = me();
    if (!id) return null;
    const ph = S2.phase(today);
    if (ph === "pre") return null;
    const seen = seenGet(id);
    let run = null;
    if (ph === "on" && !seen.rules) run = () => showRules(id, true);
    else {
      const done = ph === "post" ? S.weeks : S2.weekIdx(today);
      if (done >= 1 && !seen["settle" + (done - 1)]) run = () => showSettle(id, done - 1);
      else if (ph === "post" && !seen.final) run = () => showFinal(id);
      else if (ph === "on" && S2.wd(today) !== 0) {
        const y = S2.addDays(today, -1);
        const st = S2.personWeek(ck(), id, S2.weekIdx(today), today).days[S2.wd(y)].state;
        if (st === "missed" && !seen["miss" + y]) run = () => showDeduct(id, y);
      }
    }
    if (!run && ph === "on" && !seen["all" + today]) {
      const tc = ck()[today] || {};
      if (ORDER.every((x) => tc[x])) run = () => setTimeout(() => showAllDone(id), 1100);
    }
    return run;
  }

  /* ---------- 紙花：朱紅與米白的紙片落下 ---------- */
  function confetti(count, delay) {
    if (REDUCE) return;
    const c = $("#fx");
    const g = c.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    c.classList.add("on");
    const cols = ["#ff4a1f", "#efece5", "#ff4a1f", "#8f8d86"];
    const parts = Array.from({ length: count }, (_, i) => ({
      x: Math.random() * W, y: -20 - Math.random() * H * 0.4,
      w: 4 + Math.random() * 4, h: 9 + Math.random() * 9,
      vx: (Math.random() - 0.5) * 1.2, vy: 2.2 + Math.random() * 2.6,
      r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.18,
      col: cols[i % cols.length], at: (delay || 0) + Math.random() * 600, ph: Math.random() * 6.3
    }));
    const t0 = performance.now();
    const frame = (now) => {
      const el = now - t0;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      let alive = 0;
      parts.forEach((p) => {
        if (el < p.at) { alive++; return; }
        if (p.y > H + 30) return;
        alive++;
        p.x += p.vx + Math.sin(el / 320 + p.ph) * 0.7; p.y += p.vy; p.r += p.vr;
        g.save();
        g.translate(p.x, p.y); g.rotate(p.r); g.scale(Math.cos(el / 180 + p.ph), 1);
        g.fillStyle = p.col;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      });
      if (alive) nextFrame(frame);
      else { g.clearRect(0, 0, W, H); c.classList.remove("on"); }
    };
    nextFrame(frame);
  }

  /* ---------- 底部面板（蓋章、補蹲、取消、嗆聲、認領） ---------- */
  let sheet = null;
  function openSheet(o) {
    sheet = o;
    const box = $("#shMakeupBox");
    box.checked = !!o.makeupChecked;
    $("#shMakeup").classList.toggle("hidden", o.makeup !== "ok");
    const off = $("#shMakeupOff");
    off.classList.toggle("hidden", !(o.makeup === "used" || o.makeup === "monday"));
    off.textContent = o.makeup === "used" ? "本週補蹲卡已經用掉了" : o.makeup === "monday" ? "週一不能補上週日" : "";
    const inp = $("#shInput");
    inp.classList.toggle("hidden", !o.input);
    if (o.input) { inp.value = o.input.value || ""; inp.placeholder = o.input.placeholder || ""; inp.maxLength = CFG.maxSayLength; }
    $("#shConfirm").classList.toggle("hold", !!o.hold);
    $("#shConfirm").classList.toggle("danger", !!o.danger);
    $("#shCancel").textContent = o.cancel;
    syncSheet();
    const el = $("#sheet");
    el.classList.remove("hidden");
    nextFrame(() => el.classList.add("open"));
    Sfx.whoosh();
  }
  function syncSheet() {
    const o = sheet;
    if (!o) return;
    const mk = $("#shMakeupBox").checked && o.makeup === "ok";
    $("#shTitle").innerHTML = o.titleFn ? o.titleFn(mk) : o.title;
    o.target = mk ? CFG.squats * 2 : CFG.squats;
    $("#shLabel").textContent = o.confirm;
    $("#shCount").textContent = "";
    $("#shConfirm").style.setProperty("--p", 0);
    $("#shHint").classList.add("hidden");
    $("#sheet").classList.toggle("is-makeup", mk);
  }
  function closeSheet() {
    const el = $("#sheet");
    el.classList.remove("open");
    sheet = null;
    setTimeout(() => { if (!sheet) el.classList.add("hidden"); runCeremonies(); maybeReorder(); }, 240);
  }
  function confirmSheet() {
    const o = sheet;
    if (!o) return;
    const val = { text: $("#shInput").value.trim(), makeup: $("#shMakeupBox").checked && o.makeup === "ok" };
    closeSheet();
    o.onConfirm(val);
  }

  /* 按住蓋章：數到 40（補蹲是 80），放手太早就重來 */
  (function holdButton() {
    const btn = $("#shConfirm");
    let t0 = 0, gen = 0, holding = false, ch = null, lastStep = -1;
    const reset = () => {
      gen++; holding = false;
      btn.classList.remove("holding");
      btn.style.setProperty("--p", 0);
      $("#shCount").textContent = "";
    };
    const loop = (g) => (now) => {
      if (g !== gen) return;
      const o = sheet;
      if (!o) { reset(); return; }
      const p = Math.min(1, (now - t0) / HOLD_MS);
      btn.style.setProperty("--p", p.toFixed(3));
      const n = Math.round(p * o.target);
      $("#shCount").textContent = n;
      const step = Math.min(7, Math.floor((n / o.target) * 8));
      if (step !== lastStep) { lastStep = step; if (ch) ch.tick(step); }
      if (p >= 1) {
        holding = false; gen++;
        if (ch) ch.finish();
        Sfx.thump();
        if (navigator.vibrate) navigator.vibrate(30);
        btn.classList.add("fired");
        setTimeout(() => { btn.classList.remove("fired"); reset(); confirmSheet(); }, 170);
        return;
      }
      nextFrame(loop(g));
    };
    btn.addEventListener("pointerdown", (e) => {
      if (!sheet || !sheet.hold || e.button > 0) return;
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (x) {}
      reset();
      holding = true; lastStep = -1; t0 = performance.now();
      ch = Sfx.charge(HOLD_MS);
      btn.classList.add("holding");
      nextFrame(loop(gen));
    });
    const release = () => {
      if (!holding) return;
      const short = performance.now() - t0 < 260;
      if (ch) ch.cancel();
      reset();
      const h = $("#shHint");
      h.classList.remove("shake"); void h.offsetWidth; h.classList.add("shake");
      h.textContent = short ? "要按住喔！" : `按到 ${sheet ? sheet.target : CFG.squats} 才算`;
      h.classList.remove("hidden");
    };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => btn.addEventListener(ev, release));
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      if (!sheet) return;
      if (!sheet.hold) { confirmSheet(); return; }
      if (e.detail === 0) { Sfx.thump(); confirmSheet(); } // 鍵盤操作直接蓋
    });
  })();

  $("#shMakeupBox").addEventListener("change", syncSheet);
  $("#shCancel").addEventListener("click", closeSheet);
  $("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeSheet(); });
  $("#shInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && sheet && !sheet.hold) confirmSheet(); });

  /* ---------- 動作 ---------- */
  function fail(text) { Sfx.nope(); toast(text); }

  function openStamp(id, withMakeup) {
    const mk = S2.makeupStatus(ck(), id, today);
    const existing = (msgs()[today] || {})[id];
    openSheet({
      titleFn: (m) => `深蹲 <b>${m ? CFG.squats * 2 : CFG.squats}</b> 下做完了嗎？`,
      confirm: "按住蓋章", cancel: "還沒啦", hold: true,
      makeup: ["ok", "used", "monday"].indexOf(mk) >= 0 ? mk : null,
      makeupChecked: withMakeup && mk === "ok",
      input: { value: existing ? existing.text : "", placeholder: "順便嗆一句（可不填）" },
      onConfirm: (val) => {
        selfStamp = true;
        const jobs = [store().stamp(today, id, val.makeup)];
        if (val.text) jobs.push(store().say(today, id, val.text));
        else if (existing) jobs.push(store().unsay(today, id));
        afterStamp(id);
        Promise.all(jobs).then(() => pokeOthers(id)).catch(() => { selfStamp = false; stampFlow = false; fail("蓋章失敗，網路好像不太順，再試一次。"); });
      }
    });
  }

  function openMakeupAfter(id) {
    openSheet({
      title: `補昨天的 <b>${CFG.squats}</b> 下做完了嗎？`,
      confirm: "按住補蹲", cancel: "還沒啦", hold: true,
      onConfirm: () => store().markMakeup(today, id).catch(() => fail("補蹲失敗，網路好像不太順，再試一次。"))
    });
  }

  function claimCard(id) {
    if (!authOn()) {
      try { localStorage.setItem(ME_KEY, id); } catch (e) {}
      renderAll();
      return;
    }
    openSheet({
      title: `認領 <b>${esc(name(id))}</b> 的卡？<br>認領後<b>只有這支手機</b>能動這張卡，確定是本人再按。`,
      confirm: "我是本人，認領！", cancel: "先不要",
      onConfirm: () => claimMember(id).then(renderAll).catch(() => fail("認領失敗，網路好像不太順，再試一次。"))
    });
  }
  async function claimMember(id) {
    const uid = await DeviceAuth.uid();
    if (!uid) throw new Error("no uid");
    await store().setMember(id, { name: name(id), role: "founder", claimedBy: uid, ts: { ".sv": "timestamp" } });
    localStorage.setItem(ME_KEY, id);
  }
  function autoClaim() {
    if (autoClaimTried || !authOn() || !fresh) return;
    const id = me();
    if (id && !memberInfo(id)) {
      autoClaimTried = true;
      claimMember(id).then(renderAll).catch(() => { autoClaimTried = false; });
    }
  }

  /* 請推播發送器通知其他人；kind：stamp＝蓋章、say＝改了嗆聲 */
  function pokeOthers(actorId, kind) {
    if (DEMO || !CFG.notifyEndpoint) return;
    fetch(`${CFG.notifyEndpoint.replace(/\/$/, "")}/notify`, { method: "POST", body: JSON.stringify({ actor: actorId, kind: kind || "stamp" }) }).catch(() => {});
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act],[data-claim],[data-reset]");
    if (!t) return;
    const id = me();
    if (t.dataset.claim) { claimCard(t.dataset.claim); return; }
    if (t.dataset.reset) {
      const rid = t.dataset.reset;
      openSheet({
        title: `重設 <b>${esc(name(rid))}</b> 的手機綁定？<br>重設後本人要重新認領（換手機時用）。`,
        confirm: "重設綁定", cancel: "不要", danger: true,
        onConfirm: () => store().setMember(rid, null).catch(() => fail("重設失敗，再試一次。"))
      });
      return;
    }
    const act = t.dataset.act;
    if (!id) return;
    if ((act === "stamp" || act === "undo" || act === "say" || act === "makeup-after" || act === "like") && !canOperate(id)) {
      fail("這張卡已綁定本人的手機，只有本人能蓋章。");
      return;
    }
    if (act === "stamp") openStamp(id, false);
    else if (act === "makeup-after") openMakeupAfter(id);
    else if (act === "fortune") openFortune(t.dataset.date);
    else if (act === "like") {
      const target = t.dataset.target;
      const on = !(((likes()[today] || {})[target]) || {})[id];
      likeBurst = on ? target : null;
      if (on) Sfx.like(); else Sfx.unlike();
      store().like(today, target, id, on).catch(() => { likeBurst = null; fail("愛心送不出去，網路好像不太順，再試一次。"); });
    }
    else if (act === "undo") {
      openSheet({
        title: "要取消今天的蓋章嗎？", confirm: "取消蓋章", cancel: "不要", danger: true,
        onConfirm: () => store().uncheck(today, id).catch(() => fail("取消失敗，網路好像不太順，再試一次。"))
      });
    } else if (act === "say") {
      const existing = (msgs()[today] || {})[id];
      openSheet({
        title: `<b>${esc(name(id))}</b> 的今日嗆聲`, confirm: "送出！", cancel: "算了",
        input: { value: existing ? existing.text : "", placeholder: existing ? "清空送出＝刪掉這句" : "例：今天你們死定了" },
        onConfirm: (val) => {
          const job = val.text ? store().say(today, id, val.text).then(() => pokeOthers(id, "say"))
            : existing ? store().unsay(today, id) : Promise.resolve();
          job.catch(() => fail("嗆聲送不出去，網路好像不太順，再試一次。"));
        }
      });
    } else if (act === "ticket") {
      if (S2.makeupStatus(ck(), id, today) === "ok") (S2.rec(ck(), today, id) ? openMakeupAfter(id) : openStamp(id, true));
    }
  });

  $("#ftClose").addEventListener("click", () => { closeFortune(); setTimeout(runCeremonies, 300); });
  $("#rulesBtn").addEventListener("click", () => showRules(me(), false));

  function renderSoundBtn() {
    const b = $("#soundBtn");
    b.setAttribute("aria-pressed", Sfx.enabled ? "true" : "false");
    b.setAttribute("aria-label", Sfx.enabled ? "音效：開" : "音效：關");
    b.classList.toggle("off", !Sfx.enabled);
  }
  $("#soundBtn").addEventListener("click", () => { Sfx.setEnabled(!Sfx.enabled); renderSoundBtn(); });

  /* ---------- 週報入口 ---------- */
  function renderReport(v) {
    const el = $("#report");
    let wk = 0;
    if (DEMO) wk = v.ph === "post" ? S.weeks : v.ph === "on" ? S2.weekIdx(today) : 0;
    else if (reports && reports.latest) wk = reports.latest.week;
    if (!wk || !v.me) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    el.innerHTML = `<a class="report-link" href="week.html?w=${wk}${DEMO ? "&demo" : ""}"><span>第 ${wk} 週週報出爐</span><i aria-hidden="true">→</i></a>`;
  }

  /* ---------- 推播設定（沿用第一季） ---------- */
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  function urlB64ToBytes(s) {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  function subKey(endpoint) {
    let h = 5381;
    for (let i = 0; i < endpoint.length; i++) h = ((h << 5) + h + endpoint.charCodeAt(i)) >>> 0;
    return "d" + h.toString(16);
  }
  async function renderNotify() {
    const el = $("#notify");
    const id = me();
    if (DEMO || !CFG.vapidPublicKey || store().mode !== "cloud" || !id) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    const body = $("#notifyBody");
    if (!pushSupported()) { body.innerHTML = `<p>要收通知，請先把網頁「加入主畫面」，再從主畫面的圖示開啟這裡設定。</p>`; return; }
    let sub = null;
    try { sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch (e) {}
    if (sub) {
      body.innerHTML = `<p>這支手機已開啟 <b>${esc(name(id))}</b> 的通知 ✓</p><button class="link" type="button" id="notifyOff">關閉通知</button>`;
      $("#notifyOff").onclick = disableNotify;
    } else {
      body.innerHTML = `<p>開啟後，這支手機會收到打卡與嗆聲的即時通知</p><button class="btn-small" type="button" id="notifyOn">開啟通知</button>`;
      $("#notifyOn").onclick = () => enableNotify(id);
    }
  }
  async function enableNotify(id) {
    try {
      if (!canOperate(id)) { fail("只能開啟自己那張卡的通知喔。"); return; }
      if ((await Notification.requestPermission()) !== "granted") { fail("通知權限沒開，去 iPhone 設定裡找到這個 App 打開通知。"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(CFG.vapidPublicKey) });
      await store().saveSub(id, subKey(sub.endpoint), sub.toJSON());
      renderNotify();
    } catch (e) { fail("開啟通知失敗，重新整理後再試一次。"); }
  }
  async function disableNotify() {
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) { store().removeSub(me(), subKey(sub.endpoint)); await sub.unsubscribe(); }
      renderNotify();
    } catch (e) {}
  }

  function renderAdmin() {
    const el = $("#admin");
    if (!iAmAdmin()) { el.classList.add("hidden"); return; }
    const ids = ORDER.filter((id) => id !== "azhong" && memberInfo(id));
    el.classList.toggle("hidden", !ids.length);
    $("#adminBody").innerHTML = ids.map((id) => `<button class="link" type="button" data-reset="${id}">重設 ${esc(name(id))} 的綁定</button>`).join("");
  }

  /* ---------- 重繪 ---------- */
  function captureFlip() {
    const m = {};
    document.querySelectorAll(".team[data-team]").forEach((el) => { m[el.dataset.team] = el.getBoundingClientRect().top; });
    return m;
  }
  function playFlip(before) {
    let moved = false, promoted = false;
    document.querySelectorAll(".team[data-team]").forEach((el) => {
      const b = before[el.dataset.team];
      if (b == null) return;
      const d = b - el.getBoundingClientRect().top;
      if (Math.abs(d) < 2) return;
      moved = true;
      if (REDUCE) return;
      if (d > 0) {
        promoted = true;
        el.style.zIndex = 3;
        /* 抽出來（浮起、往右偏、微轉）→ 插到前面 → 落定；緩動放在每一段，各段時間才看得到 */
        el.animate([
          { transform: `translateY(${d}px)`, boxShadow: "0 0 0 rgba(0,0,0,0)", easing: "cubic-bezier(.3,0,.2,1)" },
          { transform: `translate(18px, ${(d * 0.8).toFixed(1)}px) scale(1.045) rotate(-1.6deg)`, boxShadow: "0 28px 54px rgba(0,0,0,.7)", offset: 0.3, easing: "cubic-bezier(.5,0,.2,1)" },
          { transform: "translate(0, -6px) scale(1.015)", boxShadow: "0 16px 32px rgba(0,0,0,.45)", offset: 0.78, easing: "cubic-bezier(.3,0,.3,1)" },
          { transform: "none", boxShadow: "0 0 0 rgba(0,0,0,0)" }
        ], { duration: 1000, easing: "linear" }).onfinish = () => {
          el.style.zIndex = "";
          el.classList.add("landed");
        };
      } else {
        /* 被擠下去的：先暗一下等前面那張插進來，再滑下去 */
        el.animate([
          { transform: `translateY(${d}px)`, opacity: 1, easing: "ease-in-out" },
          { transform: `translateY(${d}px)`, opacity: 0.45, offset: 0.3, easing: "cubic-bezier(.4,0,.2,1)" },
          { transform: "none", opacity: 0.75, offset: 0.78, easing: "ease-out" },
          { transform: "none", opacity: 1 }
        ], { duration: 1000, easing: "linear" });
      }
    });
    if (promoted) { Sfx.whoosh(); setTimeout(() => Sfx.thump(), 780); }
    else if (moved) Sfx.whoosh();
    return moved;
  }
  function animateCounts() {
    document.querySelectorAll("[data-count]").forEach((el) => {
      const k = el.dataset.count, val = Number(el.dataset.val);
      const prev = prevScore[k];
      prevScore[k] = val;
      if (firstRender || prev == null || prev === val) return;
      el.classList.add(val < prev ? "drop" : "rise");
      countUp(el, prev, val, 700, true);
    });
  }

  let renderLater = false;
  function renderAll() {
    if (Fx.introBusy()) {
      if (!renderLater) { renderLater = true; Fx.afterIntro(() => { renderLater = false; renderAll(); }); }
      return;
    }
    const v = buildView();
    const flips = captureFlip();
    renderHeader(v);
    renderReport(v);
    renderHero(v);
    $("#rulesInline").classList.toggle("hidden", v.ph !== "pre");
    if (v.ph === "pre" && !$("#rulesInline").innerHTML) $("#rulesInline").innerHTML = rulesHTML();
    renderStalls(v);
    renderAdmin();
    renderNotify();
    tickClock();
    playFlip(flips);
    likeBurst = null;
    animateCounts();

    if (!firstRender) {
      const others = ORDER.filter((x) => v.just[x] && x !== v.me);
      if (v.just[v.me]) { if (selfStamp) Sfx.ignite(); else Sfx.otherIgnite(); selfStamp = false; }
      else if (others.length && document.visibilityState === "visible") {
        Sfx.otherIgnite();
        toast(`${esc(name(others[0]))} 蓋章了！今日 ${v.doneCount}/${ORDER.length} 人達成`);
      }
      if (v.fixAnim) setTimeout(() => Sfx.screw(), v.just[v.me] ? 1000 : 120);
      if (v.newLikers.length && document.visibilityState === "visible") {
        Sfx.like();
        toast(`${HEART.replace('class="px-heart"', 'class="px-heart toast-heart"')} ${esc(name(v.newLikers[0]))} 按了你的嗆聲`);
      }
      const wk = Object.values(v.justWeekend);
      if (wk.length) setTimeout(() => { Sfx.weekendDouble(); toast(`${esc(teamName(wk[0]))} 週末雙蹲！`); }, 900);
    }
    if (v.relight) { relightPending = false; Sfx.powerUp(); }
    ORDER.forEach((x) => { prevDone[x] = v.lit[x]; });
    firstRender = false;
    autoClaim();
    runCeremonies();
  }

  /* ---------- 換日、回前景、新版本 ---------- */
  function dayCheck() {
    const k = S2.dateKey();
    if (k === today) return;
    today = k;
    prevDone = {}; prevWeekend = {}; prevFixed = {};
    firstRender = true;
    renderAll();
  }
  let bootVersion = null;
  const fetchVersion = () => fetch("version.json", { cache: "no-store" }).then((r) => r.json()).then((j) => j.v).catch(() => null);
  fetchVersion().then((v) => { bootVersion = v; });
  let lastVis = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    dayCheck();
    if (Date.now() - lastVis < 60000) return;
    lastVis = Date.now();
    store().resync();
    fetchVersion().then((v) => { if (bootVersion && v && v !== bootVersion) location.reload(); });
  });
  setInterval(tickClock, 1000);
  setInterval(dayCheck, 30000);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) maybeReorder(); }, { threshold: 0.3 }).observe($("#stalls"));
  } else {
    window.addEventListener("scroll", maybeReorder, { passive: true });
  }

  /* ---------- 啟動 ---------- */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual"; // 每次打開都從最上面開始
  renderSoundBtn();
  const horoReady = fetch("data/horoscope.json", { cache: "no-cache" }).then((r) => r.json()).then((j) => { horo = j; renderAll(); }).catch(() => {});
  if (!DEMO) fetch("data/reports/index.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { reports = j; if (j) renderAll(); }).catch(() => {});

  /* 先畫骨架（雲端資料還沒到也看得到招牌和攤位），再把「第一次重繪」的資格還回去，避免開頁就把大家當成剛蓋章 */
  renderAll();
  firstRender = true;
  prevDone = {}; prevWeekend = {}; prevFixed = {};

  const dataReady = store().init(renderAll)
    .then(() => { fresh = true; renderAll(); })
    .catch(() => { fresh = true; toast("連不上雲端，先顯示上次的紀錄。恢復連線後重新整理即可。", 5000); renderAll(); });

  /* 入場動態：等資料到（最多 0.9 秒）再印出畫面，免得剛印完又整片重畫 */
  Promise.race([Promise.all([dataReady, horoReady]), new Promise((r) => setTimeout(r, 900))])
    .then(() => Fx.intro(".top > *, #report, #hero > *, #hero .claim-list > li, #rulesInline > *, #rulesInline li, .league > *, #stalls > *, #notify, #admin, .footer"));

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").then(renderNotify).catch(() => {});
  }
})();
