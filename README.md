# Ghana Budget Tracker

A running, static website that tracks Ghana's annual Budget Statements and Mid-Year Fiscal Policy Reviews: what each budget planned, what the following budget says actually happened, and where the promises fell short. Every figure links to the page of the PDF it came from.

Live site: https://ghanabudgettracker.com

- `site/` — the website (open `site/index.html`); see [site/README.md](site/README.md) for its sections, data and how to add a new year
- `*.pdf` — the source documents the site links to

Run it locally from this folder:

```
python -m http.server 8765
```

then visit http://localhost:8765/site/
