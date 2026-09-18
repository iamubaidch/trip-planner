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

/* Reading the published ledger needs no token, so these are baked in. */
const DEFAULT_REPO = "iamubaidch/trip-planner";
const DEFAULT_BRANCH = "main";
const TOMBSTONE_DAYS = 90;

const nowIso = () => new Date().toISOString();
const stamp = (v) => Date.parse(v || "") || 0;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* state.deleted is a map of { entryId: deletedAtIso } — see mergeLedger */
let state = { opening: 350000, entries: [], deleted: {}, settingsAt: "", responsibilities: freshResponsibilities() };
let cfg = { currency: "Rs", repo: DEFAULT_REPO, branch: DEFAULT_BRANCH, token: "" };
let fileSha = null;
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
  if (!cfg.repo) cfg.repo = DEFAULT_REPO;
  if (!cfg.branch) cfg.branch = DEFAULT_BRANCH;
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

/* ---------------- Transport ---------------- */
function ghUrl() {
  return `https://api.github.com/repos/${cfg.repo}/contents/data.json?ref=${encodeURIComponent(cfg.branch)}`;
}
function ghHeaders() {
  return { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json" };
}
function b64(str) { return btoa(unescape(encodeURIComponent(str))); }
function unb64(str) { return decodeURIComponent(escape(atob(str.replace(/[^A-Za-z0-9+/=]/g, "")))); }

/* Read the published ledger. With a token we use the API, which also returns the
   sha needed to write. Without one we read raw.githubusercontent, which reflects
   a commit within seconds — the Pages copy waits for a site rebuild. */
async function readRemote() {
  if (cfg.repo && cfg.token) {
    try {
      const res = await fetch(ghUrl(), { headers: ghHeaders(), cache: "no-store" });
      if (res.status === 404) { fileSha = null; return { data: {}, sha: null }; }
      if (!res.ok) throw new Error("GitHub " + res.status);
      const j = await res.json();
      fileSha = j.sha;
      return { data: JSON.parse(unb64(j.content)), sha: j.sha };
    } catch { return null; }
  }
  const urls = [];
  if (cfg.repo) urls.push(`https://raw.githubusercontent.com/${cfg.repo}/${cfg.branch}/data.json?t=${Date.now()}`);
  urls.push(`data.json?t=${Date.now()}`);
  for (const u of urls) {
    try { const r = await fetch(u, { cache: "no-store" }); if (r.ok) return { data: await r.json(), sha: null }; } catch {}
  }
  return null;
}

async function putGitHub(body) {
  return fetch(`https://api.github.com/repos/${cfg.repo}/contents/data.json`, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* Publish = re-read, merge, write. Never a blind overwrite, so a row added on
   another device between our read and our write is not lost. */
async function pushToGitHub(quiet = false) {
  if (!cfg.repo || !cfg.token) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await readRemote();
    if (!remote) { if (!quiet) toast("Sync failed: cannot reach GitHub", true); return false; }
    const merged = mergeLedger(remote.data || {}, localLedger());
    applyMerged(merged);
    if (sig(merged) === sig(remote.data || {})) return true;   // nothing new to write
    const body = {
      message: `Update trip data (${nowIso()})`,
      content: b64(JSON.stringify(fileFrom(merged), null, 2)),
      branch: cfg.branch,
    };
    if (remote.sha) body.sha = remote.sha;
    const res = await putGitHub(body);
    if (res.ok) {
      fileSha = (await res.json()).content.sha;
      if (!quiet) toast("Synced ✓ all devices will show this");
      return true;
    }
    // 409/422 = another device committed first. Loop: read again, merge, retry.
    if (res.status !== 409 && res.status !== 422) {
      if (!quiet) toast("Sync failed: GitHub " + res.status, true);
      return false;
    }
  }
  if (!quiet) toast("Sync busy, will retry shortly", true);
  return false;
}

/* Pull what others published, merge it in, then publish anything of ours that
   is missing from the file. */
async function syncNow(quiet = true) {
  if (syncing) return;
  syncing = true;
  try {
    const remote = await readRemote();
    if (!remote) return;
    const merged = mergeLedger(remote.data || {}, localLedger());
    const changed = sig(merged) !== sig(remote.data || {});
    applyMerged(merged);
    if (changed && cfg.token) await pushToGitHub(quiet);
  } finally {
    syncing = false;
  }
}
const syncOnLoad = () => syncNow(true);

/* Keep devices converged without anyone pressing refresh. */
function startAutoSync(seconds = 45) {
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
