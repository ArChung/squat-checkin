/* 深蹲俱樂部：畫面與互動 */
(function () {
  const CFG = globalThis.APP_CONFIG;
  const $ = (sel) => document.querySelector(sel);

  const WEEK_CH = ["日", "一", "二", "三", "四", "五", "六"];
  const MONTH_CH = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
  const DAY_SHIFT_MS = CFG.dayStartHour * 3600000;
  const FAN_COLORS = ["#7d5ba6", "#5e8f4a", "#a8506e", "#3e7f8a", "#8a6d3b", "#586994", "#9a5b38", "#4f7d6b"];
  const ME_KEY = "squat-club-me";

  /* ---------- 台北時區日期工具（換日點：凌晨 dayStartHour 點） ---------- */
  const fmtKey = new Intl.DateTimeFormat("en-CA", { timeZone: CFG.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const fmtTime = new Intl.DateTimeFormat("zh-TW", { timeZone: CFG.timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
  const fmtHour = new Intl.DateTimeFormat("en-US", { timeZone: CFG.timeZone, hour: "numeric", hour12: false });

  function dateKey(d) { return fmtKey.format(new Date((d ? d.getTime() : Date.now()) - DAY_SHIFT_MS)); }
  function inLateNight() { return Number(fmtHour.format(new Date())) % 24 < CFG.dayStartHour; }

  function keyParts(key) {
    const [y, m, day] = key.split("-").map(Number);
    // 用正午 UTC 避開時區邊界，只拿星期幾
    const wd = new Date(Date.UTC(y, m - 1, day, 12)).getUTCDay();
    return { y, m, day, wd };
  }

  function lastNDays(n) {
    const out = [];
    const now = Date.now();
    for (let i = n - 1; i >= 0; i--) out.push(dateKey(new Date(now - i * 86400000)));
    return out;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------- 身分與權限 ---------- */
  const authOn = () => !!CFG.webApiKey && window.Store.mode === "cloud";
  const myId = () => localStorage.getItem(ME_KEY) || "";
  const memberInfo = (id) => (window.Store.data.members || {})[id];
  const isFounder = (id) => CFG.members.some((f) => f.id === id);

  function claimedByMe(id) {
    const m = memberInfo(id);
    return !!(m && m.claimedBy && m.claimedBy === DeviceAuth.cachedUid());
  }
  /* 卡片能不能被這支裝置操作：未啟用綁定＝老規矩全開放；啟用後＝只有認領裝置 */
  function canOperate(id) {
    if (!authOn()) return true;
    return claimedByMe(id);
  }
  function iAmAdmin() {
    const adm = memberInfo("azhong");
    return authOn() && !!(adm && adm.claimedBy && adm.claimedBy === DeviceAuth.cachedUid());
  }
  function fanColor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return FAN_COLORS[h % FAN_COLORS.length];
  }
  function fanList() {
    const members = window.Store.data.members || {};
    return Object.keys(members)
      .filter((id) => id.indexOf("f_") === 0)
      .sort((a, b) => (members[a].ts || 0) - (members[b].ts || 0));
  }

  /* ---------- 狀態 ---------- */
  let today = dateKey();
  let prevDone = {};   // personId -> bool（用來偵測「剛蓋章」以觸發動畫）
  let firstRender = true;
  let celebrated = false;
  let autoClaimTried = false;

  /* ---------- 印章 SVG ---------- */
  function sealSVG(animate) {
    return `
    <svg class="seal ${animate ? "stamp-in" : ""}" viewBox="0 0 100 100" aria-hidden="true">
      <g fill="none" stroke="var(--seal)">
        <circle cx="50" cy="50" r="45" stroke-width="5"/>
        <circle cx="50" cy="50" r="36.5" stroke-width="1.8"/>
      </g>
      <text x="50" y="46" text-anchor="middle" font-family="LXGW WenKai TC, serif" font-weight="700"
            font-size="27" fill="var(--seal)" letter-spacing="1">達成</text>
      <text x="50" y="70" text-anchor="middle" font-family="Anton, sans-serif"
            font-size="13" fill="var(--seal)" letter-spacing="2">SQUAT!</text>
    </svg>`;
  }

  function splats() {
    let html = "";
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + Math.random();
      const dist = 46 + Math.random() * 26;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
      html += `<span class="splat" style="--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px"></span>`;
    }
    return html;
  }

  /* ---------- 報頭日期 ---------- */
  function renderMasthead() {
    const p = keyParts(today);
    $("#dateNum").textContent = p.day;
    $("#dateMonth").textContent = MONTH_CH[p.m - 1];
    $("#dateWeek").textContent = "星期" + WEEK_CH[p.wd];
    $("#lateNote").classList.toggle("hidden", !inLateNight());
    const hasPushups = CFG.members.some((m) => m.pushups);
    $("#goalText").textContent = `深蹲 ${CFG.squats} 下` +
      (hasPushups ? `・男子組加碼伏地挺身 ${CFG.pushupsCount} 下` : "");
  }

  /* ---------- 卡片（創始成員＋我自己的粉絲卡） ---------- */
  function cardHTML(id, name, accent, opts) {
    const data = window.Store.data;
    const rec = (data.checkins[today] || {})[id];
    const done = !!rec;
    const justStamped = !firstRender && done && !prevDone[id];
    const msg = opts.withBubble ? (data.messages[today] || {})[id] : null;
    const mem = memberInfo(id);
    const operable = canOperate(id);
    const showClaim = authOn() && opts.isFounder && !mem && !myId();
    const showReset = iAmAdmin() && opts.isFounder && mem && !claimedByMe(id);

    return `
      <article class="card" data-card="${id}" style="--accent:${accent}">
        <div class="name-rail">${esc(name)}</div>
        <div class="card-main">
          ${opts.withBubble ? `
          <button class="bubble ${msg ? "" : "bubble-empty"} ${(!authOn() || claimedByMe(id)) ? "" : "bubble-locked"}" data-say="${id}"
                  aria-label="${msg ? "編輯" + esc(name) + "的嗆聲" : "幫" + esc(name) + "嗆一句"}">${
            msg ? `${esc(msg.text)}<span class="bubble-ts">${fmtTime.format(new Date(msg.ts))}</span>` : "嗆一句⋯"
          }</button>` : ""}
          <div class="req">
            <span class="chip">深蹲<b>${CFG.squats}</b></span>
            ${opts.pushups ? `<span class="chip extra">伏地挺身<b>${CFG.pushupsCount}</b></span>` : ""}
          </div>
          ${done ? "" : `<div class="status">尚未打卡</div>`}
          ${showClaim ? `<button class="undo" data-claim="${id}">認領這張卡（綁定這支手機）</button>` : ""}
          ${showReset ? `<button class="undo" data-reset="${id}">團主：重設綁定</button>` : ""}
          ${done && operable ? `<button class="undo" data-undo="${id}">蓋錯了？取消打卡</button>` : ""}
        </div>
        <button class="stamp-zone ${justStamped ? "splashing" : ""}" data-stamp="${id}"
                aria-label="${done ? esc(name) + " 今日已完成" : "幫" + esc(name) + "蓋章打卡"}">
          ${done
            ? sealSVG(justStamped) + (justStamped ? splats() : "")
            : `<span class="stamp-empty"><span class="tap">蓋章</span><span class="hint">按此打卡</span></span>`}
        </button>
        ${done ? `<span class="done-time"><b>${fmtTime.format(new Date(rec.ts))}</b> 蓋章</span>` : ""}
      </article>`;
  }

  function renderCards() {
    const wrap = $("#cards");
    let html = "";
    CFG.members.forEach((m) => {
      html += cardHTML(m.id, m.name, m.accent, { withBubble: true, pushups: m.pushups, isFounder: true });
    });
    const me = myId();
    if (me && me.indexOf("f_") === 0 && memberInfo(me)) {
      html += cardHTML(me, memberInfo(me).name, fanColor(me), { withBubble: false, pushups: false, isFounder: false });
    }
    wrap.innerHTML = html;

    const todayCk = window.Store.data.checkins[today] || {};
    [...wrap.querySelectorAll("[data-card]")].forEach((card) => {
      const id = card.dataset.card;
      const done = !!todayCk[id];
      if (!firstRender && done && !prevDone[id]) {
        card.classList.add("thud");
        if (navigator.vibrate) navigator.vibrate(35);
      }
      prevDone[id] = done;
    });
  }

  /* ---------- 鄉民區（其他粉絲的壓縮列） ---------- */
  function renderFans() {
    const fans = fanList().filter((id) => id !== myId());
    const on = authOn();
    $("#joinBtn").classList.toggle("hidden", !on || !!myId());
    $("#fansSection").classList.toggle("hidden", !on || fans.length === 0);
    if (!on || !fans.length) return;

    const members = window.Store.data.members;
    const todayCk = window.Store.data.checkins[today] || {};
    $("#fanRows").innerHTML = fans.map((id) => {
      const rec = todayCk[id];
      return `
      <div class="fan-row">
        <i class="fan-dot" style="background:${fanColor(id)}"></i>
        <span class="fan-name">${esc(members[id].name)}</span>
        ${rec
          ? `<span class="fan-state done">✓ <b>${fmtTime.format(new Date(rec.ts))}</b></span>`
          : `<span class="fan-state">今日未蹲</span>`}
        ${iAmAdmin() ? `<button class="kick" data-kick="${id}">移除</button>` : ""}
      </div>`;
    }).join("");
  }

  /* ---------- 本週戰績（創始成員） ---------- */
  function renderWeek(data) {
    const grid = $("#weekGrid");
    const days = lastNDays(7);
    let html = `<span class="wk-corner"></span>`;
    days.forEach((k) => {
      const p = keyParts(k);
      html += `<span class="wk-day ${k === today ? "today" : ""}" role="columnheader">${WEEK_CH[p.wd]}<b>${p.day}</b></span>`;
    });
    const rows = CFG.members.map((m) => ({ id: m.id, name: m.name, accent: m.accent }));
    const me = myId();
    if (me && me.indexOf("f_") === 0 && memberInfo(me)) {
      rows.push({ id: me, name: memberInfo(me).name, accent: fanColor(me) });
    }
    rows.forEach((m) => {
      html += `<span class="wk-name" style="--accent:${m.accent}"><i></i>${esc(m.name)}</span>`;
      days.forEach((k) => {
        const on = !!(data.checkins[k] && data.checkins[k][m.id]);
        html += `<span class="dot ${on ? "on" : ""} ${k === today && !on ? "today-col" : ""}"></span>`;
      });
    });
    grid.innerHTML = html;
  }

  /* ---------- 全員達成（創始成員） ---------- */
  function renderAllDone(data) {
    const todayCk = data.checkins[today] || {};
    const count = CFG.members.filter((m) => todayCk[m.id]).length;
    const all = count === CFG.members.length;
    $("#allDone").classList.toggle("hidden", !all);
    if (all && !firstRender && !celebrated) { celebrated = true; confetti(); }
    if (!all) celebrated = false;
  }

  function confetti() {
    const box = $("#confetti");
    const colors = ["#c8412f", "#d9a441", "#2f6f5e", "#4a6fa5", "#262119"];
    let html = "";
    for (let i = 0; i < 64; i++) {
      html += `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * .7).toFixed(2)}s;animation-duration:${(2 + Math.random() * 1.4).toFixed(2)}s"></i>`;
    }
    box.innerHTML = html;
    setTimeout(() => { box.innerHTML = ""; }, 4200);
  }

  /* ---------- 底部確認面板 ---------- */
  function openSheet(opts) {
    $("#sheetTitle").innerHTML = opts.title;
    $("#sheetConfirm").textContent = opts.confirmText;
    $("#sheetCancel").textContent = opts.cancelText;
    const input = $("#sheetInput");
    input.classList.toggle("hidden", !opts.withInput);
    if (opts.withInput) {
      input.value = opts.inputValue || "";
      input.placeholder = opts.placeholder || "";
      input.maxLength = opts.maxLength || CFG.maxSayLength;
    }
    $("#sheetOverlay").classList.remove("hidden");
    if (opts.withInput) setTimeout(() => input.focus(), 60);
    $("#sheetConfirm").onclick = () => {
      closeSheet();
      opts.onConfirm(opts.withInput ? input.value.trim() : undefined);
    };
    input.onkeydown = (e) => { if (e.key === "Enter") $("#sheetConfirm").click(); };
  }
  function closeSheet() { $("#sheetOverlay").classList.add("hidden"); }

  /* ---------- 提示橫幅 ---------- */
  function showBanner(text, isError) {
    const b = $("#modeBanner");
    b.textContent = text;
    b.classList.toggle("error", !!isError);
    b.classList.remove("hidden");
  }
  let errTimer;
  function flashError(text) {
    const wasLocal = window.Store.mode === "local";
    showBanner(text, true);
    clearTimeout(errTimer);
    errTimer = setTimeout(() => {
      if (wasLocal) showLocalBanner(); else $("#modeBanner").classList.add("hidden");
    }, 4000);
  }
  function showLocalBanner() {
    showBanner("試用模式：打卡只會存在這支手機裡，還看不到彼此。接上雲端後全員互通。");
  }

  /* ---------- 認領／加入 ---------- */
  async function claimMember(id, name, role) {
    const uid = await DeviceAuth.uid();
    if (!uid) throw new Error("no uid");
    await window.Store.setMember(id, { name: name, role: role, claimedBy: uid, ts: { ".sv": "timestamp" } });
    localStorage.setItem(ME_KEY, id);
  }

  function openClaimSheet(id, andThenStamp) {
    const f = CFG.members.find((x) => x.id === id);
    openSheet({
      title: `認領 <b>${f.name}</b> 的卡？<br>認領後<b>只有這支手機</b>能動這張卡，確定是本人再按。`,
      confirmText: "我是本人，認領！",
      cancelText: "先不要",
      onConfirm: () => {
        claimMember(id, f.name, "founder")
          .then(() => { renderAll(); if (andThenStamp) openStampSheet(id); })
          .catch(() => flashError("認領失敗，網路好像不太順，再試一次。"));
      }
    });
  }

  function openStampSheet(id) {
    const f = CFG.members.find((x) => x.id === id);
    const mem = memberInfo(id);
    const name = f ? f.name : (mem ? mem.name : "");
    const task = f && f.pushups
      ? `深蹲 ${CFG.squats} 下＋伏地挺身 ${CFG.pushupsCount} 下`
      : `深蹲 ${CFG.squats} 下`;
    openSheet({
      title: `<b>${esc(name)}</b>｜${task}<br>都做完了嗎？`,
      confirmText: "完成，蓋章！",
      cancelText: "還沒啦",
      onConfirm: () => window.Store.checkin(today, id)
        .then(() => pokeOthers(id))
        .catch(() => flashError("蓋章失敗，網路好像不太順，再試一次。"))
    });
  }

  /* ---------- 互動 ---------- */
  document.addEventListener("click", (e) => {
    const stampBtn = e.target.closest("[data-stamp]");
    const undoBtn = e.target.closest("[data-undo]");
    const sayBtn = e.target.closest("[data-say]");
    const claimBtn = e.target.closest("[data-claim]");
    const kickBtn = e.target.closest("[data-kick]");
    const resetBtn = e.target.closest("[data-reset]");
    const notifyBtn = e.target.closest("[data-notify]");

    if (stampBtn) {
      const id = stampBtn.dataset.stamp;
      if ((window.Store.data.checkins[today] || {})[id]) return; // 已蓋章
      if (authOn()) {
        const mem = memberInfo(id);
        if (!mem && isFounder(id)) {
          if (myId()) { flashError("這支手機已經有自己的卡囉。"); return; }
          openClaimSheet(id, true);
          return;
        }
        if (!canOperate(id)) { flashError("這張卡已綁定本人的手機，只有本人能蓋章。"); return; }
      }
      openStampSheet(id);
    }

    if (undoBtn) {
      const id = undoBtn.dataset.undo;
      if (authOn() && !canOperate(id)) return;
      const mem = memberInfo(id);
      const f = CFG.members.find((x) => x.id === id);
      const name = f ? f.name : (mem ? mem.name : "");
      openSheet({
        title: `要取消 <b>${esc(name)}</b> 今天的打卡嗎？`,
        confirmText: "取消打卡",
        cancelText: "不要，保留",
        onConfirm: () => window.Store.uncheck(today, id).catch(() => flashError("取消失敗，網路好像不太順，再試一次。"))
      });
    }

    if (sayBtn) {
      const id = sayBtn.dataset.say;
      if (authOn() && !canOperate(id)) { flashError("嗆聲只有本人能發，這張卡已綁定本人的手機。"); return; }
      const f = CFG.members.find((x) => x.id === id);
      const existing = (window.Store.data.messages[today] || {})[id];
      openSheet({
        title: `<b>${f.name}</b> 的今日嗆聲`,
        confirmText: "送出！",
        cancelText: "算了",
        withInput: true,
        inputValue: existing ? existing.text : "",
        placeholder: existing ? "清空送出＝刪掉這句" : "例：今天你們死定了",
        onConfirm: (text) => {
          const act = text
            ? window.Store.say(today, id, text).then(() => pokeOthers(id))
            : (existing ? window.Store.unsay(today, id) : Promise.resolve());
          act.catch(() => flashError("嗆聲送不出去，網路好像不太順，再試一次。"));
        }
      });
    }

    if (claimBtn) openClaimSheet(claimBtn.dataset.claim, false);

    if (kickBtn) {
      const id = kickBtn.dataset.kick;
      const mem = memberInfo(id);
      openSheet({
        title: `把 <b>${esc(mem ? mem.name : "")}</b> 移出打卡團？`,
        confirmText: "移除",
        cancelText: "不要",
        onConfirm: () => window.Store.setMember(id, null).catch(() => flashError("移除失敗，再試一次。"))
      });
    }

    if (resetBtn) {
      const id = resetBtn.dataset.reset;
      const f = CFG.members.find((x) => x.id === id);
      openSheet({
        title: `重設 <b>${f.name}</b> 的手機綁定？<br>重設後本人要重新認領（換手機時用）。`,
        confirmText: "重設綁定",
        cancelText: "不要",
        onConfirm: () => window.Store.setMember(id, null).catch(() => flashError("重設失敗，再試一次。"))
      });
    }

    if (notifyBtn) enableNotify(notifyBtn.dataset.notify);
  });

  $("#joinBtn").addEventListener("click", () => {
    openSheet({
      title: `加入一起蹲！<br>取個名字，你會有自己的卡（只有這支手機能動）。`,
      confirmText: "加入！",
      cancelText: "再想想",
      withInput: true,
      placeholder: "你的暱稱（12 字內）",
      maxLength: 12,
      onConfirm: (name) => {
        if (!name) { flashError("要取個名字才能加入喔。"); return; }
        const fanId = "f_" + Math.random().toString(36).slice(2, 10);
        claimMember(fanId, name, "fan")
          .then(renderAll)
          .catch(() => flashError("加入失敗，網路好像不太順，再試一次。"));
      }
    });
  });

  $("#sheetCancel").addEventListener("click", closeSheet);
  $("#sheetOverlay").addEventListener("click", (e) => { if (e.target.id === "sheetOverlay") closeSheet(); });

  /* 阿忠與小白的裝置已在通知設定選過身分：資料一到就自動認領，無感升級 */
  function autoClaim() {
    if (autoClaimTried || !authOn() || firstRender) return;
    const me = myId();
    if (me && isFounder(me) && !memberInfo(me)) {
      autoClaimTried = true;
      const f = CFG.members.find((x) => x.id === me);
      claimMember(me, f.name, "founder").then(renderAll).catch(() => { autoClaimTried = false; });
    }
  }

  /* ---------- 推播通知 ---------- */
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
    if (!CFG.vapidPublicKey || window.Store.mode === "local") return;
    $("#notifySection").classList.remove("hidden");
    const names = $("#notifyNames");
    const state = $("#notifyState");
    const hint = $("#notifyHint");
    const me = myId();

    if (!pushSupported()) {
      hint.textContent = "要收通知，請先把網頁「加入主畫面」，再從主畫面的圖示開啟這裡設定。";
      hint.classList.remove("hidden");
      names.innerHTML = "";
      state.classList.add("hidden");
      return;
    }

    let sub = null;
    try {
      const reg = await navigator.serviceWorker.ready;
      sub = await reg.pushManager.getSubscription();
    } catch (e) {}

    if (sub && me && memberInfo(me)) {
      names.innerHTML = "";
      state.classList.remove("hidden");
      state.innerHTML = `這支手機已開啟 <b>${esc(memberInfo(me).name)}</b> 的通知 ✓
        <button class="notify-off" id="notifyOff">關閉通知</button>`;
      $("#notifyOff").onclick = disableNotify;
      hint.classList.add("hidden");
      return;
    }

    state.classList.add("hidden");
    hint.classList.remove("hidden");
    if (!authOn()) {
      /* 尚未啟用裝置綁定：維持四人選單 */
      hint.textContent = "點自己的名字，這支手機就會收到大家的打卡與嗆聲通知";
      names.innerHTML = CFG.members.map((m) =>
        `<button class="notify-name" style="--accent:${m.accent}" data-notify="${m.id}">我是${m.name}</button>`
      ).join("");
      return;
    }
    if (me && memberInfo(me)) {
      hint.textContent = "開啟後，這支手機會收到打卡與嗆聲的即時通知";
      names.innerHTML = `<button class="notify-name notify-single" data-notify="${me}">🔔 開啟通知</button>`;
    } else {
      hint.textContent = "先認領你的卡（或按上面的加入），就能開啟通知";
      names.innerHTML = "";
    }
  }

  async function enableNotify(personId) {
    try {
      if (authOn() && !canOperate(personId)) { flashError("只能開啟自己那張卡的通知喔。"); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { flashError("通知權限沒開，去 iPhone 設定裡找到這個 App 打開通知。"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToBytes(CFG.vapidPublicKey)
      });
      await window.Store.saveSub(personId, subKey(sub.endpoint), sub.toJSON());
      localStorage.setItem(ME_KEY, personId);
      renderNotify();
    } catch (e) {
      flashError("開啟通知失敗，重新整理後再試一次。");
    }
  }

  async function disableNotify() {
    try {
      const me = myId();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        if (me) window.Store.removeSub(me, subKey(sub.endpoint));
        await sub.unsubscribe();
      }
      renderNotify();
    } catch (e) {}
  }

  /* 打卡／嗆聲成功後，請 Worker 推播給其他人（只有創始成員的動作會推播） */
  function pokeOthers(actorId) {
    if (!CFG.notifyEndpoint || !isFounder(actorId)) return;
    fetch(`${CFG.notifyEndpoint.replace(/\/$/, "")}/notify`, {
      method: "POST",
      body: JSON.stringify({ actor: actorId })
    }).catch(() => {});
  }

  /* ---------- 回前景：資料重新同步＋檢查新版本 ---------- */
  let bootVersion = null;
  async function fetchVersion() {
    try { return (await (await fetch("version.json", { cache: "no-store" })).json()).v; }
    catch (e) { return null; }
  }
  fetchVersion().then((v) => { bootVersion = v; });

  let lastVisCheck = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const nk = dateKey();
    if (nk !== today) {
      today = nk; prevDone = {}; firstRender = true; celebrated = false;
      renderAll();
    }
    if (Date.now() - lastVisCheck < 60000) return;
    lastVisCheck = Date.now();
    window.Store.resync();
    fetchVersion().then((v) => {
      if (bootVersion && v && v !== bootVersion) location.reload();
    });
  });

  /* ---------- 重繪 ---------- */
  function renderAll() {
    const data = window.Store.data;
    renderMasthead();
    renderCards();
    renderFans();
    renderWeek(data);
    renderAllDone(data);
    firstRender = false;
    autoClaim();
    renderNotify();
  }

  /* 跨日自動翻頁（凌晨三點）＋深夜提示更新 */
  setInterval(() => {
    const now = dateKey();
    if (now !== today) {
      today = now;
      prevDone = {};
      firstRender = true;
      celebrated = false;
      renderAll();
    } else {
      $("#lateNote").classList.toggle("hidden", !inLateNight());
    }
  }, 30000);

  /* ---------- 啟動 ---------- */
  renderMasthead();
  if (window.Store.mode === "local") showLocalBanner();

  window.Store.init(renderAll).catch(() => {
    flashError("連不上雲端，先顯示上次的紀錄。恢復連線後重新整理即可。");
    renderAll();
  });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").then(renderNotify).catch(() => {});
  } else {
    renderNotify();
  }
})();
