/* ============================================================
   main.js — Responsibilities (read-only view)
   The list is rendered from state only. No add / edit / delete.
   ============================================================ */

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
      </tr>`
    )
    .join("");
}

function avatar(name) {
  const initials = name.replace(/^sir\s+/i, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="avatar" style="background:hsl(${h},55%,45%)">${escapeHtml(initials)}</span>`;
}

/* ---------------- Init ---------------- */
loadLocal();
render();
pullFromGitHub();
