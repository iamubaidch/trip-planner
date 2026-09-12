/* ============================================================
   main.js — Responsibilities (add / edit / delete, multi-person)
   ============================================================ */

let chipPersons = [];

/* ---------------- Render ---------------- */
function render() {
  const list = state.responsibilities || [];
  $("respEmpty").hidden = list.length > 0;
  $("respBody").innerHTML = list
    .map(
      (r, i) => `
      <tr>
        <td data-label="Sr No"><span class="sr">${i + 1}</span></td>
        <td data-label="Activity" class="act">${escapeHtml(r.activity)}</td>
        <td data-label="Responsible">
          <div class="people">
            ${(r.persons || []).map((p) => `<span class="person">${avatar(p)}${escapeHtml(p)}</span>`).join("")}
            ${(r.persons || []).length ? "" : '<span class="hint">Not assigned</span>'}
          </div>
        </td>
        <td class="action row-actions">
          <button class="edit" data-id="${r.id}" title="Edit" aria-label="Edit">✎</button>
          <button class="del" data-id="${r.id}" title="Delete" aria-label="Delete">🗑</button>
        </td>
      </tr>`
    )
    .join("");

  // datalist suggestions from all known names
  const names = [...new Set(list.flatMap((r) => r.persons || []))].sort();
  $("personList").innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">`).join("");
}

function avatar(name) {
  const initials = name.replace(/^sir\s+/i, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="avatar" style="background:hsl(${h},55%,45%)">${escapeHtml(initials)}</span>`;
}

/* ---------------- Chips ---------------- */
function renderChips() {
  const box = $("personChips");
  box.querySelectorAll(".chip").forEach((c) => c.remove());
  const input = $("personInput");
  chipPersons.forEach((p, i) => {
    const el = document.createElement("span");
    el.className = "chip";
    el.innerHTML = `${escapeHtml(p)} <button type="button" data-i="${i}" aria-label="Remove">×</button>`;
    box.insertBefore(el, input);
  });
}
function addChipFromInput() {
  const input = $("personInput");
  input.value.split(/[,;]/).map((s) => s.trim()).filter(Boolean).forEach((name) => {
    if (!chipPersons.some((p) => p.toLowerCase() === name.toLowerCase())) chipPersons.push(name);
  });
  input.value = "";
  renderChips();
}
$("personInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addChipFromInput(); }
  else if (e.key === "Backspace" && !e.target.value && chipPersons.length) { chipPersons.pop(); renderChips(); }
});
$("personInput").addEventListener("blur", addChipFromInput);
$("personInput").addEventListener("change", addChipFromInput); // datalist pick
$("personChips").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]");
  if (b) { chipPersons.splice(+b.dataset.i, 1); renderChips(); $("personInput").focus(); }
  else $("personInput").focus();
});

/* ---------------- Modal ---------------- */
function openModal(resp) {
  $("respId").value = resp ? resp.id : "";
  $("respActivity").value = resp ? resp.activity : "";
  chipPersons = resp ? [...(resp.persons || [])] : [];
  renderChips();
  $("respModalTitle").textContent = resp ? "Edit Activity" : "Add Activity";
  $("deleteResp").hidden = !resp;
  $("respModal").hidden = false;
  setTimeout(() => (resp ? $("personInput") : $("respActivity")).focus(), 50);
}
function closeModal() { $("respModal").hidden = true; }

$("addRespBtn").addEventListener("click", () => openModal(null));
$("closeResp").addEventListener("click", closeModal);
$("respModal").addEventListener("click", (e) => { if (e.target === $("respModal")) closeModal(); });

$("respBody").addEventListener("click", async (e) => {
  const edit = e.target.closest(".edit");
  const del = e.target.closest(".del");
  if (edit) {
    openModal(state.responsibilities.find((r) => r.id === edit.dataset.id));
  } else if (del) {
    if (!confirm("Delete this activity?")) return;
    state.responsibilities = state.responsibilities.filter((r) => r.id !== del.dataset.id);
    saveLocal(); render(); toast("Activity deleted");
    await pushToGitHub();
  }
});

$("respForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  addChipFromInput();
  const id = $("respId").value;
  const activity = $("respActivity").value.trim();
  if (!activity) return;
  if (id) {
    const r = state.responsibilities.find((x) => x.id === id);
    if (r) { r.activity = activity; r.persons = [...chipPersons]; }
  } else {
    state.responsibilities.push({ id: uid(), activity, persons: [...chipPersons] });
  }
  saveLocal(); render(); closeModal();
  toast(id ? "Activity updated ✓" : "Activity added ✓");
  await pushToGitHub();
});

$("deleteResp").addEventListener("click", async () => {
  const id = $("respId").value;
  if (!id || !confirm("Delete this activity?")) return;
  state.responsibilities = state.responsibilities.filter((r) => r.id !== id);
  saveLocal(); render(); closeModal(); toast("Activity deleted");
  await pushToGitHub();
});

/* ---------------- Init ---------------- */
loadLocal();
render();
pullFromGitHub();
