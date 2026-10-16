/* 我的週報（week.html）：本機排程每週一寫好 data/reports/w<週>.json，這頁負責拆信給你看。
   網址：week.html?w=1（不帶 w 就看最新一週）、&p=azhong 可以看別人的、&demo 看範例。 */
(function () {
  const CFG = globalThis.APP_CONFIG;
  const S = CFG.season2;
  const $ = (s) => document.querySelector(s);
  const q = new URLSearchParams(location.search);
  const DEMO = q.has("demo");
  const WD = ["一", "二", "三", "四", "五", "六", "日"];
  const M = {};
  CFG.members.forEach((m) => { M[m.id] = m; });
  const GLYPH = { "牡羊座": "♈", "金牛座": "♉", "雙子座": "♊", "巨蟹座": "♋", "獅子座": "♌", "處女座": "♍", "天秤座": "♎", "天蠍座": "♏", "射手座": "♐", "摩羯座": "♑", "水瓶座": "♒", "雙魚座": "♓" };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const name = (id) => (M[id] ? M[id].name : id);
  const teamName = (t) => t.members.map(name).join("＋");
  const fmt = (n) => (n < 0 ? "−" + Math.abs(n) : String(n));

  let me = q.get("p") || "";
  if (!me) {
    try {
      me = DEMO ? "azhong" : (localStorage.getItem("squat-club-me") || "");
    } catch (e) {}
  }
  if (DEMO) me = "azhong"; // 範例只有阿忠那一份
  if (DEMO) $("#back").href = "s2.html?demo";

  const view = $("#week");
  const getJSON = (url) => fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  function message(html) {
    view.innerHTML = `<div class="wk-empty">${html}</div>`;
  }

  function renderSound() {
    const b = $("#soundBtn");
    b.classList.toggle("off", !Sfx.enabled);
    b.setAttribute("aria-pressed", Sfx.enabled ? "true" : "false");
  }
  $("#soundBtn").addEventListener("click", () => { Sfx.setEnabled(!Sfx.enabled); renderSound(); });
  renderSound();

  async function boot() {
    const index = DEMO ? { weeks: [{ week: 8 }], latest: { week: 8 } } : await getJSON("data/reports/index.json");
    if (!index || !index.latest) {
      message(`<p class="wk-big">第一份週報 ${S2.md(S2.addDays(S.start, 7))}（一）送到</p><p>星座運動顧問看完你上週的打卡，寫一封信給你。週一寫好就推播通知你。</p>`);
      return;
    }
    const w = Number(q.get("w")) || index.latest.week;
    const [rep, horo] = await Promise.all([
      getJSON(DEMO ? "data/reports/sample.json" : `data/reports/w${w}.json`),
      getJSON("data/horoscope.json")
    ]);
    if (!rep) { message(`<p class="wk-big">第 ${w} 週週報還在寫</p><p>週一寫好就推播通知你。</p>`); return; }
    if (!me || !rep.people[me]) {
      message(`<p class="wk-big">第 ${rep.week} 週週報</p><p>要看誰的？</p><ul class="claim-list">${Object.keys(rep.people).map((id) =>
        `<li><a href="?w=${rep.week}&p=${id}">${esc(name(id))}</a></li>`).join("")}</ul>`);
      return;
    }
    render(rep, index, (horo && horo.signs[me]) || "");
  }

  function render(rep, index, sign) {
    const p = rep.people[me];
    const glyph = GLYPH[sign] ? GLYPH[sign] + "\uFE0E" : "";
    const seenKey = `squat-s2-letter-${DEMO ? "demo-" : ""}${rep.week}-${me}`;
    let opened = false;
    try { opened = !!localStorage.getItem(seenKey); } catch (e) {}
    document.title = `深蹲俱樂部｜第 ${rep.week} 週週報`;
    const two = (n) => String(n).padStart(2, "0");
    const dot = (k) => S2.md(k).replace("/", ".");

    const days = p.days.map((st, i) => `<li class="d d-${st === "done" || st === "missed" || st === "fixed" ? st : "future"}"><i></i><span>${WD[i]}</span></li>`).join("");
    const doneDays = p.days.filter((d) => d === "done" || d === "fixed").length;
    const missed = p.days.map((d, i) => (d === "missed" ? "週" + WD[i] : null)).filter(Boolean);
    const teams = rep.teams.map((t) => {
      const T = S.teams.find((x) => x.id === t.id);
      return `<li class="${T.members.indexOf(me) >= 0 ? "mine" : ""}" style="--tint:${T.color}"><span class="rk">${two(t.rank)}</span><span>${esc(teamName(T))}</span><b>${fmt(t.score)}</b></li>`;
    }).join("");
    const chips = (index.weeks || []).length > 1 ? `<nav class="wk-chips">${index.weeks.map((x) =>
      `<a class="${x.week === rep.week ? "on" : ""}" href="?w=${x.week}${q.get("p") ? "&p=" + q.get("p") : ""}">WK ${two(x.week)}</a>`).join("")}</nav>` : "";

    view.innerHTML = `
      <div class="wk-head">
        <p class="kicker">Weekly Report ${two(rep.week)}</p>
        <h1 class="wk-title">第 ${rep.week} 週週報<br>${esc(name(me))}</h1>
        <p class="wk-range">${dot(rep.start)} — ${dot(rep.end)}・${esc(sign)}</p>
        ${rep.sample ? `<p class="wk-sample">${esc(rep.sample)}</p>` : ""}
        ${chips}
      </div>

      <div class="envelope ${opened ? "gone" : ""}" id="env" role="button" aria-label="拆信">
        <div class="env-back"></div>
        <div class="env-letter"><p>${esc(name(me))}　親啟</p></div>
        <div class="env-front"></div>
        <div class="env-flap"></div>
        <span class="env-seal"><span class="seal v" aria-hidden="true"><b>親啟</b></span></span>
        <p class="env-hint">點一下拆信</p>
      </div>

      <div class="wk-body ${opened ? "show" : ""}" id="body">
        <section class="score-card">
          <p class="blk-label">本週成績單</p>
          <div class="big"><b class="${p.score < 0 ? "neg" : ""}">${fmt(p.score)}</b><span>分</span></div>
          <ol class="days days-lg">${days}</ol>
          <dl class="rc-list">
            <div><dt>有蹲</dt><dd>${doneDays} 天</dd></div>
            <div><dt>漏掉</dt><dd>${missed.length ? missed.join("、") : "沒有，全勤"}</dd></div>
            <div><dt>補蹲卡</dt><dd>${p.makeup === "used" ? "已使用" : "未使用"}</dd></div>
          </dl>
          <ol class="rc-teams">${teams}</ol>
        </section>

        <section class="letter">
          <p class="blk-label">顧問的信</p>
          <p class="lt-text">${esc(p.letter)}</p>
          <p class="lt-sign">—— 你的星座運動顧問　${glyph}</p>
        </section>

        <section>
          <p class="blk-label">下週小目標</p>
          <p class="goal-text">${esc(p.goal)}</p>
        </section>

        ${p.whisper ? `<section>
          <p class="blk-label">隊友悄悄話</p>
          <div class="whisper-row"><b>${esc(name(p.whisper.from))}</b><p>「${esc(p.whisper.text)}」</p></div>
        </section>` : ""}
      </div>
      <p class="wk-foot">數字都是真的，星座只是好玩。</p>`;

    const env = $("#env");
    if (env && !opened) env.addEventListener("click", () => {
      if (env.classList.contains("open")) return;
      Sfx.thump();
      env.classList.add("open");
      setTimeout(() => Sfx.unroll(), 380);
      setTimeout(() => {
        env.classList.add("gone");
        $("#body").classList.add("show");
        try { localStorage.setItem(seenKey, "1"); } catch (e) {}
      }, 1250);
    });
  }

  boot();
})();
