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
| `apps-script/Code.gs` | Unused. An alternative Google Sheet backend, kept in case you switch |

## Deploy on GitHub Pages

1. Create a new repository on GitHub (e.g. `trip-finance`).
2. Upload **all files** from this zip to the repo root.
3. Go to **Settings → Pages → Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main** / **(root)** → Save
4. After ~1 minute your app is live at  
   `https://<your-username>.github.io/trip-finance/`

## How data is saved  (read this if a device shows nothing)

The ledger is one **JSON document** in a [JSONBin.io](https://jsonbin.io) bin, shared by
every device. Nothing is ever stored as Excel — the *Download Excel* button builds the
`.xlsx` in your browser from the current data, so the file is always a snapshot, never
the source of truth.

```
device  ──GET──>  JSON bin  <──PUT──  device
                  (one document, merged row by row)
```

- **Rows merge individually.** Two rows from your laptop and two from your phone all
  survive — rows are matched by id, not by overwriting the file.
- **Deletes stay deleted,** via tombstones, so a device that still has the row cannot
  bring it back.
- **Offline is safe.** Rows recorded with no signal are held locally and published on
  reconnect.
- **Auto-refresh** every 120 seconds while the page is visible, and immediately when you
  switch back to the tab or regain connectivity.
- A local copy is kept in the browser, so the page still works with no connection.

### Setting it up

1. Create a free account at [jsonbin.io](https://jsonbin.io).
2. Create a bin whose content is `{}` and copy its **Bin ID**.
3. Create an **Access Key** with **Read** and **Update** rights only (not Delete, not List).
4. Put both into `BIN_ID` and `BIN_KEY` at the top of `common.js`.

A device can override either in ⚙ Settings, but normally nobody needs to — the built-in
values are used automatically, so a new phone just opens the link and works.

> The Bin ID and key are in the site's public JavaScript. That is the price of zero setup
> per device: anyone who reads the page source could write to the bin. Keep the key
> limited to Read + Update so it cannot delete the bin, and revoke it when the trip ends.

**Concurrency caveat.** JSONBin has no server-side lock and no conditional write, so a
save is read → merge → write → **read back and verify**, retrying if another device wrote
in between. That covers the realistic cases and is tested, but it is not as airtight as a
real database transaction.

**Request budget.** The free tier counts every request. Polling is deliberately slow for
that reason; a full two-day trip is well within the allowance, but don't leave the page
open and visible for days on end.

### Responsibilities are code, not data

The activity list is read-only on the site and is defined by `DEFAULT_RESPONSIBILITIES`
in `common.js`. It is deliberately not saved or synced, so editing that array changes the
list everywhere.

## Access code (expense page)

`expenses.html` stays locked until the access code is entered. The unlock lasts for the
current browser tab session (closing the tab or browser locks it again).

To change the code, edit `ACCESS_CODE` at the top of `gate.js`.

> This is a front-end gate meant to keep casual viewers out. Anyone who opens the page
> source can read the code, so don't treat it as real security.

## Change the opening balance / currency

⚙ Settings → Opening Balance / Currency Symbol → Save.
