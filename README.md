# VE L&D Department Trip

A mobile-responsive trip site with two pages:

- **Home (`index.html`)** – the trip itinerary (Day 1 / Day 2) and the list of activity
  responsibilities. Each activity can have one or many responsible persons and can be
  added, edited or deleted at any time.
- **Record Expense (`expenses.html`)** – expense ledger starting from an opening balance
  (default **350,000**): Sr No, activity, date/time, price, qty, cost and remaining balance.
  Entries can be edited/deleted, and a formatted Excel (.xlsx) can be downloaded.
  Settings (⚙) for currency, opening balance and GitHub sync live on this page.

Runs entirely on GitHub Pages — no server needed.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Home – itinerary + responsibilities |
| `expenses.html` | Expense tracker |
| `main.js` | Responsibilities logic (multi-person add/edit) |
| `app.js` | Expense logic, Excel export/import |
| `common.js` | Shared storage + GitHub sync |
| `xlsx-writer.js` | Built-in Excel (.xlsx) writer, no external dependency |
| `style.css` | Styling (mobile-first, responsive) |
| `data.json` | Where all data is stored when GitHub sync is enabled |

## Deploy on GitHub Pages

1. Create a new repository on GitHub (e.g. `trip-finance`).
2. Upload **all files** from this zip to the repo root.
3. Go to **Settings → Pages → Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main** / **(root)** → Save
4. After ~1 minute your app is live at  
   `https://<your-username>.github.io/trip-finance/`

## How data is saved

- **By default** entries are saved in the browser (localStorage) on the device you use.
- **Download Excel** generates `VE_Trip_Expenses_<date>.xlsx` with two sheets:
  - *Trip Expenses* – formatted report (opening balance, totals, full ledger)
  - *Data* – raw rows, which you can re-import via Settings → Import Excel.

### Optional: save to the GitHub repo (shared across devices)

GitHub Pages is static, so the page cannot write files on its own. To make every
submission save to `data.json` in your repository:

1. Create a token at <https://github.com/settings/tokens> with the **repo** scope
   (or a fine-grained token with *Contents: Read & Write* on this repo).
2. Open the app → ⚙ **Settings** → fill in:
   - Repository: `your-username/trip-finance`
   - Branch: `main`
   - Personal Access Token
3. Save. From now on every Add / Delete commits `data.json` to the repo, and the app
   loads it on startup on any device where the same settings are entered.

> The token is stored only in your browser's localStorage. Do not commit it to the repo.

## Change the opening balance / currency

⚙ Settings → Opening Balance / Currency Symbol → Save.
