/* Ghana Budget Tracker — renders everything from window.BUDGET (data/budget-data.js) */
(function () {
  "use strict";
  const D = window.BUDGET;
  // every year and document comes from the data (site/data/raw/documents.json), so a new budget needs no change here
  const YEARS = D.yearList;
  const FIRST = YEARS[0], LAST = YEARS[YEARS.length - 1];
  const andJoin = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1] : String(xs[0] ?? ""));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const yc = (y) => getComputedStyle(document.documentElement).getPropertyValue("--y" + y).trim();

  // ---------- formatting ----------
  const fmtBn = (m) => (m == null || isNaN(m) ? "–" : (m / 1000).toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const fmtNum = (v, d = 1) => (v == null || isNaN(v) ? "–" : Number(v).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: d }));
  const fmtPct = (v) => (v == null || isNaN(v) ? "–" : (v > 0 ? "+" : "") + v.toFixed(1) + "%");
  // areas are standardised in the build; list them in the standard sector order
  const byAreaOrder = (list) => list.sort((a, b) => (D.areaOrder || []).indexOf(a) - (D.areaOrder || []).indexOf(b));

  // documents: budgets keyed by year (or "B2025"), mid-year reviews as "M2025"; PDFs sit in the project folder
  const DOCS = Object.fromEntries(D.docs.map((d) => [d.id, { ...d, file: "../" + d.file }]));
  const DOC_ORDER = D.docs.map((d) => d.id);
  const docOf = (d) => DOCS[typeof d === "number" || /^\d+$/.test(d) ? "B" + d : d];

  // ---------- year colours ----------
  // one blue ramp, light -> dark = earlier -> later (reversed in the dark theme), spread over however many years there are
  const RAMP = { light: ["#86b6ef", "#2a78d6", "#104281"], dark: ["#256abf", "#5598e7", "#9ec5f4"], chip: ["#5598e7", "#2a78d6", "#104281"] };
  const rampAt = (stops, t) => {
    const pos = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(pos)), f = pos - i;
    const rgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
    const a = rgb(stops[i]), b = rgb(stops[i + 1]);
    return "#" + a.map((c, k) => Math.round(c + (b[k] - c) * f).toString(16).padStart(2, "0")).join("");
  };
  (function applyYearColours() {
    const t = (i) => (YEARS.length > 1 ? i / (YEARS.length - 1) : 1);
    const vars = (key) => YEARS.map((y, i) => `--y${y}:${rampAt(RAMP[key], t(i))}`).join(";");
    const st = document.createElement("style");
    st.id = "year-colours";
    st.textContent = `:root{${vars("light")}}` +
      `@media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])){${vars("dark")}}}` +
      `:root[data-theme="dark"]{${vars("dark")}}` +
      YEARS.map((y, i) => `.yr-chip.y${y}{background:${rampAt(RAMP.chip, t(i))}}`).join("");
    document.head.appendChild(st);
  })();
  const pg = (doc, page) => {
    const d = docOf(doc);
    return page && d ? `<a class="pg" href="${d.file}#page=${page}" target="_blank" rel="noopener" title="Open the ${d.label} at PDF page ${page}">${d.short} p.${page}</a>` : "";
  };
  // turn "(page 123)" / "(p123)" at end of strings into links
  const linkify = (text, year) => {
    const t = esc(text);
    return t.replace(/\(\s*(?:pages?|pp?\.?)\s*(\d+)(?:[^)]*)\)\s*$/i, (_, p) => pg(year, +p));
  };

  // ---------- status ----------
  const ICON = {
    met: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.5" fill="var(--good)"/><path d="M4.6 8.3l2.2 2.2 4.6-4.8" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    missed: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.5" fill="var(--bad)"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
    partial: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="var(--warn)" stroke-width="1.6"/><path d="M8 1a7 7 0 0 1 0 14z" fill="var(--warn)"/></svg>',
    unclear: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="var(--neutral)" stroke-width="1.6" stroke-dasharray="2.5 2"/></svg>',
    pending: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="var(--neutral)" stroke-width="1.6"/><path d="M8 4.5V8l2.3 1.6" stroke="var(--neutral)" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
  };
  const LABEL = { met: "Met", missed: "Missed", partial: "Partly", unclear: "Not reported", pending: `Due in ${LAST + 1} Budget` };
  const CLABEL = { met: "Delivered", missed: "Not delivered", partial: "Partly delivered", unclear: "Not reported", pending: "Not yet due" };
  const statusChip = (s, labels = LABEL) => `<span class="status ${s === "pending" ? "unclear" : s}">${ICON[s] || ICON.unclear}${esc(labels[s] || s)}</span>`;
  const STATUS_COLOR = { met: "var(--good)", partial: "var(--warn)", missed: "var(--bad)", unclear: "var(--neutral)", pending: "var(--neutral)" };

  // ---------- tooltip ----------
  const tip = $("#tooltip");
  function showTip(html, ev) {
    tip.innerHTML = html;
    tip.classList.add("show");
    moveTip(ev);
  }
  function moveTip(ev) {
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => tip.classList.remove("show");

  // ---------- legends ----------
  const yearLegend = (years = YEARS) => years.map((y) => `<span><i style="background:var(--y${y})"></i>${y} Budget</span>`).join("");
  $$("#yearLegend1,#yearLegend2,#yearLegend3,#yearLegend4,#yearLegend5").forEach((el) => (el.innerHTML = yearLegend()));

  // ---------- generic grouped horizontal bar chart ----------
  // rows: [{label, values:{2025:{v,page,note}}}], opts:{fmt, unit}
  function groupedHBar(el, rows, opts = {}) {
    const fmt = opts.fmt || ((v) => fmtNum(v));
    const W = Math.max(320, el.clientWidth || 800);
    const narrow = W < 560;
    const labelW = narrow ? 0 : Math.min(230, W * 0.3);
    const barH = opts.barH || 9, gap = opts.barH ? 6 : 2, groupPad = narrow ? 30 : 16;
    const ys = opts.years || YEARS;
    const groupH = ys.length * barH + (ys.length - 1) * gap;
    const rowH = groupH + groupPad;
    const top = 6, valW = 64;
    const H = top + rows.length * rowH + 22;
    const all = rows.flatMap((r) => ys.map((y) => (r.values[y] ? r.values[y].v : null))).filter((v) => v != null);
    const min = Math.min(0, ...all), max = Math.max(0, ...all);
    const plotX = labelW + 8 + (min < 0 ? 44 : 0), plotW = W - plotX - valW;
    const sx = (v) => plotX + ((v - min) / (max - min || 1)) * plotW;
    const ticks = niceTicks(min, max, narrow ? 3 : 5);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria || "Bar chart")}"><g class="grid">`;
    ticks.forEach((t) => (s += `<line x1="${sx(t)}" x2="${sx(t)}" y1="${top - 4}" y2="${H - 20}"/>`));
    s += `</g><g class="axis">`;
    ticks.forEach((t) => (s += `<text x="${sx(t)}" y="${H - 6}" text-anchor="middle">${fmt(t)}</text>`));
    s += `</g>`;
    rows.forEach((r, i) => {
      const gy = top + i * rowH + (narrow ? 16 : 0);
      s += `<g class="cat" data-i="${i}"><rect class="hover-band" x="0" y="${gy - (narrow ? 18 : 5)}" width="${W}" height="${rowH}" rx="4"/>`;
      if (narrow) s += `<text class="lbl" x="${labelW + 8}" y="${gy - 5}" style="font-size:12px;fill:var(--ink-2)">${esc(r.label)}</text>`;
      else s += wrapLabel(r.label, labelW, gy + groupH / 2);
      ys.forEach((y, j) => {
        const cell = r.values[y];
        const by = gy + j * (barH + gap);
        if (!cell || cell.v == null) {
          s += `<text class="lbl" x="${sx(0) + 4}" y="${by + barH / 2 + 4}" style="font-size:10px">not stated</text>`;
          return;
        }
        const x0 = sx(Math.min(0, cell.v)), x1 = sx(Math.max(0, cell.v));
        const w = Math.max(1, x1 - x0);
        s += `<path d="${barPath(x0, by, w, barH, cell.v >= 0)}" fill="var(--y${y})"/>`;
        s += `<text class="val" x="${cell.v >= 0 ? x1 + 5 : x0 - 5}" y="${by + barH / 2 + 4}" text-anchor="${cell.v >= 0 ? "start" : "end"}" style="font-weight:${j === ys.length - 1 ? 600 : 400};fill:${j === ys.length - 1 ? "var(--ink)" : "var(--ink-3)"}">${fmt(cell.v)}</text>`;
      });
      s += `<rect class="hit" x="0" y="${gy - (narrow ? 18 : 5)}" width="${W}" height="${rowH}"/></g>`;
    });
    if (min < 0) s += `<line class="zero" x1="${sx(0)}" x2="${sx(0)}" y1="${top - 4}" y2="${H - 20}"/>`;
    s += `</svg>`;
    el.innerHTML = s;
    $$("g.cat", el).forEach((g) => {
      const r = rows[+g.dataset.i];
      const html = () => `<div class="tt-title">${esc(r.label)}</div>` + ys.map((y) => {
        const c = r.values[y];
        return `<div class="tt-row"><span><i style="background:var(--y${y})"></i>${y}</span><b>${c && c.v != null ? fmt(c.v) + (opts.unit ? " " + opts.unit : "") : "not stated"}</b></div>`;
      }).join("") + (r.note ? `<div class="muted small" style="margin-top:4px">${esc(r.note)}</div>` : "");
      g.addEventListener("mouseenter", (e) => showTip(html(), e));
      g.addEventListener("mousemove", moveTip);
      g.addEventListener("mouseleave", hideTip);
    });
  }
  function barPath(x, y, w, h, right) {
    const r = Math.min(4, w / 2, h / 2);
    if (right) return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
  }
  function wrapLabel(text, width, cy) {
    const maxChars = Math.floor(width / 6.4);
    const words = String(text).split(" ");
    const lines = [];
    let cur = "";
    words.forEach((w) => {
      if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
    });
    if (cur) lines.push(cur);
    const ls = lines.slice(0, 2);
    if (lines.length > 2) ls[1] = ls[1].slice(0, maxChars - 1) + "…";
    const y0 = cy - ((ls.length - 1) * 13) / 2 + 4;
    return ls.map((l, i) => `<text class="lbl" x="${width}" y="${y0 + i * 13}" text-anchor="end" style="font-size:12px;fill:var(--ink-2)">${esc(l)}</text>`).join("");
  }
  function niceTicks(min, max, n) {
    const span = max - min || 1;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n + 0.5) || mag * 10;
    const out = [];
    for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(+t.toFixed(10));
    return out;
  }
  const redraws = [];
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => redraws.forEach((f) => f()), 150); });

  // ---------- segmented buttons ----------
  function seg(attr, onChange) {
    const btns = $$(`[data-${attr}]`);
    btns.forEach((b) => b.addEventListener("click", () => {
      btns.forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
      onChange(b.dataset[attr]);
    }));
  }

  // ===================== HERO =====================
  function renderHero() {
    $("#coverage").textContent = andJoin(YEARS);
    // the cards show the latest three budgets; older ones stay in every section below
    const shown = YEARS.slice(-3);
    const older = YEARS.slice(0, -3);
    $("#stripsNote").hidden = !older.length;
    $("#stripsNote").innerHTML = older.length ? `Showing the latest three budgets. Earlier ones (${andJoin(older)}) are in every section below; <a href="#compare">compare all years</a>.` : "";
    $("#strips").innerHTML = shown.map((y) => {
      const m = D.years[y];
      const h = m.headline || {};
      return `<article class="strip" style="--yc:var(--y${y})">
        <div class="yr">${y}</div>
        <div class="theme">${esc(m.title)}</div>
        <dl>
          <dt>Total revenue &amp; grants</dt><dd>GH¢${fmtBn(h.revenue)}bn</dd>
          <dt>Total expenditure</dt><dd>GH¢${fmtBn(h.expenditure)}bn</dd>
          <dt>Real GDP growth target</dt><dd>${h.gdp != null ? "at least " + fmtNum(h.gdp) + "%" : "–"}</dd>
          <dt>Inflation target (end-year)</dt><dd>${esc(h.inflation_label || (h.inflation != null ? h.inflation + "%" : "–"))}</dd>
          <dt>Primary balance target</dt><dd>${h.primary != null ? fmtNum(h.primary) + "% of GDP" : "–"}</dd>
        </dl>
      </article>`;
    }).join("");
  }

  // ===================== INDICATOR EXPLORER =====================
  const MEAS = [
    { k: "proj", label: "Earlier projection", tip: "What an earlier budget projected for this year" },
    { k: "target", label: "Budget target", tip: "The target in that year's budget" },
    { k: "revised", label: "Mid-year revised target", tip: "The target as revised in that year's Mid-Year Review" },
    { k: "h1", label: "Mid-year outturn", tip: "Performance reported at mid-year (usually January–June)" },
    { k: "outturn", label: "End-year outturn", tip: "The latest end-year figure, from the following budget(s)" },
  ];
  const IND_YEARS = D.indicatorYears;
  const EX = { id: "gdp", meas: new Set(MEAS.map((m) => m.k)), years: new Set(IND_YEARS) };
  const indById = (id) => D.indicators.find((i) => i.id === id);
  const isMoney = (ind) => ind.unit === "GH¢ million";
  const fmt1 = (v) => Number(v).toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const indFmt = (ind, v) => v == null ? "–" : isMoney(ind) ? "GH¢" + (v / 1000).toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "bn" : fmt1(v) + (ind.unit === "%" || ind.unit === "% of GDP" ? "%" : "");
  const cellText = (ind, c) => (c ? (c.label && c.v == null ? c.label : c.label && /^≥/.test(c.label) ? "≥" + indFmt(ind, c.v) : indFmt(ind, c.v)) : "–");

  function verdict(ind, y, t, o) {
    if (!t || !o || t.v == null || o.v == null || !ind.better) return null;
    if (ind.id === "infl" && y >= 2026) return o.v >= 6 && o.v <= 10 ? "met" : o.v < 6 ? "partial" : "missed";
    const ok = ind.better === "higher" ? o.v >= t.v - 1e-9 : o.v <= t.v + 1e-9;
    return ok ? "met" : "missed";
  }

  function renderExplorer() {
    const sel = $("#indSelect");
    if (!sel.options.length) {
      const groups = [...new Set(D.indicators.map((i) => i.group))];
      sel.innerHTML = groups.map((g) => `<optgroup label="${esc(g)}">${D.indicators.filter((i) => i.group === g).map((i) => `<option value="${i.id}">${esc(i.name)}${isMoney(i) ? "" : ` (${esc(i.unit)})`}</option>`).join("")}</optgroup>`).join("");
      sel.value = EX.id;
      sel.addEventListener("change", () => { EX.id = sel.value; renderExplorer(); });
      $("#indView").addEventListener("change", renderExplorer);
    }
    const ind = indById(EX.id);
    const has = (k) => IND_YEARS.some((y) => ind.years[y] && ind.years[y][k]);
    $("#indMeasures").className = "chips swatched";
    $("#indMeasures").innerHTML = MEAS.map((m) => `<button type="button" data-k="${m.k}" aria-pressed="${EX.meas.has(m.k)}" title="${esc(m.tip)}"${has(m.k) ? "" : " disabled style=\"opacity:.35\""}><i class="sw" style="background:var(--m-${m.k})"></i>${esc(m.label)}</button>`).join("");
    $("#indYears").innerHTML = IND_YEARS.map((y) => `<button type="button" data-y="${y}" aria-pressed="${EX.years.has(y)}">${y}</button>`).join("");
    $$("#indMeasures button").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.k; EX.meas.has(k) ? EX.meas.delete(k) : EX.meas.add(k); renderExplorer(); }));
    $$("#indYears button").forEach((b) => b.addEventListener("click", () => { const y = +b.dataset.y; EX.years.has(y) ? EX.years.delete(y) : EX.years.add(y); renderExplorer(); }));

    const ms = MEAS.filter((m) => EX.meas.has(m.k) && has(m.k));
    const ys = IND_YEARS.filter((y) => EX.years.has(y));

    // verdicts: target vs end-year outturn, and mid-year revisions
    const vs = [];
    ys.forEach((y) => {
      const d = ind.years[y] || {};
      const st = verdict(ind, y, d.target, d.outturn);
      if (st) vs.push(`<div>${statusChip(st, { met: "Met", missed: "Missed", partial: ind.id === "infl" ? "Below band" : "Partly" })}<span><b>${y}</b>: ${cellText(ind, d.outturn)} against a target of ${cellText(ind, d.target)}</span></div>`);
      else if (d.target && !d.outturn && y >= LAST) vs.push(`<div>${statusChip("pending")}<span><b>${y}</b>: target ${cellText(ind, d.target)}</span></div>`);
      if (d.revised && d.target && d.revised.v != null && d.target.v != null && Math.abs(d.revised.v - d.target.v) > 1e-6)
        vs.push(`<div><span class="doc-chip">Revised</span><span><b>${y}</b>: mid-year moved the target from ${cellText(ind, d.target)} to ${cellText(ind, d.revised)}</span></div>`);
    });
    $("#indVerdicts").innerHTML = vs.join("") || `<div class="muted">No target-versus-outturn pair for the selected years.</div>`;

    // chart
    const el = $("#indChart");
    el.hidden = $("#indView").value === "table";
    if (!el.hidden) {
      const W = Math.max(300, el.clientWidth || 800), H = 300, padL = 52, padB = 30, padT = 22;
      const vals = ys.flatMap((y) => ms.map((m) => ind.years[y] && ind.years[y][m.k] && ind.years[y][m.k].v)).filter((v) => v != null);
      if (!vals.length || !ms.length || !ys.length) el.innerHTML = `<p class="empty">Nothing to draw: tick at least one measure and one year that have data.</p>`;
      else {
        const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
        const ticks = niceTicks(min, max, 5);
        const lo = Math.min(min, ticks[0]), hi = Math.max(max, ticks[ticks.length - 1]);
        const sy = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
        const gw = (W - padL) / ys.length, inner = gw * 0.78, bw = Math.min(46, (inner - (ms.length - 1) * 3) / ms.length);
        const tfmt = (v) => isMoney(ind) ? fmtNum(v / 1000, 0) : fmtNum(v, 1);
        let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ind.name)} by year and measure"><g class="grid">`;
        ticks.forEach((t) => (s += `<line x1="${padL}" x2="${W}" y1="${sy(t)}" y2="${sy(t)}"/><text class="lbl" x="${padL - 8}" y="${sy(t) + 4}" text-anchor="end">${tfmt(t)}</text>`));
        s += `</g><text class="lbl" x="0" y="11">${esc(isMoney(ind) ? "GH¢ billion" : ind.unit)}</text>`;
        ys.forEach((y, gi) => {
          const gx = padL + gi * gw + (gw - (ms.length * bw + (ms.length - 1) * 3)) / 2;
          s += `<g class="cat" data-y="${y}"><rect class="hover-band" x="${padL + gi * gw + 2}" y="${padT - 18}" width="${gw - 4}" height="${H - padT - padB + 18}" rx="6"/>`;
          ms.forEach((m, mi) => {
            const c = ind.years[y] && ind.years[y][m.k];
            const x = gx + mi * (bw + 3);
            if (!c || c.v == null) { s += `<text class="lbl" x="${x + bw / 2}" y="${sy(0) - 4}" text-anchor="middle" style="font-size:10px">–</text>`; return; }
            const y0 = sy(Math.max(0, c.v)), y1 = sy(Math.min(0, c.v)), h = Math.max(1, y1 - y0), r = Math.min(4, bw / 2, h);
            const path = c.v >= 0 ? `M${x},${y1}V${y0 + r}Q${x},${y0} ${x + r},${y0}H${x + bw - r}Q${x + bw},${y0} ${x + bw},${y0 + r}V${y1}Z`
              : `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + bw - r}Q${x + bw},${y1} ${x + bw},${y1 - r}V${y0}Z`;
            s += `<path d="${path}" fill="var(--m-${m.k})"/>`;
            if (bw >= 20) s += `<text class="val" x="${x + bw / 2}" y="${c.v >= 0 ? y0 - 5 : y1 + 12}" text-anchor="middle" style="font-size:10px">${isMoney(ind) ? fmtNum(c.v / 1000, 0) : Number(c.v).toFixed(1)}</text>`;
          });
          s += `<text class="lbl" x="${padL + gi * gw + gw / 2}" y="${H - 8}" text-anchor="middle" style="font-size:12px;fill:var(--ink-2);font-weight:600">${y}</text>`;
          s += `<rect class="hit" x="${padL + gi * gw}" y="0" width="${gw}" height="${H}"/></g>`;
        });
        if (min < 0) s += `<line class="zero" x1="${padL}" x2="${W}" y1="${sy(0)}" y2="${sy(0)}"/>`;
        el.innerHTML = s + `</svg>`;
        $$("g.cat", el).forEach((g) => {
          const y = +g.dataset.y, d = ind.years[y] || {};
          const h = `<div class="tt-title">${esc(ind.name)}, ${y}</div>` + ms.map((m) => `<div class="tt-row"><span><i style="background:var(--m-${m.k})"></i>${esc(m.label)}</span><b>${cellText(ind, d[m.k])}</b></div>`).join("");
          g.addEventListener("mouseenter", (e) => showTip(h, e));
          g.addEventListener("mousemove", moveTip);
          g.addEventListener("mouseleave", hideTip);
        });
      }
    }

    // table: measures down, years across
    $("#indTable").innerHTML = `<thead><tr><th>Measure</th>${ys.map((y) => `<th>${y}</th>`).join("")}</tr></thead><tbody>` +
      ms.map((m) => `<tr><td><i class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--m-${m.k});margin-right:6px"></i>${esc(m.label)}</td>` +
        ys.map((y) => { const c = ind.years[y] && ind.years[y][m.k]; return `<td>${c ? `<b>${cellText(ind, c)}</b><br>${pg(c.doc, c.page)}${c.note ? `<div class="muted small">${esc(c.note)}</div>` : ""}` : '<span class="muted">–</span>'}</td>`; }).join("") + `</tr>`).join("") + `</tbody>`;
    $("#indNote").textContent = (ind.note ? ind.note + " " : "") +
      (ind.flow && EX.meas.has("h1") ? "The mid-year outturn for this line covers January–June only, so it is roughly half of a full-year figure; it is not a shortfall in itself. " : "") +
      "A dash means the documents give no figure for that measure and year." + (D.midYears.length ? ` Mid-year measures exist for ${andJoin(D.midYears)} only.` : "");
  }
  redraws.push(() => renderExplorer());

  // ===================== YEAR ON YEAR =====================
  function renderMacro() {
    $("#macroGrid").innerHTML = D.macro.map((m) => {
      const vals = YEARS.map((y) => (m.values[y] ? m.values[y].v : null)).filter((v) => v != null);
      const mx = Math.max(...vals.map(Math.abs), 1e-9);
      return `<div class="kpi"><h4>${esc(m.indicator)}</h4><div class="kpi-rows">` + YEARS.map((y) => {
        const c = m.values[y];
        if (!c || c.v == null) return `<div class="kpi-row"><span class="yr">${y}</span><span class="small muted">not stated</span><span></span></div>`;
        const w = (Math.abs(c.v) / mx) * 100;
        return `<div class="kpi-row" title="${esc((c.label || c.v) + (m.unit ? " " + m.unit : ""))} — ${y} Budget, PDF p.${c.page || "?"}"><span class="yr">${y}</span><span class="track"><span class="fill" style="width:${w}%;background:var(--y${y})"></span></span><span class="v">${esc(c.label || fmtNum(c.v))}${m.unit === "%" || m.unit === "% of GDP" ? "%" : ""}</span></div>`;
      }).join("") + `</div>${m.note ? `<p class="small muted" style="margin:8px 0 0">${esc(m.note)}</p>` : ""}</div>`;
    }).join("");
  }

  // fiscal lines fall into three groups, in the order the data lists them
  const FISCAL_GROUP = (item) => /revenue|grants from/i.test(item) ? "Revenue" : /balance|appropriation/i.test(item) ? "Balances and totals" : "Spending";
  function renderFiscal() {
    const sel = $("#fiscalPick");
    if (!sel.options.length) {
      const groups = [...new Set(D.fiscal.map((f) => FISCAL_GROUP(f.item)))];
      sel.innerHTML = groups.map((g) => `<optgroup label="${esc(g)}">${D.fiscal.map((f, i) => (FISCAL_GROUP(f.item) === g ? `<option value="${i}">${esc(f.item)}</option>` : "")).join("")}</optgroup>`).join("") +
        `<optgroup label="Several lines at once">${groups.map((g) => `<option value="g:${esc(g)}">All ${esc(g.toLowerCase())} lines</option>`).join("")}<option value="all">Every line</option></optgroup>`;
      sel.value = "0";
      sel.addEventListener("change", renderFiscal);
      seg("fview", (v) => { $("#fiscalChart").hidden = v !== "chart"; $("#yearLegend2").hidden = v !== "chart"; $("#fiscalTable").hidden = v !== "table"; });
      redraws.push(drawFiscal);
    }
    const pick = sel.value;
    const list = pick === "all" ? D.fiscal : pick.startsWith("g:") ? D.fiscal.filter((f) => FISCAL_GROUP(f.item) === pick.slice(2)) : [D.fiscal[+pick]];
    FISCAL_ROWS = list.map((f) => ({ label: f.item, values: f.values, note: f.note }));
    drawFiscal();
    // a single line gets its headline numbers above the chart
    const one = list.length === 1 ? list[0] : null;
    if (one) {
      const a = one.values[FIRST] && one.values[FIRST].v, b = one.values[LAST] && one.values[LAST].v;
      $("#fiscalSummary").innerHTML = `<div><b>GH¢${fmtBn(b)}bn</b>${esc(one.item.toLowerCase())} in the ${LAST} Budget</div>` +
        (a != null && b != null && a !== 0 ? `<div><b>${fmtPct(((b - a) / Math.abs(a)) * 100)}</b>change since the ${FIRST} Budget (GH¢${fmtBn(a)}bn)</div>` : "") +
        (one.values[LAST] && one.values[LAST].pct_gdp != null ? `<div><b>${one.values[LAST].pct_gdp}%</b>of GDP in ${LAST}</div>` : "") +
        (one.note ? `<div class="muted small" style="align-self:end">${esc(one.note)}</div>` : "");
    } else $("#fiscalSummary").innerHTML = "";
    $("#fiscalTable").innerHTML = `<table class="data"><thead><tr><th>Item (GH¢ million)</th>${YEARS.map((y) => `<th class="num">${y} Budget</th>`).join("")}<th class="num">Change ${FIRST}→${LAST}</th></tr></thead><tbody>` +
      list.map((f) => {
        const a = f.values[FIRST] && f.values[FIRST].v, b = f.values[LAST] && f.values[LAST].v;
        const ch = a && b ? ((b - a) / Math.abs(a)) * 100 : null;
        return `<tr><td>${esc(f.item)}</td>${YEARS.map((y) => { const c = f.values[y]; return `<td class="num">${c && c.v != null ? fmtNum(c.v, 0) + (c.pct_gdp != null ? ` <span class="muted small">(${c.pct_gdp}%)</span>` : "") + "<br>" + pg(y, c.page) : "–"}</td>`; }).join("")}<td class="num">${fmtPct(ch)}</td></tr>`;
      }).join("") + `</tbody></table><p class="small muted" style="margin-top:8px">Figures in brackets are % of GDP where stated.</p>`;
  }
  let FISCAL_ROWS = [];
  function drawFiscal() {
    groupedHBar($("#fiscalChart"), FISCAL_ROWS, { fmt: (v) => fmtBn(v), unit: "GH¢bn", aria: "Fiscal envelope by year, GH¢ billion", barH: FISCAL_ROWS.length === 1 ? 26 : 0 });
  }

  function renderTaxes() {
    const TYPE = { new: "New", abolished: "Abolished", "rate change": "Rate change", exemption: "Exemption", admin: "Administration" };
    $("#taxCols").innerHTML = YEARS.map((y) => {
      const list = D.taxes[y] || [];
      const show = list.slice(0, 8), rest = list.slice(8);
      const li = (t) => `<li>${esc(t.measure)}<span class="tag">${esc(TYPE[t.type] || t.type || "")}</span>${t.expected_yield_ghs_m ? ` <span class="muted small">yield GH¢${fmtNum(t.expected_yield_ghs_m, 0)}m</span>` : ""} ${pg(y, t.page)}</li>`;
      return `<div class="yearcol" style="--yc:var(--y${y})"><h4>${y} Budget <span class="muted small">(${list.length})</span></h4><ul class="bullets">${show.map(li).join("")}</ul>${rest.length ? `<details class="more"><summary>${rest.length} more</summary><ul class="bullets">${rest.map(li).join("")}</ul></details>` : ""}</div>`;
    }).join("");
  }

  // ===================== CLOSING THE LOOP =====================
  function tallyHTML(list, labels) {
    const order = ["met", "partial", "missed", "unclear", "pending"];
    const c = {};
    list.forEach((x) => (c[x.status] = (c[x.status] || 0) + 1));
    const tally = order.filter((k) => c[k]).map((k) => `<div data-status="${k}"><b>${c[k]}</b>${statusChip(k, labels)}</div>`).join("");
    const total = list.length || 1;
    const bar = order.filter((k) => c[k]).map((k) => `<span style="width:${(c[k] / total) * 100}%;background:${STATUS_COLOR[k]}" title="${labels[k]}: ${c[k]}"></span>`).join("");
    return { tally, bar };
  }
  // status filter: the dropdown, or a click on a tally figure, narrows the table; the tally keeps the whole year
  const LOOP_STATUSES = ["met", "partial", "missed", "unclear", "pending"];
  let lStatus = "all";
  function renderLoop(year) {
    const all = D.loop[year] || [];
    const count = (s) => all.filter((r) => r.status === s).length;
    $("#loopStatus").innerHTML = `<option value="all">All statuses (${all.length})</option>` +
      LOOP_STATUSES.map((s) => `<option value="${s}"${count(s) ? "" : " disabled"}>${esc(LABEL[s])} (${count(s)})</option>`).join("");
    if (lStatus !== "all" && !count(lStatus)) lStatus = "all";
    $("#loopStatus").value = lStatus;
    const list = lStatus === "all" ? all : all.filter((r) => r.status === lStatus);
    const t = tallyHTML(all, LABEL);
    $("#loopTally").innerHTML = t.tally + `<div><b>${all.length}</b>targets tracked</div>`;
    $("#loopBar").innerHTML = t.bar;
    $$("#loopTally [data-status]").forEach((d) => {
      d.classList.add("pick");
      d.setAttribute("role", "button");
      d.setAttribute("tabindex", "0");
      d.setAttribute("aria-pressed", String(lStatus === d.dataset.status));
      d.classList.toggle("dim", lStatus !== "all" && lStatus !== d.dataset.status);
      const pick = () => { lStatus = lStatus === d.dataset.status ? "all" : d.dataset.status; renderLoop(year); };
      d.addEventListener("click", pick);
      d.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });
    $("#loopTable").innerHTML = `<colgroup><col style="width:17%"><col style="width:17%"><col style="width:19%"><col style="width:11%"><col></colgroup><thead><tr><th>Indicator</th><th>${year} target</th><th>Outturn</th><th>Status</th><th>What the later budgets say</th></tr></thead><tbody>` +
      (list.length ? "" : `<tr><td colspan="5" class="empty">No targets with this status.</td></tr>`) +
      list.map((r) => `<tr><td>${esc(r.indicator)}${r.unit ? ` <span class="muted small">(${esc(r.unit)})</span>` : ""}</td>
        <td>${esc(r.target_label || (r.target != null ? fmtNum(r.target) : "No target set"))}<br>${pg(year, r.target_page)}</td>
        <td>${esc(r.outturn_label || fmtNum(r.outturn))}<br>${pg(r.outturn_source_year || +year + 1, r.outturn_page)}</td>
        <td>${statusChip(r.status)}</td>
        <td class="small">${esc(r.comment || "")}${r.basis ? `<div class="muted">Basis: ${esc(r.basis)}</div>` : ""}</td></tr>`).join("") + `</tbody>`;
  }
  let cYear = String(FIRST), cStatus = "all", cArea = "all", cAll = false, cAreaYear = null;
  const MIDLABEL = { done: "done", "on track": "on track", delayed: "delayed", "not started": "not started" };
  function renderCommitments() {
    const all = D.commitments[cYear] || [];
    if (cAreaYear !== cYear) {
      const areas = byAreaOrder([...new Set(all.map((c) => c.area).filter(Boolean))]);
      $("#commitArea").innerHTML = `<option value="all">All areas</option>` + areas.map((a) => `<option>${esc(a)}</option>`).join("");
      cArea = "all"; cAreaYear = cYear;
    }
    const inArea = cArea === "all" ? all : all.filter((c) => c.area === cArea);
    const t = tallyHTML(inArea, CLABEL);
    $("#commitTally").innerHTML = t.tally + `<div><b>${inArea.length}</b>commitments${cArea === "all" ? "" : " in " + esc(cArea)}</div>`;
    const full = cStatus === "all" ? inArea : inArea.filter((c) => c.status === cStatus);
    const list = cAll ? full : full.slice(0, 10);
    const nextY = +cYear + 1;
    $("#commitList").innerHTML = (list.length ? list.map((c) => `<li>
        <div><div class="area">${esc(c.area)}</div>${statusChip(c.status, CLABEL)}</div>
        <div class="promise">${esc(c.commitment)}${c.target_value ? ` <span class="muted small">Target: ${esc(c.target_value)}</span>` : ""} ${pg(cYear, c.page)}</div>
        <div class="outcome">${c.midyear && MIDLABEL[c.midyear.status_at_midyear] ? `<div style="margin-bottom:6px"><span class="doc-chip">Mid-year: ${esc(MIDLABEL[c.midyear.status_at_midyear])}</span> ${esc(c.midyear.evidence || "")} ${pg("M" + cYear, c.midyear.page)}</div>` : ""}${c.status === "pending" ? `<span class="muted">Outturn will be reported in the ${nextY} Budget.</span>` : esc(c.outcome || "The following budget does not report on this.") + " " + (c.outcome_page ? pg(c.outcome_year || nextY, c.outcome_page) : "")}</div>
      </li>`).join("") : `<li><span class="empty">No commitments with this status.</span></li>`) +
      (full.length > 10 ? `<li style="display:block;border:0"><button type="button" class="theme-btn" id="commitMore" style="color:var(--ink);border-color:var(--rule)">${cAll ? "Show fewer" : `Show all ${full.length}`}</button></li>` : "");
    const mb = $("#commitMore");
    if (mb) mb.addEventListener("click", () => { cAll = !cAll; renderCommitments(); });
  }

  // ===================== SECTORS =====================
  function renderSectorGroups() {
    const rows = D.sectorGroups.map((g) => ({ label: g.group, values: g.values, note: g.note }));
    const draw = () => groupedHBar($("#sectorGroupChart"), rows, { fmt: (v) => fmtBn(v), unit: "GH¢bn", aria: "Allocation by sector group" });
    draw();
    redraws.push(draw);
    const ms = D.multiSectoral || {};
    $("#multiNote").innerHTML = `Not shown: the multi-sectoral vote (interest, statutory funds, pensions, the Big Push and arrears), which is larger than all ministries combined: ${YEARS.map((y) => `GH¢${fmtBn(ms[y] && ms[y].v)}bn in ${y}${ms[y] && ms[y].derived ? "*" : ""}`).join(", ")}. Its lines are in the ministry table below.${YEARS.some((y) => ms[y] && ms[y].derived) ? ` *Derived as the grand total minus all ministries; the ${andJoin(YEARS.filter((y) => ms[y] && ms[y].derived))} appendix prints no subtotal.` : ""}`;
  }
  // flagship programmes: pick a sector (assigned in the build) and any budget years to set side by side
  const INIT = { area: "all", years: new Set(YEARS) };
  function renderInitiatives() {
    const sel = $("#initArea");
    if (!sel.options.length) {
      const all = YEARS.flatMap((y) => D.initiatives[y] || []);
      const areas = byAreaOrder([...new Set(all.map((i) => i.area).filter(Boolean))]);
      sel.innerHTML = `<option value="all">All sectors (${all.length})</option>` + areas.map((a) => `<option value="${esc(a)}">${esc(a)} (${all.filter((i) => i.area === a).length})</option>`).join("");
      sel.addEventListener("change", () => { INIT.area = sel.value; renderInitiatives(); });
    }
    $("#initYears").innerHTML = YEARS.map((y) => `<button type="button" data-y="${y}" aria-pressed="${INIT.years.has(y)}"><i class="sw" style="background:var(--y${y})"></i>${y}</button>`).join("");
    $$("#initYears button").forEach((b) => b.addEventListener("click", () => { const y = +b.dataset.y; INIT.years.has(y) ? INIT.years.delete(y) : INIT.years.add(y); renderInitiatives(); }));
    const ys = YEARS.filter((y) => INIT.years.has(y));
    const listFor = (y) => (D.initiatives[y] || []).filter((i) => INIT.area === "all" || i.area === INIT.area).sort((a, b) => (b.allocation_ghs_m || 0) - (a.allocation_ghs_m || 0));
    if (!ys.length) {
      $("#initSummary").innerHTML = `<div class="empty">Pick at least one budget year above.</div>`;
      $("#initCols").innerHTML = "";
      return;
    }
    // per-year totals of the allocations the budgets state, so a sector can be compared year on year
    $("#initSummary").innerHTML = ys.map((y) => {
      const list = listFor(y), stated = list.filter((i) => i.allocation_ghs_m);
      const tot = stated.reduce((s, i) => s + i.allocation_ghs_m, 0);
      return `<div style="border-left:4px solid var(--y${y});padding-left:10px"><b>${tot ? "GH¢" + fmtBn(tot) + "bn" : "–"}</b>${y}: ${list.length} programme${list.length === 1 ? "" : "s"}${stated.length < list.length ? `, ${stated.length} with a stated amount` : ""}</div>`;
    }).join("") + `<div class="muted small" style="align-self:end">Totals add up the allocations each budget states for ${INIT.area === "all" ? "its flagship programmes" : esc(INIT.area.toLowerCase()) + " programmes"}.</div>`;
    const cap = INIT.area === "all" ? 6 : 12;
    $("#initCols").style.setProperty("--cols", ys.length);
    $("#initCols").innerHTML = ys.map((y) => {
      const list = listFor(y);
      const li = (t) => `<li><b>${esc(t.name)}</b>${t.allocation_ghs_m ? ` <span class="muted small">GH¢${fmtNum(t.allocation_ghs_m, 0)}m</span>` : ""}${INIT.area === "all" && t.area ? ` <span class="tag">${esc(t.area)}</span>` : ""}<br><span class="small">${esc(t.description || "")}</span> ${pg(y, t.page)}</li>`;
      return `<div class="yearcol" style="--yc:var(--y${y})"><h4>${y} Budget <span class="muted small">(${list.length})</span></h4>` +
        (list.length ? `<ul class="bullets">${list.slice(0, cap).map(li).join("")}</ul>${list.length > cap ? `<details class="more"><summary>${list.length - cap} more</summary><ul class="bullets">${list.slice(cap).map(li).join("")}</ul></details>` : ""}`
          : `<p class="empty">No ${esc(INIT.area.toLowerCase())} flagship programme in this budget.</p>`) + `</div>`;
    }).join("");
  }
  let mdaSort = { key: "v" + LAST, dir: -1 }, mdaAll = false;
  function renderMDA() {
    $("#mdaRange").textContent = `${FIRST} to ${LAST}`;
    $("#mdaChange").textContent = `${LAST} against ${FIRST}`;
    const groups = ["All sector groups", ...Array.from(new Set(D.mdas.map((m) => m.group)))];
    const sel = $("#mdaGroup");
    if (!sel.options.length) sel.innerHTML = groups.map((g) => `<option>${esc(g)}</option>`).join("");
    const g = sel.value, q = $("#mdaSearch").value.trim().toLowerCase();
    let rows = D.mdas.filter((m) => (g === "All sector groups" || m.group === g) && (!q || m.name.toLowerCase().includes(q) || (m.aliases || []).join(" ").toLowerCase().includes(q)));
    const val = (m, k) => {
      if (k === "name") return m.name;
      if (k === "group") return m.group;
      if (k === "change") return m.change == null ? -Infinity : m.change;
      const y = k.slice(1);
      return m.values[y] && m.values[y].v != null ? m.values[y].v : -Infinity;
    };
    rows.sort((a, b) => { const x = val(a, mdaSort.key), y = val(b, mdaSort.key); return (typeof x === "string" ? x.localeCompare(y) : x - y) * mdaSort.dir; });
    const max = Math.max(...D.mdas.flatMap((m) => YEARS.map((y) => (m.values[y] ? m.values[y].v || 0 : 0))));
    const total = rows.length;
    if (!mdaAll && !q) rows = rows.slice(0, 15);
    const arrow = (k) => (mdaSort.key === k ? (mdaSort.dir < 0 ? " ↓" : " ↑") : "");
    $("#mdaTable").innerHTML = `<thead><tr><th data-sort="name">Ministry / agency${arrow("name")}</th><th data-sort="group">Group${arrow("group")}</th>${YEARS.map((y) => `<th class="num" data-sort="v${y}">${y} (GH¢m)${arrow("v" + y)}</th>`).join("")}<th class="num" data-sort="change">Change${arrow("change")}</th><th style="min-width:120px">Scale</th></tr></thead><tbody>` +
      rows.map((m) => `<tr><td>${esc(m.name)}${m.note ? `<div class="muted small">${esc(m.note)}</div>` : ""}</td><td class="small muted">${esc(m.group)}</td>` +
        YEARS.map((y) => { const c = m.values[y]; return `<td class="num">${c && c.v != null ? fmtNum(c.v, 0) : '<span class="muted">–</span>'}</td>`; }).join("") +
        `<td class="num">${m.change > 0 ? "▲ " : m.change < 0 ? "▼ " : ""}${fmtPct(m.change)}</td>
        <td><svg viewBox="0 0 120 ${YEARS.length * 10}" width="120" height="${YEARS.length * 10}" aria-hidden="true">${YEARS.map((y, j) => { const c = m.values[y]; const w = c && c.v ? Math.max(1, (c.v / max) * 120) : 0; return w ? `<path d="${barPath(0, j * 10, w, 8, true)}" fill="var(--y${y})"/>` : ""; }).join("")}</svg></td></tr>`).join("") +
      `</tbody>` +
      (total > 15 && !q ? `<tfoot><tr><td colspan="${YEARS.length + 4}" style="border:0;padding-top:14px"><button type="button" class="theme-btn" id="mdaMore" style="color:var(--ink);border-color:var(--rule)">${mdaAll ? "Show top 15" : `Show all ${total}`}</button></td></tr></tfoot>` : "");
    const mm = $("#mdaMore");
    if (mm) mm.addEventListener("click", () => { mdaAll = !mdaAll; renderMDA(); });
    $$("#mdaTable th[data-sort]").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.sort;
      mdaSort = { key: k, dir: mdaSort.key === k ? -mdaSort.dir : (k === "name" || k === "group" ? 1 : -1) };
      renderMDA();
    }));
  }

  const docYear = (d) => +String(d).slice(1);
  function renderSectors() {
    const sel = $("#sectorSelect");
    if (!sel.options.length) {
      sel.innerHTML = D.sectors.map((x) => `<option>${esc(x.sector)}</option>`).join("");
      sel.addEventListener("change", renderSectors);
      $("#sectorShow").addEventListener("change", renderSectors);
    }
    const s = D.sectors.find((x) => x.sector === sel.value) || D.sectors[0];
    const show = $("#sectorShow").value;
    const list = (arr, doc, cls) => (arr && arr.length ? `<ul class="bullets ${cls || ""}">${arr.slice(0, 7).map((t) => `<li>${linkify(t, doc)}</li>`).join("")}</ul>${arr.length > 7 ? `<details class="more"><summary>${arr.length - 7} more</summary><ul class="bullets ${cls || ""}">${arr.slice(7).map((t) => `<li>${linkify(t, doc)}</li>`).join("")}</ul></details>` : ""}` : `<p class="empty">Nothing stated.</p>`);
    $("#sectorCols").innerHTML = DOC_ORDER.filter((d) => s.docs[d]).map((d) => {
      const x = s.docs[d], y = docYear(d), mid = d[0] === "M";
      const parts = [];
      if (show === "all" || show === "achievements") parts.push(`<h5>${mid ? `Achieved January–June ${y}` : `Achieved in ${y - 1}`}</h5>${list(x.achievements, d, "good")}`);
      if ((show === "all" || show === "gaps") && (mid || y > FIRST || (x.gaps && x.gaps.length))) parts.push(`<h5>Not achieved or delayed</h5>${list(x.gaps, d, "bad")}`);
      if ((show === "all" || show === "plans") && !mid) parts.push(`<h5>Planned for ${y}</h5>${list(x.plans, d)}`);
      if (!parts.length) parts.push(`<p class="empty">Mid-year reviews report progress, not plans.</p>`);
      return `<div class="yearcol ${mid ? "midcol" : ""}" style="--yc:var(--y${y})"><h4>${esc(docOf(d).label)}</h4>${parts.join("")}</div>`;
    }).join("");
  }

  // ===================== REGIONS =====================
  const TILE = {
    "Upper West": [0, 1], "Upper East": [0, 3],
    "Savannah": [1, 1], "Northern": [1, 2], "North East": [1, 3],
    "Bono": [2, 1], "Bono East": [2, 2], "Oti": [2, 3],
    "Western North": [3, 0], "Ahafo": [3, 1], "Ashanti": [3, 2], "Eastern": [3, 3], "Volta": [3, 4],
    "Western": [4, 0], "Central": [4, 1], "Greater Accra": [4, 3],
  };
  const SEQ = ["#e8f1fc", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
  // filters: any budget years, which documents (budgets / mid-year reviews), and the status a document gives an item
  const RSTAT = [
    { k: "completed", label: "Completed", color: "var(--good)" },
    { k: "ongoing", label: "Ongoing", color: "var(--warn)" },
    { k: "planned", label: "Planned", color: "#2a78d6" },
    { k: "none", label: "Status not stated", color: "var(--neutral)" },
  ];
  const statusOf = (i) => (RSTAT.some((x) => x.k === i.status) ? i.status : "none");
  const RF = { years: new Set(D.regions.flatMap((r) => r.items.map((i) => i.year))), src: "all", status: "all" };
  let curRegion = null;
  const docMatch = (i) => RF.years.has(i.year) && (RF.src === "all" || i.doc[0] === RF.src) && (RF.status === "all" || statusOf(i) === RF.status);
  const regionRaw = (name) => (D.regions.find((x) => x.region === name) || { items: [] }).items;
  function regionItems(name) {
    return regionRaw(name).filter(docMatch);
  }
  function initRegionFilters() {
    $("#regionSelect").innerHTML = `<option value="">Overview: measures for every region</option>` + Object.keys(TILE).sort().map((n) => `<option>${esc(n)}</option>`).join("");
    $("#regionDoc").innerHTML = `<option value="all">Budgets and mid-year reviews</option><option value="B">Budgets only</option><option value="M">Mid-year reviews only</option>`;
    $("#regionSelect").addEventListener("change", (e) => { curRegion = e.target.value || null; renderRegions(); });
    $("#regionDoc").addEventListener("change", (e) => { RF.src = e.target.value; renderRegions(); });
    $("#regionStatus").addEventListener("change", (e) => { RF.status = e.target.value; renderRegions(); });
  }
  function renderRegionFilters() {
    const ys = [...new Set(D.regions.flatMap((r) => r.items.map((i) => i.year)))].sort();
    $("#regionYears").innerHTML = ys.map((y) => `<button type="button" data-y="${y}" aria-pressed="${RF.years.has(y)}"><i class="sw" style="background:var(--y${y})"></i>${y}</button>`).join("");
    $$("#regionYears button").forEach((b) => b.addEventListener("click", () => { const y = +b.dataset.y; RF.years.has(y) ? RF.years.delete(y) : RF.years.add(y); renderRegions(); }));
    // status counts follow the region, years and documents chosen (but not the status itself)
    const pool = (curRegion ? regionRaw(curRegion) : D.regions.flatMap((r) => r.items)).filter((i) => RF.years.has(i.year) && (RF.src === "all" || i.doc[0] === RF.src));
    const n = (k) => pool.filter((i) => statusOf(i) === k).length;
    $("#regionStatus").innerHTML = `<option value="all">All statuses (${pool.length})</option>` + RSTAT.map((x) => `<option value="${x.k}"${n(x.k) ? "" : " disabled"}>${x.label} (${n(x.k)})</option>`).join("");
    if (RF.status !== "all" && !n(RF.status)) RF.status = "all";
    $("#regionStatus").value = RF.status;
  }
  function renderRegions() {
    renderRegionFilters();
    renderTiles();
    renderRegionDetail();
  }
  function renderTiles() {
    const counts = Object.keys(TILE).map((n) => regionItems(n).length);
    const max = Math.max(...counts, 1);
    $("#tilemap").innerHTML = Object.entries(TILE).map(([n, [r, c]]) => {
      const k = regionItems(n).length;
      const idx = k ? Math.min(SEQ.length - 1, 1 + Math.floor((k / max) * (SEQ.length - 2))) : 0;
      return `<button type="button" class="tile ${idx >= 4 ? "dark-text" : ""}" style="grid-row:${r + 1};grid-column:${c + 1};background:${SEQ[idx]}" aria-pressed="${n === curRegion}" aria-label="${esc(n)}: ${k} items"><span class="nm">${esc(n)}</span><span class="ct">${k}</span></button>`;
    }).join("");
    $$("#tilemap .tile").forEach((t) => t.addEventListener("click", () => { curRegion = t.querySelector(".nm").textContent; $("#regionSelect").value = curRegion; renderRegions(); }));
    $("#ramp").innerHTML = `<span>Fewer</span><span class="sw">${SEQ.map((c) => `<i style="background:${c}"></i>`).join("")}</span><span>More items named</span>`;
  }
  // one row per chosen year: how many items, split by status, so years can be compared at a glance
  function regionCompareHTML(items) {
    const ys = [...RF.years].sort();
    const byY = ys.map((y) => ({ y, list: items.filter((i) => i.year === y) }));
    const max = Math.max(1, ...byY.map((r) => r.list.length));
    return `<div class="rcmp">` + byY.map(({ y, list }) => {
      const parts = RSTAT.map((x) => ({ ...x, n: list.filter((i) => statusOf(i) === x.k).length })).filter((x) => x.n);
      return `<div class="rcmp-row"><span class="rcmp-y" style="border-color:var(--y${y})">${y}</span><span class="rcmp-n">${list.length}</span>` +
        `<span class="rcmp-bar">${parts.map((x) => `<i style="width:${(x.n / max) * 100}%;background:${x.color}" title="${x.label}: ${x.n}"></i>`).join("")}</span>` +
        `<span class="rcmp-txt">${parts.map((x) => `${x.n} ${x.label.toLowerCase()}`).join(" · ") || "none named"}</span></div>`;
    }).join("") + `</div><div class="rcmp-key">${RSTAT.map((x) => `<span><i style="background:${x.color}"></i>${x.label}</span>`).join("")}</div>`;
  }
  function renderRegionDetail() {
    const box = $("#regionItems");
    const nat = D.regions.find((x) => x.region === "National/Decentralisation");
    const items = curRegion ? regionItems(curRegion) : nat ? nat.items.filter(docMatch) : [];
    const ys = [...new Set(items.map((i) => i.year))].sort();
    $("#regionTitle").textContent = curRegion ? curRegion + " Region" : "Select a region";
    $("#regionSub").textContent = curRegion
      ? `${items.length} item${items.length === 1 ? "" : "s"} in ${RF.years.size ? andJoin([...RF.years].sort()) : "no year"}${RF.src === "B" ? ", budgets only" : RF.src === "M" ? ", mid-year reviews only" : ""}`
      : "Tap a tile on the map. Below are the decentralisation measures that apply to every region.";
    $("#regionCompare").innerHTML = RF.years.size ? regionCompareHTML(items) : "";
    if (!RF.years.size) { box.innerHTML = `<li><span class="empty" style="grid-column:1/-1">Pick at least one year.</span></li>`; return; }
    if (!items.length) { box.innerHTML = `<li><span class="empty" style="grid-column:1/-1">No items${curRegion ? " for " + esc(curRegion) : ""} match these filters.</span></li>`; return; }
    // several years: list each year under its own heading, newest first
    box.innerHTML = ys.length > 1
      ? ys.slice().reverse().map((y) => { const l = items.filter((i) => i.year === y); return `<li class="ry-head" style="--yc:var(--y${y})"><b>${y}</b><span>${l.length} item${l.length === 1 ? "" : "s"}</span></li>` + capped(l); }).join("")
      : capped(items);
  }
  const capped = (arr) => arr.slice(0, 12).map(itemLi).join("") + (arr.length > 12 ? `<li style="display:block;border:0"><details class="more"><summary>Show ${arr.length - 12} more</summary><ul class="region-items">${arr.slice(12).map(itemLi).join("")}</ul></details></li>` : "");
  const itemLi = (i) => `<li><span class="yr-chip y${i.year} ${i.doc && i.doc[0] === "M" ? "mid" : ""}" title="${esc(docOf(i.doc || i.year).label)}">${i.doc && i.doc[0] === "M" ? "MY" + String(i.year).slice(2) : i.year}</span><span>${esc(i.text)}${i.status ? `<span class="tag">${esc(i.status)}</span>` : ""}${i.amount_ghs_m ? ` <span class="muted small">GH¢${fmtNum(i.amount_ghs_m)}m</span>` : ""} ${pg(i.doc || i.year, i.page)}</span></li>`;
  // region comparison: one set of region and year pickers drives both charts
  const REGION_NAMES = Object.keys(TILE).sort();
  const shareOf = (n, y) => { const s = D.regionShares.find((x) => x.label === n); return (s && s.values[y] && s.values[y].v) || 0; };
  const RC = {
    // start with the four regions holding the largest share in the latest budget, all years on
    regions: new Set(REGION_NAMES.slice().sort((a, b) => shareOf(b, LAST) - shareOf(a, LAST)).slice(0, 4)),
    years: new Set(YEARS),
  };
  function renderRegionPickers() {
    $("#rcRegions").innerHTML = REGION_NAMES.map((n) => `<button type="button" data-r="${esc(n)}" aria-pressed="${RC.regions.has(n)}">${esc(n)}</button>`).join("");
    $("#rcYears").innerHTML = YEARS.map((y) => `<button type="button" data-y="${y}" aria-pressed="${RC.years.has(y)}"><i class="sw" style="background:var(--y${y})"></i>${y}</button>`).join("");
    $("#rcCount").textContent = `${RC.regions.size} of ${REGION_NAMES.length} regions`;
    $$("#rcRegions button").forEach((b) => b.addEventListener("click", () => { const n = b.dataset.r; RC.regions.has(n) ? RC.regions.delete(n) : RC.regions.add(n); renderRegionPickers(); drawRegionCharts(); }));
    $$("#rcYears button").forEach((b) => b.addEventListener("click", () => { const y = +b.dataset.y; RC.years.has(y) ? RC.years.delete(y) : RC.years.add(y); renderRegionPickers(); drawRegionCharts(); }));
  }
  function drawRegionCharts() {
    const ys = YEARS.filter((y) => RC.years.has(y));
    const latest = ys[ys.length - 1];
    const empty = !RC.regions.size ? "Pick at least one region above." : !ys.length ? "Pick at least one budget year above." : "";
    $("#yearLegend4").innerHTML = $("#yearLegend5").innerHTML = empty ? "" : yearLegend(ys);
    if (empty) {
      $("#regionChart").innerHTML = $("#shareChart").innerHTML = `<p class="empty">${empty}</p>`;
      $("#shareNote").innerHTML = "";
      return;
    }
    // both charts sort by the latest chosen year, largest first
    const rows = REGION_NAMES.filter((n) => RC.regions.has(n)).map((n) => {
      const r = D.regions.find((x) => x.region === n) || { items: [] };
      const v = {};
      YEARS.forEach((y) => (v[y] = { v: r.items.filter((i) => i.doc === "B" + y).length }));
      return { label: n, values: v };
    }).sort((a, b) => b.values[latest].v - a.values[latest].v || a.label.localeCompare(b.label));
    groupedHBar($("#regionChart"), rows, { years: ys, fmt: (v) => fmtNum(v, 0), unit: "items", aria: "Region-specific items by budget year" });
    const shares = D.regionShares.filter((s) => RC.regions.has(s.label)).sort((a, b) => shareOf(b.label, latest) - shareOf(a.label, latest));
    groupedHBar($("#shareChart"), shares, { years: ys, fmt: (v) => fmtNum(v, 1) + "%", unit: "", aria: "Regional share of district assembly ceilings" });
    const picked = shares.reduce((acc, s) => { ys.forEach((y) => (acc[y] = (acc[y] || 0) + shareOf(s.label, y))); return acc; }, {});
    const T = D.ceilingTotals || {};
    $("#shareNote").innerHTML = (RC.regions.size > 1 && RC.regions.size < REGION_NAMES.length ? `Together these ${RC.regions.size} regions hold ${ys.map((y) => `${fmtNum(picked[y], 1)}% in ${y}`).join(", ")}. ` : "") +
      `Totals across all districts: ${ys.map((y) => `GH¢${fmtNum(T[y] && T[y].v, 0)}m in ${y} ${pg(y, T[y] && T[y].page)}`).join(", ")}. The appendix covers different items each year (2027 adds the Common Fund), so compare shares rather than amounts.`;
  }
  function renderRegionChart() {
    renderRegionPickers();
    $("#rcAll").addEventListener("click", () => { REGION_NAMES.forEach((n) => RC.regions.add(n)); renderRegionPickers(); drawRegionCharts(); });
    $("#rcNone").addEventListener("click", () => { RC.regions.clear(); renderRegionPickers(); drawRegionCharts(); });
    drawRegionCharts();
    redraws.push(drawRegionCharts);
  }

  // ===================== SUCCESSES / GAPS =====================
  let scoreY = null;
  function renderScore() {
    const y = $("#scoreYear").value;
    const src = +y + 1; // the budget that reviews year y
    if (scoreY !== y) {
      const areas = byAreaOrder([...new Set([...(D.successes[y] || []), ...(D.gaps[y] || [])].map((x) => x.area).filter(Boolean))]);
      $("#scoreArea").innerHTML = `<option value="all">All areas</option>` + areas.map((a) => `<option>${esc(a)}</option>`).join("");
      scoreY = y;
    }
    const area = $("#scoreArea").value;
    const keep = (x) => area === "all" || x.area === area;
    const li = (x) => `<li>${esc(x.text)}<div class="meta">${esc(x.area || "")}${x.area ? " · " : ""}${pg(x.doc || src, x.page)}</div></li>`;
    const s = (D.successes[y] || []).filter(keep), g = (D.gaps[y] || []).filter(keep);
    const block = (arr) => !arr.length ? `<li class="empty">None listed.</li>` : arr.slice(0, 12).map(li).join("") +
      (arr.length > 12 ? `<li style="border:0"><details class="more"><summary>Show ${arr.length - 12} more</summary><ul class="itemlist">${arr.slice(12).map(li).join("")}</ul></details></li>` : "");
    $("#successList").innerHTML = block(s);
    $("#gapList").innerHTML = block(g);
  }

  // ===================== SHORTFALLS =====================
  let dBasis = "ytd";
  const BASIS = { h1: "Half-year, from the Mid-Year Review", ytd: "Year to date, from the next budget", full: "Full year (projected or actual)" };
  function renderDev(y) {
    const dv = D.deviations[y] || { full: [], ytd: [] };
    const avail = ["h1", "ytd", "full"].filter((k) => dv[k] && dv[k].length);
    const bsel = $("#devBasis");
    bsel.innerHTML = avail.map((k) => `<option value="${k}">${BASIS[k]}</option>`).join("");
    const basis = avail.includes(dBasis) ? dBasis : avail.includes("ytd") ? "ytd" : avail[0];
    bsel.value = basis;
    const rows = (dv[basis] || []).filter((r) => r.budget != null && r.outturn != null && r.budget !== 0);
    $("#devNote").textContent = +y === D.preYear
      ? `${y} actual outturn against the ${y} revised budget, as reported in the ${+y + 1} Budget.`
      : basis === "h1" ? `Half-year outturn against the half-year programme, as reported in the ${y} Mid-Year Review.`
      : basis === "ytd" ? `Provisional actual figures for ${dv.ytd_label} against the programmed target for the same period, as reported in the ${+y + 1} Budget.`
      : `Projected full-year outturn against the mid-year revised ${y} budget. Projections often simply repeat the budget figure, so the year-to-date view is the firmer evidence.`;
    const el = $("#devChart");
    const W = Math.max(320, el.clientWidth || 800), narrow = W < 560;
    const labelW = narrow ? 0 : Math.min(240, W * 0.32), barH = 14, rowH = narrow ? 40 : 26, top = 22;
    const H = top + rows.length * rowH + 24;
    const pcts = rows.map((r) => ((r.outturn - r.budget) / Math.abs(r.budget)) * 100);
    const lim = Math.max(10, ...pcts.map(Math.abs));
    const plotX = labelW + 58, plotW = W - plotX - 54;
    const sx = (v) => plotX + ((v + lim) / (2 * lim)) * plotW;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Deviation of ${y} outturn from budget"><g class="axis"><text x="${sx(-lim / 2)}" y="12" text-anchor="middle">Below budget</text><text x="${sx(lim / 2)}" y="12" text-anchor="middle">Above budget</text></g><g class="grid">`;
    niceTicks(-lim, lim, narrow ? 4 : 6).forEach((t) => (s += `<line x1="${sx(t)}" x2="${sx(t)}" y1="${top - 4}" y2="${H - 20}"/><text class="lbl" x="${sx(t)}" y="${H - 6}" text-anchor="middle">${t > 0 ? "+" : ""}${t}%</text>`));
    s += `</g>`;
    rows.forEach((r, i) => {
      const p = pcts[i], y0 = top + i * rowH + (narrow ? 16 : 0);
      const x0 = sx(Math.min(0, p)), x1 = sx(Math.max(0, p));
      s += `<g class="cat" data-i="${i}"><rect class="hover-band" x="0" y="${y0 - (narrow ? 18 : 6)}" width="${W}" height="${rowH}" rx="4"/>`;
      s += narrow ? `<text class="lbl" x="4" y="${y0 - 4}" style="font-size:12px;fill:var(--ink-2)">${esc(r.item)}</text>` : wrapLabel(r.item, labelW, y0 + barH / 2);
      s += `<path d="${barPath(x0, y0, Math.max(1, x1 - x0), barH, p >= 0)}" fill="${p >= 0 ? "#2a78d6" : "#e34948"}"/>`;
      s += `<text class="val" x="${p >= 0 ? x1 + 5 : x0 - 5}" y="${y0 + barH - 3}" text-anchor="${p >= 0 ? "start" : "end"}">${fmtPct(p)}</text>`;
      s += `<rect class="hit" x="0" y="${y0 - (narrow ? 18 : 6)}" width="${W}" height="${rowH}"/></g>`;
    });
    s += `<line class="zero" x1="${sx(0)}" x2="${sx(0)}" y1="${top - 4}" y2="${H - 20}"/></svg>`;
    el.innerHTML = rows.length ? s : `<p class="empty">No budget-versus-outturn table reported.</p>`;
    $$("g.cat", el).forEach((g) => {
      const r = rows[+g.dataset.i];
      const h = `<div class="tt-title">${esc(r.item)}</div><div class="tt-row"><span>Budget</span><b>GH¢${fmtNum(r.budget, 0)}m</b></div><div class="tt-row"><span>Outturn</span><b>GH¢${fmtNum(r.outturn, 0)}m</b></div><div class="tt-row"><span>Gap</span><b>GH¢${fmtNum(r.outturn - r.budget, 0)}m</b></div>${r.basis ? `<div class="muted small" style="margin-top:4px">${esc(r.basis)}</div>` : ""}`;
      g.addEventListener("mouseenter", (e) => showTip(h, e));
      g.addEventListener("mousemove", moveTip);
      g.addEventListener("mouseleave", hideTip);
    });
    $("#devTable").innerHTML = `<thead><tr><th>Item</th><th class="num">Budget (GH¢m)</th><th class="num">Outturn (GH¢m)</th><th class="num">Gap (GH¢m)</th><th class="num">Gap %</th><th>Source</th></tr></thead><tbody>` +
      rows.map((r, i) => `<tr><td>${esc(r.item)}</td><td class="num">${fmtNum(r.budget, 0)}</td><td class="num">${fmtNum(r.outturn, 0)}</td><td class="num">${fmtNum(r.outturn - r.budget, 0)}</td><td class="num">${fmtPct(pcts[i])}</td><td>${pg(r.doc || +y + 1, r.page)}</td></tr>`).join("") + `</tbody>`;
  }
  let dYear = String(FIRST);
  function renderDebtRisk() {
    $("#debtBox").innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Reported in</th><th class="num">Debt stock</th><th class="num">% of GDP</th><th>As at</th></tr></thead><tbody>` +
      YEARS.map((y) => { const d = D.debt[y] || {}; return `<tr><td>${y} Budget</td><td class="num">GH¢${fmtBn(d.stock_ghs_m)}bn</td><td class="num">${d.pct_gdp != null ? d.pct_gdp + "%" : "–"}</td><td class="small">${esc(d.as_at || "")} ${pg(y, d.page)}</td></tr>`; }).join("") +
      `</tbody></table></div>` + YEARS.map((y) => (D.debt[y] && D.debt[y].notes ? `<p class="small" style="margin-top:10px"><b>${y}:</b> ${esc(D.debt[y].notes)}</p>` : "")).join("");
    $("#riskBox").innerHTML = `<div class="yearcols" style="grid-template-columns:1fr">` + YEARS.map((y) => `<div class="yearcol" style="--yc:var(--y${y})"><h4>${y} Budget</h4><ul class="bullets">${(D.risks[y] || []).slice(0, 6).map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>`).join("") + `</div>`;
  }

  // ===================== COMPARE (year picker + selection) =====================
  const CMP = { years: new Set(YEARS), set: "groups", measure: "ghs", sort: "to", q: "", grp: "All sector groups", sel: {} };
  function cmpItems(set) {
    if (set === "fiscal") return D.fiscal.map((f) => ({ id: f.item, label: f.item, values: f.values }));
    if (set === "groups") {
      const g = D.sectorGroups.map((x) => ({ id: x.group, label: x.group, values: x.values }));
      g.push({ id: "Multi-sectoral", label: "Multi-sectoral (interest, statutory funds, Big Push…)", values: D.multiSectoral });
      return g;
    }
    return D.mdas.map((m) => ({ id: m.name, label: m.name, group: m.group, values: m.values }));
  }
  const CMP_DEFAULT = {
    fiscal: ["Total revenue & grants", "Tax revenue", "Total expenditure", "Compensation of employees", "Interest payments", "Capital expenditure"],
    groups: ["Social", "Public Safety", "Administration", "Infrastructure", "Economic"],
    mdas: D.mdas.filter((m) => m.group !== "Multi-sectoral").slice(0, 10).map((m) => m.name),
  };
  Object.keys(CMP_DEFAULT).forEach((k) => (CMP.sel[k] = new Set(CMP_DEFAULT[k])));
  const gdpOf = (y) => D.years[y].gdp_nominal.v;
  const cmpVal = (cell, y) => (cell && cell.v != null ? (CMP.measure === "gdp" ? (cell.v / gdpOf(y)) * 100 : cell.v / 1000) : null);
  const cmpFmt = (v) => v == null ? "–" : CMP.measure === "gdp"
    ? (Math.abs(v) < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "%"
    : (Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1));
  const cmpUnit = () => (CMP.measure === "gdp" ? "% of GDP" : "GH¢bn");
  // a change in a share of GDP is in percentage points, not percent
  const cmpDelta = (d) => d == null ? "–" : (d > 0 ? "+" : "") + (CMP.measure === "gdp" ? (Math.abs(d) < 0.1 ? d.toFixed(3) : d.toFixed(2)) + " pts" : cmpFmt(d));

  function renderCmpChips() {
    const items = cmpItems(CMP.set);
    const sel = CMP.sel[CMP.set];
    const grpSel = $("#cmpGroup");
    grpSel.hidden = CMP.set !== "mdas";
    if (CMP.set === "mdas" && !grpSel.options.length) grpSel.innerHTML = ["All sector groups", ...new Set(D.mdas.map((m) => m.group))].map((g) => `<option>${esc(g)}</option>`).join("");
    const q = CMP.q.toLowerCase();
    const visible = items.filter((i) => (!q || i.label.toLowerCase().includes(q)) && (CMP.set !== "mdas" || CMP.grp === "All sector groups" || i.group === CMP.grp));
    $("#cmpChips").innerHTML = visible.map((i) => `<button type="button" data-id="${esc(i.id)}" aria-pressed="${sel.has(i.id)}">${esc(i.label)}</button>`).join("") || `<span class="empty">Nothing matches that filter.</span>`;
    $("#cmpCount").textContent = `${sel.size} of ${items.length} selected`;
    $$("#cmpChips button").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.id;
      sel.has(id) ? sel.delete(id) : sel.add(id);
      b.setAttribute("aria-pressed", sel.has(id));
      $("#cmpCount").textContent = `${sel.size} of ${items.length} selected`;
      drawCompare();
    }));
    return visible;
  }

  function drawCompare() {
    const ys = YEARS.filter((y) => CMP.years.has(y));
    const A = ys[0], B = ys[ys.length - 1], multi = ys.length > 1;
    const sel = CMP.sel[CMP.set];
    const summ = $("#cmpSummary");
    if (!ys.length) {
      summ.innerHTML = `<div class="empty">Pick at least one budget year above.</div>`;
      $("#cmpLegend").innerHTML = $("#cmpChart").innerHTML = $("#cmpTable").innerHTML = "";
      return;
    }
    let rows = cmpItems(CMP.set).filter((i) => sel.has(i.id)).map((i) => {
      const v = {};
      ys.forEach((y) => (v[y] = cmpVal(i.values[y], y)));
      const a = v[A], b = v[B];
      return { ...i, v, a, b, d: multi && a != null && b != null ? b - a : null, pct: multi && a != null && b != null && a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null };
    });
    const sorters = {
      to: (x, y) => (y.b ?? -Infinity) - (x.b ?? -Infinity),
      rise: (x, y) => (y.pct ?? -Infinity) - (x.pct ?? -Infinity),
      fall: (x, y) => (x.pct ?? Infinity) - (y.pct ?? Infinity),
      name: (x, y) => x.label.localeCompare(y.label),
    };
    rows.sort(sorters[CMP.sort]);
    $("#cmpLegend").innerHTML = ys.map((y) => `<span><i style="background:var(--y${y})"></i>${y} Budget</span>`).join("");

    // summary
    if (!rows.length) {
      summ.innerHTML = `<div class="empty">Tick at least one item above to compare.</div>`;
      $("#cmpChart").innerHTML = "";
      $("#cmpTable").innerHTML = "";
      return;
    }
    const range = `${A}${multi ? " → " + B : ""}`;
    const both = rows.filter((r) => r.d != null);
    const up = both.filter((r) => r.d > 0).length, down = both.filter((r) => r.d < 0).length;
    let html = "";
    if (CMP.set !== "fiscal") {
      // combined total per year, over items that have a figure in every chosen year
      const full = rows.filter((r) => ys.every((y) => r.v[y] != null));
      const tot = ys.map((y) => full.reduce((s, r) => s + r.v[y], 0));
      const ta = tot[0], tb = tot[tot.length - 1];
      html += !multi ? `<div><b>${cmpFmt(ta)}</b>total${CMP.measure === "gdp" ? " share of GDP" : ", GH¢bn,"} for ${full.length} item${full.length !== 1 ? "s" : ""} in ${A}</div>`
        : `<div><b>${tot.map(cmpFmt).join(" → ")}</b>combined${CMP.measure === "gdp" ? " share of GDP" : ", GH¢bn"}, ${ys.join(" · ")} (${CMP.measure === "gdp" ? cmpDelta(tb - ta) : fmtPct(ta ? ((tb - ta) / Math.abs(ta)) * 100 : null)} overall)</div>`;
    }
    if (multi) {
      html += `<div><b>${up} up · ${down} down</b>items rising and falling, ${range}</div>`;
      const top = both.filter((r) => r.pct != null).sort((x, y) => y.pct - x.pct);
      if (top.length) html += `<div><b>${fmtPct(top[0].pct)}</b>largest rise: ${esc(top[0].label)}</div>`;
      if (top.length > 1 && top[top.length - 1].pct < 0) html += `<div><b>${fmtPct(top[top.length - 1].pct)}</b>largest fall: ${esc(top[top.length - 1].label)}</div>`;
    } else html += `<div class="muted small" style="align-self:end">Pick a second year to see the change.</div>`;
    summ.innerHTML = html;

    // strip chart: one dot per chosen year on each item's row
    const el = $("#cmpChart");
    const W = Math.max(320, el.clientWidth || 800), narrow = W < 600;
    const labelW = narrow ? 0 : Math.min(260, W * 0.3), chgW = multi ? 70 : 10;
    const rowH = narrow ? 46 : 32, top = 8;
    const H = top + rows.length * rowH + 24;
    const vals = rows.flatMap((r) => ys.map((y) => r.v[y])).filter((v) => v != null);
    const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
    const plotX = labelW + 16 + (min < 0 ? 40 : 0), plotW = W - plotX - chgW - 48;
    const sx = (v) => plotX + ((v - min) / (max - min || 1)) * plotW;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Comparison of the ${ys.join(", ")} budgets"><g class="grid">`;
    niceTicks(min, max, narrow ? 3 : 5).forEach((t) => (s += `<line x1="${sx(t)}" x2="${sx(t)}" y1="${top}" y2="${H - 20}"/><text class="lbl" x="${sx(t)}" y="${H - 6}" text-anchor="middle">${cmpFmt(t)}</text>`));
    s += `</g>`;
    if (multi) s += `<text class="lbl" x="${W - 4}" y="${top + 2}" text-anchor="end" style="font-size:10px">change ${range}</text>`;
    rows.forEach((r, i) => {
      const cy = top + i * rowH + (narrow ? 30 : rowH / 2);
      s += `<g class="cat" data-i="${i}"><rect class="hover-band" x="0" y="${top + i * rowH}" width="${W}" height="${rowH}" rx="4"/>`;
      s += narrow ? `<text class="lbl" x="2" y="${cy - 14}" style="font-size:12px;fill:var(--ink-2)">${esc(r.label.length > 52 ? r.label.slice(0, 50) + "…" : r.label)}</text>` : wrapLabel(r.label, labelW, cy);
      const xs = ys.map((y) => (r.v[y] != null ? sx(r.v[y]) : null)).filter((x) => x != null);
      if (xs.length > 1) s += `<line class="dumb-line" x1="${Math.min(...xs)}" x2="${Math.max(...xs)}" y1="${cy}" y2="${cy}"/>`;
      ys.forEach((y) => { if (r.v[y] != null) s += `<circle class="dot" cx="${sx(r.v[y])}" cy="${cy}" r="${y === B ? 7.5 : 6}" fill="var(--y${y})"/>`; });
      // latest year's value sits right of the strip, earliest year's left of it
      if (xs.length) {
        const hi = Math.max(...xs), lo = Math.min(...xs);
        if (r.b != null) s += `<text class="val" x="${hi + 11}" y="${cy + 4}">${cmpFmt(r.b)}</text>`;
        if (multi && r.a != null && hi - lo > 2) s += `<text class="lbl" x="${lo - 10}" y="${cy + 4}" text-anchor="end">${cmpFmt(r.a)}</text>`;
      }
      const missing = ys.filter((y) => r.v[y] == null);
      if (missing.length) s += `<text class="lbl" x="${(xs.length ? Math.max(...xs) : plotX) + 12}" y="${cy + 16}" style="font-size:10px">not in the ${missing.join(", ")} Budget${missing.length > 1 ? "s" : ""}</text>`;
      if (multi) s += `<text class="val" x="${W - 4}" y="${cy + 4}" text-anchor="end">${r.pct != null ? (r.pct > 0 ? "▲ " : r.pct < 0 ? "▼ " : "") + fmtPct(r.pct) : "–"}</text>`;
      s += `<rect class="hit" x="0" y="${top + i * rowH}" width="${W}" height="${rowH}"/></g>`;
    });
    if (min < 0) s += `<line class="zero" x1="${sx(0)}" x2="${sx(0)}" y1="${top}" y2="${H - 20}"/>`;
    el.innerHTML = s + `</svg>`;
    $$("g.cat", el).forEach((g) => {
      const r = rows[+g.dataset.i];
      const srcs = ys.map((y) => (r.values[y] && r.values[y].page ? `${y} p.${r.values[y].page}` : "")).filter(Boolean);
      const h = `<div class="tt-title">${esc(r.label)}</div>` +
        ys.map((y) => `<div class="tt-row"><span><i style="background:var(--y${y})"></i>${y}</span><b>${cmpFmt(r.v[y])} ${r.v[y] != null ? cmpUnit() : ""}</b></div>`).join("") +
        (r.d != null ? `<div class="tt-row"><span>Change ${range}</span><b>${cmpDelta(r.d)} (${fmtPct(r.pct)})</b></div>` : "") +
        (srcs.length ? `<div class="muted small" style="margin-top:4px">Source: ${srcs.join(", ")}</div>` : "");
      g.addEventListener("mouseenter", (e) => showTip(h, e));
      g.addEventListener("mousemove", moveTip);
      g.addEventListener("mouseleave", hideTip);
    });

    // table
    $("#cmpTable").innerHTML = `<thead><tr><th>Item</th>${ys.map((y) => `<th class="num">${y} (${cmpUnit()})</th>`).join("")}${multi ? `<th class="num">Change ${range}</th><th class="num">Change %</th>` : ""}<th>Sources</th></tr></thead><tbody>` +
      rows.map((r) => `<tr><td>${esc(r.label)}</td>${ys.map((y) => `<td class="num">${cmpFmt(r.v[y])}</td>`).join("")}${multi ? `<td class="num">${cmpDelta(r.d)}</td><td class="num">${fmtPct(r.pct)}</td>` : ""}<td>${ys.map((y) => pg(y, r.values[y] && r.values[y].page)).join(" ")}</td></tr>`).join("") + `</tbody>`;
  }

  function initCompare() {
    const renderYears = () => {
      $("#cmpYears").innerHTML = YEARS.map((y) => `<button type="button" data-y="${y}" aria-pressed="${CMP.years.has(y)}"><i class="sw" style="background:var(--y${y})"></i>${y}</button>`).join("");
      $$("#cmpYears button").forEach((b) => b.addEventListener("click", () => {
        const y = +b.dataset.y;
        CMP.years.has(y) ? CMP.years.delete(y) : CMP.years.add(y);
        renderYears();
        drawCompare();
      }));
    };
    $("#cmpYearsAll").addEventListener("click", () => { YEARS.forEach((y) => CMP.years.add(y)); renderYears(); drawCompare(); });
    $("#cmpSet").addEventListener("change", (e) => { CMP.set = e.target.value; CMP.q = ""; $("#cmpSearch").value = ""; renderCmpChips(); drawCompare(); });
    $("#cmpMeasure").addEventListener("change", (e) => { CMP.measure = e.target.value; drawCompare(); });
    $("#cmpSearch").addEventListener("input", (e) => { CMP.q = e.target.value; renderCmpChips(); });
    $("#cmpGroup").addEventListener("change", (e) => { CMP.grp = e.target.value; renderCmpChips(); });
    $("#cmpAll").addEventListener("click", () => { renderCmpChips().forEach((i) => CMP.sel[CMP.set].add(i.id)); renderCmpChips(); drawCompare(); });
    $("#cmpNone").addEventListener("click", () => { renderCmpChips().forEach((i) => CMP.sel[CMP.set].delete(i.id)); renderCmpChips(); drawCompare(); });
    // sort control lives next to the filter
    const sortSel = document.createElement("select");
    sortSel.setAttribute("aria-label", "Sort the comparison");
    sortSel.innerHTML = `<option value="to">Sort: largest in latest year</option><option value="rise">Sort: biggest rise</option><option value="fall">Sort: biggest fall</option><option value="name">Sort: A–Z</option>`;
    sortSel.addEventListener("change", () => { CMP.sort = sortSel.value; drawCompare(); });
    $("#cmpSearch").before(sortSel);
    renderYears();
    renderCmpChips();
    drawCompare();
    redraws.push(drawCompare);
  }

  // ===================== SOURCES =====================
  function renderSources() {
    $("#sourceBox").innerHTML = `<ul>${D.docs.map((d) => d.kind === "budget"
      ? `<li><a href="${DOCS[d.id].file}" target="_blank" rel="noopener">${d.year} Budget Statement and Economic Policy</a> — “${esc(D.years[d.year].title)}”, presented ${esc(D.years[d.year].date_label || D.years[d.year].date_presented)}.</li>`
      : `<li><a href="${DOCS[d.id].file}" target="_blank" rel="noopener">${d.year} Mid-Year Fiscal Policy Review</a></li>`).join("")}</ul>` + (D.method || []).map((p) => `<p>${esc(p)}</p>`).join("");
  }

  // ---------- theme ----------
  // no theme switch: the page follows the device's light/dark setting; clear any choice saved by the old Theme button
  try { localStorage.removeItem("gbl-theme"); } catch (e) {}

  // ---------- nav highlight ----------
  const links = $$(".nav a");
  const obs = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id)); }), { rootMargin: "-40% 0px -55% 0px" });
  $$("section[id], footer[id]").forEach((s) => obs.observe(s));

  // ---------- year selectors, built from the data; each opens on its most recent year ----------
  function initYearSelects() {
    const opts = (sel, list, label) => {
      $(sel).innerHTML = list.map((y) => `<option value="${y}">${esc(label(+y))}</option>`).join("");
      $(sel).value = String(list[list.length - 1]);
    };
    const later = (y) => YEARS.filter((x) => x > y);
    const loopYears = Object.keys(D.loop).filter((y) => (D.loop[y] || []).length).map(Number).sort();
    opts("#loopYear", loopYears, (y) => `${y} targets, reported in the ${andJoin(later(y))} Budget${later(y).length > 1 ? "s" : ""}`);
    const judged = YEARS.filter((y) => (D.commitments[y] || []).some((c) => c.status !== "pending"));
    opts("#commitYear", YEARS, (y) => `${y} Budget`);
    if (judged.length) $("#commitYear").value = String(judged[judged.length - 1]);
    opts("#scoreYear", Object.keys(D.successes).map(Number).sort(), (y) => y === D.preYear
      ? `${y}, as reviewed in the ${y + 1} Budget`
      : `${y}, from the ${D.midYears.includes(y) ? "Mid-Year Review and " : ""}${y + 1} Budget`);
    opts("#devYear", Object.keys(D.deviations).map(Number).sort(), (y) => String(y));
    // the budget cycle, showing the latest three budgets
    const shown = YEARS.slice(-3);
    $("#loopDiagram").innerHTML = (YEARS.length > shown.length ? `<span class="muted">…</span>` : "") +
      shown.map((y) => `<span class="node"><b>${y} Budget</b> ${y === FIRST ? "" : `reports ${y - 1} outturn, `}sets ${y} targets</span><span>→</span>`).join("") +
      `<span class="node">${LAST} outturn: <b>due in the ${LAST + 1} Budget</b></span>`;
  }

  // ---------- boot ----------
  initYearSelects();
  cYear = $("#commitYear").value;
  dYear = $("#devYear").value;
  renderHero();
  initCompare();
  renderExplorer();
  renderFiscal();
  renderTaxes();
  renderLoop($("#loopYear").value);
  $("#loopYear").addEventListener("change", (e) => renderLoop(e.target.value));
  $("#loopStatus").addEventListener("change", (e) => { lStatus = e.target.value; renderLoop($("#loopYear").value); });
  renderCommitments();
  $("#commitYear").addEventListener("change", (e) => { cYear = e.target.value; cAll = false; renderCommitments(); });
  $("#commitArea").addEventListener("change", (e) => { cArea = e.target.value; cAll = false; renderCommitments(); });
  $("#commitStatus").addEventListener("change", (e) => { cStatus = e.target.value; cAll = false; renderCommitments(); });
  renderSectorGroups();
  renderMDA();
  $("#mdaGroup").addEventListener("change", renderMDA);
  $("#mdaSearch").addEventListener("input", renderMDA);
  renderSectors();
  initRegionFilters();
  renderRegions();
  renderRegionChart();

  renderScore();
  $("#scoreYear").addEventListener("change", renderScore);
  $("#scoreArea").addEventListener("change", renderScore);
  renderDev(dYear);
  redraws.push(() => renderDev(dYear));
  $("#devYear").addEventListener("change", (e) => { dYear = e.target.value; renderDev(dYear); });
  $("#devBasis").addEventListener("change", (e) => { dBasis = e.target.value; renderDev(dYear); });
  renderInitiatives();
  renderDebtRisk();
  renderSources();
})();
