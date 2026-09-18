/* ============================================================
   common.js — shared state, storage, GitHub sync, toast
   Used by both index.html (main) and expenses.html
   ============================================================ */

const STORE_KEY = "veTrip.v2";
const CFG_KEY = "veTrip.cfg.v2";
const $ = (id) => document.getElementById(id);

const DEFAULT_RESPONSIBILITIES = [
  { id: "r1", activity: "Finance Management", persons: ["Sir Faraz Ahmad", "Abdullah Khan"] },
  { id: "r2", activity: "Room Arrangement", persons: ["Abdullah Khan"] },
  { id: "r3", activity: "Conveyance Arrangement", persons: ["Muhammad Hamza"] },
  { id: "r4", activity: "Drive Coordination", persons: ["Muhammad Haris"] },
  { id: "r5", activity: "Food Menu Decision", persons: ["All L&D"] },
  { id: "r6", activity: "Restaurant Reservation", persons: ["Muhammad Hamza"] },
  { id: "r7", activity: "Bill Collection", persons: ["Muhammad Ubaidullah", "Muhammad Haris"] },
  { id: "r8", activity: "Finance Reporting", persons: ["Muhammad Ubaidullah"] },
  { id: "r9", activity: "Photography", persons: ["Muhammad Hamza", "Muhammad Haris"] },
];

const freshResponsibilities = () => DEFAULT_RESPONSIBILITIES.map((r) => ({ ...r, persons: [...r.persons] }));

/* ---- Where the shared ledger lives ---------------------------------
   One JSON document in a JSONBin.io bin. Every device uses these, so
   there is nothing to set up per device. Both can be overridden per
   device in Settings if they ever change.
   Create the bin at jsonbin.io, then paste its Bin ID here, and an
   Access Key that has Read + Update rights (not Delete or List).    */
const BIN_ID = "6aad94aaffd5d16053172b87";
const BIN_KEY = "$2a$10$9c1aiW4/jamZlF6SaEh2BOlFzUYh77qgqXYKQ19TwuvKeCKUqWYOu";

/* Seconds between background checks. Deliberately slow - JSONBin's free
   tier counts every request. Switching back to the tab syncs instantly. */
const POLL_SECONDS = 120;

const TOMBSTONE_DAYS = 90;

const nowIso = () => new Date().toISOString();
const stamp = (v) => Date.parse(v || "") || 0;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* state.deleted is a map of { entryId: deletedAtIso } — see mergeLedger */
let state = { opening: 350000, entries: [], deleted: {}, settingsAt: "", responsibilities: freshResponsibilities() };
let cfg = { currency: "Rs", binId: "", binKey: "" };
let syncing = false;

/* ---------------- Persistence ----------------
   Responsibilities are NOT persisted or synced: they are defined in
   DEFAULT_RESPONSIBILITIES above and shown read-only, so the code stays the
   single source of truth. Only the expense ledger travels between devices.
   ------------------------------------------------------------------ */
function normalizeEntry(e) {
  return {
    id: e.id || uid(),
    activity: String(e.activity || ""),
    datetime: String(e.datetime || ""),
    price: Number(e.price) || 0,
    qty: Number(e.qty) || 1,
    updatedAt: e.updatedAt || "",
  };
}

function loadLocal() {
  let migrated = false;
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && typeof s === "object") {
      state.opening = s.opening ?? state.opening;
      state.settingsAt = s.settingsAt || "";
      state.deleted = s.deleted && typeof s.deleted === "object" ? s.deleted : {};
      if (Array.isArray(s.entries)) state.entries = s.entries.map(normalizeEntry);
      // Rows saved before per-row sync carry no stamp of their own. Give each one
      // a stamp once, and persist it, so it can merge with other devices' rows.
      state.entries.forEach((e) => {
        if (!e.updatedAt) { e.updatedAt = s.updatedAt || nowIso(); migrated = true; }
      });
    }
  } catch {}
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY));
    if (c) cfg = { ...cfg, ...c };
  } catch {}
  state.responsibilities = freshResponsibilities();
  if (migrated) saveLocal();
}

function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      opening: state.opening,
      entries: state.entries,
      deleted: state.deleted,
      settingsAt: state.settingsAt,
    }));
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {}
}
const commitLocal = saveLocal;          // kept for call sites that only need a save

/* Stamp a row as edited on this device. Every mutation goes through this,
   because the stamp decides which version of a row wins on merge. */
function touchEntry(e) { e.updatedAt = nowIso(); return e; }

/* Record a deletion. Without a tombstone the row simply comes back on the next
   merge, because another device still has its copy. */
function tombstone(id) { state.deleted[id] = nowIso(); }

/* ---------------- Helpers ---------------- */
const fmt = (n) =>
  `${cfg.currency} ${Number(n || 0).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let toastTimer;
function toast(msg, isErr = false) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "toast" + (isErr ? " err" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2800);
}

/* ---------------- Merge ----------------
   Rows are merged INDIVIDUALLY by id, so three devices can each add their own
   rows and all of them survive. Only the same row edited on two devices is a
   real conflict, and there the newer edit wins.
   ------------------------------------------------------------------ */
function mergeLedger(a, b) {
  const byId = new Map();
  const consider = (raw) => {
    const e = normalizeEntry(raw);
    const prev = byId.get(e.id);
    if (!prev || stamp(e.updatedAt) >= stamp(prev.updatedAt)) byId.set(e.id, e);
  };
  (a.entries || []).forEach(consider);
  (b.entries || []).forEach(consider);

  const deleted = { ...(a.deleted || {}) };
  for (const [id, at] of Object.entries(b.deleted || {})) {
    if (!deleted[id] || stamp(at) > stamp(deleted[id])) deleted[id] = at;
  }
  for (const [id, at] of Object.entries(deleted)) {
    const e = byId.get(id);
    // A delete only removes the row if it happened after that row's last edit,
    // so re-adding a row on another device is not undone by an old delete.
    if (e && stamp(at) >= stamp(e.updatedAt)) byId.delete(id);
  }
  // Drop tombstones old enough that no device can still be holding the row.
  const cutoff = Date.now() - TOMBSTONE_DAYS * 86400000;
  for (const [id, at] of Object.entries(deleted)) if (stamp(at) < cutoff) delete deleted[id];

  // Opening balance and currency are single values, so newest save wins.
  const top = stamp(b.settingsAt) > stamp(a.settingsAt) ? b : a;
  return {
    entries: [...byId.values()],
    deleted,
    opening: top.opening ?? a.opening ?? b.opening ?? 0,
    currency: top.currency || a.currency || b.currency || "Rs",
    settingsAt: top.settingsAt || "",
  };
}

const localLedger = () => ({
  entries: state.entries, deleted: state.deleted,
  opening: state.opening, currency: cfg.currency, settingsAt: state.settingsAt,
});

/* Identity of a ledger, used to tell whether we have anything new to publish */
const sig = (l) => JSON.stringify({
  e: (l.entries || []).map((x) => [x.id, x.updatedAt || ""]).sort(),
  d: Object.entries(l.deleted || {}).sort(),
  o: l.opening ?? null, c: l.currency || "", s: l.settingsAt || "",
});

function applyMerged(m) {
  state.entries = m.entries;
  state.deleted = m.deleted;
  state.opening = m.opening;
  state.settingsAt = m.settingsAt;
  if (m.currency) cfg.currency = m.currency;
  saveLocal();
  if (typeof render === "function") render();
}

const fileFrom = (l) => ({
  opening: l.opening, currency: l.currency, settingsAt: l.settingsAt,
  entries: l.entries, deleted: l.deleted, updatedAt: nowIso(),
});

/* ---------------- Transport: JSONBin.io ----------------
   The ledger is one JSON document in a bin. Reads are a GET, writes a PUT.
   JSONBin has no locking and no conditional write, so a save is
   read -> merge -> write -> read back and verify, retrying if another
   device wrote in between. That closes the race in practice.
   ------------------------------------------------------------------ */
const BIN_BASE = "https://api.jsonbin.io/v3/b";
let lastSyncMsg = "";

const binId  = () => (cfg.binId  || BIN_ID  || "").trim();
const binKey = () => (cfg.binKey || BIN_KEY || "").trim();
const binReady = () => !!binId();

function setSyncStatus(msg, kind) {
  lastSyncMsg = msg || "";
  const el = $("syncStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "hint" + (kind ? " " + kind : "");
}

async function binError(res) {
  let detail = "";
  try { detail = (await res.clone().json()).message || ""; } catch {}
  if (res.status === 401 || res.status === 403)
    return `Access key rejected (${res.status}). Check the key, and that it has Read and Update rights on this bin.`;
  if (res.status === 404) return "Bin not found (404). Check the Bin ID.";
  if (res.status === 429) return "JSONBin rate limit reached. It will retry shortly.";
  return `JSONBin ${res.status}` + (detail ? ": " + detail : "");
}

async function apiGet() {
  if (!binReady()) { setSyncStatus("No bin configured. Open Settings and add the Bin ID.", "err"); return null; }
  try {
    const headers = { "X-Bin-Meta": "false" };
    if (binKey()) headers["X-Access-Key"] = binKey();
    const res = await fetch(`${BIN_BASE}/${binId()}/latest?t=${Date.now()}`, { headers, cache: "no-store" });
    if (!res.ok) throw new Error(await binError(res));
    const j = await res.json();
    // With X-Bin-Meta:false the body IS the record; older replies wrap it.
    return j && j.record ? j.record : j || {};
  } catch (err) {
    setSyncStatus("Cannot read the data: " + err.message, "err");
    return null;
  }
}

async function apiPut(ledger) {
  if (!binReady()) { setSyncStatus("No bin configured. Open Settings and add the Bin ID.", "err"); return false; }
  try {
    const res = await fetch(`${BIN_BASE}/${binId()}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": binKey(),
        "X-Bin-Versioning": "false",   // overwrite in place, do not pile up versions
      },
      body: JSON.stringify(ledger),
    });
    if (!res.ok) throw new Error(await binError(res));
    return true;
  } catch (err) {
    setSyncStatus("Could not save: " + err.message, "err");
    return false;
  }
}

/* True when `outer` already contains everything in `inner` - used to confirm
   our write survived, rather than trusting the PUT blindly. */
const contains = (outer, inner) => sig(mergeLedger(outer, inner)) === sig(outer);

async function publish(quiet = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await apiGet();
    if (!remote) { if (!quiet) toast(lastSyncMsg || "Save failed", true); return false; }

    const merged = mergeLedger(remote, localLedger());
    applyMerged(merged);
    if (contains(remote, merged)) {            // nothing of ours is missing
      setSyncStatus("Up to date · checked " + new Date().toLocaleTimeString() + ".", "ok");
      return true;
    }
    if (!(await apiPut(merged))) { if (!quiet) toast(lastSyncMsg, true); return false; }

    const after = await apiGet();
    if (!after || contains(after, merged)) {
      setSyncStatus("Saved at " + new Date().toLocaleTimeString() + ".", "ok");
      if (!quiet) toast("Saved ✓ your other devices will show this");
      return true;
    }
    // Another device overwrote us between our read and our write. Merge again.
  }
  setSyncStatus("Another device kept saving at the same time. Will retry.", "err");
  if (!quiet) toast("Busy - will retry shortly", true);
  return false;
}

/* Read, merge, and push back anything the bin is missing. */
async function syncNow(quiet = true) {
  if (syncing) return;
  syncing = true;
  try {
    const remote = await apiGet();
    if (!remote) return;
    const merged = mergeLedger(remote, localLedger());
    const weHaveMore = !contains(remote, merged);
    applyMerged(merged);
    if (weHaveMore) await publish(quiet);
    else setSyncStatus("Up to date · checked " + new Date().toLocaleTimeString() + ".", "ok");
  } finally {
    syncing = false;
  }
}
const syncOnLoad = () => syncNow(true);

/* Polling is deliberately slow: JSONBin's free tier counts every request,
   and a fast poll would burn the monthly allowance for nothing. Switching
   back to the tab or regaining signal syncs immediately anyway. */
function startAutoSync(seconds = POLL_SECONDS) {
  const tick = () => { if (document.visibilityState === "visible") syncNow(true); };
  setInterval(tick, seconds * 1000);
  document.addEventListener("visibilitychange", tick);
  window.addEventListener("online", tick);
}

/* ---------------- Nav active state ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach((a) => {
    if (a.getAttribute("href") === page) a.classList.add("active");
  });
});
