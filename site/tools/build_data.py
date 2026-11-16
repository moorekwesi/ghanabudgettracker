"""Merge the per-year extractions in site/data/raw/ into site/data/budget-data.js.

Inputs (all extracted from the PDFs; page numbers are PDF pages):
  raw/documents.json      the list of budgets and mid-year reviews: PDF file, page offset, date, title
  raw/<year>.json         one extraction per Budget Statement
  raw/mid<year>.json      one extraction per Mid-Year Fiscal Policy Review
  raw/loop_<year>.json    a budget's targets/commitments judged against the following budget(s)
The years come from documents.json, so adding a year needs no code change here unless the new
budget labels a line differently; the label lists below fall back to the latest budget's wording.
Run:  python site/tools/build_data.py
(BUDGET_RAW / BUDGET_OUT environment variables point the build at another raw folder or output file.)
"""
import json, re, os, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = pathlib.Path(os.environ.get("BUDGET_RAW") or ROOT / "data" / "raw")

def load(name):
    p = RAW / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

REG = load("documents.json")
YEARS = sorted(int(y) for y in REG["budgets"] if (RAW / f"{y}.json").exists())
MID_YEARS = sorted(int(y) for y in REG.get("midyear", {}) if (RAW / f"mid{y}.json").exists())
FIRST, LAST = YEARS[0], YEARS[-1]
PRE = FIRST - 1  # the year the first budget looks back on
BUD = {y: REG["budgets"][str(y)] for y in YEARS}
PAIRS = list(zip(YEARS, YEARS[1:]))  # (year reviewed, budget that reviews it)

def pick(names, y):
    """Per-year label lookup; a year not listed uses the most recent year's label."""
    return names[y] if y in names else names[max(names)]

Y = {y: load(f"{y}.json") for y in YEARS}
LOOP = {y: load(f"loop_{y}.json") for y in YEARS[:-1]}

def clean(s):
    if s is None:
        return s
    return str(s).replace("�", "¢").replace("GH¢¢", "GH¢")

def walk(o):
    if isinstance(o, dict):
        return {k: walk(v) for k, v in o.items()}
    if isinstance(o, list):
        return [walk(v) for v in o]
    if isinstance(o, str):
        return clean(o)
    return o

Y = {y: walk(d) for y, d in Y.items()}
MID = {y: walk(load(f"mid{y}.json")) for y in MID_YEARS}
PAGE_RE = re.compile(r"\s*\(\s*(?:pages?|pp?\.?)\s*(\d+)[^)]*\)\s*$", re.I)
def split_page(t):
    m = PAGE_RE.search(t)
    return (PAGE_RE.sub("", t), int(m.group(1))) if m else (t, None)
LOOP = {y: walk(d) if d else None for y, d in LOOP.items()}

def find(lst, key, name, exact=True):
    for x in lst:
        v = x.get(key, "")
        if (v == name) if exact else v.lower().startswith(name.lower()):
            return x
    raise KeyError(f"{name!r} not found")

def need(fn, lst, key, name, y, table):
    """find(), but tell the person adding a year exactly which label to add."""
    try:
        return fn(lst, key, name)
    except KeyError:
        raise SystemExit(f"The {y} budget has no line called {name!r}. Add the {y} spelling to {table} in build_data.py.")

# ---------------------------------------------------------------- years meta
years = {}
for y in YEARS:
    d, b = Y[y], BUD[y]
    years[y] = {"title": b.get("title") or d["title"], "presented_by": d["presented_by"],
                "presented_by_short": b.get("presenter") or d["presented_by"],
                "date_presented": d["date_presented"], "date_label": b.get("date_label") or d["date_presented"],
                "summary": d.get("headline_summary")}

# every document in reading order: each budget, then that year's mid-year review
docs = []
for y in sorted(set(YEARS) | set(MID_YEARS)):
    if y in YEARS:
        docs.append({"id": f"B{y}", "year": y, "kind": "budget", "file": BUD[y]["pdf"], "page_offset": BUD[y].get("page_offset"),
                     "label": f"{y} Budget", "short": str(y)})
    if y in MID_YEARS:
        m = REG["midyear"][str(y)]
        docs.append({"id": f"M{y}", "year": y, "kind": "midyear", "file": m["pdf"], "page_offset": m.get("page_offset"),
                     "label": f"{y} Mid-Year Review", "short": f"MY{y}"})
DOC_RANK = {d["id"]: i for i, d in enumerate(docs)}

# ---------------------------------------------------------------- fiscal envelope
FISCAL_MAP = [
    ("Total revenue & grants", {2025: "Total Revenue & Grants", 2026: "Total Revenue & Grants", 2027: "Total Revenue & Grants"}, None),
    ("Tax revenue", {2025: "Tax revenue (gross, incl. oil company taxes, before refunds)", 2026: "Tax Revenue (incl. oil company taxes, net of refunds)", 2027: "Tax Revenue"}, "2025 figure is the Appendix 3A tax line before refunds."),
    ("Non-tax revenue", {2025: "Non-tax revenue (Appendix 3A, incl. oil-related)", 2026: "Non-Tax Revenue (total, incl. oil CAPI)", 2027: "Non-Tax Revenue"}, None),
    ("Oil and gas revenue", {2025: "Oil and gas revenue", 2026: "Oil & Gas Revenue", 2027: "Oil Revenue"}, None),
    ("Grants from partners", {2025: "Grants", 2026: "Grants", 2027: "Grants"}, None),
    ("Total expenditure", {2025: "Total expenditure (commitment)", 2026: "Total Expenditure (commitment)", 2027: "Total Expenditure (Commitment)"}, "Commitment basis."),
    ("Compensation of employees", {2025: "Compensation of employees", 2026: "Compensation of Employees", 2027: "Compensation of Employees"}, None),
    ("Goods and services", {2025: "Use of goods & services", 2026: "Use of Goods & Services", 2027: "Use of Goods and Services"}, None),
    ("Interest payments", {2025: "Interest payments", 2026: "Interest Payments", 2027: "Interest Payments"}, None),
    ("Transfers to other government units", {2025: "Grants to other government units (earmarked funds)", 2026: "Grants to Other Government Units", 2027: "Grants to Other Government Units"}, "Statutory and earmarked funds such as DACF, GETFund and NHIF."),
    ("Capital expenditure", {2025: "Capital expenditure", 2026: "Capital Expenditure", 2027: "Capital Expenditure"}, None),
    ("Arrears clearance", {2025: "Arrears clearance", 2026: "Arrears Clearance (net)", 2027: "Arrears Clearance (net)"}, None),
    ("Overall balance (commitment)", {2025: "Overall balance (commitment)", 2026: "Overall Balance (commitment)", 2027: "Overall Balance (Commitment)"}, "Negative = deficit."),
    ("Primary balance (commitment)", {2025: "Primary balance (commitment)", 2026: "Primary Balance (commitment)", 2027: "Primary Balance (Commitment)"}, "Balance before interest payments."),
    ("Total appropriation", {2025: "Total appropriation (all MDAs incl. statutory, interest, amortisation, arrears)", 2026: "Total Appropriation (expenditure + arrears clearance + amortisation)", 2027: "Total Appropriation"}, "Everything Parliament is asked to approve, including debt amortisation."),
]
fiscal = []
for label, names, note in FISCAL_MAP:
    vals = {}
    for y in YEARS:
        x = need(find, Y[y]["fiscal_framework"]["budget_year"], "item", pick(names, y), y, "FISCAL_MAP")
        v = x["ghs_m"]
        if label == "Arrears clearance":
            v = abs(v)
        vals[y] = {"v": round(v, 1), "pct_gdp": x.get("pct_gdp"), "page": x.get("page")}
    fiscal.append({"item": label, "values": vals, "note": note})

# ---------------------------------------------------------------- macro targets
MACRO_MAP = [
    ("Real GDP growth", "%", {y: "Real GDP growth (%)" for y in YEARS}, None),
    ("Non-oil real GDP growth", "%", {y: "Non-oil real GDP growth (%)" for y in YEARS}, None),
    ("End-year inflation", "%", {2025: "End-period inflation (%)", 2026: "End-period inflation (%)", 2027: "End-period (end-year) inflation (%)"}, "Targets from 2026 onward sit within the Bank of Ghana's 8 ± 2% band."),
    ("Primary balance, commitment", "% of GDP", {y: "Primary balance, commitment basis (% of GDP)" for y in YEARS}, "Surplus before interest. A positive number is a surplus."),
    ("Overall fiscal balance, commitment", "% of GDP", {y: "Overall fiscal balance, commitment basis (% of GDP)" for y in YEARS}, "Negative = deficit."),
    ("Total revenue and grants", "% of GDP", {2025: "Total revenue & grants (% of GDP)", 2026: "Total revenue & grants (% of GDP)", 2027: "Total revenue and grants (% of GDP)"}, None),
    ("Total expenditure", "% of GDP", {2025: "Total expenditure, commitment (% of GDP)", 2026: "Total expenditure, commitment (% of GDP)", 2027: "Total expenditure, commitment (% of GDP)"}, None),
    ("Gross reserves", "months of imports", {y: "Gross international reserves (months of import cover)" for y in YEARS}, "Minimum import cover targeted."),
    ("Benchmark crude oil price", "US$/barrel", {y: "Benchmark crude oil price (US$/barrel)" for y in YEARS}, None),
    ("Public debt", "% of GDP", {y: "Public debt (% of GDP)" for y in YEARS}, "2025 and 2026 set no numeric debt target; 2027 restates the 45%-of-GDP debt anchor."),
]
macro = []
for label, unit, names, note in MACRO_MAP:
    vals = {}
    for y in YEARS:
        x = need(find, Y[y]["macro_targets"], "indicator", pick(names, y), y, "MACRO_MAP")
        if x.get("target") is None:
            continue
        lab = None
        if x.get("qualifier") in ("at least", "not less than"):
            lab = "≥" + f"{x['target']:g}"
        vals[y] = {"v": x["target"], "page": x.get("page"), "label": lab}
    macro.append({"indicator": label, "unit": unit, "values": vals, "note": note})

headline = {}
for y in YEARS:
    fy = {f["item"]: f["values"][y]["v"] for f in fiscal}
    mm = {m["indicator"]: m["values"].get(y, {}).get("v") for m in macro}
    headline[y] = {"revenue": fy["Total revenue & grants"], "expenditure": fy["Total expenditure"],
                   "gdp": mm["Real GDP growth"], "inflation": mm["End-year inflation"],
                   "inflation_label": f"{mm['End-year inflation']:g}%" + (" (8 ± 2 band)" if y >= 2026 else ""),
                   "primary": mm["Primary balance, commitment"]}
    years[y]["headline"] = headline[y]
    g = find(Y[y]["macro_targets"], "indicator", "Nominal GDP (GH", exact=False)
    years[y]["gdp_nominal"] = {"v": g["target"], "page": g.get("page")}

# ---------------------------------------------------------------- MDA allocations
def norm_mda(n):
    n = re.sub(r"\s*\(o/w.*$", "", n)
    rules = [
        (r"^Ministry of Fisheries and Aquaculture", "Ministry of Fisheries and Aquaculture"),
        (r"Legal Aid Commission", "Legal Aid Commission"),
        (r"^Contingency", "Contingency vote"),
        (r"^Subscription", "Subscriptions"),
        (r"^National Health Fund", "National Health Fund"),
        (r"Education Trust Fund", "GETFund (Ghana Education Trust Fund)"),
        (r"^Road (Maintenance Trust )?Fund", "Road Fund"),
        (r"^District Assemblies Common Fund", "District Assemblies Common Fund"),
        (r"^Transfer to (the )?National Oil Company", "Transfer to GNPC from oil revenue"),
        (r"^Social Benefits", "Social benefits (LEAP, school feeding, lifeline electricity)"),
        (r"^Other Expenditures", "Other expenditures (ESLA, energy-sector shortfalls)"),
        (r"^Foreign Loans and Grants", "Foreign loans and grants (unallocated)"),
        (r"^Big Push", "Big Push capital programme"),
        (r"^Subsidies on Petroleum", "Subsidies on petroleum products"),
        (r"^New Economy", "New Economy programme"),
    ]
    for pat, rep in rules:
        if re.search(pat, n, re.I):
            return rep
    return n

mdas, groups = {}, {}
for y in YEARS:
    for m in Y[y]["sector_allocations"]:
        name = m["mda"]
        if name.startswith("SECTOR TOTAL:"):
            g = name.split(":", 1)[1].strip()
            groups.setdefault(g, {})[y] = {"v": round(m["ghs_m"], 1), "page": m.get("page")}
            continue
        if name.startswith(("SUB-TOTAL", "GRAND TOTAL")):
            continue
        key = norm_mda(name)
        grp = m.get("sector_group")
        if grp == "Multi-Sectoral":
            grp = "Multi-sectoral"
        e = mdas.setdefault(key, {"name": key, "group": grp, "values": {}})
        e["values"][y] = {"v": round(m["ghs_m"], 1), "page": m.get("page")}

MDA_NOTES = {
    "Office of Government Machinery": "Falls in 2026 largely because the National Security Council became a separate line.",
    "National Security Council": "Shown separately from 2026; in 2025 it sat under the Office of Government Machinery.",
    "New Economy programme": "New multi-sectoral vote introduced in the 2027 Budget.",
    "Ministry of Labour, Jobs and Employment": "Falls sharply in 2026 as programmes moved to Youth Development and Empowerment.",
}
mda_list = []
for k, e in mdas.items():
    a, b = e["values"].get(FIRST, {}).get("v"), e["values"].get(LAST, {}).get("v")
    e["change"] = round((b - a) / a * 100, 1) if a and b else None
    e["note"] = MDA_NOTES.get(k)
    mda_list.append(e)
mda_list.sort(key=lambda e: -(e["values"].get(LAST, {}).get("v") or 0))

sector_groups = [{"group": g, "values": groups[g]} for g in ["Social", "Public Safety", "Administration", "Infrastructure", "Economic"]]
multi = groups.get("Multi-Sectoral", {})
for y in YEARS:  # some years (2027) print no multi-sectoral subtotal: derive it as grand total minus the MDA sub-total
    if y not in multi:
        al = Y[y]["sector_allocations"]
        gt = next(m for m in al if m["mda"].startswith("GRAND TOTAL"))
        st = next(m for m in al if m["mda"].startswith("SUB-TOTAL"))
        multi[y] = {"v": round(gt["ghs_m"] - st["ghs_m"], 1), "page": gt.get("page"), "derived": True}

# ---------------------------------------------------------------- sector highlights
SECTOR_ORDER = ["Education", "Health", "Agriculture", "Roads & Transport", "Energy", "Water & Sanitation", "Housing",
                "Trade & Industry", "Digital/ICT", "Employment & Youth", "Social Protection", "Local Government",
                "Lands & Natural Resources", "Tourism", "Security", "Finance", "Other"]
sectors = []
for s in SECTOR_ORDER:
    entry = {"sector": s if s != "Other" else "Other sectors", "docs": {}}
    for y in YEARS:
        for h in Y[y]["sector_highlights"]:
            if h["sector"] == s:
                entry["docs"][f"B{y}"] = {"achievements": h.get("past_year_achievements", []),
                                          "plans": h.get("plans_for_budget_year", []),
                                          "gaps": h.get("not_achieved_or_delayed", [])}
    for y, M in MID.items():
        for h in (M or {}).get("sector_highlights", []):
            if h["sector"] == s:
                entry["docs"][f"M{y}"] = {"achievements": h.get("h1_achievements", []), "gaps": h.get("issues_or_delays", [])}
    sectors.append(entry)

# ---------------------------------------------------------------- flagship initiatives
initiatives = {y: Y[y]["key_initiatives"] for y in YEARS}

# ---------------------------------------------------------------- regions
REGIONS = ["Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East", "Northern",
           "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North"]
is_ceiling = lambda t: bool(re.search(r"ceiling", t, re.I))
regions = {r: {"region": r, "items": []} for r in REGIONS + ["National/Decentralisation"]}
ceilings = {r: {} for r in REGIONS}
ceiling_total = {}
for y in YEARS:
    for r in Y[y]["regional"]:
        name = r["region"]
        target = name if name in regions else "National/Decentralisation"
        for i in r["items"]:
            t = i["text"]
            if is_ceiling(t):
                if name in ceilings and re.search(r"MMDA", t):
                    ceilings[name][y] = {"v": i.get("amount_ghs_m"), "page": i.get("page")}
                elif name == "National/Decentralisation" and re.search(r"MMDA", t):
                    ceiling_total[y] = {"v": i.get("amount_ghs_m"), "page": i.get("page")}
                continue
            item = {"year": y, "doc": f"B{y}", "text": t + (" (covers several regions)" if name == "Multi-regional" else ""),
                    "status": i.get("status"), "amount_ghs_m": i.get("amount_ghs_m"), "page": i.get("page")}
            regions[target]["items"].append(item)
    if y in MID and MID[y]:
        for r in MID[y].get("regional", []):
            target = r["region"] if r["region"] in regions else "National/Decentralisation"
            for i in r["items"]:
                if is_ceiling(i["text"]):
                    continue
                regions[target]["items"].append({"year": y, "doc": f"M{y}", "text": i["text"], "status": i.get("status"),
                                                 "amount_ghs_m": i.get("amount_ghs_m"), "page": i.get("page")})
for r in regions.values():
    r["items"].sort(key=lambda i: DOC_RANK[i["doc"]])
region_shares = []
for r in REGIONS:
    vals = {}
    for y in YEARS:
        c = ceilings[r].get(y)
        tot = sum(ceilings[x][y]["v"] for x in REGIONS if ceilings[x].get(y))
        if c and c["v"]:
            vals[y] = {"v": round(c["v"] / tot * 100, 2), "amount": c["v"], "page": c["page"]}
    region_shares.append({"label": r, "values": vals})

# ---------------------------------------------------------------- successes and gaps
successes, gaps = {}, {}
# the year before the first budget, as that budget reviews it
d = Y[FIRST]
successes[PRE] = [{"doc": f"B{FIRST}", "area": "Macro target", "text": f"{p['indicator']}: {p['outturn']:g}{p.get('unit') if p.get('unit') == '%' else ' ' + str(p.get('unit') or '')} against a target of {p['target']:g}. {p.get('comment') or ''}".strip(), "page": p["page"]}
                   for p in d["prior_year_review"] if p.get("achieved") is True and p.get("target") is not None and p.get("outturn") is not None]
for h in d["sector_highlights"]:
    for a in h.get("past_year_achievements", []):
        m = re.search(r"\(\s*(?:page|p\.?)\s*(\d+)[^)]*\)\s*$", a)
        successes[PRE].append({"area": h["sector"], "text": re.sub(r"\s*\(\s*(?:page|p\.?)\s*\d+[^)]*\)\s*$", "", a), "page": int(m.group(1)) if m else None})
gaps[PRE] = [{"area": "Macro target", "text": f"{p['indicator']}: {p['outturn']:g}{p.get('unit') if p.get('unit') == '%' else ' ' + str(p.get('unit') or '')} against a target of {p['target']:g}. {p.get('comment') or ''}".strip(), "page": p["page"]}
              for p in d["prior_year_review"] if p.get("achieved") is False and p.get("target") is not None and p.get("outturn") is not None]
gaps[PRE] += [{"area": "Acknowledged in the budget", "text": s["text"], "page": s["page"]} for s in d["shortfalls_admitted"]]

for rev, src in PAIRS:
    d = Y[src]
    successes[rev] = [{"area": a.get("area"), "text": a["claim"], "page": a.get("page"), "doc": f"B{src}"} for a in d.get(f"achievements_reported_for_{rev}", [])]
    gaps[rev] = [{"area": "Acknowledged in the budget", "text": s["text"], "page": s["page"], "doc": f"B{src}"} for s in d["shortfalls_admitted"]]
    for h in d["sector_highlights"]:
        for a in h.get("not_achieved_or_delayed", []):
            t, pgn = split_page(a)
            gaps[rev].append({"area": h["sector"], "text": t, "page": pgn, "doc": f"B{src}"})
    M = MID.get(rev)
    if M:
        mid_s, mid_g = [], []
        for h in M.get("sector_highlights", []):
            for a in h.get("h1_achievements", []):
                t, pgn = split_page(a)
                mid_s.append({"area": h["sector"], "text": t + " (mid-year)", "page": pgn, "doc": f"M{rev}"})
            for a in h.get("issues_or_delays", []):
                t, pgn = split_page(a)
                mid_g.append({"area": h["sector"], "text": t + " (mid-year)", "page": pgn, "doc": f"M{rev}"})
        mid_g += [{"area": "Acknowledged at mid-year", "text": x["text"], "page": x.get("page"), "doc": f"M{rev}"} for x in M.get("shortfalls_admitted", [])]
        successes[rev] = mid_s + successes[rev]
        gaps[rev] = mid_g + gaps[rev]

# ---------------------------------------------------------------- deviations (budget vs outturn)
DEV_SKIP = re.compile(r"Nominal GDP|Financing|Appropriation|Other outstanding|Overall|Primary|Arrears", re.I)
deviations = {}
# the year before the first budget: actual vs revised budget, as the first budget reports it
deviations[str(PRE)] = {"full": [{"item": f["item"], "budget": f["budget"], "outturn": f["outturn"], "page": f["page"], "basis": f.get("note") or f"{PRE} outturn against the {PRE} revised budget"}
                                 for f in Y[FIRST]["fiscal_framework"]["prior_year_outturn"] if not DEV_SKIP.search(f["item"])], "ytd": []}
for rev, src in PAIRS:
    rows = [f for f in Y[src]["fiscal_framework"]["prior_year_outturn"] if not DEV_SKIP.search(f["item"])]
    ytd = BUD[src].get("prior_year_ytd") or {}
    tk, ok, per = ytd.get("target"), ytd.get("outturn"), ytd.get("period")
    deviations[str(rev)] = {
        "full": [{"item": f["item"], "budget": f.get("budget_ghs_m"), "outturn": f.get("outturn_ghs_m"), "page": f.get("page"),
                  "basis": "Projected full-year outturn against the mid-year revised budget"} for f in rows],
        "ytd": [{"item": f["item"], "budget": f.get(tk), "outturn": f.get(ok), "page": f.get("page"),
                 "basis": f"Provisional outturn against programme, {per}"} for f in rows if tk and f.get(tk) is not None and f.get(ok) is not None],
        "ytd_label": per,
    }

for y, M in MID.items():
    rows = []
    for f in M.get("fiscal_revised", []):
        if DEV_SKIP.search(f["item"]):
            continue
        if f.get("h1_programme_ghs_m") is not None and f.get("h1_outturn_ghs_m") is not None:
            rows.append({"item": f["item"], "budget": f["h1_programme_ghs_m"], "outturn": f["h1_outturn_ghs_m"], "page": f.get("page"), "doc": f"M{y}"})
    # a mid-year review can arrive before the next budget does
    deviations.setdefault(str(y), {"full": [], "ytd": []})["h1"] = rows

# ---------------------------------------------------------------- debt, risks, taxes
debt = {}
for y in YEARS:
    x = Y[y]["debt"]
    debt[y] = {"stock_ghs_m": x.get("stock_ghs_m"), "pct_gdp": x.get("pct_gdp"), "as_at": x.get("as_at"),
               "external_ghs_m": x.get("external_ghs_m"), "domestic_ghs_m": x.get("domestic_ghs_m"),
               "page": x.get("page"), "notes": x.get("restructuring_notes")}
risks = {y: Y[y]["risks"] for y in YEARS}
taxes = {y: Y[y]["tax_measures"] for y in YEARS}

# ---------------------------------------------------------------- closing the loop
loop, commitments = {}, {}
for y in YEARS[:-1]:
    L = LOOP[y]
    loop[y] = L["macro"] if L else []
    judged = {c["id"]: c for c in (L["commitments"] if L else [])}
    commitments[y] = []
    for c in Y[y]["commitments"]:
        j = judged.get(c["id"], {})
        mp = next((x for x in ((MID.get(y) or {}).get("commitment_progress", [])) if x["id"] == c["id"]), None)
        commitments[y].append({**c, "status": j.get("status", "unclear"), "outcome": j.get("outcome"),
                               "outcome_page": j.get("outcome_page"), "outcome_year": j.get("outcome_year"),
                               "midyear": {k: mp.get(k) for k in ("status_at_midyear", "evidence", "page")} if mp else None})
commitments[LAST] = [{**c, "status": "pending"} for c in Y[LAST]["commitments"]]

# ---------------------------------------------------------------- indicator explorer
# Each indicator gathers, per year, up to five measures from different documents:
#   proj    = projection for that year made in an earlier budget's medium-term framework
#   target  = the budget's own target for that year
#   revised = the mid-year review's revised target
#   h1      = the mid-year review's half-year outturn
#   outturn = the latest end-year outturn (from the following budget(s))

def cell(v, doc, page, note=None, label=None):
    if v is None or isinstance(v, str):
        try:
            v = float(str(v).replace("≥", "").replace(">=", "")) if v is not None else None
        except ValueError:
            label, v = str(v), None
    if v is None and label is None:
        return None
    return {k: x for k, x in {"v": v, "doc": doc, "page": page, "note": note, "label": label}.items() if x is not None}

def mt(y_src, name, y_for):
    if y_src not in Y:
        return None
    for m in Y[y_src]["medium_term_targets"]:
        if m["indicator"] == name and str(y_for) in m["years"]:
            return cell(m["years"][str(y_for)], f"B{y_src}", m.get("page"))
    return None

def tgt(y, name):
    if y not in Y:
        return None
    for m in Y[y]["macro_targets"]:
        if m["indicator"] == name and m.get("target") is not None:
            return cell(m["target"], f"B{y}", m.get("page"), label=("≥" + f"{m['target']:g}") if m.get("qualifier") in ("at least", "not less than") else None)
    return None

def fis(y, name, pct=False):
    for f in Y[y]["fiscal_framework"]["budget_year"]:
        if f["item"] == name:
            return cell(f["pct_gdp"] if pct else f["ghs_m"], f"B{y}", f.get("page"))
    return None

def pyr(y_src, year, name):
    for p in (Y[y_src]["prior_year_review"] if y_src in Y else []):
        if p.get("year", y_src - 1) == year and p["indicator"] == name:
            return p
    return None

def loopm(y, name):
    for m in LOOP[y]["macro"] if LOOP.get(y) else []:
        if m["indicator"] == name:
            return m
    return None

def from_loop(y, name):
    if y not in LOOP:
        return None
    m = loopm(y, name)
    if not m or m.get("outturn") is None:
        return None
    return cell(m["outturn"], f"B{m.get('outturn_source_year') or y + 1}", m.get("outturn_page"), note=m.get("basis"), label=m.get("outturn_label"))

def from_pyr(y_src, year, name, which="outturn"):
    p = pyr(y_src, year, name)
    if not p or p.get(which) is None:
        return None
    return cell(p[which], f"B{y_src}", p.get("page"), note=p.get("outturn_basis") if which == "outturn" else f"{year} Budget target as cited in the {y_src} Budget")

def pyo(y_src, name, field):
    if y_src not in Y or not name:
        return None
    for f in Y[y_src]["fiscal_framework"]["prior_year_outturn"]:
        if f["item"] == name:
            v = f.get(field)
            note = {"budget": f"{y_src - 1} revised budget", "outturn": f"{y_src - 1} outturn", "budget_ghs_m": "Mid-year revised budget, as tabled in the following budget",
                    "outturn_ghs_m": f.get("outturn_basis") or "Projected end-year outturn"}.get(field)
            return cell(v, f"B{y_src}", f.get("page"), note=note)
    return None

def mid_rev(y, name):
    M = MID.get(y)
    if not M:
        return None
    for r in M.get("macro_revisions", []):
        if r["indicator"] == name and r.get("revised_target") is not None:
            return cell(r["revised_target"], f"M{y}", r.get("page"))
    return None

def mid_h1(y, name):
    M = MID.get(y)
    if not M:
        return None
    for r in M.get("h1_outturn", []):
        if r["indicator"] == name and r.get("outturn") is not None:
            return cell(r["outturn"], f"M{y}", r.get("page"), note=r.get("period"))
    return None

def mid_fis(y, item_re, field):
    M = MID.get(y)
    if not M:
        return None
    for f in M.get("fiscal_revised", []):
        if re.search(item_re, f["item"], re.I) and f.get(field) is not None:
            note = "January–June programme vs outturn" if field.startswith("h1") else None
            return cell(f[field], f"M{y}", f.get("page"), note=("Half-year outturn" if field == "h1_outturn_ghs_m" else note))
    return None

def first(*xs):
    for x in xs:
        if x:
            return x
    return None

def and_join(xs):
    xs = [str(x) for x in xs]
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1]

# The budgets spell the same indicator in different ways; each helper tries every known spelling.
def proj(y, *names):
    """Projection for year y from the medium-term framework of the one or two budgets before it."""
    if y <= FIRST:
        return None
    for src in (y - 1, y - 2):
        for n in names:
            r = mt(src, n, y)
            if r:
                return r
    return None

def target(y, *names):
    return first(*(tgt(y, n) for n in names))

def outturn(y, *names):
    """End-year outturn as judged in the loop file (from the following budget)."""
    return first(*(from_loop(y, n) for n in names)) if y < LAST else None

def pre(name, which="outturn"):
    """The year before the first budget, as that budget's review of it reports."""
    return from_pyr(FIRST, PRE, name, which)

IND = []
IND_YEARS = [PRE] + YEARS
def add(id_, name, unit, group, better, per_year, note=None):
    years_ = {}
    for y in IND_YEARS:
        d = {k: v for k, v in per_year(y).items() if v}
        if d:
            years_[y] = d
    IND.append({"id": id_, "name": name, "unit": unit, "group": group, "better": better, "years": years_, "note": note})

CAN = {  # canonical mid-year names (the mid-year extractions use these exact strings)
    "gdp": "Real GDP growth (%)", "nonoil": "Non-oil real GDP growth (%)", "infl": "End-period inflation (%)",
    "pbc": "Primary balance, commitment (% of GDP)", "obc": "Overall fiscal balance, commitment (% of GDP)",
    "obcash": "Overall fiscal balance, cash (% of GDP)", "pbcash": "Primary balance, cash (% of GDP)",
    "res": "Gross international reserves (months of import cover)", "rev": "Total revenue & grants (% of GDP)",
    "exp": "Total expenditure (% of GDP)", "debt": "Public debt (% of GDP)", "oil": "Benchmark crude oil price (US$/barrel)",
    "policy": "Policy rate (%)", "tbill": "91-day T-bill rate (%)",
}
mid = lambda y, k: {"revised": mid_rev(y, CAN[k]), "h1": mid_h1(y, CAN[k])}

add("gdp", "Real GDP growth", "%", "Growth and prices", "higher", lambda y: {
    "proj": proj(y, "Real GDP growth (%)"),
    "target": pre("Real GDP growth", "target") if y == PRE else target(y, "Real GDP growth (%)"),
    **mid(y, "gdp"),
    "outturn": pre("Real GDP growth") if y == PRE else outturn(y, "Real GDP growth")})
add("nonoil", "Non-oil real GDP growth", "%", "Growth and prices", "higher", lambda y: {
    "proj": proj(y, "Non-oil real GDP growth (%)"),
    "target": pre("Non-oil real GDP growth", "target") if y == PRE else target(y, "Non-oil real GDP growth (%)"),
    **mid(y, "nonoil"),
    "outturn": pre("Non-oil real GDP growth") if y == PRE else outturn(y, "Non-oil real GDP growth")})
add("infl", "End-year inflation", "%", "Growth and prices", "lower", lambda y: {
    "proj": proj(y, "End-period inflation (%)", "Inflation (%)"),
    "target": pre("End-period (December) inflation", "target") if y == PRE else target(y, "End-period inflation (%)", "End-period (end-year) inflation (%)"),
    **mid(y, "infl"),
    "outturn": pre("End-period (December) inflation") if y == PRE else outturn(y, "End-period inflation")},
    note="Targets from 2026 onward sit within the Bank of Ghana's 8 ± 2% band.")
add("pbc", "Primary balance, commitment basis", "% of GDP", "Fiscal balances", "higher", lambda y: {
    "proj": proj(y, "Primary balance, commitment (% of GDP)"),
    "target": pre("Primary balance, commitment basis", "target") if y == PRE else target(y, "Primary balance, commitment basis (% of GDP)"),
    **mid(y, "pbc"),
    "outturn": pre("Primary balance, commitment basis") if y == PRE else outturn(y, "Primary balance, commitment basis")},
    note="A positive number is a surplus before interest payments.")
add("obc", "Overall fiscal balance, commitment basis", "% of GDP", "Fiscal balances", "higher", lambda y: {
    "proj": proj(y, "Overall fiscal balance, commitment (% of GDP)", "Overall balance, commitment (% of GDP)"),
    "target": pre("Overall fiscal balance, commitment basis", "target") if y == PRE else target(y, "Overall fiscal balance, commitment basis (% of GDP)"),
    **mid(y, "obc"),
    "outturn": pre("Overall fiscal balance, commitment basis") if y == PRE else outturn(y, "Overall fiscal balance, commitment basis")},
    note="Negative = deficit.")
add("obcash", "Overall fiscal balance, cash basis", "% of GDP", "Fiscal balances", "higher", lambda y: {
    "proj": proj(y, "Overall fiscal balance, cash (% of GDP)", "Overall balance, cash (% of GDP)"),
    "target": pre("Overall fiscal balance, cash basis", "target") if y == PRE else target(y, "Overall fiscal balance, cash basis (% of GDP)"),
    **mid(y, "obcash"),
    "outturn": pre("Overall fiscal balance, cash basis") if y == PRE else outturn(y, "Overall fiscal balance, cash basis")},
    note="Negative = deficit.")
add("pbcash", "Primary balance, cash basis", "% of GDP", "Fiscal balances", "higher", lambda y: {
    "proj": proj(y, "Primary balance, cash (% of GDP)"),
    "target": pre("Primary balance, cash basis", "target") if y == PRE else target(y, "Primary balance, cash basis (% of GDP)"),
    **mid(y, "pbcash"),
    "outturn": pre("Primary balance, cash basis") if y == PRE else outturn(y, "Primary balance, cash basis")})
# end-year outturns the loop files don't hold, read by hand from the budgets
REV_OUT = {2024: cell(15.9, "B2025", 141, note="2024 outturn"), 2025: cell(16.0, "B2026", 170, note="Projected end-year"), 2026: cell(17.2, "B2027", 191, note="Projected end-year")}
EXP_OUT = {2024: cell(23.7, "B2025", 40, note="2024 outturn incl. discrepancy"), 2026: cell(19.1, "B2027", 191, note="Projected end-year")}
add("rev", "Total revenue and grants", "% of GDP", "Revenue and spending (% of GDP)", "higher", lambda y: {
    "proj": proj(y, "Total revenue & grants (% of GDP)", "Total revenue and grants (% of GDP)"),
    "target": target(y, "Total revenue & grants (% of GDP)", "Total revenue and grants (% of GDP)") if y > PRE else None,
    **mid(y, "rev"),
    "outturn": REV_OUT.get(y) or outturn(y, "Total revenue and grants")})
add("exp", "Total expenditure (commitment)", "% of GDP", "Revenue and spending (% of GDP)", "lower", lambda y: {
    "proj": proj(y, "Total expenditure, commitment (% of GDP)"),
    "target": target(y, "Total expenditure, commitment (% of GDP)") if y > PRE else None,
    **mid(y, "exp"),
    "outturn": EXP_OUT.get(y) or outturn(y, "Total expenditure, commitment basis", "Total expenditure (commitment)")})
add("res", "Gross international reserves", "months of imports", "External sector and debt", "higher", lambda y: {
    "proj": proj(y, "Gross international reserves (months of import cover)", "Gross international reserves (months of imports)"),
    "target": pre("Gross international reserves", "target") if y == PRE else target(y, "Gross international reserves (months of import cover)"),
    **mid(y, "res"),
    "outturn": pre("Gross international reserves") if y == PRE else outturn(y, "Gross international reserves")},
    note="Targets are minimum levels of import cover.")
add("debt", "Public debt", "% of GDP", "External sector and debt", "lower", lambda y: {
    "proj": proj(y, "Public debt (% of GDP)"),
    "target": target(y, "Public debt (% of GDP)"),
    **mid(y, "debt"),
    "outturn": pre("Public debt") if y == PRE else outturn(y, "Public debt")},
    note="Only the 2027 Budget sets a level (the 45%-of-GDP anchor). 2026 outturn is end-October.")
add("oil", "Benchmark crude oil price", "US$/barrel", "Oil", None, lambda y: {
    "proj": proj(y, "Benchmark crude oil price (US$/barrel)", "Benchmark crude oil price (US$/bbl)"),
    "target": target(y, "Benchmark crude oil price (US$/barrel)") if y > PRE else None,
    **mid(y, "oil")})
add("policy", "Monetary policy rate", "%", "Growth and prices", None, lambda y: {
    "revised": None, "h1": mid_h1(y, CAN["policy"]),
    "outturn": outturn(y, "Monetary policy rate") if y > PRE else None})
add("tbill", "91-day Treasury bill rate", "%", "Growth and prices", None, lambda y: {
    "h1": mid_h1(y, CAN["tbill"]),
    "outturn": pre("91-day treasury bill rate (end-December)") if y == PRE else first(from_pyr(y + 1, y, "91-day Treasury bill rate"), from_pyr(y + 1, y, "91-day treasury bill rate"))})

# fiscal lines in GH¢ (budget target, mid-year revision, half-year outturn, end-year outturn)
# per line: the mid-year regex, then labels keyed by the budget that prints them:
#   MT  = the line in that budget's medium-term framework (None = not given)
#   PYO = the line in that budget's review of the previous year (the first budget uses its own older format)
# A budget not listed uses the most recent listed label.
FIS_IND = [
    ("f_rev", "Total revenue and grants (GH¢)", r"^total revenue", "higher",
     {2025: "Total revenue & grants (GH¢ million)", 2026: "Total revenue & grants (GH¢ million)", 2027: "Total revenue and grants (GH¢ million)"},
     {2025: "Total Revenue & Grants", 2026: "Total Revenue & Grants", 2027: "Total Revenue & Grants"}),
    ("f_tax", "Tax revenue (GH¢)", r"^tax revenue", "higher",
     {2025: None},
     {2025: "Tax revenue (gross)", 2026: "Tax Revenue", 2027: "Tax Revenue"}),
    ("f_exp", "Total expenditure (GH¢)", r"^total expenditure", "lower",
     {2025: "Total expenditure, commitment (GH¢ million)", 2026: "Total expenditure (GH¢ million)", 2027: "Total expenditure (GH¢ million)"},
     {2025: "Total expenditure (commitment, incl. discrepancy)", 2026: "Total Expenditure (commitment)", 2027: "Total Expenditure (Commitment)"}),
    ("f_comp", "Compensation of employees (GH¢)", r"^compensation", None,
     {2025: None},
     {2025: "Compensation of employees", 2026: "Compensation of Employees", 2027: "Compensation of Employees"}),
    ("f_int", "Interest payments (GH¢)", r"^interest", "lower",
     {2025: None, 2026: "Interest payments (GH¢ million)", 2027: "Interest payments (GH¢ million)"},
     {2025: "Interest payments", 2026: "Interest Payments", 2027: "Interest Payments"}),
    ("f_capex", "Capital expenditure (GH¢)", r"^capital expenditure", "higher",
     {2025: None, 2026: "Capital expenditure (GH¢ million)", 2027: "Capital expenditure (GH¢ million)"},
     {2025: "Capital expenditure", 2026: "Capital Expenditure", 2027: "Capital Expenditure"}),
]
for id_, name, mid_re, better, MT, PYO in FIS_IND:
    lab = name.replace(" (GH¢)", "")
    fx = next(f for f in fiscal if f["item"].lower().startswith(lab.lower()[:12]))
    def per(y, fx=fx, mid_re=mid_re, MT=MT, PYO=PYO):
        def mt_proj():
            for src in (y - 1, y - 2):
                n = pick(MT, src) if src in Y else None
                r = mt(src, n, y) if n else None
                if r:
                    return r
            return None
        nxt = y + 1
        return {
            "proj": mt_proj() if y > FIRST else None,
            "target": pyo(FIRST, pick(PYO, FIRST), "budget") if y == PRE else cell(fx["values"][y]["v"], f"B{y}", fx["values"][y]["page"]) if y in fx["values"] else None,
            "revised": mid_fis(y, mid_re, "revised_budget_ghs_m") or (pyo(nxt, pick(PYO, nxt), "budget_ghs_m") if y >= FIRST else None),
            "h1": mid_fis(y, mid_re, "h1_outturn_ghs_m"),
            "outturn": pyo(FIRST, pick(PYO, FIRST), "outturn") if y == PRE else pyo(nxt, pick(PYO, nxt), "outturn_ghs_m"),
        }
    add(id_, name, "GH¢ million", "Revenue and spending (GH¢)", better, per,
        note=f"{PRE} 'target' is the {PRE} revised budget. Mid-year revisions come from the mid-year reviews; end-year outturns for {and_join(YEARS[:-1])} are projections made in the following budget.")

# fiscal flows: a half-year outturn covers January–June only, so it is not comparable with a full-year figure
FLOWS = {"pbc", "obc", "obcash", "pbcash", "rev", "exp", "f_rev", "f_tax", "f_exp", "f_comp", "f_int", "f_capex"}
for i in IND:
    i["flow"] = i["id"] in FLOWS
indicators = IND

# ---------------------------------------------------------------- standard area names
# The extractions labelled items with ~86 free-text areas. Fold them into one standard list,
# using the same sector names as the Sector section plus a few macro/fiscal headings.
STD_AREAS = ["Macroeconomy", "Revenue & tax", "Spending & fiscal balance", "Public debt", "Financial sector",
             "Education", "Health", "Agriculture", "Roads & Transport", "Energy", "Water & Sanitation", "Housing",
             "Trade & Industry", "Digital/ICT", "Employment & Youth", "Social Protection", "Local Government",
             "Lands & Natural Resources", "Tourism", "Security", "Governance & Justice", "Other"]
DIRECT = {
    "macro": "Macroeconomy", "macroeconomy": "Macroeconomy", "growth": "Macroeconomy", "inflation": "Macroeconomy",
    "external": "Macroeconomy", "reserves": "Macroeconomy", "exchange rate": "Macroeconomy", "interest rates": "Macroeconomy",
    "monetary": "Macroeconomy", "statistics": "Macroeconomy",
    "revenue": "Revenue & tax", "revenue administration": "Revenue & tax", "tax law": "Revenue & tax",
    "fiscal": "Spending & fiscal balance", "expenditure": "Spending & fiscal balance", "arrears": "Spending & fiscal balance",
    "arrears audit": "Spending & fiscal balance", "wages": "Spending & fiscal balance", "payroll": "Spending & fiscal balance",
    "fiscal discipline": "Spending & fiscal balance", "pfm": "Spending & fiscal balance", "procurement": "Spending & fiscal balance",
    "audit": "Spending & fiscal balance",
    "debt": "Public debt", "imf": "Public debt", "ratings": "Public debt",
    "financial sector": "Financial sector", "banking": "Financial sector", "capital market": "Financial sector", "credit": "Financial sector",
    "education": "Education", "health": "Health",
    "agriculture": "Agriculture", "cocoa": "Agriculture", "fisheries": "Agriculture",
    "roads & transport": "Roads & Transport", "roads": "Roads & Transport", "transport": "Roads & Transport", "rail": "Roads & Transport",
    "energy": "Energy", "petroleum": "Energy",
    "water & sanitation": "Water & Sanitation", "water": "Water & Sanitation", "sanitation": "Water & Sanitation",
    "housing": "Housing",
    "trade & industry": "Trade & Industry", "trade": "Trade & Industry", "business": "Trade & Industry", "investment": "Trade & Industry",
    "digital/ict": "Digital/ICT", "digital": "Digital/ICT", "ict": "Digital/ICT",
    "employment & youth": "Employment & Youth", "youth": "Employment & Youth", "jobs": "Employment & Youth", "sports": "Employment & Youth",
    "social protection": "Social Protection",
    "local government": "Local Government", "decentralisation": "Local Government",
    "lands & natural resources": "Lands & Natural Resources", "minerals": "Lands & Natural Resources", "mining": "Lands & Natural Resources",
    "illegal mining": "Lands & Natural Resources", "gold": "Lands & Natural Resources", "forestry": "Lands & Natural Resources",
    "environment": "Lands & Natural Resources",
    "tourism": "Tourism", "security": "Security", "floods": "Security",
    "governance": "Governance & Justice", "justice": "Governance & Justice", "anti-corruption": "Governance & Justice",
    "transparency": "Governance & Justice", "passports": "Governance & Justice", "identification": "Governance & Justice",
    "foreign affairs": "Governance & Justice",
}
# keyword rules for generic labels ("Acknowledged in the budget", "Macro target", "Finance", "Other", ...); first match wins
KEYWORDS = [
    ("Public debt", r"\bdebt|eurobond|ddep|restructur|imf\b|credit rating|fitch|moody|s&p|bondholder|amortis|qpc|\becf\b|\bocc\b|bilateral (agreement|project)|loan disburs|recapitali[sz]ation bond|claims on government"),
    ("Revenue & tax", r"revenue|\btax|vat\b|levy|levies|customs|excise|duties|^grants|grants? disburs|receipts"),
    ("Spending & fiscal balance", r"deficit|primary (balance|surplus)|expenditure|spending|capex|capital expenditure|arrears|wage|payroll|compensation|abfa|budget|appropriation|fiscal|procurement|audit|goods and services|interest payments|earmarked|ghaneps"),
    ("Financial sector", r"bank|npl|masloc|non-performing|savings|s&l|microfinance|capital market|gse\b|stock|insurance|pension|credit|fmc|receiver|nib\b|lending"),
    ("Macroeconomy", r"gdp|growth|inflation|exchange rate|cedi|reserves|current account|trade surplus|interest rate|t-bill|treasury bill|policy rate|monetary|ecowas|unemployment|rebasing|statistic"),
    ("Energy", r"energy|akosombo|\bmw\b|electric|power|ecg|ipp|\bgas\b|oil|petroleum|fuel|lpg|grid|solar|crude"),
    ("Agriculture", r"agric|extension agent|cocoa|cocobod|farm|crop|fertili|seed|livestock|poultry|vaccin|irrigation|fish|food"),
    ("Education", r"school|education|shs|jhs|teacher|student|tertiary|tvet|learner|library|textbook"),
    ("Health", r"health|pharmacist|hospital|nhis|nhia|clinic|chps|medical|nurse|blood|disease|agenda 111"),
    ("Roads & Transport", r"road|\bbus(es)?\b|metro mass|highway|bridge|rail|transport|port|airport|interchange|expressway"),
    ("Water & Sanitation", r"water|sanitation|toilet|landfill|waste"),
    ("Housing", r"housing|affordable homes|saglemi|apartment"),
    ("Lands & Natural Resources", r"mining|log grading|lumber|\bepa\b|e-waste|environmental permit|galamsey|gold|mineral|forest|tree|timber|land|plantation|ecotour|environment"),
    ("Trade & Industry", r"industr|registrar of companies|factory|trade|export|business|investment|agro-industrial|free zone|sme"),
    ("Digital/ICT", r"digital|telephony|tower|ict|coders|broadband|internet|cell site|telecom|data centre"),
    ("Employment & Youth", r"job|african games|medal|employment|youth|apprentice|sport|stadi"),
    ("Social Protection", r"leap|social protection|school feeding|vulnerable|disabilit|livelihood|social benefit"),
    ("Local Government", r"assembl|district|dacf|mmda|decentrali|local government|rcc"),
    ("Security", r"security|elbit|\bapcs?\b|police|army|navy|air force|military|fire service|nadmo|disaster|prison|immigration"),
    ("Governance & Justice", r"justice|\brti\b|right to information|court|corruption|special prosecutor|governance|passport|birth registration|chieftaincy|electoral"),
    ("Tourism", r"touris|culture|creative arts"),
]
import re as _re
KW = [(a, _re.compile(p, _re.I)) for a, p in KEYWORDS]
def std_area(area, text):
    a = (area or "").strip().lower()
    if a in DIRECT:
        return DIRECT[a]
    for name in STD_AREAS:  # already standard (e.g. "Health", "Roads & Transport"); "Other" still goes through the keywords
        if a == name.lower() and name != "Other":
            return name
    for name, rx in KW:
        if rx.search(text or ""):
            return name
    return "Other"

for y, lst in commitments.items():
    for c in lst:
        c["area_detail"] = c.get("area")
        c["area"] = std_area(c.get("area"), c.get("commitment", "") + " " + str(c.get("metric", "")))
for book in (successes, gaps):
    for y, lst in book.items():
        for x in lst:
            x["area_detail"] = x.get("area")
            x["area"] = std_area(x.get("area"), x.get("text", ""))

offsets = [f"minus {d['page_offset']} in the {d['label']}" for d in docs if d.get("page_offset")]
method = [
    f"Figures were extracted from the Budget Statement PDFs for {and_join(YEARS)} in this folder. Page references are PDF page numbers, so the links open the right page; the page number printed on the document differs (PDF page {and_join(offsets)}).",
    "Money is shown in Ghana cedis. Allocations use the appendix tables (all funding sources: GoG, internally generated funds and donor funds). Where the speech text and the appendix disagree, the appendix figure is used.",
    "Closing the loop: each target or commitment in one budget is judged against what the next budget reports. 'Met' and 'delivered' mean the later budget reports the target achieved; 'not reported' means the later budget is silent. Outturns for the most recent year are provisional (January–September or January–October) or projected, as labelled.",
    f"The {and_join(MID_YEARS)} Mid-Year Fiscal Policy Review{'s add' if len(MID_YEARS) > 1 else ' adds'} revised targets, half-year outturns and progress updates. They appear as 'Mid-year' measures in the indicator explorer, as their own column in sector views, and as {' / '.join('MY' + str(y) for y in MID_YEARS)} tags elsewhere.",
    "Regional counts reflect how many projects or allocations a budget names for each region; they are not spending totals. District assembly ceilings are compared as shares because the appendix covers different items each year.",
    "Known inconsistencies inside the documents: several totals differ between the speech and the appendix (for example the 2027 Big Push figure appears as GH¢27.8bn, GH¢28bn and GH¢29.8bn), and the 2027 MDA appendix is scanned, so its figures were transcribed by hand.",
]

data = {"yearList": YEARS, "preYear": PRE, "indicatorYears": IND_YEARS, "midYears": MID_YEARS, "docs": docs,
        "years": years, "macro": macro, "fiscal": fiscal, "taxes": taxes, "loop": loop, "commitments": commitments,
        "sectorGroups": sector_groups, "multiSectoral": multi, "mdas": mda_list, "sectors": sectors, "initiatives": initiatives,
        "regions": list(regions.values()), "regionShares": region_shares, "ceilingTotals": ceiling_total,
        "successes": successes, "gaps": gaps, "deviations": deviations, "debt": debt, "risks": risks, "method": method,
        "indicators": indicators, "areaOrder": STD_AREAS}

out = pathlib.Path(os.environ.get("BUDGET_OUT") or ROOT / "data" / "budget-data.js")
out.write_text("window.BUDGET = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
print("wrote", out, out.stat().st_size // 1024, "KB")
print("budgets:", YEARS, "mid-year reviews:", MID_YEARS, "loop files:", {y: bool(LOOP[y]) for y in LOOP})
