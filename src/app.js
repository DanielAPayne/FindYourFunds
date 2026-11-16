/* Find Your Funds — page behavior. Depends on FYFRegistry and FYFCore. */
(function () {
  "use strict";
  const R = window.FYFRegistry;
  const C = window.FYFCore;

  const K_RECORDS = "fyf-records-v3";
  const K_PROFILE = "found-money-profile-v1";
  const K_LEGACY = "found-money-track-v2";

  const tagIds = R.PROFILE_TAGS.map((t) => t.id);
  const catById = Object.fromEntries(R.CATEGORIES.map((c) => [c.id, c]));
  const sourceIds = R.SOURCES.map((s) => s.id);
  const $ = (id) => document.getElementById(id);

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids) if (kid !== null && kid !== undefined) n.append(kid);
    return n;
  }

  // ---------- storage ----------
  let storageOk = true;
  function load(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { storageOk = false; showStorageWarning(); return false; }
  }
  try { localStorage.setItem("fyf-probe", "1"); localStorage.removeItem("fyf-probe"); } catch (e) { storageOk = false; }

  let records = C.sanitizeRecords(load(K_RECORDS));
  let migrated = 0;
  if (!load(K_RECORDS)) {
    const old = load(K_LEGACY);
    if (old) {
      records = C.migrateLegacy(old, C.buildLegacyMap(R.SOURCES, R.LEGACY_ALIASES), Object.keys(R.LEGACY_ALIASES));
      migrated = Object.keys(records).filter((id) => sourceIds.includes(id)).length;
      save(K_RECORDS, records);
    }
  }
  let profile = C.sanitizeProfile(load(K_PROFILE), tagIds);

  function rec(id) { return records[id] || (records[id] = { status: "todo", amount: "", ref: "", notes: "" }); }
  function persist() { save(K_RECORDS, records); }

  function showStorageWarning() {
    const w = $("storageWarn");
    if (w) w.hidden = false;
  }
  if (!storageOk) showStorageWarning();
  if (migrated > 0) {
    const m = $("migrateNote");
    m.textContent = `Your earlier tracking for ${migrated} source${migrated === 1 ? "" : "s"} was moved to the new format. Statuses were mapped conservatively (nothing was marked as received), so check them.`;
    m.hidden = false;
  }

  // ---------- profile chips ----------
  const chips = $("chips");
  R.PROFILE_TAGS.forEach((t) => {
    const b = el("button", { type: "button", class: "chip", "aria-pressed": profile[t.id] ? "true" : "false", text: t.label });
    b.addEventListener("click", () => {
      if (profile[t.id]) delete profile[t.id]; else profile[t.id] = true;
      b.setAttribute("aria-pressed", profile[t.id] ? "true" : "false");
      save(K_PROFILE, profile);
      applyView();
    });
    chips.append(b);
  });

  // ---------- source cards ----------
  const KINDS = [
    { id: "owed", title: "Money that may already be yours",
      sub: "Records held for their rightful owners. A search result is only a lead until the details match you." },
    { id: "eligibility", title: "Programs you may qualify for",
      sub: "Each program decides eligibility under its own rules. These links don't establish that you qualify." },
    { id: "optional", title: "Optional ways to earn",
      sub: "Not money you are owed. You earn these by doing something, so read the terms." },
  ];

  const cards = {};          // id -> {card, sel, money, amt, amtErr, ref, notes}
  const sectionEls = [];     // {kindId, el, catEls:[{el, ids}]}
  const list = $("list");

  for (const kind of KINDS) {
    const kindEl = el("section", { class: "kind", "aria-labelledby": "k-" + kind.id },
      el("h2", { class: "kind-title", id: "k-" + kind.id, text: kind.title }),
      el("p", { class: "kind-sub", text: kind.sub }));
    const catEls = [];
    for (const cat of R.CATEGORIES.filter((c) => c.kind === kind.id)) {
      const srcs = R.SOURCES.filter((s) => s.cat === cat.id);
      const catEl = el("div", { class: "cat" },
        el("div", { class: "cat-head" }, el("h3", { text: cat.title }), el("span", { class: "tag", text: cat.tag })),
        el("p", { class: "cat-desc", text: cat.desc }));
      const grid = el("div", { class: "cards" });
      for (const s of srcs) grid.append(buildCard(s));
      catEl.append(grid);
      kindEl.append(catEl);
      catEls.push({ el: catEl, ids: srcs.map((s) => s.id) });
    }
    list.append(kindEl);
    sectionEls.push({ el: kindEl, catEls });
  }

  function buildCard(s) {
    const r = rec(s.id);
    const badges = el("div", { class: "badges" },
      el("span", { class: "badge type-" + s.type, text: R.TYPE_LABELS[s.type] }),
      s.free ? el("span", { class: "badge free", text: "Free to search" }) : null);
    const may = el("span", { class: "badge may", text: "May apply to you", hidden: true });
    badges.append(may);

    const link = el("a", { class: "src-link", href: s.url, target: "_blank", rel: "noopener noreferrer" },
      "Open " + s.host.split(",")[0]);
    link.insertAdjacentHTML("beforeend", ' <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg><span class="sr-only"> (opens in a new tab)</span>');

    const meta = el("p", { class: "meta", text: `${R.ACCESS_LABELS[s.access]} · Link checked ${fmtDate(s.checked)}` });

    const stId = "st-" + s.id, amtId = "amt-" + s.id, refId = "ref-" + s.id, notesId = "notes-" + s.id;
    const sel = el("select", { id: stId });
    for (const st of C.STATUSES) sel.append(el("option", { value: st.v, text: st.label }));
    sel.value = C.STATUS_BY[r.status] ? r.status : "todo";

    const amt = el("input", { id: amtId, class: "amt", inputmode: "decimal", autocomplete: "off", placeholder: "0.00", value: r.amount || "" });
    const amtErr = el("span", { class: "field-err", id: amtId + "-err", role: "alert" });
    amt.setAttribute("aria-describedby", amtId + "-err");
    const ref = el("input", { id: refId, autocomplete: "off", placeholder: "Property ID or claim #", value: r.ref || "" });
    const notes = el("input", { id: notesId, class: "notes-in", autocomplete: "off", placeholder: "Dates, contacts, what's needed", value: r.notes || "" });

    const money = el("div", { class: "money" },
      el("div", { class: "field" }, el("label", { for: amtId, text: "Amount" }), amt, amtErr),
      el("div", { class: "field" }, el("label", { for: refId, text: "Reference" }), ref));

    const track = el("div", { class: "track" },
      el("div", { class: "field" }, el("label", { for: stId, text: "Status" }), sel),
      money,
      el("div", { class: "field grow" }, el("label", { for: notesId, text: "Notes" }), notes));

    const card = el("article", { class: "card", "data-id": s.id },
      el("div", { class: "card-top" }, el("h4", { text: s.name }), badges),
      el("p", { class: "what", text: s.what }),
      el("div", { class: "card-links" }, link, meta),
      track);

    sel.addEventListener("change", () => { r.status = sel.value; refreshCard(s.id); persist(); updateTotals(); });
    amt.addEventListener("input", () => { r.amount = amt.value; refreshCard(s.id); persist(); updateTotals(); });
    ref.addEventListener("input", () => { r.ref = ref.value; persist(); updateTotals(); });
    notes.addEventListener("input", () => { r.notes = notes.value; persist(); });

    cards[s.id] = { card, sel, money, amt, amtErr, may, source: s };
    refreshCard(s.id);
    return card;
  }

  function refreshCard(id) {
    const c = cards[id];
    const r = rec(id);
    const st = C.statusInfo(r.status);
    c.card.dataset.status = st.v;
    c.money.hidden = !st.bucket;
    const p = C.parseAmount(r.amount);
    c.amtErr.textContent = st.bucket && p.error ? p.error : "";
    c.amt.setAttribute("aria-invalid", st.bucket && p.error ? "true" : "false");
  }

  function fmtDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  // ---------- filtering ----------
  const q = $("q");
  const only = $("only");
  const onlyLbl = $("onlyLbl");
  function applyView() {
    const active = Object.keys(profile).length > 0;
    only.disabled = !active;
    onlyLbl.classList.toggle("disabled", !active);
    if (!active) only.checked = false;
    $("clearProfile").hidden = !active;

    let mayCount = 0, visible = 0;
    for (const id of sourceIds) {
      const c = cards[id];
      const s = c.source;
      const may = C.mayApply(s, profile);
      if (may) mayCount++;
      c.may.hidden = !may;
      const tagged = s.rel && s.rel.length > 0;
      const show = C.matchesQuery(s, catById[s.cat].title, q.value) && !(only.checked && tagged && !may);
      c.card.hidden = !show;
      if (show) visible++;
    }
    for (const sec of sectionEls) {
      let any = false;
      for (const cat of sec.catEls) {
        const catVisible = cat.ids.some((id) => !cards[id].card.hidden);
        cat.el.hidden = !catVisible;
        any = any || catVisible;
      }
      sec.el.hidden = !any;
    }
    $("empty").hidden = visible > 0;
    $("mayInfo").textContent = active ? `${mayCount} source${mayCount === 1 ? "" : "s"} tagged for your situation` : "";
  }
  q.addEventListener("input", applyView);
  only.addEventListener("change", applyView);
  $("clearProfile").addEventListener("click", () => {
    profile = {};
    save(K_PROFILE, profile);
    chips.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", "false"));
    applyView();
  });

  // ---------- totals ----------
  function updateTotals() {
    const t = C.computeTotals(records, sourceIds);
    for (const b of C.BUCKETS) $("t-" + b).textContent = C.formatCents(t.buckets[b]);
    const c = t.counts;
    $("coverage").textContent = `${c.searched} of ${c.total} searched` +
      (c.noMatch ? ` · ${c.noMatch} no match` : "") +
      (c.unavailable ? ` · ${c.unavailable} couldn't be completed` : "");
    $("fill").style.width = (c.total ? (c.searched / c.total) * 100 : 0) + "%";
    const warn = [];
    if (t.invalid.length) warn.push(`${t.invalid.length} amount${t.invalid.length === 1 ? " isn't" : "s aren't"} a valid number and ${t.invalid.length === 1 ? "is" : "are"} left out.`);
    if (t.duplicates.length) warn.push(`${t.duplicates.length} reference number${t.duplicates.length === 1 ? " appears" : "s appear"} on more than one source and ${t.duplicates.length === 1 ? "is" : "are"} counted once.`);
    $("ledgerWarn").textContent = warn.join(" ");
    $("ledgerWarn").hidden = warn.length === 0;
  }

  // ---------- backup / restore / clear ----------
  const panels = ["backupPanel", "restorePanel", "clearPanel"];
  function openPanel(id) {
    for (const p of panels) $(p).hidden = p !== id ? true : !$(p).hidden;
    setMsg("");
    const opened = $(id);
    if (!opened.hidden) { const f = opened.querySelector("input, textarea, button"); if (f) f.focus(); }
  }
  $("openBackup").addEventListener("click", () => openPanel("backupPanel"));
  $("openRestore").addEventListener("click", () => openPanel("restorePanel"));
  $("openClear").addEventListener("click", () => openPanel("clearPanel"));
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => { $(b.dataset.close).hidden = true; }));

  function setMsg(text, isError) {
    const m = $("toolMsg");
    m.textContent = text;
    m.classList.toggle("error", !!isError);
  }

  async function backupText(pass) {
    const b = await C.makeBackup({ records, profile }, pass);
    return JSON.stringify(b, null, 2);
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = el("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function backupName() { return "find-your-funds-backup-" + new Date().toISOString().slice(0, 10) + ".json"; }

  async function doDownload(passInputId) {
    try {
      const pass = passInputId ? $(passInputId).value : "";
      download(backupName(), await backupText(pass));
      setMsg(pass ? "Encrypted backup downloaded. Keep the passphrase somewhere safe; it can't be recovered." : "Backup downloaded.");
      return true;
    } catch (e) { setMsg("Couldn't create the backup: " + e.message, true); return false; }
  }
  $("backupDownload").addEventListener("click", () => doDownload("backupPass"));
  $("backupCopy").addEventListener("click", async () => {
    const text = await backupText($("backupPass").value);
    const out = $("backupText");
    out.value = text;
    out.hidden = false;
    try { await navigator.clipboard.writeText(text); setMsg("Backup copied. Paste it somewhere safe."); }
    catch (e) { out.select(); setMsg("Select the text below and copy it."); }
  });

  $("restoreFile").addEventListener("change", async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (f) $("restoreText").value = await f.text();
  });
  $("restoreGo").addEventListener("click", async () => {
    try {
      const state = await C.readBackup($("restoreText").value, $("restorePass").value);
      records = state.records;
      profile = C.sanitizeProfile(state.profile, tagIds);
      save(K_RECORDS, records);
      save(K_PROFILE, profile);
      location.reload();
    } catch (e) { setMsg(e.message, true); }
  });

  $("clearBackupFirst").addEventListener("click", () => doDownload(null));
  $("clearGo").addEventListener("click", () => {
    try { localStorage.removeItem(K_RECORDS); localStorage.removeItem(K_PROFILE); localStorage.removeItem(K_LEGACY); } catch (e) { /* ignore */ }
    location.reload();
  });

  updateTotals();
  applyView();
})();
