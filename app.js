/* ============================================================
   app.js — Expense tracker (requires common.js + xlsx-writer.js)
   - Entries stored in localStorage (works fully offline / static)
   - Optional GitHub sync: writes data.json to your repo via API
   - Export to a formatted .xlsx (built-in writer), import back via SheetJS
   ============================================================ */

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/* Compute running balances (entries sorted by date) */
function computed() {
  const sorted = [...state.entries].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  let bal = Number(state.opening);
  return sorted.map((e, i) => {
    const cost = Number(e.price) * Number(e.qty);
    bal -= cost;
    return { ...e, sr: i + 1, cost, balance: bal };
  });
}

/* ---------------- Render ---------------- */
function render() {
  const rows = computed();
  const spent = rows.reduce((s, r) => s + r.cost, 0);
  const remaining = Number(state.opening) - spent;

  $("openingCard").textContent = fmt(state.opening);
  $("spentCard").textContent = fmt(spent);
  const rc = $("remainingCard");
  rc.textContent = fmt(remaining);
  rc.classList.toggle("negative", remaining < 0);

  const pct = state.opening > 0 ? Math.max(0, Math.min(100, (remaining / state.opening) * 100)) : 0;
  const bar = $("barFill");
  bar.style.width = pct + "%";
  bar.style.background = pct < 15 ? "#dc2626" : pct < 40 ? "#f59e0b" : "#16a34a";

  $("countBadge").textContent = `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`;
  $("emptyMsg").hidden = rows.length > 0;

  const tb = $("ledgerBody");
  tb.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td data-label="Sr No"><span class="sr">${r.sr}</span></td>
        <td data-label="Activity">${escapeHtml(r.activity)}</td>
        <td data-label="Date & Time"><span class="dt">${fmtDate(r.datetime)}</span></td>
        <td data-label="Price" class="num">${fmt(r.price)}</td>
        <td data-label="Qty" class="num">${r.qty}</td>
        <td data-label="Cost" class="num cost">- ${fmt(r.cost)}</td>
        <td data-label="Remaining Balance" class="num balance ${r.balance < 0 ? "negative" : ""}">${fmt(r.balance)}</td>
        <td class="action row-actions"><button class="edit" data-id="${r.id}" title="Edit" aria-label="Edit">✎</button><button class="del" data-id="${r.id}" title="Delete" aria-label="Delete">🗑</button></td>
      </tr>`
    )
    .join("");

  const names = [...new Set([...(state.responsibilities || []).map((r) => r.activity), ...state.entries.map((e) => e.activity)])].sort();
  $("activityList").innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">`).join("");
  updateCostPreview();
}

function updateCostPreview() {
  const p = parseFloat($("price").value) || 0;
  const q = parseFloat($("qty").value) || 0;
  $("costPreview").value = fmt(p * q);
}

/* ---------------- Add / Delete ---------------- */
$("entryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const editId = $("entryId").value;
  const data = {
    activity: $("activity").value.trim(),
    datetime: $("datetime").value,
    price: parseFloat($("price").value) || 0,
    qty: parseInt($("qty").value, 10) || 1,
  };
  if (!data.activity || !data.datetime) return;

  if (editId) {
    const ex = state.entries.find((x) => x.id === editId);
    if (ex) touchEntry(Object.assign(ex, data));
  } else {
    state.entries.push(touchEntry({ id: uid(), ...data }));
  }
  commitLocal();
  render();
  resetForm();
  toast(editId ? "Expense updated ✓" : "Expense saved ✓");
  await pushToGitHub();
});

function resetForm() {
  $("entryId").value = "";
  $("activity").value = "";
  $("price").value = "";
  $("qty").value = "1";
  $("datetime").value = nowLocalInput();
  $("formTitle").textContent = "Record Expense";
  $("submitBtn").textContent = "＋ Add & Save";
  $("cancelEdit").hidden = true;
  updateCostPreview();
}
$("cancelEdit").addEventListener("click", resetForm);

function startEdit(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  $("entryId").value = e.id;
  $("activity").value = e.activity;
  $("datetime").value = e.datetime;
  $("price").value = e.price;
  $("qty").value = e.qty;
  $("formTitle").textContent = "Edit Expense";
  $("submitBtn").textContent = "✓ Update";
  $("cancelEdit").hidden = false;
  updateCostPreview();
  $("entryForm").scrollIntoView({ behavior: "smooth", block: "start" });
  $("activity").focus();
}

$("ledgerBody").addEventListener("click", async (e) => {
  const ed = e.target.closest(".edit");
  if (ed) return startEdit(ed.dataset.id);
  const btn = e.target.closest(".del");
  if (!btn) return;
  if (!confirm("Delete this entry?")) return;
  if ($("entryId").value === btn.dataset.id) resetForm();
  state.entries = state.entries.filter((x) => x.id !== btn.dataset.id);
  tombstone(btn.dataset.id);
  commitLocal();
  render();
  toast("Entry deleted");
  await pushToGitHub();
});

["price", "qty"].forEach((id) => $(id).addEventListener("input", updateCostPreview));

/* ---------------- Excel Export ---------------- */
$("exportBtn").addEventListener("click", () => {
  const rows = computed();
  const spent = rows.reduce((s, r) => s + r.cost, 0);
  const remaining = Number(state.opening) - spent;
  const money = '"' + cfg.currency + '" #,##0.00';

  const wb = new MiniXLSX.Workbook();
  const S = {
    title:   wb.style({ bold: true, size: 16, color: "0F766E" }),
    meta:    wb.style({ color: "64748B" }),
    sumLbl:  wb.style({ bold: true, fill: "F1F5F9", border: true }),
    sumVal:  wb.style({ bold: true, numFmt: money, border: true, align: "right" }),
    sumNeg:  wb.style({ bold: true, numFmt: money, border: true, align: "right", color: "DC2626", fill: "FEE2E2" }),
    sumPos:  wb.style({ bold: true, numFmt: money, border: true, align: "right", color: "15803D", fill: "DCFCE7" }),
    head:    wb.style({ bold: true, fill: "0F766E", color: "FFFFFF", border: true, align: "center" }),
    cell:    wb.style({ border: true }),
    center:  wb.style({ border: true, align: "center" }),
    date:    wb.style({ border: true, numFmt: "dd-mmm-yyyy hh:mm AM/PM", align: "center" }),
    num:     wb.style({ border: true, numFmt: money, align: "right" }),
    cost:    wb.style({ border: true, numFmt: money, align: "right", color: "DC2626" }),
    bal:     wb.style({ border: true, numFmt: money, align: "right", bold: true, color: "15803D" }),
    balNeg:  wb.style({ border: true, numFmt: money, align: "right", bold: true, color: "DC2626" }),
    total:   wb.style({ bold: true, fill: "F1F5F9", border: true }),
    totalV:  wb.style({ bold: true, fill: "F1F5F9", border: true, numFmt: money, align: "right" }),
  };

  const sheetRows = [
    [{ v: "VE L&D Department Trip — Expense Report", s: S.title }],
    [{ v: "Generated: " + new Date().toLocaleString(), s: S.meta }],
    [],
    [{ v: "Opening Balance", s: S.sumLbl }, { v: Number(state.opening), s: S.sumVal }],
    [{ v: "Total Spent", s: S.sumLbl }, { v: spent, s: S.sumVal }],
    [{ v: "Remaining Balance", s: S.sumLbl }, { v: remaining, s: remaining < 0 ? S.sumNeg : S.sumPos }],
    [],
    ["Sr No", "Activity", "Date & Time", "Price", "Qty", "Cost", "Remaining Balance"].map((h) => ({ v: h, s: S.head })),
  ];
  rows.forEach((r) =>
    sheetRows.push([
      { v: r.sr, s: S.center },
      { v: r.activity, s: S.cell },
      { v: new Date(r.datetime), s: S.date },
      { v: Number(r.price), s: S.num },
      { v: Number(r.qty), s: S.center },
      { v: r.cost, s: S.cost },
      { v: r.balance, s: r.balance < 0 ? S.balNeg : S.bal },
    ])
  );
  sheetRows.push([
    { v: "", s: S.total }, { v: "TOTAL", s: S.total }, { v: "", s: S.total }, { v: "", s: S.total }, { v: "", s: S.total },
    { v: spent, s: S.totalV }, { v: remaining, s: S.totalV },
  ]);

  wb.addSheet({
    name: "Trip Expenses",
    rows: sheetRows,
    cols: [{ wch: 8 }, { wch: 34 }, { wch: 24 }, { wch: 16 }, { wch: 7 }, { wch: 16 }, { wch: 20 }],
    merges: ["A1:G1", "A2:G2"],
    rowHeights: { 0: 26 },
    freezeRow: 8,
  });

  // Raw data sheet (used by Import Excel to restore)
  const rawHead = wb.style({ bold: true, fill: "F1F5F9", border: true });
  wb.addSheet({
    name: "Data",
    rows: [
      ["id", "activity", "datetime", "price", "qty"].map((h) => ({ v: h, s: rawHead })),
      ...state.entries.map((e) => [e.id, e.activity, e.datetime, Number(e.price), Number(e.qty)]),
    ],
    cols: [{ wch: 16 }, { wch: 34 }, { wch: 20 }, { wch: 12 }, { wch: 6 }],
  });

  const stamp = new Date().toISOString().slice(0, 10);
  wb.download(`VE_Trip_Expenses_${stamp}.xlsx`);
  toast("Excel downloaded");
});

/* ---------------- Excel Import (optional UI — guarded) ---------------- */
$("importFile")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (typeof XLSX === "undefined") { toast("Import needs internet (Excel reader library not loaded)", true); e.target.value = ""; return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const wb = XLSX.read(ev.target.result, { type: "array" });
      const ws = wb.Sheets["Data"] || wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws);
      const imported = json
        .filter((r) => r.activity && r.datetime)
        .map((r) => ({
          id: r.id || uid(),
          activity: String(r.activity),
          datetime: String(r.datetime),
          price: Number(r.price) || 0,
          qty: Number(r.qty) || 1,
        }));
      if (!imported.length) return toast("No valid rows found (use the 'Data' sheet from an export)", true);
      if (!confirm(`Import ${imported.length} entries? This replaces current data.`)) return;
      const keep = new Set(imported.map((r) => r.id));
      state.entries.forEach((e) => { if (!keep.has(e.id)) tombstone(e.id); });
      state.entries = imported.map(touchEntry);
      commitLocal();
      render();
      toast(`Imported ${imported.length} entries`);
      pushToGitHub();
    } catch (err) {
      toast("Could not read file", true);
    }
    e.target.value = "";
  };
  reader.readAsArrayBuffer(file);
});

/* ---------------- Settings (optional UI — guarded) ---------------- */
$("settingsBtn")?.addEventListener("click", () => {
  $("openingInput").value = state.opening;
  $("currencyInput").value = cfg.currency;
  $("repoInput").value = cfg.repo;
  $("branchInput").value = cfg.branch;
  $("tokenInput").value = cfg.token;
  const st = $("syncStatus");
  if (st) { st.textContent = cfg.repo && cfg.token ? "Sync configured." : "Sync not configured (local-only mode)."; st.className = "hint"; }
  $("settingsModal").hidden = false;
});
$("closeSettings")?.addEventListener("click", () => ($("settingsModal").hidden = true));
$("settingsModal")?.addEventListener("click", (e) => { if (e.target === $("settingsModal")) $("settingsModal").hidden = true; });

$("saveSettings")?.addEventListener("click", async () => {
  const newOpening = parseFloat($("openingInput").value) || 0;
  const newCurrency = $("currencyInput").value.trim() || "Rs";
  const openingChanged = newOpening !== Number(state.opening);
  const currencyChanged = newCurrency !== cfg.currency;
  state.opening = newOpening;
  cfg.currency = newCurrency;
  cfg.repo = $("repoInput").value.trim()
    .replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  cfg.branch = $("branchInput").value.trim() || "main";
  cfg.token = $("tokenInput").value.trim();
  // Opening balance and currency are single shared values: stamp them only when
  // they actually change, so saving a token does not override another device.
  if (openingChanged || currencyChanged) state.settingsAt = nowIso();
  saveLocal();
  render();
  $("settingsModal").hidden = true;
  toast("Settings saved");
  await syncOnLoad();
  updateSyncPill();
});

$("clearBtn")?.addEventListener("click", async () => {
  if (!confirm("Delete ALL entries? This cannot be undone.")) return;
  state.entries.forEach((e) => tombstone(e.id));
  state.entries = [];
  commitLocal();
  render();
  $("settingsModal").hidden = true;
  toast("All data cleared");
  await pushToGitHub();
});

/* ---------------- Sync indicator ---------------- */
function updateSyncPill() {
  const pill = $("syncPill");
  if (!pill) return;
  const on = !!(cfg.repo && cfg.token);
  pill.textContent = on ? "☁ Syncing" : "📴 This device only";
  pill.className = "badge sync-pill " + (on ? "on" : "off");
  pill.title = on
    ? `Entries are committed to ${cfg.repo} (${cfg.branch}) and appear on every device.`
    : "Entries stay in this browser only. Open ⚙ Settings and add a token to share them.";
}

/* ---------------- Init ---------------- */
loadLocal();
$("datetime").value = nowLocalInput();
render();
updateSyncPill();
syncOnLoad();
startAutoSync(45);
