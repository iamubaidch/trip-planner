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

let state = { opening: 350000, entries: [], responsibilities: DEFAULT_RESPONSIBILITIES.map((r) => ({ ...r, persons: [...r.persons] })) };
let cfg = { currency: "Rs", repo: "", branch: "main", token: "" };
let fileSha = null;

/* ---------------- Persistence ---------------- */
function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && typeof s === "object") {
      state.opening = s.opening ?? state.opening;
      if (Array.isArray(s.entries)) state.entries = s.entries;
      if (Array.isArray(s.responsibilities)) state.responsibilities = s.responsibilities;
    }
  } catch {}
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY));
    if (c) cfg = { ...cfg, ...c };
  } catch {}
}
function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {}
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

/* ---------------- GitHub Sync ---------------- */
function ghUrl() {
  return `https://api.github.com/repos/${cfg.repo}/contents/data.json?ref=${encodeURIComponent(cfg.branch)}`;
}
function ghHeaders() {
  return { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json" };
}
function b64(str) { return btoa(unescape(encodeURIComponent(str))); }
function unb64(str) { return decodeURIComponent(escape(atob(str.replace(/\n/g, "")))); }

async function pullFromGitHub(interactive = false) {
  if (!cfg.repo || !cfg.token) return false;
  try {
    const res = await fetch(ghUrl(), { headers: ghHeaders(), cache: "no-store" });
    if (res.status === 404) { fileSha = null; return false; }
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const j = await res.json();
    fileSha = j.sha;
    const remote = JSON.parse(unb64(j.content));
    if (remote && typeof remote === "object") {
      state.opening = remote.opening ?? state.opening;
      if (Array.isArray(remote.entries)) state.entries = remote.entries;
      if (Array.isArray(remote.responsibilities)) state.responsibilities = remote.responsibilities;
      saveLocal();
      if (typeof render === "function") render();
    }
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
      content: b64(JSON.stringify(state, null, 2)),
      branch: cfg.branch,
    };
    if (fileSha) body.sha = fileSha;
    let res = await putGitHub(body);
    if (res.status === 409 || res.status === 422) {
      const r2 = await fetch(ghUrl(), { headers: ghHeaders(), cache: "no-store" });
      if (r2.ok) { fileSha = (await r2.json()).sha; body.sha = fileSha; }
      res = await putGitHub(body);
    }
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    fileSha = (await res.json()).content.sha;
    toast("Synced to GitHub ✓");
  } catch (err) {
    toast("GitHub sync failed: " + err.message, true);
  }
}

/* ---------------- Nav active state ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach((a) => {
    if (a.getAttribute("href") === page) a.classList.add("active");
  });
});
