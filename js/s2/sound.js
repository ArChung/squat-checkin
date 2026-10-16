/* 第二季音效：全部用 Web Audio 即時合成，不載任何音檔。
   iPhone 靜音鍵打開時不會出聲（ambient）；右上角喇叭可以整個關掉，記在這支手機。 */
(function () {
  const KEY = "squat-s2-sound";
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== "off"; } catch (e) {}
  let ctx = null, master = null, noiseBuf = null;

  try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) {}

  function ac() {
    if (!enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 5;
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /* iOS：第一次觸碰時解鎖音訊 */
  function unlock() {
    const c = ac();
    if (!c) return;
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b; s.connect(c.destination); s.start(0);
    if (c.state === "running") ["pointerdown", "touchend", "keydown"].forEach((ev) => window.removeEventListener(ev, unlock, true));
  }
  ["pointerdown", "touchend", "keydown"].forEach((ev) => window.addEventListener(ev, unlock, true));

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  /* 單音：f→f2 滑音、指數衰減 */
  function tone(o) {
    const c = ac(); if (!c) return null;
    const t0 = c.currentTime + (o.at || 0);
    const osc = c.createOscillator();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + (o.glide || o.d));
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.v || 0.2, t0 + (o.a || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    let node = osc;
    if (o.lp) { const fl = c.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = o.lp; osc.connect(fl); node = fl; }
    node.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + o.d + 0.05);
    return osc;
  }

  /* 雜訊：用濾波器塑形成「啪」「沙」「噗」 */
  function noise(o) {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime + (o.at || 0);
    const src = c.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = o.type || "bandpass";
    fl.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.d);
    fl.Q.value = o.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.v || 0.2, t0 + (o.a || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    src.connect(fl); fl.connect(g); g.connect(master);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + o.d + 0.05);
  }

  /* 柔和的鐘聲：正弦波＋一點泛音，像木琴敲在遠處 */
  const chime = (notes, at, gap, v) => notes.forEach((n, i) => {
    tone({ type: "sine", f: midi(n), d: 0.9, v: v || 0.08, a: 0.01, at: (at || 0) + i * (gap || 0.08) });
    tone({ type: "sine", f: midi(n) * 2.01, d: 0.35, v: (v || 0.08) * 0.25, at: (at || 0) + i * (gap || 0.08) });
  });
  /* 很輕的「嗒」：紙、木頭、按鍵 */
  const tick = (at, v, f) => noise({ type: "bandpass", f: f || 3800, q: 1.4, d: 0.018, v: v || 0.08, at });

  const Sfx = {
    get enabled() { return enabled; },
    setEnabled(on) {
      enabled = !!on;
      try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {}
      if (on) chime([76, 83], 0, 0.09, 0.07);
      else if (ctx) ctx.suspend();
    },

    /* 按鈕鎖定：兩聲很短的數位嗒嗒 */
    tap() {
      tone({ type: "sine", f: 2900, d: 0.028, v: 0.035 });
      tone({ type: "sine", f: 3900, d: 0.03, v: 0.03, at: 0.045 });
      tick(0, 0.04, 5200);
    },
    /* 切片蓋過來（約 0.34 秒）：往上掃的快門聲，每條切片細碎地嗒一下，蓋滿時一記低沉的落定 */
    wipeIn() {
      noise({ type: "bandpass", f: 700, f2: 6000, q: 1.2, d: 0.34, a: 0.06, v: 0.1 });
      tone({ type: "sawtooth", f: 150, f2: 600, d: 0.32, v: 0.035, lp: 1800, a: 0.05 });
      for (let i = 0; i < 6; i++) tick(0.03 + i * 0.045, 0.05 + i * 0.01, 3000 + i * 520);
      tone({ type: "sine", f: 92, f2: 52, d: 0.24, v: 0.32, at: 0.32 });
      noise({ type: "lowpass", f: 700, d: 0.06, v: 0.2, at: 0.32 });
    },
    /* 切片抽走（約 0.42 秒）：往下掃的氣流＋一聲乾淨的數位提示音，新畫面就位 */
    wipeOut() {
      noise({ type: "bandpass", f: 5200, f2: 900, q: 1, d: 0.4, a: 0.03, v: 0.07 });
      tone({ type: "sine", f: midi(88), d: 0.42, v: 0.055, at: 0.16 });
      tone({ type: "sine", f: midi(95), d: 0.55, v: 0.045, at: 0.25 });
    },
    scan() { this.wipeIn(); },
    /* 像素愛心：8-bit 的叮叮叮 */
    like() {
      [88, 93, 100].forEach((n, i) => tone({ type: "square", f: midi(n), d: 0.08, v: 0.035, lp: 4200, at: i * 0.05 }));
    },
    unlike() {
      [93, 86].forEach((n, i) => tone({ type: "square", f: midi(n), d: 0.07, v: 0.03, lp: 3600, at: i * 0.05 }));
    },
    /* 鎖定自己這隊：嗒嗒＋一聲輕鐘 */
    focus() {
      tone({ type: "sine", f: 2600, d: 0.03, v: 0.04 });
      tone({ type: "sine", f: 3500, d: 0.03, v: 0.035, at: 0.06 });
      noise({ type: "bandpass", f: 1500, f2: 4200, q: 0.9, d: 0.5, a: 0.08, v: 0.03, at: 0.05 });
      chime([84, 91], 0.16, 0.1, 0.05);
    },
    whoosh() { noise({ type: "bandpass", f: 500, f2: 1600, q: 0.7, d: 0.26, a: 0.1, v: 0.045 }); },
    nope() { tone({ type: "sine", f: 220, d: 0.12, v: 0.07 }); tone({ type: "sine", f: 175, d: 0.16, v: 0.07, at: 0.1 }); },

    /* 按住蓋章：像機械計數器，一格一格往上 */
    charge(ms) {
      const c = ac();
      let osc = null, g = null;
      if (c) {
        const t0 = c.currentTime;
        osc = c.createOscillator(); osc.type = "sine";
        osc.frequency.setValueAtTime(110, t0);
        osc.frequency.linearRampToValueAtTime(220, t0 + ms / 1000);
        g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.08);
        osc.connect(g); g.connect(master); osc.start(t0);
      }
      const stop = () => {
        if (!osc) return;
        const t = c.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        osc.stop(t + 0.1); osc = null;
      };
      return {
        tick(i) { tick(0, 0.05 + i * 0.008, 2600 + i * 220); },
        cancel() { stop(); tone({ type: "sine", f: 300, f2: 150, d: 0.16, v: 0.05 }); },
        finish() { stop(); }
      };
    },

    /* 印章壓下去：低沉的咚＋紙被拍到的一聲 */
    thump() {
      tone({ type: "sine", f: 120, f2: 46, d: 0.32, v: 0.6 });
      noise({ type: "lowpass", f: 900, d: 0.07, v: 0.4 });
      noise({ type: "bandpass", f: 260, q: 0.8, d: 0.14, v: 0.18 });
    },
    /* 蓋好了：兩聲很輕的鐘 */
    ignite() { chime([79, 86], 0.18, 0.11, 0.07); },
    /* 別人蓋章：遠遠的一聲 */
    otherIgnite() { tick(0, 0.05, 2200); chime([86], 0.04, 0, 0.04); },

    /* 扣分：一記悶響往下沉 */
    burst() {
      tone({ type: "sine", f: 98, f2: 40, d: 0.5, v: 0.55 });
      noise({ type: "lowpass", f: 600, d: 0.12, v: 0.35 });
      tone({ type: "triangle", f: midi(62), f2: midi(55), d: 0.9, v: 0.06, a: 0.03, at: 0.08 });
    },
    flicker() { tick(0, 0.05, 1800); },

    /* 補回來：兩聲嗒＋往上的鐘 */
    screw() { tick(0, 0.08); tick(0.12, 0.08); chime([72, 79, 84], 0.26, 0.08, 0.07); },

    /* 紙：遞出、攤開 */
    poke() { noise({ type: "bandpass", f: 2400, q: 0.8, d: 0.08, v: 0.08 }); },
    unroll() { noise({ type: "bandpass", f: 1400, f2: 3400, q: 0.6, d: 0.4, a: 0.08, v: 0.035 }); },
    star(i) { chime([81 + [0, 2, 4, 7, 9][i % 5]], 0, 0, 0.05); },
    jackpot() { chime([84, 88, 91, 96], 0, 0.07, 0.06); },

    /* 新的一週：七格依序亮起 */
    powerUp() { for (let i = 0; i < 7; i++) tick(i * 0.07, 0.06, 2000 + i * 260); chime([72, 79], 0.55, 0.1, 0.06); },

    /* 結算：越來越快的鼓，揭曉時一個溫暖的和弦 */
    drumroll(sec) {
      let t = 0, gap = 0.22;
      while (t < sec) {
        tone({ type: "sine", f: 92, f2: 60, d: 0.12, v: 0.12 + 0.25 * (t / sec), at: t });
        t += gap; gap = Math.max(0.05, gap * 0.86);
      }
    },
    fanfare() {
      [60, 64, 67, 72].forEach((n) => tone({ type: "triangle", f: midi(n), d: 1.8, v: 0.06, a: 0.04, lp: 2200, at: 0.05 }));
      chime([84, 91], 0.1, 0.12, 0.06);
    },
    countTick() { tick(0, 0.04, 3000); },
    firework() {},
    allDone() { this.thump(); chime([72, 76, 79, 84], 0.25, 0.09, 0.07); },
    weekendDouble() { chime([79, 84], 0, 0.1, 0.06); }
  };

  globalThis.Sfx = Sfx;
})();
