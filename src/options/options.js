/* YouPrune — options.js */
(function () {
  "use strict";
  const YP = self.YouPrune;
  const $ = (id) => document.getElementById(id);

  const BOOL_FIELDS = ["enabled", "reveal", "hideShelves", "hideShorts", "hideAds"];
  const NUM_FIELDS = ["notInterestedThreshold"];
  const LIST_FIELDS = ["notInterestedLabels", "dontRecommendLabels"];

  function flash(msg) {
    const el = $("status");
    el.textContent = msg;
    setTimeout(() => (el.textContent = ""), 1800);
  }

  async function load() {
    const data = await YP.getAll();
    const s = data.settings;
    BOOL_FIELDS.forEach((f) => ($(f).checked = !!s[f]));
    NUM_FIELDS.forEach((f) => ($(f).value = s[f]));
    LIST_FIELDS.forEach((f) => ($(f).value = (s[f] || []).join(", ")));
    renderBanned(data.banned);
    renderCounts(data.counts);
  }

  function renderBanned(banned) {
    const tbody = $("bannedTable").querySelector("tbody");
    tbody.innerHTML = "";
    const keys = Object.keys(banned);
    $("bannedTotal").textContent = keys.length;
    for (const primary of keys) {
      const b = banned[primary];
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${esc(b.name) || "(unknown)"}</td>` +
        `<td>${esc(b.reason)}</td>` +
        `<td class="key">${esc(primary)}</td>`;
      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.className = "link";
      btn.textContent = "unban";
      btn.addEventListener("click", async () => {
        delete banned[primary];
        await YP.set({ [YP.STORAGE_KEYS.banned]: banned });
        renderBanned(banned);
        flash("Unbanned.");
      });
      td.appendChild(btn);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  function renderCounts(counts) {
    const tbody = $("countsTable").querySelector("tbody");
    tbody.innerHTML = "";
    for (const primary of Object.keys(counts)) {
      const c = counts[primary];
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(c.name) || esc(primary)}</td><td>${c.count}</td>`;
      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.className = "link";
      btn.textContent = "reset";
      btn.addEventListener("click", async () => {
        delete counts[primary];
        await YP.set({ [YP.STORAGE_KEYS.counts]: counts });
        renderCounts(counts);
      });
      td.appendChild(btn);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  function esc(s) {
    return String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  }

  async function save() {
    const data = await YP.getAll();
    const s = Object.assign({}, data.settings);
    BOOL_FIELDS.forEach((f) => (s[f] = $(f).checked));
    NUM_FIELDS.forEach((f) => (s[f] = Math.max(1, parseInt($(f).value, 10) || 1)));
    LIST_FIELDS.forEach(
      (f) => (s[f] = $(f).value.split(",").map((x) => x.trim()).filter(Boolean))
    );
    await YP.set({ [YP.STORAGE_KEYS.settings]: s });
    flash("Saved.");
  }

  [...BOOL_FIELDS, ...NUM_FIELDS, ...LIST_FIELDS].forEach((f) =>
    $(f).addEventListener("change", save)
  );

  $("export").addEventListener("click", async () => {
    const data = await YP.getAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "youprune-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        const patch = {};
        if (parsed.settings)
          patch[YP.STORAGE_KEYS.settings] = Object.assign({}, YP.DEFAULT_SETTINGS, parsed.settings);
        if (parsed.banned) patch[YP.STORAGE_KEYS.banned] = parsed.banned;
        if (parsed.counts) patch[YP.STORAGE_KEYS.counts] = parsed.counts;
        await YP.set(patch);
        await load();
        flash("Imported.");
      } catch (err) {
        flash("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
  });

  load();
})();
