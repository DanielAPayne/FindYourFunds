/*
 * Find Your Funds — lead finders. Pure functions shared by the browser and
 * the data-build scripts, tested under `node --test`.
 *
 * Back-wage leads come from DOL Wage and Hour Division "Enforcement" data
 * (concluded compliance actions since FY2005). A match means DOL found back
 * wages owed by an employer. It does NOT mean the person searching is owed
 * any of it; that is checked on DOL's Workers Owed Wages site.
 */
(function (root) {
  // Column order inside each published state shard.
  const WHD_COLUMNS = ["case_id", "legal_name", "trade_name", "city", "zip", "start", "end", "back_wages_cents", "employees"];

  // Accepted names for each field in DOL's source data, first match wins.
  const WHD_SOURCE_FIELDS = {
    case_id: ["case_id"],
    legal_name: ["legal_name"],
    trade_name: ["trade_nm", "trade_name"],
    city: ["cty_nm", "city"],
    state: ["st_cd", "state"],
    zip: ["zip_cd", "zip"],
    start: ["findings_start_date"],
    end: ["findings_end_date"],
    back_wages: ["bw_atp_amt", "back_wages"],
    employees: ["ee_atp_cnt"],
  };
  const WHD_REQUIRED = ["case_id", "legal_name", "state", "back_wages"];

  const US_STATES = ["AK","AL","AR","AZ","CA","CO","CT","DC","DE","FL","GA","GU","HI","IA","ID","IL","IN","KS","KY","LA","MA","MD","ME","MI","MN","MO","MP","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH","OK","OR","PA","PR","RI","SC","SD","TN","TX","UT","VA","VI","VT","WA","WI","WV","WY"];

  const SUFFIXES = new Set(["inc", "incorporated", "llc", "l", "lc", "llp", "lp", "ltd", "limited", "corp", "corporation", "co", "company", "pc", "pllc", "plc", "the", "dba"]);

  /* Lowercase, unify "&", drop punctuation and legal-entity suffixes. Keeps meaningful words. */
  function normalizeEmployer(name) {
    const words = String(name || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const kept = words.filter((w) => !SUFFIXES.has(w));
    return (kept.length ? kept : words).join(" ");
  }

  /* Map a raw DOL record to a shard row, or null if it has no back wages. */
  function pick(rec, names) {
    for (const n of names) if (rec[n] !== undefined && rec[n] !== null && rec[n] !== "") return rec[n];
    return null;
  }
  function toCents(v) {
    const n = Number(String(v).replace(/[$,]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  /* YYYY-MM-DD, or "" when missing or impossible (DOL data has typos like 0200 and 3021). */
  function toDate(v, maxYear) {
    if (!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    const y = Number(m[1]);
    if (y < 1950 || y > maxYear) return "";
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  /* Throws if the source data is missing a required field. Returns the field map that was found. */
  function checkWhdFields(sampleRecords) {
    const keys = new Set();
    for (const r of sampleRecords.slice(0, 200)) for (const k of Object.keys(r)) keys.add(k);
    const found = {};
    const missing = [];
    for (const [field, names] of Object.entries(WHD_SOURCE_FIELDS)) {
      const hit = names.find((n) => keys.has(n));
      if (hit) found[field] = hit;
      else if (WHD_REQUIRED.includes(field)) missing.push(`${field} (looked for ${names.join(", ")})`);
    }
    if (missing.length) {
      throw new Error(`DOL data is missing expected fields: ${missing.join("; ")}. Fields present: ${[...keys].sort().join(", ")}`);
    }
    return found;
  }

  /* Raw DOL records -> { [state]: rows[] } for records with back wages owed. */
  function buildWhdShards(records, opts) {
    const maxYear = (opts && opts.maxYear) || new Date().getUTCFullYear() + 1;
    const shards = {};
    for (const r of records) {
      const cents = toCents(pick(r, WHD_SOURCE_FIELDS.back_wages));
      if (cents <= 0) continue;
      const st = String(pick(r, WHD_SOURCE_FIELDS.state) || "").toUpperCase().trim();
      if (!US_STATES.includes(st)) continue;
      const row = [
        String(pick(r, WHD_SOURCE_FIELDS.case_id) || ""),
        String(pick(r, WHD_SOURCE_FIELDS.legal_name) || "").trim(),
        String(pick(r, WHD_SOURCE_FIELDS.trade_name) || "").trim(),
        String(pick(r, WHD_SOURCE_FIELDS.city) || "").trim(),
        String(pick(r, WHD_SOURCE_FIELDS.zip) || "").trim().slice(0, 5),
        toDate(pick(r, WHD_SOURCE_FIELDS.start), maxYear),
        toDate(pick(r, WHD_SOURCE_FIELDS.end), maxYear),
        cents,
        Number(pick(r, WHD_SOURCE_FIELDS.employees)) || 0,
      ];
      (shards[st] || (shards[st] = [])).push(row);
    }
    for (const rows of Object.values(shards)) rows.sort((a, b) => (b[6] || "").localeCompare(a[6] || "") || b[7] - a[7]);
    return shards;
  }

  function rowToCase(row) {
    const o = {};
    WHD_COLUMNS.forEach((c, i) => { o[c] = row[i]; });
    return o;
  }

  /*
   * Search one state's rows for an employer.
   * Every query word must appear (as a word prefix) in the legal or trade name.
   * Exact normalized matches rank first. Returns at most `limit` cases.
   */
  function searchEmployer(rows, query, opts) {
    const limit = (opts && opts.limit) || 50;
    const city = normalizeEmployer(opts && opts.city);
    const q = normalizeEmployer(query);
    if (q.length < 2) return [];
    const qWords = q.split(" ");
    const out = [];
    for (const row of rows) {
      const names = [normalizeEmployer(row[1]), normalizeEmployer(row[2])].filter(Boolean);
      let best = 0;
      for (const n of names) {
        if (n === q) { best = 3; break; }
        const words = n.split(" ");
        if (qWords.every((qw) => words.some((w) => w.startsWith(qw)))) best = Math.max(best, n.startsWith(q) ? 2 : 1);
      }
      if (!best) continue;
      if (city && !normalizeEmployer(row[3]).startsWith(city)) continue;
      out.push({ score: best, row });
    }
    out.sort((a, b) => b.score - a.score || (b.row[6] || "").localeCompare(a.row[6] || "") || b.row[7] - a.row[7]);
    return out.slice(0, limit).map((x) => Object.assign(rowToCase(x.row), { score: x.score }));
  }

  /* Validate a published shard before trusting it. */
  function parseShard(obj) {
    if (!obj || obj.format !== "fyf-whd-shard" || obj.version !== 1 || !Array.isArray(obj.rows)) {
      throw new Error("Back-wage data file is missing or damaged.");
    }
    if (JSON.stringify(obj.columns) !== JSON.stringify(WHD_COLUMNS)) throw new Error("Back-wage data file has an unexpected layout.");
    return obj;
  }

  // ---------------------------------------------------------------------------
  // FDIC failed and assisted banks (FDIC BankFind "failures" data, 1934 on).
  // A match means a bank failed or received FDIC assistance. Whether a depositor
  // might have unclaimed money depends on how it was resolved (see FDIC_TYPES).
  // ---------------------------------------------------------------------------
  const FDIC_COLUMNS = ["cert", "name", "city", "state", "date", "type", "acquirer", "acquirer_city", "acquirer_state"];
  const FDIC_REQUIRED = ["NAME", "PSTALP", "FAILDATE", "RESTYPE1"];

  // FDIC transaction types (RESTYPE1), from FDIC's failure_properties definitions.
  // ABT is grouped with IDT and DINB with payouts by those definitions; OBAM is
  // open-bank assistance. `check` marks resolutions worth searching FDIC unclaimed funds.
  const FDIC_TYPES = {
    PO:    { group: "payout",   check: true,  label: "FDIC paid depositors directly" },
    DINB:  { group: "payout",   check: true,  label: "FDIC paid depositors through a temporary bank" },
    IDT:   { group: "transfer", check: true,  label: "Insured deposits paid out by another bank" },
    ABT:   { group: "transfer", check: true,  label: "Insured deposits paid out by another bank" },
    PI:    { group: "insured",  check: true,  label: "Only insured deposits moved to another bank" },
    PA:    { group: "assumed",  check: false, label: "All deposits moved to another bank" },
    "P&A": { group: "assumed",  check: false, label: "Deposits moved to another bank" },
    "A/A": { group: "assisted", check: false, label: "FDIC assisted the bank" },
    OBAM:  { group: "assisted", check: false, label: "FDIC assistance while the bank stayed open" },
    REP:   { group: "assisted", check: false, label: "Taken over by regulators, then sold" },
    MGR:   { group: "assisted", check: false, label: "Run by regulators before being sold" },
  };

  /* What a resolution means for someone who had an account there. */
  function describeBankCase(c) {
    const t = FDIC_TYPES[c.type];
    const acq = c.acquirer ? titleCase(c.acquirer) : "";
    if (!t) return { label: `Resolution type ${c.type || "not recorded"}`, check: true,
      detail: "The FDIC's record doesn't say how deposits were handled. Search FDIC unclaimed funds to be sure." };
    const detail = {
      payout: "There was no successor bank. The FDIC paid insured depositors directly, and money nobody collected may still be held by the FDIC or turned over to the state's unclaimed property program.",
      transfer: `${acq || "Another bank"} paid insured deposits on the FDIC's behalf. Payments nobody collected may still be held by the FDIC or the state.`,
      insured: `Insured deposits moved to ${acq || "another bank"}. Amounts above the insurance limit were handled by the FDIC as receiver, which may have paid uninsured depositors a share later.`,
      assumed: `Accounts moved to ${acq || "the acquiring bank"} and usually continued there. If the account later went unused, check that bank or your state's unclaimed property.`,
      assisted: "The bank generally stayed open, so accounts usually continued as normal.",
    }[t.group];
    return { label: t.label, check: t.check, detail };
  }

  // FDIC names are all caps. Title-case them for reading, but keep abbreviations
  // (words with no vowels, like NCNB or FSB) and a few known forms intact.
  const NAME_FORMS = { NA: "NA", "N.A.": "N.A.", "N.A": "N.A.", USA: "USA", "S&LA": "S&LA", "FS&LA": "FS&LA", SSB: "SSB", FSB: "FSB", JPMORGAN: "JPMorgan", "A&M": "A&M" };
  function titleCase(s) {
    return String(s || "").split(/(\s+|-|\/)/).map((tok) => {
      const up = tok.toUpperCase();
      if (NAME_FORMS[up]) return NAME_FORMS[up];
      // Vowel-less words are abbreviations (NCNB, FSB), except short ones like FT. or MT.
      if (/^[A-Z&.]+$/.test(up) && !/[AEIOUY]/.test(up) && !/^[A-Z]{1,2}\.$/.test(up)) return up;
      const lower = tok.toLowerCase();
      return lower.replace(/^([^a-z]*)([a-z])/, (m, pre, ch) => pre + ch.toUpperCase());
    }).join("");
  }

  /* "7/17/2026" -> "2026-07-17"; "" when malformed or impossible. */
  function parseFdicDate(v, maxYear) {
    const m = String(v || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return "";
    const y = Number(m[3]);
    if (y < 1930 || y > (maxYear || new Date().getUTCFullYear() + 1)) return "";
    return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  function unwrapFdic(body) {
    const list = Array.isArray(body) ? body : body && body.data;
    if (!Array.isArray(list)) throw new Error("Unexpected FDIC response shape.");
    return list.map((x) => (x && x.data && typeof x.data === "object" ? x.data : x));
  }

  /* FDIC API body (or plain records) -> rows sorted newest first. Throws if fields are missing. */
  function buildFdicRows(body, opts) {
    const recs = unwrapFdic(body);
    const keys = new Set();
    for (const r of recs.slice(0, 200)) for (const k of Object.keys(r)) keys.add(k);
    const missing = FDIC_REQUIRED.filter((k) => !keys.has(k));
    if (missing.length) throw new Error(`FDIC data is missing expected fields: ${missing.join(", ")}. Fields present: ${[...keys].sort().join(", ")}`);
    const clean = (v) => { const s = String(v == null ? "" : v).trim(); return s === "0" ? "" : s; };
    const rows = recs.map((r) => [
      clean(r.CERT), clean(r.NAME), clean(r.CITY), clean(r.PSTALP).toUpperCase(),
      parseFdicDate(r.FAILDATE, opts && opts.maxYear), clean(r.RESTYPE1),
      clean(r.BIDNAME), clean(r.BIDCITY), clean(r.BIDSTATE).toUpperCase(),
    ]).filter((row) => row[1]);
    rows.sort((a, b) => (b[4] || "").localeCompare(a[4] || "") || a[1].localeCompare(b[1]));
    return rows;
  }

  function bankRowToCase(row) {
    const o = {};
    FDIC_COLUMNS.forEach((c, i) => { o[c] = row[i]; });
    return o;
  }

  /* Search failed-bank names. Every query word must start a word in the name; exact names first. */
  function searchBanks(rows, query, opts) {
    const limit = (opts && opts.limit) || 50;
    const state = String((opts && opts.state) || "").toUpperCase();
    const q = normalizeEmployer(query);
    if (q.length < 2) return [];
    const qWords = q.split(" ");
    const out = [];
    for (const row of rows) {
      if (state && row[3] !== state) continue;
      const n = normalizeEmployer(row[1]);
      const core = n.replace(/\b(bank|n a|na|fsb|ssb)\b/g, " ").replace(/\s+/g, " ").trim();
      let score = 0;
      if (n === q || core === q) score = 3;
      else {
        const words = n.split(" ");
        if (qWords.every((qw) => words.some((w) => w.startsWith(qw)))) score = n.startsWith(q) ? 2 : 1;
      }
      if (score) out.push({ score, row });
    }
    out.sort((a, b) => b.score - a.score || (b.row[4] || "").localeCompare(a.row[4] || ""));
    return out.slice(0, limit).map((x) => Object.assign(bankRowToCase(x.row), { score: x.score }));
  }

  function parseFdicFile(obj) {
    if (!obj || obj.format !== "fyf-fdic-failures" || obj.version !== 1 || !Array.isArray(obj.rows)) {
      throw new Error("Failed-bank data file is missing or damaged.");
    }
    if (JSON.stringify(obj.columns) !== JSON.stringify(FDIC_COLUMNS)) throw new Error("Failed-bank data file has an unexpected layout.");
    return obj;
  }

  const api = {
    WHD_COLUMNS, WHD_SOURCE_FIELDS, US_STATES, normalizeEmployer, checkWhdFields, buildWhdShards, searchEmployer, parseShard, rowToCase,
    FDIC_COLUMNS, FDIC_TYPES, describeBankCase, parseFdicDate, buildFdicRows, searchBanks, parseFdicFile, bankRowToCase, titleCase,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FYFLeads = api;
})(typeof self !== "undefined" ? self : this);
