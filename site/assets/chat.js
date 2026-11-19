/* Ghana Budget Tracker: "Ask the data" assistant.
   No AI and no server: it searches the figures already on the page (window.BUDGET) and quotes them
   with a link to the PDF page they come from. Built lazily the first time the panel opens. */
(function () {
  "use strict";
  const D = window.BUDGET;
  if (!D) return;
  const YEARS = D.yearList, FIRST = YEARS[0], LAST = YEARS[YEARS.length - 1];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtBn = (m) => (m == null || isNaN(m) ? "–" : "GH¢" + (m / 1000).toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "bn");
  const fmtNum = (v) => (v == null || isNaN(v) ? "–" : Number(v).toLocaleString("en-GB", { maximumFractionDigits: 1 }));
  const DOCS = Object.fromEntries(D.docs.map((d) => [d.id, d]));
  const docOf = (d) => DOCS[typeof d === "number" || /^\d+$/.test(d) ? "B" + d : d];
  const pg = (doc, page) => {
    const d = docOf(doc);
    return page && d ? `<a class="pg" href="../${d.file}#page=${page}" target="_blank" rel="noopener" title="Open the ${esc(d.label)} at PDF page ${page}">${esc(d.short)} p.${page}</a>` : "";
  };
  const STATUS = { met: "Met", partial: "Partly met", missed: "Missed", unclear: "Not reported", pending: `Due in the ${LAST + 1} Budget` };
  const CSTATUS = { met: "Delivered", partial: "Partly delivered", missed: "Not delivered", unclear: "Not reported", pending: "Not yet due" };
  const REGIONS = ["Ahafo", "Ashanti", "Bono East", "Bono", "Central", "Eastern", "Greater Accra", "North East", "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western North", "Western"];

  // ---------- text handling ----------
  const STOP = new Set("a an and are as at be been by can could did do does for from get got had has have how i in is it its me my of on or show tell that the their there this to was were what what's whats when where which who why will with would about please give list any all much many each per vs versus than so also see find year years budget budgets ghana ghana's government".split(" "));
  const stem = (w) => w.replace(/'s$/, "").replace(/(ies)$/, "y").replace(/(ing|ed)$/, "").replace(/s$/, "");
  const words = (t) => String(t || "").toLowerCase().replace(/gh¢|ghs/g, " ").match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
  const terms = (t) => words(t).filter((w) => !STOP.has(w) && !/^\d+$/.test(w) && w.length > 1).map(stem);
  // a question word pulls in the words the documents actually use
  const SYN = {
    health: ["hospital", "nhis", "nhil", "medical", "clinic", "agenda", "mahamacare", "healthcare", "nurse"],
    hospital: ["health"], nhis: ["health", "nhil"],
    education: ["school", "shs", "teacher", "tertiary", "textbook", "student", "getfund", "learning"],
    school: ["education"], road: ["roads", "highway", "expressway", "transport", "feeder", "bridge"],
    transport: ["road", "rail", "railway", "bus"], agriculture: ["agric", "farm", "farmer", "cocoa", "food", "crop", "fertiliser", "aeta"],
    farm: ["agriculture", "farmer"], energy: ["power", "electricity", "ecg", "ipp", "electrification", "thermal"],
    electricity: ["energy", "power"], water: ["sanitation", "waste"], jobs: ["employment", "job", "youth", "apprenticeship"],
    job: ["employment", "jobs"], employment: ["job", "jobs"], youth: ["employment"], gdp: ["growth"], growth: ["gdp"],
    inflation: ["price", "cpi"], spending: ["expenditure", "allocation"], expenditure: ["spending"], allocation: ["spending", "expenditure"],
    revenue: ["tax", "grant"], tax: ["levy", "vat", "revenue"], debt: ["borrowing", "eurobond"], security: ["police", "army", "armed", "navy", "military"],
    housing: ["home", "homes"], digital: ["ict", "coder", "technology"], mining: ["gold", "galamsey", "mineral"], gold: ["mining", "goldbod"],
    social: ["leap", "protection"], deficit: ["balance"], reserve: ["reserves"],
  };
  // each question word becomes a group: the word itself (weight 1) and its related words (0.6); a group counts once
  const expand = (ts) => [...new Set(ts)].map((t) => {
    const g = new Map([[t, 1]]);
    (SYN[t] || []).forEach((s) => { const k = stem(s); if (!g.has(k)) g.set(k, 0.6); });
    return g;
  });

  // ---------- index: one entry per fact on the site ----------
  let INDEX = null, DF = null;
  function add(list, e) {
    e.tokens = new Set(terms(e.title + " " + (e.text || "") + " " + (e.area || "") + " " + (e.region || "")));
    e.titleTokens = new Set(terms(e.title));
    list.push(e);
  }
  const yearVals = (values, fmt) => YEARS.filter((y) => values[y] && values[y].v != null).map((y) => `${y}: <b>${fmt(values[y].v, values[y])}</b> ${pg(y, values[y].page)}`).join(" · ");
  function buildIndex() {
    const L = [];
    D.fiscal.forEach((f) => add(L, { kind: "Fiscal envelope", money: true, section: "#yoy", title: f.item, text: "budget fiscal envelope " + (f.note || ""),
      years: YEARS, html: yearVals(f.values, (v) => fmtBn(v)) }));
    D.macro.forEach((m) => add(L, { kind: "Macro target", section: "#yoy", title: m.indicator + " target", text: m.note || "", years: YEARS,
      html: yearVals(m.values, (v, c) => (c.label || fmtNum(v)) + (m.unit === "%" || m.unit === "% of GDP" ? "%" : " " + m.unit)) }));
    D.sectorGroups.forEach((g) => add(L, { kind: "Sector allocation", money: true, section: "#sectors", title: g.group + " sector allocation", text: "sector group spending", years: YEARS, html: yearVals(g.values, (v) => fmtBn(v)) }));
    D.mdas.forEach((m) => add(L, { kind: "Ministry allocation", money: true, section: "#sectors", title: m.name, text: (m.group || "") + " allocation " + (m.note || ""), years: YEARS,
      html: yearVals(m.values, (v) => fmtBn(v)) + (m.change != null ? ` · change ${FIRST}→${LAST}: <b>${m.change > 0 ? "+" : ""}${m.change}%</b>` : "") }));
    YEARS.forEach((y) => (D.initiatives[y] || []).forEach((i) => add(L, { kind: `Flagship programme ${y}`, money: true, section: "#sectors", title: i.name, text: i.description, area: i.area, years: [y],
      html: `${i.allocation_ghs_m ? `<b>${fmtBn(i.allocation_ghs_m)}</b> · ` : ""}${esc(i.description || "")} ${pg(y, i.page)}` })));
    Object.entries(D.loop).forEach(([y, list]) => (list || []).forEach((r) => add(L, { kind: `${y} target`, section: "#loop", title: r.indicator, text: (r.comment || "") + " target outturn", years: [+y], status: r.status,
      html: `Target ${esc(r.target_label || fmtNum(r.target))} ${pg(y, r.target_page)} · outturn ${esc(r.outturn_label || fmtNum(r.outturn))} ${pg(r.outturn_source_year || +y + 1, r.outturn_page)} · <b>${STATUS[r.status] || r.status}</b>` })));
    Object.entries(D.commitments).forEach(([y, list]) => list.forEach((c) => add(L, { kind: `${y} commitment`, section: "#loop", title: c.commitment, text: (c.metric || "") + " promise commitment pledge " + (c.outcome || ""), area: c.area, years: [+y], status: c.status,
      html: `<b>${CSTATUS[c.status] || c.status}</b>${c.outcome ? ": " + esc(c.outcome) : ""} ${pg(y, c.page)} ${c.outcome_page ? pg(c.outcome_year || +y + 1, c.outcome_page) : ""}` })));
    D.regions.forEach((r) => r.items.forEach((i) => add(L, { kind: r.region === "National/Decentralisation" ? `Every region, ${i.year}` : `${r.region}, ${i.year}`, section: "#regions", title: i.text, text: "project region " + (i.status || ""), region: r.region, years: [i.year], status: i.status || "none",
      html: `${i.status ? `<span class="chat-tag">${esc(i.status)}</span> ` : ""}${i.amount_ghs_m ? fmtBn(i.amount_ghs_m) + " · " : ""}${docOf(i.doc).label} ${pg(i.doc, i.page)}` })));
    ["successes", "gaps"].forEach((book) => Object.entries(D[book]).forEach(([y, list]) => list.forEach((x) => add(L, { kind: `${book === "successes" ? "Reported success" : "Not achieved"}, ${y}`, section: "#scorecard", title: x.text, text: book === "successes" ? "achieved success delivered" : "not achieved shortfall gap delayed missed", area: x.area, years: [+y], status: book === "successes" ? "met" : "missed",
      html: `${esc(x.area || "")} ${pg(x.doc || +y + 1, x.page)}` }))));
    D.sectors.forEach((s) => Object.entries(s.docs).forEach(([doc, x]) => {
      const y = +doc.slice(1), mid = doc[0] === "M";
      [["achievements", mid ? `achieved January–June ${y}` : `achieved in ${y - 1}`], ["plans", `planned for ${y}`], ["gaps", "not achieved or delayed"]].forEach(([k, lab]) => (x[k] || []).forEach((t) => {
        const page = (String(t).match(/\(\s*(?:pages?|pp?\.?)\s*(\d+)/i) || [])[1];
        add(L, { kind: `${s.sector}: ${lab}`, section: "#sectors", title: String(t).replace(/\s*\(\s*(?:pages?|pp?\.?)\s*\d+[^)]*\)\s*$/i, ""), text: s.sector + " " + k, area: s.sector, years: [k === "achievements" && !mid ? y - 1 : y],
          status: k === "achievements" ? "met" : k === "gaps" ? "missed" : "planned", html: `${docOf(doc).label} ${pg(doc, page && +page)}` });
      }));
    }));
    YEARS.forEach((y) => (D.taxes[y] || []).forEach((t) => add(L, { kind: `Tax measure, ${y} Budget`, section: "#yoy", title: t.measure, text: "tax levy " + (t.type || ""), years: [y],
      html: `${esc(t.type || "")}${t.expected_yield_ghs_m ? ` · expected yield ${fmtBn(t.expected_yield_ghs_m)}` : ""} ${pg(y, t.page)}` })));
    YEARS.forEach((y) => (D.risks[y] || []).forEach((t) => add(L, { kind: `Risk flagged, ${y} Budget`, section: "#shortfalls", title: t, text: "risk", years: [y], html: `${y} Budget` })));
    YEARS.forEach((y) => { const d = D.debt[y]; if (d) add(L, { kind: `Public debt, ${y} Budget`, money: true, section: "#shortfalls", title: "Public debt stock", text: "debt borrowing " + (d.notes || ""), years: [y],
      html: `<b>${fmtBn(d.stock_ghs_m)}</b>${d.pct_gdp != null ? ` (${d.pct_gdp}% of GDP)` : ""}, ${esc(d.as_at || "")} ${pg(y, d.page)}` }); });
    YEARS.forEach((y) => { const m = D.years[y]; add(L, { kind: `${y} Budget`, section: "#overview", title: `${y} Budget: ${m.title}`, text: "theme title presented " + (m.summary || ""), years: [y],
      html: `Presented ${esc(m.date_label || m.date_presented)}. Revenue and grants ${fmtBn(m.headline.revenue)}, expenditure ${fmtBn(m.headline.expenditure)}.` }); });
    INDEX = L;
    DF = new Map();
    L.forEach((e) => e.tokens.forEach((t) => DF.set(t, (DF.get(t) || 0) + 1)));
  }

  // ---------- understanding the question ----------
  // words that set a filter (status, kind of fact) rather than say what the question is about
  const FILTER_WORDS = new Set(("target targets outturn outturns promise promised promises commitment commitments pledge pledged project projects region regions " +
    "missed miss fail failed met achieved achieve delivered deliver kept success successes completed complete finished done ongoing progress partly partial " +
    "allocation allocated spend spending spent cost amount funding money number count").split(" ").map(stem));
  function parse(q) {
    const low = q.toLowerCase();
    const years = (low.match(/\b20[2-4]\d\b/g) || []).map(Number);
    const region = REGIONS.find((r) => new RegExp("\\b" + r.toLowerCase() + "\\b").test(low)) || null;
    let status = null;
    if (/\b(missed|fail|failed|not (met|delivered|achieved)|fell short|shortfall|behind)\b/.test(low)) status = "missed";
    else if (/\bpartly|partial(ly)?\b/.test(low)) status = "partial";
    else if (/\b(complete|completed|finished|done)\b/.test(low)) status = "completed";
    else if (/\b(ongoing|in progress|under way|underway)\b/.test(low)) status = "ongoing";
    else if (/\b(met|achieved|delivered|success|successes|kept)\b/.test(low)) status = "met";
    let kind = null;
    if (/\b(target|targets|outturn)\b/.test(low)) kind = "target";
    else if (/\b(promise|promised|promises|commitment|commitments|pledge|pledged)\b/.test(low)) kind = "commitment";
    else if (/\b(how much|allocation|allocated|spend|spending|cost|amount|funding|money)\b/.test(low)) kind = "money";
    else if (/\b(project|projects)\b/.test(low) || region) kind = "region";
    else if (/\b(tax|taxes|levy|levies|vat)\b/.test(low)) kind = "tax";
    else if (/\b(risk|risks)\b/.test(low)) kind = "risk";
    const count = /\bhow many\b|\bnumber of\b|\bcount\b/.test(low);
    const regionWords = region ? new Set(terms(region)) : new Set();
    const ts = terms(q).filter((t) => !regionWords.has(t) && !FILTER_WORDS.has(t));
    return { years, region, status, kind, count, terms: expand(ts) };
  }
  const statusMatch = (e, s) => !s || e.status === s || (s === "met" && e.status === "completed") || (s === "completed" && e.status === "met");
  const kindMatch = (e, k) => !k ||
    (k === "target" && /target$/.test(e.kind)) || (k === "commitment" && /commitment$/.test(e.kind)) ||
    (k === "money" && e.money) || (k === "region" && e.region) || (k === "tax" && /^Tax/.test(e.kind)) || (k === "risk" && /^Risk/.test(e.kind));

  function search(p) {
    const N = INDEX.length;
    return INDEX.map((e) => {
      let s = 0, inTitle = 0;
      p.terms.forEach((g) => {
        let best = 0, title = false;
        g.forEach((w, t) => {
          if (!e.tokens.has(t)) return;
          const v = w * Math.log(1 + N / (DF.get(t) || 1)) * (e.titleTokens.has(t) ? 1.6 : 1);
          if (v > best) { best = v; title = e.titleTokens.has(t) && w === 1; }
        });
        s += best;
        if (title) inTitle++;
      });
      if (!p.terms.length) s = 1; // filters alone ("missed targets in 2025")
      if (s <= 0) return null;
      // every question word in the title ("ministry of education") is a strong sign
      if (p.terms.length && inTitle === p.terms.length) s *= 1.6;
      // "how much / spending" questions: an allocation figure beats a programme description
      if (p.kind === "money" && /allocation|Fiscal envelope/.test(e.kind)) s *= 1.5;
      if (p.years.length) s *= e.years && e.years.some((y) => p.years.includes(y)) ? 1.8 : 0.15;
      if (p.region) s *= e.region === p.region ? 4 : e.region ? 0.05 : 0.3;
      if (p.status) s *= statusMatch(e, p.status) ? 2 : 0.25;
      if (p.kind) s *= kindMatch(e, p.kind) ? 2 : 0.5;
      return { e, s };
    }).filter(Boolean).sort((a, b) => b.s - a.s);
  }

  // ---------- answers ----------
  const card = (e) => `<li><span class="chat-kind">${esc(e.kind)}</span><b>${esc(e.title)}</b><div>${e.html}</div><a class="chat-goto" href="${e.section}">Show on the page</a></li>`;
  function answer(q) {
    if (!INDEX) buildIndex();
    const p = parse(q);
    const yrTxt = p.years.length ? " in " + p.years.join(" and ") : "";
    // region questions: count what the budgets name for that region, by status
    if (p.region) {
      const items = INDEX.filter((e) => e.region === p.region && (!p.years.length || p.years.some((y) => e.years.includes(y))) && statusMatch(e, p.status));
      const by = {};
      items.forEach((e) => (by[e.status] = (by[e.status] || 0) + 1));
      const split = ["completed", "ongoing", "planned", "none"].filter((k) => by[k]).map((k) => `${by[k]} ${k === "none" ? "with no status stated" : k}`).join(", ");
      const hits = p.terms.length ? search(p).filter((r) => r.e.region === p.region).map((r) => r.e) : items.slice().sort((a, b) => b.years[0] - a.years[0]);
      return `<p>The documents name <b>${items.length}</b> item${items.length === 1 ? "" : "s"} for the <b>${esc(p.region)} Region</b>${yrTxt}${p.status ? ` marked ${esc(p.status)}` : ""}${split && !p.status ? ` (${split})` : ""}.</p>` +
        (hits.length ? `<ul class="chat-results">${hits.slice(0, 6).map(card).join("")}</ul>` : "") +
        `<p><button type="button" class="chat-link" data-region="${esc(p.region)}">Open ${esc(p.region)} on the regional map</button></p>`;
    }
    // filter-only questions ("which targets were missed in 2025?") list the matches in full
    if (!p.terms.length && (p.status || p.kind) && (p.kind === "target" || p.kind === "commitment")) {
      const list = INDEX.filter((e) => kindMatch(e, p.kind) && statusMatch(e, p.status) && (!p.years.length || p.years.some((y) => e.years.includes(y))));
      const what = p.kind === "target" ? "target" : "commitment";
      return `<p><b>${list.length}</b> ${what}${list.length === 1 ? "" : "s"}${p.status ? ` ${p.kind === "commitment" ? CSTATUS[p.status] || p.status : STATUS[p.status] || p.status}`.toLowerCase() : ""}${yrTxt}.</p>` +
        (list.length ? `<ul class="chat-results">${list.slice(0, 8).map(card).join("")}</ul>${list.length > 8 ? `<p class="chat-muted">Showing 8 of ${list.length}. See them all in <a href="#loop">Closing the loop</a>.</p>` : ""}` : "");
    }
    const res = search(p);
    if (!res.length) return `<p>I couldn't find that in the budget data. Try naming a sector, a programme, a region or a figure, for example "health spending 2027" or "projects in Volta".</p>`;
    const top = res.slice(0, 5).map((r) => r.e);
    const n = res.filter((r) => r.s >= res[0].s * 0.35).length;
    return `<p>${n > 5 ? `Here are the closest of ${n} matches` : "Here is what the budgets say"}${yrTxt}:</p><ul class="chat-results">${top.map(card).join("")}</ul>`;
  }

  // ---------- panel ----------
  const SUGGEST = [`Health spending ${LAST}`, `Which targets were missed in ${LAST - 1}?`, "Projects in Volta", "What was promised for roads?", "Inflation target", "Public debt"];
  const root = document.createElement("div");
  root.className = "chat";
  root.innerHTML = `
    <button type="button" class="chat-fab" aria-expanded="false" aria-controls="chatPanel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 9.5h8M8 12.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Ask the data</span></button>
    <section class="chat-panel" id="chatPanel" role="dialog" aria-label="Ask the budget data" hidden>
      <header class="chat-head"><div><b>Ask the budget data</b><span>Finds and quotes the figures on this site, with the page they come from. It is a search tool, not AI.</span></div><button type="button" class="chat-close" aria-label="Close">×</button></header>
      <div class="chat-log" aria-live="polite"></div>
      <form class="chat-form"><input type="text" placeholder="e.g. health spending ${LAST}" aria-label="Your question" autocomplete="off"><button type="submit">Ask</button></form>
    </section>`;
  document.body.appendChild(root);
  const fab = root.querySelector(".chat-fab"), panel = root.querySelector(".chat-panel"), log = root.querySelector(".chat-log"), form = root.querySelector(".chat-form"), input = form.querySelector("input");
  const say = (html, who) => {
    const m = document.createElement("div");
    m.className = "chat-msg " + who;
    m.innerHTML = html;
    log.appendChild(m);
    m.scrollIntoView({ block: "start" });
    return m;
  };
  const intro = () => say(`<p>Ask about any figure, target, promise, programme or region in the ${YEARS[0]}–${LAST} budgets.</p><div class="chat-sugg">${SUGGEST.map((s) => `<button type="button">${esc(s)}</button>`).join("")}</div>`, "bot");
  const open = (on) => {
    panel.hidden = !on;
    fab.setAttribute("aria-expanded", String(on));
    root.classList.toggle("open", on);
    if (on) { if (!log.childElementCount) intro(); input.focus(); }
  };
  const ask = (q) => {
    q = q.trim();
    if (!q) return;
    say(`<p>${esc(q)}</p>`, "me");
    let html;
    try { html = answer(q); } catch (err) { html = "<p>Something went wrong searching for that. Please try different words.</p>"; }
    say(html, "bot");
  };
  fab.addEventListener("click", () => open(panel.hidden));
  root.querySelector(".chat-close").addEventListener("click", () => open(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) open(false); });
  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); input.value = ""; });
  log.addEventListener("click", (e) => {
    const s = e.target.closest(".chat-sugg button");
    if (s) return ask(s.textContent);
    const r = e.target.closest("[data-region]");
    if (r) {
      const sel = document.querySelector("#regionSelect");
      if (sel) { sel.value = r.dataset.region; sel.dispatchEvent(new Event("change")); }
      document.querySelector("#regions").scrollIntoView({ behavior: "smooth" });
      if (window.innerWidth < 700) open(false);
      return;
    }
    if (e.target.closest(".chat-goto") && window.innerWidth < 700) open(false);
  });
  // exposed for testing in the browser console
  window.GBTAsk = (q) => answer(q);
})();
