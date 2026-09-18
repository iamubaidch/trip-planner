# VE L&D Department Trip

A mobile-responsive trip site with two pages:

- **Home (`index.html`)** – the trip itinerary (Day 1 / Day 2) and the list of activity
  responsibilities. This page is **view only**: activities cannot be added, edited or
  deleted from the browser.
- **Record Expense (`expenses.html`)** – **protected by an access code**. The page shows a
  lock screen first and only loads the ledger once the correct code is entered.
  Expense ledger starting from an opening balance
  (default **350,000**): Sr No, activity, date/time, price, qty, cost and remaining balance.
  Entries can be edited/deleted, and a formatted Excel (.xlsx) can be downloaded.
  Settings (⚙) for currency, opening balance and GitHub sync live on this page.

Runs entirely on GitHub Pages — no server needed.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Home – itinerary + responsibilities |
| `expenses.html` | Expense tracker |
| `main.js` | Responsibilities rendering (read-only) |
| `gate.js` | Access-code lock screen for the expense page |
| `app.js` | Expense logic, Excel export/import |
| `common.js` | Shared storage + GitHub sync |
| `xlsx-writer.js` | Built-in Excel (.xlsx) writer, no external dependency |
| `style.css` | Styling (mobile-first, responsive) |
| `data.json` | The published ledger — read by every device, written by devices with a token |

## Deploy on GitHub Pages

1. Create a new repository on GitHub (e.g. `trip-finance`).
2. Upload **all files** from this zip to the repo root.
3. Go to **Settings → Pages → Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main** / **(root)** → Save
4. After ~1 minute your app is live at  
   `https://<your-username>.github.io/trip-finance/`

## How data is saved  (read this if the phone shows nothing)

The site is static — GitHub Pages can serve files but cannot receive them. So by
default every entry lives in **localStorage**, which is private to one browser on
one device. That is why data typed on a PC does not appear on a phone.

To share across devices, the ledger has to be written into `data.json` in the repo:

- **Reading needs no token.** Every device fetches `data.json` from the site on load,
  so anyone who opens the link sees the latest published ledger.
- **Writing needs a token,** because committing to the repo goes through the GitHub API.
  Set it up under ⚙ **Settings → Share across devices** on the expense page.

Which mode a device is in is shown by the pill next to "Expense Log":

| Pill | Meaning |
|------|---------|
| 📴 This device only | Entries stay in this browser. Nobody else will see them. |
| ☁ Syncing | Every add / edit / delete is committed to `data.json`. |

### Setting up sync

1. Create a token at <https://github.com/settings/tokens?type=beta> — **fine-grained**,
   limited to this one repository, permission **Contents: Read & write**.
2. Open the expense page → enter the access code → ⚙ **Settings**.
3. Fill in Repository (`iamubaidch/trip-planner`), Branch (`main`) and the token → **Save**.
4. The device pushes whatever it already has, and from then on syncs every change.

Other devices pick it up on their next page load (GitHub Pages caches `data.json`
for about a minute).

> The token is stored only in that browser's localStorage and is never committed.
> Anyone who can unlock that device can read it from devtools, so only add it on
> devices you trust. Revoke it on GitHub when the trip is over.

**Conflicts.** Each save stamps the ledger with a timestamp, and the newer copy wins.
If two people record at the same moment, the later save replaces the earlier one —
fine for one or two people recording, not a true multi-writer database.

**Excel.** *Download Excel* generates `VE_Trip_Expenses_<date>.xlsx` with two sheets:
*Trip Expenses* (formatted report) and *Data* (raw rows, re-importable via ⬆ Import Excel).

### Responsibilities are code, not data

The activity list is read-only on the site and is defined by `DEFAULT_RESPONSIBILITIES`
in `common.js`. It is deliberately **not** saved or synced, so editing that array is all
it takes to change the list everywhere — no stale copy in a browser or in `data.json`
can override it.

## Access code (expense page)

`expenses.html` stays locked until the access code is entered. The unlock lasts for the
current browser tab session (closing the tab or browser locks it again).

To change the code, edit `ACCESS_CODE` at the top of `gate.js`.

> This is a front-end gate meant to keep casual viewers out. Anyone who opens the page
> source can read the code, so don't treat it as real security.

## Change the opening balance / currency

⚙ Settings → Opening Balance / Currency Symbol → Save.
