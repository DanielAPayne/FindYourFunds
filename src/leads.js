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
  function toDate(v) {
    if (!v) return "";
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
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
  function buildWhdShards(records) {
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
        toDate(pick(r, WHD_SOURCE_FIELDS.start)),
        toDate(pick(r, WHD_SOURCE_FIELDS.end)),
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

  const api = { WHD_COLUMNS, WHD_SOURCE_FIELDS, US_STATES, normalizeEmployer, checkWhdFields, buildWhdShards, searchEmployer, parseShard, rowToCase };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FYFLeads = api;
})(typeof self !== "undefined" ? self : this);
