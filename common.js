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

let state = { opening: 350000, entries: [], updatedAt: "", responsibilities: freshResponsibilities() };
let cfg = { currency: "Rs", repo: "", branch: "main", token: "" };
let fileSha = null;
let remoteUpdatedAt = 0;          // updatedAt of the copy currently in the repo

const stamp = (v) => Date.parse(v || "") || 0;

/* ---------------- Persistence ----------------
   Responsibilities are NOT persisted or synced: they are defined in
   DEFAULT_RESPONSIBILITIES above and the page shows them read-only, so the
   code stays the single source of truth. Only the expense ledger travels.
   ------------------------------------------------------------------ */
function loadLocal() {
  let backfilled = false;
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && typeof s === "object") {
      state.opening = s.opening ?? state.opening;
      if (Array.isArray(s.entries)) state.entries = s.entries;
      state.updatedAt = s.updatedAt || "";
      // Data saved before sync existed has no timestamp. Stamp it once so it is
      // not replaced by an older/empty copy from the repo.
      if (!state.updatedAt && state.entries.length) { state.updatedAt = new Date().toISOString(); backfilled = true; }
    }
  } catch {}
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY));
    if (c) cfg = { ...cfg, ...c };
  } catch {}
  state.responsibilities = freshResponsibilities();
  // Persist the backfill NOW. If it only lived in memory, every refresh would mint
  // a newer timestamp and this device would keep overwriting other devices' edits.
  if (backfilled) saveLocal();
}
function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ opening: state.opening, entries: state.entries, updatedAt: state.updatedAt }));
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {}
}
/* Mark the ledger as changed on this device, then save. Call this for every
   user edit — it is what makes this copy win over the one in the repo. */
function commitLocal() {
  state.updatedAt = new Date().toISOString();
  saveLocal();
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

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

/* ---------------- Sync ----------------
   Reading needs NO token: data.json sits next to this page on GitHub Pages,
   so any device (phone included) can just fetch it.
   Writing needs a token, because GitHub Pages is static and cannot accept
   uploads — the entry is committed to data.json through the GitHub API.
   -------------------------------------------------------------------- */
function ghUrl() {
  return `https://api.github.com/repos/${cfg.repo}/contents/data.json?ref=${encodeURIComponent(cfg.branch)}`;
}
function ghHeaders() {
  return { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json" };
}
function b64(str) { return btoa(unescape(encodeURIComponent(str))); }
function unb64(str) { return decodeURIComponent(escape(atob(str.replace(/\s/g, "")))); }

/* What gets written to data.json */
function payload() {
  return { opening: state.opening, currency: cfg.currency, entries: state.entries, updatedAt: state.updatedAt };
}

/* Take the repo's copy only when it is genuinely newer than this device's.
   Without this guard, opening the page would wipe unsynced local entries. */
function adoptRemote(remote) {
  if (!remote || typeof remote !== "object") return false;
  remoteUpdatedAt = stamp(remote.updatedAt);
  if (remoteUpdatedAt <= stamp(state.updatedAt)) return false;
  state.opening = remote.opening ?? state.opening;
  if (remote.currency) cfg.currency = remote.currency;
  if (Array.isArray(remote.entries)) state.entries = remote.entries;
  state.updatedAt = remote.updatedAt;
  saveLocal();
  if (typeof render === "function") render();
  return true;
}

/* Public read — no token, works for everyone who opens the link */
async function pullPublic() {
  try {
    const res = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return false;
    return adoptRemote(await res.json());
  } catch {
    return false;                       // offline, or opened via file://
  }
}

/* Authenticated read — also gives us the blob sha needed to write */
async function pullFromGitHub(interactive = false) {
  if (!cfg.repo || !cfg.token) return false;
  try {
    const res = await fetch(ghUrl(), { headers: ghHeaders(), cache: "no-store" });
    if (res.status === 404) { fileSha = null; remoteUpdatedAt = 0; return false; }
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const j = await res.json();
    fileSha = j.sha;
    adoptRemote(JSON.parse(unb64(j.content)));
    if (interactive) toast("Loaded data from GitHub ✓");
    return true;
  } catch (err) {
    if (interactive) toast("GitHub load failed: " + err.message, true);
    return false;
  }
}

async function putGitHub(body) {
  return fetch(`https://api.github.com/repos/${cfg.repo}/contents/data.json`, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function pushToGitHub() {
  if (!cfg.repo || !cfg.token) return;
  try {
    const body = {
      message: `Update trip data (${new Date().toISOString()})`,
      content: b64(JSON.stringify(payload(), null, 2)),
      branch: cfg.branch,
    };
    if (fileSha) body.sha = fileSha;
    let res = await putGitHub(body);
    if (res.status === 409 || res.status === 422) {
      // Someone else committed first — re-read the sha and retry once.
      const r2 = await fetch(ghUrl(), { headers: ghHeaders(), cache: "no-store" });
      if (r2.ok) { fileSha = (await r2.json()).sha; body.sha = fileSha; }
      res = await putGitHub(body);
    }
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    fileSha = (await res.json()).content.sha;
    remoteUpdatedAt = stamp(state.updatedAt);
    toast("Synced ✓ visible on other devices in ~1 min");
  } catch (err) {
    toast("Sync failed: " + err.message, true);
  }
}

/* Startup: read what the repo has, then push if this device is ahead. */
async function syncOnLoad() {
  await pullPublic();
  if (!cfg.repo || !cfg.token) return;
  await pullFromGitHub();
  if (stamp(state.updatedAt) > remoteUpdatedAt) await pushToGitHub();
}

/* ---------------- Nav active state ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach((a) => {
    if (a.getAttribute("href") === page) a.classList.add("active");
  });
});
