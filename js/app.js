(function () {
  "use strict";

  /* ============ helpers & constants ============ */
  const $ = (id) => document.getElementById(id);
  const KG_TO_LB = 2.20462, CM_PER_IN = 2.54;
  const SCALE_MIN = 12, SCALE_MAX = 45;
  const LIM = { h: [100, 220], w: [20, 200], wa: [40, 200], age: [5, 100] }; // หน่วย metric
  const STORE = "bmi-state-v1";
  const ACT = [1.2, 1.375, 1.55, 1.725, 1.9];
  const RATES = [0.25, 0.5, 0.75, 1]; // kg / สัปดาห์
  const STANDARDS = {
    asia: { cuts: [18.5, 23, 25, 30], normalMax: 22.9 },
    who: { cuts: [18.5, 25, 30, 35, 40], normalMax: 24.9 },
  };
  const svg = (d) => `<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    flag: svg('<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>'),
    check: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
  };
  const r1 = (x) => Math.round(x * 10) / 10;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ============ state ============ */
  function newProfile(name) {
    return { id: uid(), name: name || "Me", h: 170, w: 65, sex: null, age: null, waist: null, act: 1, goal: null, history: [] };
  }
  function defaults() {
    const p = newProfile(I18N.th.pDefault);
    return { v: 1, lang: "th", std: "asia", unit: "metric", sound: false, active: p.id, profiles: [p] };
  }
  function sanitizeProfile(p) {
    const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== "" ? +v : d);
    const g = p.goal && Number.isFinite(+p.goal.target) ? {
      target: +p.goal.target, start: num(p.goal.start, +p.goal.target), startT: num(p.goal.startT, Date.now()),
      rate: RATES.includes(+p.goal.rate) ? +p.goal.rate : 0.5, done: !!p.goal.done,
    } : null;
    return {
      id: String(p.id || uid()), name: String(p.name || "Me").slice(0, 40),
      h: clamp(num(p.h, 170), ...LIM.h), w: clamp(num(p.w, 65), ...LIM.w),
      sex: p.sex === "m" || p.sex === "f" ? p.sex : null,
      age: p.age == null ? null : clamp(num(p.age, 30), ...LIM.age),
      waist: p.waist == null ? null : clamp(num(p.waist, 80), ...LIM.wa),
      act: clamp(Math.round(num(p.act, 1)), 0, 4), goal: g,
      history: (Array.isArray(p.history) ? p.history : [])
        .filter((e) => e && Number.isFinite(+e.t) && Number.isFinite(+e.w) && Number.isFinite(+e.h))
        .map((e) => ({ t: +e.t, h: +e.h, w: +e.w, waist: e.waist == null ? null : +e.waist, bmi: +e.bmi || +e.w / Math.pow(+e.h / 100, 2) }))
        .slice(-500),
    };
  }
  function normalizeState(s) {
    const d = defaults();
    if (!s || !Array.isArray(s.profiles) || !s.profiles.length) return d;
    const profiles = s.profiles.map(sanitizeProfile);
    return {
      v: 1, lang: s.lang === "en" ? "en" : "th", std: STANDARDS[s.std] ? s.std : "asia",
      unit: s.unit === "imperial" ? "imperial" : "metric", sound: !!s.sound,
      active: profiles.some((p) => p.id === s.active) ? s.active : profiles[0].id, profiles,
    };
  }
  function load() {
    try { return normalizeState(JSON.parse(localStorage.getItem(STORE))); } catch { return defaults(); }
  }
  let state = load();
  let saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }, 150);
  }
  const profile = () => state.profiles.find((p) => p.id === state.active) || state.profiles[0];
  // กันข้อมูลหายถ้าปิดแท็บก่อนครบเวลาหน่วง
  function flush() { clearTimeout(saveTimer); try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

  /* ============ i18n ============ */
  const L = () => I18N[state.lang];
  function t(path, vars) {
    let v = path.split(".").reduce((o, k) => (o == null ? o : o[k]), L());
    if (typeof v === "string" && vars) v = v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ""));
    return v == null ? path : v;
  }
  function applyLang() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    document.querySelectorAll("[data-i18n-title]").forEach((el) => (el.title = t(el.dataset.i18nTitle)));
    document.querySelectorAll("#langSeg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.lang === state.lang));
    $("guideBody").innerHTML = t("guide").map((s) => `<li><b>${s.t}</b><span>${s.d}</span></li>`).join("");
    $("act").innerHTML = t("act").map((n, i) => `<option value="${i}">${n}</option>`).join("");
    $("act").value = profile().act;
    buildRateOptions();
  }

  /* ============ units ============ */
  const isMetric = () => state.unit === "metric";
  const toDisp = (k, v) => (isMetric() ? v : k === "w" ? v * KG_TO_LB : v / CM_PER_IN);
  const fromDisp = (k, v) => (isMetric() ? v : k === "w" ? v / KG_TO_LB : v * CM_PER_IN);
  const unitOf = (k) => (k === "w" ? (isMetric() ? "kg" : "lb") : isMetric() ? "cm" : "in");
  const F = { h: $("height"), w: $("weight"), wa: $("waist") };
  const R = { h: $("heightRange"), w: $("weightRange") };

  function setField(k, metric) {
    if (metric == null) { F[k].value = ""; return; }
    F[k].value = r1(toDisp(k, metric));
    if (R[k]) R[k].value = F[k].value;
  }
  function setRanges() {
    ["h", "w"].forEach((k) => {
      R[k].min = Math.ceil(toDisp(k, LIM[k][0]));
      R[k].max = Math.floor(toDisp(k, LIM[k][1]));
      R[k].step = 0.5;
    });
    $("hUnit").textContent = unitOf("h");
    $("wUnit").textContent = unitOf("w");
    $("waUnit").textContent = unitOf("wa");
    $("gUnit").textContent = unitOf("w");
    document.querySelectorAll("#unitSeg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.unit === state.unit));
  }
  function buildRateOptions() {
    const cur = $("gRate").value;
    $("gRate").innerHTML = RATES.map((v) => `<option value="${v}">${r1(toDisp("w", v))} ${unitOf("w")}/${t("wk")}</option>`).join("");
    $("gRate").value = cur || (profile().goal ? profile().goal.rate : 0.5);
  }
  function fillForm() {
    const p = profile();
    setRanges();
    setField("h", p.h); setField("w", p.w); setField("wa", p.waist);
    $("age").value = p.age == null ? "" : p.age;
    $("act").value = p.act;
    document.querySelectorAll("#sexSeg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.sex === p.sex));
    $("gTarget").value = p.goal ? r1(toDisp("w", p.goal.target)) : "";
    $("gRate").value = p.goal ? p.goal.rate : 0.5;
    if (p.sex || p.age != null || p.waist != null) $("more").open = true;
    lastIdx = null;
  }

  /* ============ form reading ============ */
  let cur = null; // { h, w, hm, kg, bmi } เป็น metric
  function setErr(id, inputEl, msg) { $(id).textContent = msg || ""; if (inputEl) inputEl.classList.toggle("bad", !!msg); }
  function rangeMsg(name, k) {
    const lim = LIM[k];
    return t("eRange", { n: name, a: Math.ceil(toDisp(k, lim[0])), b: Math.floor(toDisp(k, lim[1])), u: unitOf(k) });
  }
  function readForm() {
    const p = profile();
    const num = (el) => (el.value === "" ? NaN : parseFloat(el.value));

    const read = (k, el, errId, name, required) => {
      setErr(errId, el, "");
      const v = num(el);
      if (isNaN(v)) { if (required) setErr(errId, el, t("eEnter", { n: name })); return null; }
      const m = fromDisp(k, v);
      if (!(m >= LIM[k][0] && m <= LIM[k][1])) { setErr(errId, el, rangeMsg(name, k)); return null; }
      return m;
    };
    const h = read("h", F.h, "hErr", t("height"), true);
    const w = read("w", F.w, "wErr", t("weight"), true);
    // เขียนทับค่าที่เก็บไว้ก็ต่อเมื่อผู้ใช้แก้จริง (กันค่าคลาดเคลื่อนจากการปัดเศษตอนสลับหน่วย)
    const changed = (k, m, stored) => stored == null || r1(toDisp(k, m)) !== r1(toDisp(k, stored));
    if (h != null && changed("h", h, p.h)) p.h = h;
    if (w != null && changed("w", w, p.w)) p.w = w;

    // ไม่บังคับ
    if (F.wa.value === "") { p.waist = null; setErr("waErr", F.wa, ""); }
    else { const wa = read("wa", F.wa, "waErr", t("waist"), false); if (wa != null && changed("wa", wa, p.waist)) p.waist = wa; }

    const ageEl = $("age");
    if (ageEl.value === "") { p.age = null; setErr("aErr", ageEl, ""); }
    else {
      const a = parseFloat(ageEl.value);
      if (a >= LIM.age[0] && a <= LIM.age[1]) { p.age = Math.round(a); setErr("aErr", ageEl, ""); }
      else setErr("aErr", ageEl, t("eRange", { n: t("age"), a: LIM.age[0], b: LIM.age[1], u: t("ageU") }));
    }
    persist();

    if (h == null || w == null) return null;
    const hm = p.h / 100;
    return { h: p.h, w: p.w, hm, kg: p.w, bmi: p.w / (hm * hm) };
  }

  /* ============ standards / categories ============ */
  const S = () => STANDARDS[state.std];
  const names = () => t("cat." + state.std);
  const catIdx = (bmi) => { const i = S().cuts.findIndex((c) => bmi < c); return i === -1 ? S().cuts.length : i; };
  const catColor = (i) => `var(--c${i + 1})`;
  const fmtRange = (i) => {
    const c = S().cuts;
    if (i === 0) return `< ${c[0]}`;
    if (i === c.length) return `≥ ${c[c.length - 1]}`;
    return `${c[i - 1]} – ${r1(c[i] - 0.1)}`;
  };

  function buildScale() {
    const cuts = S().cuts, edges = [SCALE_MIN, ...cuts, SCALE_MAX], nm = names();
    $("segs").innerHTML = nm.map((_, i) => `<i style="flex:${edges[i + 1] - edges[i]};background:${catColor(i)}"></i>`).join("");
    $("ticks").innerHTML = cuts.map((c) => `<span style="left:${((c - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100}%">${c}</span>`).join("");
    $("legend").innerHTML = nm.map((n, i) => `<li data-cat="${i}"><i style="background:${catColor(i)}"></i><span>${n}</span><b>${fmtRange(i)}</b></li>`).join("");
    document.querySelectorAll("#stdSeg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.std === state.std));
  }

  /* ============ result ============ */
  let shown = 0, anim, lastIdx = null, lastCelebrate = 0;
  function animateTo(target) {
    cancelAnimationFrame(anim);
    const from = shown, t0 = performance.now(), dur = 700;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      shown = from + (target - from) * e;
      $("bmiVal").textContent = shown.toFixed(1);
      if (p < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  const wUnit = () => unitOf("w");
  const fmtW = (kg) => `${r1(toDisp("w", kg))} ${wUnit()}`;
  const fmtH = (cm) => `${r1(toDisp("h", cm))} ${unitOf("h")}`;

  function renderResult() {
    $("empty").classList.toggle("hidden", !!cur);
    $("out").classList.toggle("hidden", !cur);
    $("saveBtn").disabled = !cur;
    $("shareBtn").disabled = !cur;
    if (!cur) { lastIdx = null; return; }

    const idx = catIdx(cur.bmi), std = S(), p = profile();
    document.documentElement.style.setProperty("--cat", catColor(idx));
    if ($("badge").textContent !== names()[idx]) $("badge").textContent = names()[idx]; // ไม่ให้ screen reader อ่านซ้ำ
    $("advice").textContent = t("tip." + state.std)[idx];
    $("childWarn").classList.toggle("hidden", !(p.age != null && p.age < 18));
    document.querySelectorAll("#legend li").forEach((li) => li.classList.toggle("on", +li.dataset.cat === idx));

    const pos = ((clamp(cur.bmi, SCALE_MIN, SCALE_MAX) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
    $("marker").style.left = pos + "%";
    $("markerTip").textContent = cur.bmi.toFixed(1);
    animateTo(cur.bmi);

    const lo = 18.5 * cur.hm * cur.hm, hi = std.normalMax * cur.hm * cur.hm;
    $("ideal").textContent = `${r1(toDisp("w", lo))} – ${r1(toDisp("w", hi))} ${wUnit()}`;
    if (cur.bmi < 18.5) { $("deltaLabel").textContent = t("toGain"); $("delta").textContent = `+${fmtW(lo - cur.kg)}`; }
    else if (cur.bmi >= std.cuts[1]) { $("deltaLabel").textContent = t("toLose"); $("delta").textContent = `−${fmtW(cur.kg - hi)}`; }
    else { $("deltaLabel").textContent = t("status"); $("delta").textContent = t("inRange"); }

    if (lastIdx !== null && lastIdx !== 1 && idx === 1 && Date.now() - lastCelebrate > 4000) celebrate();
    lastIdx = idx;
  }

  /* ============ energy ============ */
  function bmrOf(kg, cm, age, sex) {
    return 10 * kg + 6.25 * cm - 5 * age + (sex === "m" ? 5 : -161);
  }
  function renderEnergy() {
    const p = profile(), box = $("energyBody");
    if (!cur || !p.sex || p.age == null) { box.innerHTML = `<p class="muted">${t("needInfo")}</p>`; return; }
    if (p.age < 18) { box.innerHTML = `<p class="muted">${t("adultOnly")}</p>`; return; }
    const bmr = bmrOf(cur.kg, cur.h, p.age, p.sex), tdee = bmr * ACT[p.act];
    const row = (label, v, cls = "") => `<div class="kv ${cls}"><span>${label}</span><b>${Math.round(v).toLocaleString()} <small>${t("kcal")}</small></b></div>`;
    box.innerHTML =
      `<div class="stats">
        <div class="stat"><span class="stat-label">${t("bmr")}</span><strong>${Math.round(bmr).toLocaleString()}</strong></div>
        <div class="stat"><span class="stat-label">${t("tdee")}</span><strong>${Math.round(tdee).toLocaleString()}</strong></div>
      </div>` +
      row(t("planLose"), Math.max(tdee - 550, bmr), "lose") + row(t("planKeep"), tdee, "keep") + row(t("planGain"), tdee + 300, "gain");
  }

  /* ============ waist ============ */
  function renderWaist() {
    const p = profile(), box = $("waistBody");
    if (!cur || p.waist == null) { box.innerHTML = `<p class="muted">${t("needWaist")}</p>`; return; }
    const r = p.waist / cur.h;
    const i = r < 0.4 ? 0 : r < 0.5 ? 1 : r < 0.6 ? 2 : 3;
    const col = ["--c1", "--c2", "--c4", "--c5"][i];
    const pos = clamp(((r - 0.3) / 0.4) * 100, 0, 100);
    let extra = "";
    if (p.sex) {
      const lim = p.sex === "m" ? 90 : 80, over = p.waist >= lim, v = `${r1(toDisp("wa", p.waist))}/${r1(toDisp("wa", lim))} ${unitOf("wa")}`;
      extra = `<p class="mini ${over ? "bad" : "good"}">${t(over ? "waistOver" : "waistOk", { v })}</p>`;
    }
    box.innerHTML =
      `<div class="stat wide-stat" style="--cat:var(${col})">
         <span class="stat-label">${t("whtr")}</span>
         <strong class="big">${r.toFixed(2)} <em class="pill">${t("whtrCat")[i]}</em></strong>
       </div>
       <div class="mini-scale"><i style="flex:1;background:var(--c1)"></i><i style="flex:1;background:var(--c2)"></i><i style="flex:1;background:var(--c4)"></i><i style="flex:1;background:var(--c5)"></i><b style="left:${pos}%"></b></div>
       <p class="mini">${t("whtrHint")}</p>${extra}`;
  }

  /* ============ goal ============ */
  const goalReached = (g, kg) => (g.start >= g.target ? kg <= g.target + 0.05 : kg >= g.target - 0.05);
  function renderGoal() {
    const p = profile(), g = p.goal, box = $("goalBody");
    if (!g) { box.innerHTML = `<p class="muted">${t("gNone")}</p>`; return; }
    const kg = cur ? cur.kg : p.w;
    const total = Math.abs(g.start - g.target) || 1;
    const prog = clamp((g.start >= g.target ? g.start - kg : kg - g.start) / total, 0, 1);
    const reached = goalReached(g, kg);
    const remain = Math.abs(kg - g.target);
    let tail = "";
    if (reached) tail = `<p class="goal-done">${ICON.check} ${t("gReached")}</p>`;
    else {
      const weeks = Math.ceil(remain / g.rate);
      const eta = new Date(Date.now() + weeks * 7 * 864e5).toLocaleDateString(state.lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
      const adj = Math.round(g.rate * 1100), lose = g.start >= g.target;
      let kc = `<p class="mini">${t("gDaily", { n: adj })}</p>`;
      if (cur && p.sex && p.age != null && p.age >= 18) {
        const bmr = bmrOf(cur.kg, cur.h, p.age, p.sex), target = bmr * ACT[p.act] + (lose ? -adj : adj);
        kc += `<p class="mini">${t("gTargetKcal", { n: Math.round(target).toLocaleString() })}</p>`;
        if (lose && target < bmr) kc += `<p class="mini bad">${t("gLow")}</p>`;
      }
      tail = `<div class="stats three">
        <div class="stat"><span class="stat-label">${t("gRemain")}</span><strong>${fmtW(remain)}</strong></div>
        <div class="stat"><span class="stat-label">${t("gWeeks", { n: weeks })}</span><strong>${eta}</strong></div>
      </div>${kc}`;
    }
    box.innerHTML =
      `<div class="prog-meta"><span>${t("gStart")} ${fmtW(g.start)}</span><b>${Math.round(prog * 100)}%</b><span class="tgt">${ICON.flag} ${fmtW(g.target)}</span></div>
       <div class="prog"><i style="width:${prog * 100}%"></i></div>
       <div class="prog-meta sub"><span>${t("gNow")}: <b>${fmtW(kg)}</b></span></div>${tail}`;
  }

  /* ============ history + chart ============ */
  let chartMode = "bmi";
  const dateFmt = (ts, opt) => new Date(ts).toLocaleDateString(state.lang === "th" ? "th-TH" : "en-GB", opt || { day: "numeric", month: "short", year: "2-digit" });

  function renderHistory() {
    const hist = profile().history.slice().sort((a, b) => a.t - b.t);
    const list = $("histList");
    document.querySelectorAll("#chartSeg .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.chart === chartMode));
    if (!hist.length) { list.innerHTML = `<p class="muted center">${t("hEmpty")}</p>`; }
    else {
      list.innerHTML = hist.slice().reverse().slice(0, 60).map((e) => {
        const i = catIdx(e.bmi);
        return `<div class="hrow"><span class="hdate">${dateFmt(e.t, { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
          <span class="hval"><b>${fmtW(e.w)}</b> · BMI ${e.bmi.toFixed(1)}</span>
          <span class="hbadge" style="--cat:${catColor(i)}">${names()[i]}</span>
          <button class="x no-print" type="button" data-del="${e.t}" aria-label="${t("hDel")}">×</button></div>`;
      }).join("");
    }
    renderChart(hist);
  }

  function renderChart(pts) {
    const box = $("chart"), ro = $("chartReadout");
    ro.textContent = "";
    if (pts.length < 2) { box.innerHTML = `<p class="muted center">${t("chNeed")}</p>`; return; }
    const W = 640, H = 240, PL = 46, PR = 14, PT = 14, PB = 28;
    const val = (e) => (chartMode === "bmi" ? e.bmi : toDisp("w", e.w));
    const vs = pts.map(val);
    const mn = Math.min(...vs), mx = Math.max(...vs), pad = Math.max((mx - mn) * 0.25, 1);
    const lo = mn - pad, hi = mx + pad;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t, span = t1 - t0 || 1;
    const X = (ts) => PL + ((ts - t0) / span) * (W - PL - PR);
    const Y = (v) => PT + ((hi - v) / (hi - lo)) * (H - PT - PB);

    let bands = "";
    if (chartMode === "bmi") {
      const edges = [-Infinity, ...S().cuts, Infinity];
      for (let i = 0; i < edges.length - 1; i++) {
        const a = Math.max(edges[i], lo), b = Math.min(edges[i + 1], hi);
        if (b > a) bands += `<rect x="${PL}" y="${Y(b)}" width="${W - PL - PR}" height="${Y(a) - Y(b)}" style="fill:${catColor(i)}" opacity=".13"/>`;
      }
    }
    let grid = "";
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4, y = Y(v);
      grid += `<line x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}" class="gl"/><text x="${PL - 8}" y="${y + 4}" text-anchor="end" class="ax">${v.toFixed(chartMode === "bmi" ? 1 : 0)}</text>`;
    }
    const path = pts.map((e, i) => `${i ? "L" : "M"}${X(e.t).toFixed(1)},${Y(val(e)).toFixed(1)}`).join(" ");
    const dots = pts.map((e, i) => `<circle cx="${X(e.t).toFixed(1)}" cy="${Y(val(e)).toFixed(1)}" r="${i === pts.length - 1 ? 5 : 3.5}" class="dot"/>`).join("");
    const base = H - PB;
    const area = `${path} L${X(t1).toFixed(1)},${base} L${X(t0).toFixed(1)},${base} Z`;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("hTitle")}">
      <defs><linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${bands}${grid}
      <path d="${area}" fill="url(#areaG)"/>
      <path d="${path}" class="ln"/>${dots}
      <circle id="hov" r="7" class="hov" cx="-20" cy="-20"/>
      <text x="${PL}" y="${H - 8}" class="ax">${dateFmt(t0)}</text><text x="${W - PR}" y="${H - 8}" text-anchor="end" class="ax">${dateFmt(t1)}</text></svg>`;

    const svg = box.querySelector("svg"), hov = $("hov");
    const show = (ev) => {
      const rect = svg.getBoundingClientRect(), x = ((ev.clientX - rect.left) / rect.width) * W;
      let best = pts[0];
      pts.forEach((e) => { if (Math.abs(X(e.t) - x) < Math.abs(X(best.t) - x)) best = e; });
      hov.setAttribute("cx", X(best.t)); hov.setAttribute("cy", Y(val(best)));
      ro.textContent = `${dateFmt(best.t)} · ${fmtW(best.w)} · BMI ${best.bmi.toFixed(1)}`;
    };
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerdown", show);
  }

  /* ============ actions ============ */
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2200);
  }
  // กล่องยืนยันของแอป (แทน confirm() ของเบราว์เซอร์)
  function ask(msg) {
    return new Promise((resolve) => {
      const d = $("confirmDlg");
      $("confirmMsg").textContent = msg;
      d.returnValue = "";
      d.addEventListener("close", () => resolve(d.returnValue === "ok"), { once: true });
      d.showModal();
    });
  }
  $("confirmNo").addEventListener("click", () => $("confirmDlg").close("cancel"));
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function saveEntry() {
    if (!cur) return;
    const p = profile();
    p.history.push({ t: Date.now(), h: cur.h, w: cur.kg, waist: p.waist, bmi: cur.bmi });
    if (p.history.length > 500) p.history.shift();
    persist(); toast(t("saved"));
    if (p.goal && !p.goal.done && goalReached(p.goal, cur.kg)) { p.goal.done = true; celebrate(); }
    renderHistory(); renderGoal();
  }

  async function share() {
    if (!cur) return;
    const p = profile(), q = new URLSearchParams({ h: r1(cur.h), w: r1(cur.kg), std: state.std });
    if (p.sex) q.set("s", p.sex);
    if (p.age != null) q.set("a", p.age);
    if (p.waist != null) q.set("wa", r1(p.waist));
    const url = location.href.split("#")[0].split("?")[0] + "?" + q.toString();
    const text = t("shareText", { bmi: cur.bmi.toFixed(1), cat: names()[catIdx(cur.bmi)], h: fmtH(cur.h), w: fmtW(cur.kg) });
    if (navigator.share) {
      try { await navigator.share({ title: t("shareTitle"), text, url }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text + "\n" + url); }
    catch { const ta = document.createElement("textarea"); ta.value = text + "\n" + url; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove(); }
    toast(t("copied"));
  }

  function applyUrlParams() {
    const q = new URLSearchParams(location.search);
    if (!q.has("h") || !q.has("w")) return;
    const h = +q.get("h"), w = +q.get("w");
    if (!(h >= LIM.h[0] && h <= LIM.h[1] && w >= LIM.w[0] && w <= LIM.w[1])) return;
    const p = newProfile(t("pShared"));
    p.h = h; p.w = w;
    if (q.get("s") === "m" || q.get("s") === "f") p.sex = q.get("s");
    const a = +q.get("a"); if (a >= LIM.age[0] && a <= LIM.age[1]) p.age = Math.round(a);
    const wa = +q.get("wa"); if (wa >= LIM.wa[0] && wa <= LIM.wa[1]) p.waist = wa;
    if (STANDARDS[q.get("std")]) state.std = q.get("std");
    state.profiles.push(p); state.active = p.id;
    try { history.replaceState(null, "", location.pathname); } catch {}
  }

  function exportCsv() {
    const p = profile(), esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["date", "profile", "height_cm", "weight_kg", "bmi", "waist_cm", "category"]];
    p.history.slice().sort((a, b) => a.t - b.t).forEach((e) =>
      rows.push([new Date(e.t).toISOString(), p.name, r1(e.h), r1(e.w), e.bmi.toFixed(2), e.waist == null ? "" : r1(e.waist), names()[catIdx(e.bmi)]]));
    download(`bmi-${p.name}.csv`, "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }
  function backup() { download(`bmi-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), "application/json"); }
  function restore(file) {
    const fr = new FileReader();
    fr.onload = async () => {
      let obj;
      try {
        obj = JSON.parse(fr.result);
        if (!obj || !Array.isArray(obj.profiles) || !obj.profiles.length) throw 0;
      } catch { toast(t("importBad")); return; }
      if (!(await ask(t("confirmImport")))) return;
      state = normalizeState(obj);
      persist(); initAll(); toast(t("importOk"));
    };
    fr.readAsText(file);
  }

  /* ============ celebration ============ */
  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = $("confetti"), ctx = c.getContext && c.getContext("2d");
    if (!ctx) return;
    c.width = innerWidth; c.height = innerHeight; c.classList.remove("hidden");
    const cols = ["#4f46e5", "#06b6d4", "#22c55e", "#facc15", "#fb923c", "#ef4444"];
    const ps = Array.from({ length: 130 }, () => ({
      x: innerWidth / 2, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 16, vy: Math.random() * -13 - 3,
      s: 5 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
    }));
    let f = 0;
    (function tick() {
      ctx.clearRect(0, 0, c.width, c.height);
      ps.forEach((p) => {
        p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6); ctx.restore();
      });
      if (++f < 140) requestAnimationFrame(tick); else { ctx.clearRect(0, 0, c.width, c.height); c.classList.add("hidden"); }
    })();
  }
  function chime() {
    if (!state.sound) return;
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain(), s = a.currentTime + i * 0.12;
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.12, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
        o.connect(g); g.connect(a.destination); o.start(s); o.stop(s + 0.55);
      });
    } catch {}
  }
  function celebrate() { lastCelebrate = Date.now(); confetti(); chime(); }

  /* ============ profiles ============ */
  function renderProfiles() {
    $("profileSel").innerHTML = state.profiles.map((p) => `<option value="${p.id}">${p.name.replace(/</g, "&lt;")}</option>`).join("");
    $("profileSel").value = state.active;
  }
  let dlgMode = "add";
  function openDlg(mode) {
    dlgMode = mode;
    $("profName").value = mode === "edit" ? profile().name : "";
    $("profDialog").returnValue = "";
    $("profDialog").showModal();
    $("profName").focus();
  }
  $("profDialog").addEventListener("close", () => {
    if ($("profDialog").returnValue !== "ok") return;
    const name = $("profName").value.trim().slice(0, 40);
    if (!name) return;
    if (dlgMode === "edit") profile().name = name;
    else { const p = newProfile(name); state.profiles.push(p); state.active = p.id; }
    persist(); switchProfile();
  });
  $("profCancel").addEventListener("click", () => $("profDialog").close("cancel"));
  function switchProfile() {
    renderProfiles(); fillForm(); update();
  }

  /* ============ update / init ============ */
  function update() {
    cur = readForm();
    renderResult(); renderEnergy(); renderWaist(); renderGoal(); renderHistory();
  }
  function initAll() {
    applyLang(); renderProfiles(); buildScale();
    $("soundTg").checked = state.sound;
    fillForm(); update();
  }

  /* ============ events ============ */
  ["h", "w"].forEach((k) => {
    R[k].addEventListener("input", () => { F[k].value = R[k].value; update(); });
    F[k].addEventListener("input", () => { if (F[k].value !== "") R[k].value = F[k].value; update(); });
  });
  F.wa.addEventListener("input", update);
  $("age").addEventListener("input", update);
  $("act").addEventListener("change", () => { profile().act = +$("act").value; persist(); update(); });
  $("form").addEventListener("submit", (e) => e.preventDefault());

  $("sexSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sex]"); if (!b) return;
    const p = profile(); p.sex = p.sex === b.dataset.sex ? null : b.dataset.sex;
    document.querySelectorAll("#sexSeg .seg-btn").forEach((x) => x.classList.toggle("active", x.dataset.sex === p.sex));
    persist(); update();
  });
  $("unitSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-unit]"); if (!b || b.dataset.unit === state.unit) return;
    cur = readForm(); // เก็บค่าล่าสุดก่อนสลับ
    state.unit = b.dataset.unit; persist();
    const keep = lastIdx; fillForm(); lastIdx = keep; buildRateOptions(); update();
  });
  $("stdSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-std]"); if (!b || b.dataset.std === state.std) return;
    state.std = b.dataset.std; persist(); buildScale(); lastIdx = null; update();
  });
  $("langSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]"); if (!b || b.dataset.lang === state.lang) return;
    state.lang = b.dataset.lang; persist(); applyLang(); buildScale(); update();
  });
  $("chartSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-chart]"); if (!b) return;
    chartMode = b.dataset.chart; renderHistory();
  });
  $("soundTg").addEventListener("change", () => { state.sound = $("soundTg").checked; persist(); if (state.sound) chime(); });

  $("reset").addEventListener("click", () => {
    const p = profile(); Object.assign(p, { h: 170, w: 65, sex: null, age: null, waist: null, act: 1 });
    $("sexSeg").querySelectorAll(".seg-btn").forEach((x) => x.classList.remove("active"));
    $("act").value = 1; fillForm(); update();
  });
  $("saveBtn").addEventListener("click", saveEntry);
  $("shareBtn").addEventListener("click", share);

  $("gSet").addEventListener("click", () => {
    const p = profile(), v = parseFloat($("gTarget").value), m = fromDisp("w", v);
    if (!(m >= LIM.w[0] && m <= LIM.w[1])) { toast(t("gBad")); return; }
    p.goal = { target: m, start: cur ? cur.kg : p.w, startT: Date.now(), rate: +$("gRate").value || 0.5, done: false };
    persist(); toast(t("gSetOk")); renderGoal();
  });
  $("gClear").addEventListener("click", () => { profile().goal = null; $("gTarget").value = ""; persist(); renderGoal(); });
  $("gRate").addEventListener("change", () => { const g = profile().goal; if (g) { g.rate = +$("gRate").value; persist(); renderGoal(); } });

  $("histList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]"); if (!b) return;
    const p = profile(); p.history = p.history.filter((x) => String(x.t) !== b.dataset.del);
    persist(); renderHistory();
  });
  $("clearBtn").addEventListener("click", async () => {
    if (profile().history.length && (await ask(t("confirmClear")))) { profile().history = []; persist(); renderHistory(); }
  });
  $("csvBtn").addEventListener("click", exportCsv);
  addEventListener("beforeprint", () => { $("printDate").textContent = `${profile().name} · ${dateFmt(Date.now(), { day: "numeric", month: "long", year: "numeric" })}`; });
  $("pdfBtn").addEventListener("click", () => window.print());
  $("backupBtn").addEventListener("click", backup);
  $("restoreBtn").addEventListener("click", () => $("restoreFile").click());
  $("restoreFile").addEventListener("change", (e) => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ""; });

  $("profileSel").addEventListener("change", () => { state.active = $("profileSel").value; persist(); switchProfile(); });
  $("profAdd").addEventListener("click", () => openDlg("add"));
  $("profEdit").addEventListener("click", () => openDlg("edit"));
  $("profDel").addEventListener("click", async () => {
    if (state.profiles.length <= 1) { toast(t("pLast")); return; }
    if (!(await ask(t("pConfirmDel", { n: profile().name })))) return;
    state.profiles = state.profiles.filter((p) => p.id !== state.active);
    state.active = state.profiles[0].id; persist(); switchProfile();
  });

  /* ============ theme ============ */
  function applyTheme(m) {
    document.documentElement.dataset.theme = m;
    try { localStorage.setItem("bmi-theme", m); } catch {}
  }
  let savedTheme = null;
  try { savedTheme = localStorage.getItem("bmi-theme"); } catch {}
  applyTheme(savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("themeBtn").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  /* ============ PWA ============ */
  // ปุ่มติดตั้งแสดงเสมอ (ยกเว้นเปิดจากแอปที่ติดตั้งแล้ว) เพราะ Safari/Firefox ไม่ส่งสัญญาณ beforeinstallprompt
  let deferred;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone) $("installBtn").classList.add("hidden");
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
  $("installBtn").addEventListener("click", async () => {
    if (deferred) {
      deferred.prompt(); await deferred.userChoice.catch(() => {});
      deferred = null; return;
    }
    if (!/^https?:$/.test(location.protocol)) { toast(t("installHttp")); return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    toast(t(ios ? "installIos" : "installMenu"));
  });
  window.addEventListener("appinstalled", () => { $("installBtn").classList.add("hidden"); toast(t("installed")); });
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  /* ============ คู่มือ (แสดงทุกครั้งที่เปิดหน้าเว็บ) ============ */
  const guide = $("guideDlg");
  function openGuide() {
    if (guide.open) return;
    if (typeof guide.showModal === "function") guide.showModal(); else guide.setAttribute("open", "");
    $("guideOk").focus();
  }
  const closeGuide = () => { if (typeof guide.close === "function") guide.close(); else guide.removeAttribute("open"); };
  $("guideOk").addEventListener("click", closeGuide);
  $("guideX").addEventListener("click", closeGuide);
  $("guideBtn").addEventListener("click", openGuide);
  guide.addEventListener("click", (e) => { if (e.target === guide) closeGuide(); }); // คลิกพื้นหลังเพื่อปิด

  /* ============ start ============ */
  applyUrlParams();
  initAll();
  openGuide();
})();
