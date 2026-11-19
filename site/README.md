# Ghana Budget Tracker

A running, static website that tracks Ghana's annual Budget Statements and Mid-Year Fiscal Policy Reviews, adding each new year as it is presented. It currently covers the 2025, 2026 and 2027 Budget Statements and the 2025 and 2026 Mid-Year Reviews.

## Open it

Double-click `site/index.html`. It works straight from disk; no server is needed.
For page links into the PDFs to open at the right page, serve the project folder instead:

```
python -m http.server 8765
```

then visit http://localhost:8765/site/index.html

## Sections

Navigation is dropdown-led: each section has labelled selectors at the top.

- **Overview**: theme, presenter and headline numbers for each budget
- **Compare budgets across years**: tick any number of budget years (change runs from the earliest to the latest picked); choose revenue and spending lines, sector groups, or ministries; tick the items to include; show as GH¢ or share of GDP
- **Year on year**
  - **Indicator explorer**: choose an indicator (real GDP, inflation, deficits, revenue, spending, debt, reserves and more) and compare up to five measures across 2024–2027: earlier projection, budget target, mid-year revised target, mid-year outturn, end-year outturn
  - Fiscal envelope (chart and table) and tax measures
- **Closing the loop**: targets against outturns by year; commitments filtered by year, area and status, each with its mid-year progress and final outcome
- **Sector by sector**: sector-group totals, flagship programmes, a sortable ministry table, and a sector selector showing achievements, gaps and plans across all five documents
- **Regional development**: region and document selectors with a tile map of the 16 regions, plus each region's share of district assembly ceilings
- **Successes and what was not achieved**: year and area selectors
- **Shortfalls**: budget against outturn by year and period (half-year, year to date, full year), debt and risks
- **Ask the data** (button at the bottom right): a search assistant over everything on the page (`assets/chat.js`). It runs in the browser with no AI and no server: it matches the question against the site's figures, targets, promises, programmes and regional items, understands years, regions and status words (missed, delivered, completed...), and quotes the matches with their PDF page links.

## Data

- `data/raw/documents.json`: the list of budgets and mid-year reviews the site covers, with each PDF's file name, page offset, presentation date, and title/presenter where the extraction gets them wrong
- `data/raw/<year>.json`: figures extracted from each Budget Statement
- `data/raw/mid<year>.json`: revised targets, half-year outturns and commitment progress from each Mid-Year Review
- `data/raw/loop_<year>.json`: a budget's targets and commitments judged (met / partly / missed / not reported) against the budgets that follow, with the evidence page
- `tools/build_data.py`: merges the raw files into `data/budget-data.js`, which the page loads

After editing any raw file, run `python site/tools/build_data.py` from the project folder.

Page references are PDF page numbers. The printed page number is lower by each document's `page_offset` in `documents.json`.

## Adding a new year

Every year list, dropdown, colour, column and label on the site comes from `documents.json`, so no page code changes.

1. Put the new Budget Statement PDF in the project folder.
2. Extract it to `data/raw/<year>.json` in the same shape as the existing years. Include `achievements_reported_for_<previous year>` and the previous year's `prior_year_outturn` lines.
3. Add the year under `budgets` in `documents.json`. Give `prior_year_ytd` the names of the year-to-date target and outturn fields if the budget reports them.
4. Write `data/raw/loop_<previous year>.json` judging the previous budget's targets and commitments against the new one.
5. For a Mid-Year Review, add `data/raw/mid<year>.json` and an entry under `midyear`.
6. Run `python site/tools/build_data.py`.

If a new budget spells a fiscal or macro line differently, the build stops and names the label it couldn't find. Add the new spelling for that year in `FISCAL_MAP` or `MACRO_MAP` in `build_data.py`. Lines left unlisted for a year use the most recent year's spelling.
