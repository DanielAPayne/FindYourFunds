/*
 * Find Your Funds — core logic. Pure functions, no DOM, so they run in the
 * browser and under `node --test`.
 */
(function (root) {
  // One status per source. It is the single source of truth for whether a
  // source has been searched and which ledger bucket an amount belongs to.
  const STATUSES = [
    { v: "todo",          label: "Not searched yet",              bucket: null,        searched: false },
    { v: "searched_none", label: "Searched: no match",            bucket: null,        searched: true },
    { v: "unavailable",   label: "Search couldn't be completed",  bucket: null,        searched: false, unavailable: true },
    { v: "possible",      label: "Possible match (unverified)",   bucket: "potential", searched: true },
    { v: "claim_filed",   label: "Claim filed",                   bucket: "filed",     searched: true },
    { v: "approved",      label: "Approved, not yet paid",        bucket: "approved",  searched: true },
    { v: "received",      label: "Payment received",              bucket: "received",  searched: true },
    { v: "rejected",      label: "Not mine, or claim denied",     bucket: null,        searched: true },
  ];
  const STATUS_BY = Object.fromEntries(STATUSES.map((s) => [s.v, s]));
  const BUCKETS = ["potential", "filed", "approved", "received"];

  function statusInfo(v) { return STATUS_BY[v] || STATUS_BY.todo; }

  /*
   * Parse a user-typed dollar amount into integer cents.
   * Accepts "1234", "1,234.56", "$12", "-12.50", "$-12", "(12.50)".
   * Returns { cents, error }: cents is null for an empty field.
   */
  function parseAmount(input) {
    if (input === null || input === undefined) return { cents: null, error: null };
    let s = String(input).trim();
    if (s === "") return { cents: null, error: null };
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = !neg; s = s.slice(1, -1).trim(); }
    if (s.startsWith("-")) { neg = !neg; s = s.slice(1).trim(); }
    if (s.startsWith("$")) s = s.slice(1).trim();
    if (s.startsWith("-")) { neg = !neg; s = s.slice(1).trim(); }
    const ok = /^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s) || /^\.\d{1,2}$/.test(s);
    if (!ok) return { cents: null, error: "Enter a dollar amount, like 125.50" };
    const [whole, frac = ""] = s.replace(/,/g, "").split(".");
    const cents = parseInt(whole || "0", 10) * 100 + parseInt((frac + "00").slice(0, 2), 10);
    return { cents: neg && cents !== 0 ? -cents : cents, error: null };
  }

  function formatCents(cents) {
    const neg = cents < 0;
    const abs = Math.abs(cents);
    const dollars = Math.floor(abs / 100).toLocaleString("en-US");
    const rest = String(abs % 100).padStart(2, "0");
    return (neg ? "-$" : "$") + dollars + "." + rest;
  }

  function normRef(ref) { return String(ref || "").trim().toLowerCase().replace(/\s+/g, ""); }

  /*
   * Ledger totals and search coverage.
   *   records   { [sourceId]: { status, amount, ref, notes } }
   *   sourceIds ids of every current source (unknown record ids are ignored)
   * Amounts count only in the bucket of their status. A reference number
   * (claim # / property ID) seen on more than one source is counted once.
   */
  function computeTotals(records, sourceIds) {
    const buckets = { potential: 0, filed: 0, approved: 0, received: 0 };
    const counts = { total: sourceIds.length, searched: 0, noMatch: 0, unavailable: 0, todo: 0 };
    const duplicates = [];
    const invalid = [];
    const seen = new Map();
    for (const id of sourceIds) {
      const r = (records && records[id]) || {};
      const st = statusInfo(r.status);
      if (st.searched) counts.searched++;
      if (st.v === "searched_none") counts.noMatch++;
      if (st.unavailable) counts.unavailable++;
      if (st.v === "todo") counts.todo++;
      if (!st.bucket) continue;
      const p = parseAmount(r.amount);
      if (p.error) { invalid.push(id); continue; }
      if (p.cents === null) continue;
      const ref = normRef(r.ref);
      if (ref) {
        if (seen.has(ref)) { duplicates.push({ id, ref: r.ref, first: seen.get(ref) }); continue; }
        seen.set(ref, id);
      }
      buckets[st.bucket] += p.cents;
    }
    return { buckets, counts, duplicates, invalid };
  }

  function isBlank(rec) {
    return !rec || ((rec.status || "todo") === "todo" && !rec.amount && !rec.notes && !rec.ref);
  }

  // v2 statuses -> v3. Mapped conservatively: nothing becomes "received".
  const LEGACY_STATUS = { todo: "todo", none: "searched_none", claiming: "possible", claimed: "claim_filed" };

  /*
   * Convert v2 tracking (keyed "c<group>_<index>") to v3 records keyed by id.
   * legacyMap maps old keys to ids; an alias never overwrites real data.
   */
  function migrateLegacy(oldTrack, legacyMap, aliasKeys) {
    const out = {};
    const aliases = new Set(aliasKeys || []);
    // Current keys first, so a retired alias can only fill a blank record.
    const entries = Object.entries(oldTrack || {})
      .sort((a, b) => Number(aliases.has(a[0])) - Number(aliases.has(b[0])));
    for (const [key, r] of entries) {
      const id = legacyMap[key];
      if (!id || !r || typeof r !== "object") continue;
      let status = LEGACY_STATUS[r.status] || "todo";
      if (status === "todo" && r.searched) status = "searched_none";
      const rec = { status, amount: String(r.amount || ""), notes: String(r.notes || ""), ref: "" };
      if (isBlank(rec)) continue;
      if (isBlank(out[id])) out[id] = rec;
    }
    return out;
  }

  function buildLegacyMap(sources, aliases) {
    const map = {};
    for (const s of sources) if (s.legacy) map[s.legacy] = s.id;
    for (const [k, id] of Object.entries(aliases || {})) if (!map[k]) map[k] = id;
    return map;
  }

  /* Profile tags suggest where to look. They never decide eligibility. */
  function mayApply(source, profile) {
    return !!(source.rel && source.rel.length && source.rel.some((t) => profile && profile[t]));
  }

  function matchesQuery(source, catTitle, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    return [source.name, source.what, source.host, catTitle].join(" ").toLowerCase().includes(q);
  }

  /* Drop unknown statuses and malformed entries from imported or stored data. */
  function sanitizeRecords(records) {
    const out = {};
    if (!records || typeof records !== "object") return out;
    for (const [id, r] of Object.entries(records)) {
      if (!r || typeof r !== "object") continue;
      out[id] = {
        status: STATUS_BY[r.status] ? r.status : "todo",
        amount: typeof r.amount === "string" ? r.amount.slice(0, 40) : "",
        ref: typeof r.ref === "string" ? r.ref.slice(0, 80) : "",
        notes: typeof r.notes === "string" ? r.notes.slice(0, 2000) : "",
      };
    }
    return out;
  }

  function sanitizeProfile(p, tagIds) {
    const out = {};
    if (!p || typeof p !== "object") return out;
    for (const t of tagIds) if (p[t] === true) out[t] = true;
    return out;
  }

  function validateRegistry(reg) {
    const errors = [];
    const catIds = new Set(reg.CATEGORIES.map((c) => c.id));
    const tagIds = new Set(reg.PROFILE_TAGS.map((t) => t.id));
    const ids = new Set();
    const legacy = new Set();
    for (const c of reg.CATEGORIES) {
      if (!["owed", "eligibility", "optional"].includes(c.kind)) errors.push(`category ${c.id}: bad kind`);
    }
    for (const s of reg.SOURCES) {
      if (!/^[a-z0-9-]+$/.test(s.id)) errors.push(`${s.id}: id must be lowercase slug`);
      if (ids.has(s.id)) errors.push(`${s.id}: duplicate id`);
      ids.add(s.id);
      if (!catIds.has(s.cat)) errors.push(`${s.id}: unknown category ${s.cat}`);
      if (!reg.TYPE_LABELS[s.type]) errors.push(`${s.id}: unknown type ${s.type}`);
      if (!reg.ACCESS_LABELS[s.access]) errors.push(`${s.id}: unknown access ${s.access}`);
      if (!/^https:\/\//.test(s.url)) errors.push(`${s.id}: url must be https`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.checked)) errors.push(`${s.id}: checked must be YYYY-MM-DD`);
      for (const t of s.rel) if (!tagIds.has(t)) errors.push(`${s.id}: unknown tag ${t}`);
      if (s.legacy) {
        if (legacy.has(s.legacy)) errors.push(`${s.id}: duplicate legacy key ${s.legacy}`);
        legacy.add(s.legacy);
      }
      if (/treasury hunt/i.test(s.name)) errors.push(`${s.id}: Treasury Hunt was discontinued`);
      if (/benefits\.gov/i.test(s.url)) errors.push(`${s.id}: Benefits.gov was retired`);
    }
    for (const c of reg.CATEGORIES) {
      if (!reg.SOURCES.some((s) => s.cat === c.id)) errors.push(`category ${c.id}: has no sources`);
    }
    return errors;
  }

  // ---- Backups (optionally encrypted with a passphrase) ----
  const BACKUP_FORMAT = "findyourfunds-backup";
  const PBKDF2_ITERATIONS = 250000;

  function toB64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function fromB64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function deriveKey(passphrase, salt, iterations) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function makeBackup(state, passphrase, now) {
    const exportedAt = (now || new Date()).toISOString();
    const payload = { records: state.records || {}, profile: state.profile || {} };
    if (!passphrase) return { format: BACKUP_FORMAT, version: 1, encrypted: false, exportedAt, data: payload };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key,
      new TextEncoder().encode(JSON.stringify(payload))));
    return { format: BACKUP_FORMAT, version: 1, encrypted: true, exportedAt,
      kdf: "PBKDF2-SHA256", iterations: PBKDF2_ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(ct) };
  }

  async function readBackup(text, passphrase) {
    let obj;
    try { obj = typeof text === "string" ? JSON.parse(text) : text; } catch (e) { throw new Error("That isn't a Find Your Funds backup file."); }
    if (!obj || obj.format !== BACKUP_FORMAT || obj.version !== 1) throw new Error("That isn't a Find Your Funds backup file.");
    let payload = obj.data;
    if (obj.encrypted) {
      if (!passphrase) throw new Error("This backup is encrypted. Enter its passphrase.");
      try {
        const key = await deriveKey(passphrase, fromB64(obj.salt), obj.iterations || PBKDF2_ITERATIONS);
        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(obj.iv) }, key, fromB64(obj.data));
        payload = JSON.parse(new TextDecoder().decode(pt));
      } catch (e) {
        throw new Error("Wrong passphrase, or the backup is damaged.");
      }
    }
    return { records: sanitizeRecords(payload && payload.records), profile: (payload && payload.profile) || {} };
  }

  const api = {
    STATUSES, STATUS_BY, BUCKETS, statusInfo, parseAmount, formatCents, computeTotals,
    migrateLegacy, buildLegacyMap, mayApply, matchesQuery, sanitizeRecords, sanitizeProfile,
    validateRegistry, makeBackup, readBackup, BACKUP_FORMAT,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FYFCore = api;
})(typeof self !== "undefined" ? self : this);
