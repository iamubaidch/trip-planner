/* ============================================================
   gate.js — access-code gate for the expense page
   The expense app (app.js) is only loaded once the correct code
   is entered, so nothing is rendered while the page is locked.
   ============================================================ */

const ACCESS_CODE = "647499";
const UNLOCK_KEY = "veTrip.expenseUnlocked";

let appLoaded = false;

function loadExpenseApp() {
  if (appLoaded) return;
  appLoaded = true;
  const s = document.createElement("script");
  s.src = "app.js";
  document.body.appendChild(s);
}

function isUnlocked() {
  try { return sessionStorage.getItem(UNLOCK_KEY) === "1"; } catch { return false; }
}

function unlock(remember) {
  if (remember) { try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch {} }
  $("lockScreen").hidden = true;
  document.body.classList.remove("locked");
  loadExpenseApp();
}

function denyAccess() {
  const box = $("lockBox");
  const input = $("accessCode");
  $("lockError").hidden = false;
  box.classList.remove("shake");
  void box.offsetWidth;        // restart the animation
  box.classList.add("shake");
  input.value = "";
  input.focus();
}

/* ---------------- Init ---------------- */
if (isUnlocked()) {
  unlock(false);
} else {
  $("lockForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if ($("accessCode").value.trim() === ACCESS_CODE) unlock(true);
    else denyAccess();
  });
  $("accessCode").addEventListener("input", () => ($("lockError").hidden = true));
  $("accessCode").focus();
}
