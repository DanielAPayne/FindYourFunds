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

  // ---------- back-wage lead finder ----------
  const Lx = window.FYFLeads;
  const WOW_URL = "https://www.dol.gov/agencies/whd/wow";
  const shardCache = {};
  let whdIndex = null;

  function wageStatus(text, isError) {
    const s = $("wageStatus");
    s.textContent = text;
    s.classList.toggle("error", !!isError);
  }
  function fmtMB(bytes) { return bytes > 1e6 ? (bytes / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1e3)) + " KB"; }

  async function initWages() {
    const form = $("wageForm");
    try {
      const res = await fetch("data/whd/index.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("missing");
      const idx = await res.json();
      if (!idx || idx.format !== "fyf-whd-index" || idx.version !== 1) throw new Error("bad");
      if (idx.status === "not_built" || !Object.keys(idx.states || {}).length) throw new Error("not built");
      whdIndex = idx;
    } catch (e) {
      form.querySelectorAll("input, select, button").forEach((n) => { n.disabled = true; });
      wageStatus("This search isn't available yet. It turns on after the first download of Department of Labor data.");
      return;
    }
    const sel = $("wageState");
    sel.append(el("option", { value: "", text: "Choose a state" }));
    for (const st of Object.keys(whdIndex.states).sort()) sel.append(el("option", { value: st, text: st }));
    $("wageSource").textContent = `Source: U.S. Department of Labor, Wage and Hour Division enforcement data. ` +
      `${whdIndex.total_cases.toLocaleString("en-US")} cases with back wages, updated ${fmtDate(whdIndex.generated.slice(0, 10))}.`;
  }

  async function loadShard(st) {
    if (shardCache[st]) return shardCache[st];
    const info = whdIndex.states[st];
    if (!info) throw new Error("no data for that state");
    wageStatus(`Loading ${st} records (${fmtMB(info.bytes)})…`);
    const res = await fetch("data/whd/" + info.file, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return (shardCache[st] = Lx.parseShard(await res.json()));
  }

  function saveCaseToNotes(c, st) {
    const r = rec("dol-wow");
    const line = `DOL case ${c.case_id}: ${c.trade_name || c.legal_name}, ${c.city} ${st}, ${c.start || "?"} to ${c.end || "?"}`;
    if (r.notes.includes(`DOL case ${c.case_id}:`)) return false;
    r.notes = r.notes ? r.notes + " | " + line : line;
    persist();
    const notesEl = $("notes-dol-wow");
    if (notesEl) notesEl.value = r.notes;
    return true;
  }

  function renderCase(c, st) {
    const name = c.trade_name && c.trade_name.toLowerCase() !== c.legal_name.toLowerCase()
      ? `${c.trade_name} (${c.legal_name})` : (c.legal_name || c.trade_name);
    const period = c.start || c.end ? `Findings period ${c.start ? fmtDate(c.start) : "?"} to ${c.end ? fmtDate(c.end) : "?"}` : "Findings period not listed";
    const owed = `DOL found ${C.formatCents(c.back_wages_cents)} in back wages owed` +
      (c.employees ? ` to ${c.employees.toLocaleString("en-US")} worker${c.employees === 1 ? "" : "s"}` : "");
    const save = el("button", { class: "btn", type: "button", text: "Save to my notes" });
    save.addEventListener("click", () => {
      save.textContent = saveCaseToNotes(c, st) ? "Saved to Workers Owed Wages notes" : "Already in your notes";
      save.disabled = true;
    });
    const wow = el("a", { class: "btn", href: WOW_URL, target: "_blank", rel: "noopener noreferrer", text: "Check Workers Owed Wages" });
    return el("li", null,
      el("h3", { text: name }),
      el("p", { text: [c.city, st, c.zip].filter(Boolean).join(", ").replace(`, ${st}, `, `, ${st} `) + ` · Case ${c.case_id}` }),
      el("p", { text: period }),
      el("p", { class: "amount", text: owed }),
      el("div", { class: "actions" }, wow, save));
  }

  $("wageForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const employer = $("wageEmployer").value.trim();
    const st = $("wageState").value;
    const list = $("wageResults");
    list.replaceChildren();
    if (employer.length < 2) { wageStatus("Enter at least two letters of the employer's name.", true); return; }
    if (!st) { wageStatus("Choose the state where you worked.", true); return; }
    let shard;
    try { shard = await loadShard(st); }
    catch (e) { wageStatus(`The search couldn't be completed (${e.message}). This isn't the same as finding nothing; try again later.`, true); return; }
    const results = Lx.searchEmployer(shard.rows, employer, { city: $("wageCity").value, limit: 50 });
    if (!results.length) {
      wageStatus(`No Department of Labor back-wage cases found for "${employer}" in ${st}. Try the company's legal name or a shorter name. This only covers cases DOL investigated, so wages can still be owed without a record here.`);
      return;
    }
    wageStatus(`${results.length === 50 ? "First 50" : results.length} case${results.length === 1 ? "" : "s"} found. A case shows what an employer owed some workers, not what you are owed. Compare the city and dates with your own job.`);
    for (const c of results) list.append(renderCase(c, st));
  });

  // ---------- failed-bank check ----------
  const FDIC_FUNDS_URL = "https://closedbanks.fdic.gov/funds/";
  let fdicPromise = null;

  function bankStatus(text, isError) {
    const s = $("bankStatus");
    s.textContent = text;
    s.classList.toggle("error", !!isError);
  }

  const bankSel = $("bankState");
  bankSel.append(el("option", { value: "", text: "Any state" }));
  for (const st of Lx.US_STATES) bankSel.append(el("option", { value: st, text: st }));

  // Loaded on the first search, not on page load (it's about 400 KB).
  function loadFdic() {
    if (!fdicPromise) {
      fdicPromise = fetch("data/fdic/failures.json", { cache: "no-cache" })
        .then((res) => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
        .then((obj) => {
          const f = Lx.parseFdicFile(obj);
          if (f.status === "not_built" || !f.rows.length) { const e = new Error("not built"); e.notBuilt = true; throw e; }
          $("bankSource").textContent = `Source: FDIC BankFind failures list, ${f.rows.length.toLocaleString("en-US")} failed or assisted banks since 1934, updated ${fmtDate(f.generated.slice(0, 10))}.`;
          return f;
        })
        .catch((e) => { fdicPromise = null; throw e; });
    }
    return fdicPromise;
  }

  function saveBankToNotes(c, d) {
    const r = rec("fdic-unclaimed");
    const line = `FDIC: ${Lx.titleCase(c.name)} (${Lx.titleCase(c.city)}, ${c.state}), ${c.date ? fmtDate(c.date) : "date not recorded"}: ${d.label}`;
    if (r.notes.includes(line)) return false;
    r.notes = r.notes ? r.notes + " | " + line : line;
    persist();
    const notesEl = $("notes-fdic-unclaimed");
    if (notesEl) notesEl.value = r.notes;
    return true;
  }

  function renderBank(c) {
    const d = Lx.describeBankCase(c);
    const assisted = Lx.FDIC_TYPES[c.type] && Lx.FDIC_TYPES[c.type].group === "assisted";
    const when = c.date ? `${assisted ? "FDIC action" : "Failed"} ${fmtDate(c.date)}` : (assisted ? "FDIC action, date not recorded" : "Failure date not recorded");
    const save = el("button", { class: "btn", type: "button", text: "Save to my notes" });
    save.addEventListener("click", () => {
      save.textContent = saveBankToNotes(c, d) ? "Saved to FDIC unclaimed funds notes" : "Already in your notes";
      save.disabled = true;
    });
    const actions = el("div", { class: "actions" });
    if (d.check) actions.append(el("a", { class: "btn", href: FDIC_FUNDS_URL, target: "_blank", rel: "noopener noreferrer", text: "Search FDIC unclaimed funds" }));
    actions.append(save);
    return el("li", { class: d.check ? "lead" : null },
      el("h3", { text: Lx.titleCase(c.name) }),
      el("p", { text: `${Lx.titleCase(c.city)}, ${c.state} · ${when}` }),
      el("p", { class: "amount", text: d.label + (d.check ? " · worth checking" : "") }),
      el("p", { text: d.detail }),
      actions);
  }

  $("bankForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const name = $("bankName").value.trim();
    const st = $("bankState").value;
    const list = $("bankResults");
    list.replaceChildren();
    if (name.length < 2) { bankStatus("Enter at least two letters of the bank's name.", true); return; }
    bankStatus("Loading the FDIC list…");
    let f;
    try { f = await loadFdic(); }
    catch (e) {
      if (e.notBuilt) bankStatus("This search isn't available yet. It turns on after the first download of FDIC data.");
      else bankStatus(`The search couldn't be completed (${e.message}). This isn't the same as finding nothing; try again later.`, true);
      return;
    }
    const results = Lx.searchBanks(f.rows, name, { state: st, limit: 50 });
    if (!results.length) {
      bankStatus(`No failed or FDIC-assisted bank matches "${name}"${st ? " in " + st : ""}. Banks that never failed aren't on this list. If an account there went unused, check your state's unclaimed property.`);
      return;
    }
    const leads = results.filter((c) => Lx.describeBankCase(c).check).length;
    bankStatus(`${results.length === 50 ? "First 50" : results.length} matching bank${results.length === 1 ? "" : "s"}. ` +
      (leads ? `${leads} ${leads === 1 ? "was" : "were"} handled in a way where unclaimed money is possible.`
        : `${results.length === 1 ? "Its" : "Their"} accounts moved to another bank or continued, so unclaimed money is unlikely.`));
    for (const c of results) list.append(renderBank(c));
  });

  // ---------- city and county lists (queried live) ----------
  const Fx = window.FYFLocal;
  $("localPlaces").textContent = [...new Set(Fx.LOCAL_SOURCES.map((s) => `${s.place}, ${s.state}`))].join("; ");

  function localStatus(text, isError) {
    const s = $("localStatus");
    s.textContent = text;
    s.classList.toggle("error", !!isError);
  }

  const csvCache = {};
  async function querySource(src, query) {
    const url = Fx.buildLocalUrl(src, query);
    let body;
    if (src.platform === "csv" && csvCache[src.id]) body = csvCache[src.id];
    else {
      const res = await fetch(url, { headers: { accept: src.platform === "csv" ? "text/csv" : "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      body = src.platform === "csv" ? await res.text() : await res.json();
      if (src.platform === "csv") csvCache[src.id] = body;
    }
    const { rows, truncated } = Fx.parseLocalResponse(src, body);
    const results = Fx.localResults(src, rows, query);
    results.truncated = truncated;
    return results;
  }
  function sourceLabel(src) { return `${src.place}, ${src.state}${src.list ? " (" + src.list + ")" : ""}`; }

  function saveLocalToNotes(r) {
    const rec0 = rec("local-funds");
    const amt = r.cents !== null ? C.formatCents(r.cents) : "amount not listed";
    const line = `${r.place}, ${r.state}: ${r.name}, ${amt}${r.date ? ", " + fmtDate(r.date) : ""}${r.ref ? ", ref " + r.ref : ""}`;
    if (rec0.notes.includes(line)) return false;
    rec0.notes = rec0.notes ? rec0.notes + " | " + line : line;
    persist();
    const notesEl = $("notes-local-funds");
    if (notesEl) notesEl.value = rec0.notes;
    return true;
  }

  function renderLocalGroup(src, results) {
    const list = el("ol", { class: "wage-results" });
    for (const r of results.slice(0, 25)) {
      const save = el("button", { class: "btn", type: "button", text: "Save to my notes" });
      save.addEventListener("click", () => { save.textContent = saveLocalToNotes(r) ? "Saved to local funds notes" : "Already in your notes"; save.disabled = true; });
      const facts = [r.cents !== null ? C.formatCents(r.cents) : "Amount not published", r.date ? fmtDate(r.date) : "", r.location].filter(Boolean).join(" · ");
      const extra = r.extras.length ? el("p", { text: r.extras.map((e) => `${e.label}: ${e.value}`).join(" · ") }) : null;
      list.append(el("li", null, el("h3", { text: r.name }), el("p", { class: "amount", text: facts }), extra,
        el("div", { class: "actions" }, el("a", { class: "btn", href: src.claimUrl, target: "_blank", rel: "noopener noreferrer", text: "How to claim" }), save)));
    }
    const more = results.length > 25 ? el("p", { class: "claim", text: `Showing 25 of ${results.length}. Add a first name to narrow the list.` }) : null;
    return el("div", { class: "local-group" },
      el("h3", { text: sourceLabel(src) }),
      el("p", { class: "claim", text: `${src.what}. ${src.claim}` }),
      list, more);
  }

  $("localForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const query = { last: $("localLast").value, first: $("localFirst").value };
    const cov = $("localCoverage");
    const out = $("localResults");
    cov.replaceChildren();
    out.replaceChildren();
    if (!Fx.buildLocalUrl(Fx.LOCAL_SOURCES[0], query)) { localStatus("Enter at least two letters of a last name or business name.", true); return; }
    localStatus(`Searching ${Fx.LOCAL_SOURCES.length} lists…`);
    $("localGo").disabled = true;
    const settled = await Promise.allSettled(Fx.LOCAL_SOURCES.map((s) => querySource(s, query)));
    $("localGo").disabled = false;
    let hits = 0, failed = 0, people = 0, truncated = 0;
    settled.forEach((res, i) => {
      const src = Fx.LOCAL_SOURCES[i];
      const label = sourceLabel(src);
      if (res.status === "rejected") {
        failed++;
        cov.append(el("li", { class: "fail", text: `${label}: couldn't search` }));
        return;
      }
      const n = res.value.length;
      if (res.value.truncated) truncated++;
      const cut = res.value.truncated ? " (list too long to finish; add a first name)" : "";
      cov.append(el("li", { class: n ? "hit" : (cut ? "fail" : null), text: `${label}: ${n ? n + " possible match" + (n === 1 ? "" : "es") : "no match"}${cut}` }));
      if (n) { hits++; people += n; out.append(renderLocalGroup(src, res.value)); }
    });
    const searched = settled.length - failed;
    const cutNote = truncated ? ` ${truncated} list${truncated === 1 ? " had" : "s had"} too many similar names to check fully; add a first name to search ${truncated === 1 ? "it" : "them"} completely.` : "";
    if (people) localStatus(`${people} possible match${people === 1 ? "" : "es"} in ${hits} list${hits === 1 ? "" : "s"}. A matching name isn't proof it's yours; each government verifies identity before paying.${cutNote}`);
    else if (truncated) localStatus(`No match found yet.${cutNote}`, true);
    else if (searched) localStatus(`No match in the ${searched} list${searched === 1 ? "" : "s"} that could be searched.${failed ? " Some couldn't be reached, so try again later." : ""} These lists cover only these places; for anywhere else, use your state's unclaimed property search.`);
    else localStatus("None of the lists could be reached right now. That isn't the same as finding nothing; try again later.", true);
  });

  updateTotals();
  applyView();
  initWages();
})();
