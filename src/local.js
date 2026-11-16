/*
 * Find Your Funds — city and county unclaimed-money lists.
 *
 * These lists name the people owed money, and governments remove entries once
 * they're claimed. So instead of copying them (which would keep names in git
 * history forever), the browser queries each government's open-data portal
 * directly through its public Socrata API. The name a visitor types goes to
 * those portals, which publish the lists for exactly this purpose.
 */
(function (root) {
  const LOCAL_SOURCES = [
    { id: "providence-ri", place: "City of Providence", state: "RI", domain: "data.providenceri.gov", dataset: "4hhd-fzq6",
      what: "City checks not cashed after a year", name: "payee_name", amount: "payment_amount", date: "check_date", city: "city", st: "state",
      claim: "Call the City of Providence Treasurer at 401-680-5000.", claimUrl: "https://data.providenceri.gov/d/4hhd-fzq6" },
    { id: "ramsey-mn", place: "Ramsey County", state: "MN", domain: "data.ramseycountymn.gov", dataset: "ea8s-irrm",
      what: "County checks not cashed within six months", name: "payee_name", amount: "check_amount", date: "oldest_check_date",
      claim: "Email Ramsey County Finance at askba@ramseycounty.us. A lost or destroyed check needs an affidavit.", claimUrl: "https://data.ramseycountymn.gov/d/ea8s-irrm" },
    { id: "marin-ca", place: "Marin County", state: "CA", domain: "data.marincounty.gov", dataset: "er4x-svwp",
      what: "County checks not cashed within six months", name: "vendor_name", amount: "amount", date: "check_date",
      claim: "Lost or uncashed checks can be reissued with an affidavit up to 2 years and 6 months after issue; older checks need the original.",
      claimUrl: "https://www.marincounty.gov/departments/finance/accounts-payable/request-payment/replace-lost-or-outdated-check" },
    { id: "sonoma-ca", place: "Sonoma County", state: "CA", domain: "data.sonomacounty.ca.gov", dataset: "7zt2-w5w6",
      what: "Stale-dated county checks (private payments such as welfare and payroll are not listed)", name: "payeename", amount: "issueamount", date: "issuedate",
      claim: "Request a replacement check from the Auditor-Controller-Treasurer-Tax Collector.",
      claimUrl: "https://sonomacounty.ca.gov/administrative-support-and-fiscal-services/auditor-controller-treasurer-tax-collector" },
    { id: "roseville-ca", place: "City of Roseville", state: "CA", domain: "data.roseville.ca.us", dataset: "vtyn-52t8",
      what: "Stale-dated city checks", name: "name", amount: "amount", date: "date",
      claim: "Contact the City of Roseville Finance Department.", claimUrl: "https://data.roseville.ca.us/d/vtyn-52t8" },
    { id: "austin-tx", place: "City of Austin", state: "TX", domain: "datahub.austintexas.gov", dataset: "h3i4-5e5v",
      what: "Unclaimed city property (names only; amounts aren't published)", first: "first", last: "last",
      claim: "Claim through the City of Austin's unclaimed property page.", claimUrl: "https://www.austintexas.gov/services/search-unclaimed-property" },
  ];

  const LOCAL_LIMIT = 500;

  /* Uppercase words, letters/digits/&'.- only. Anything else is dropped, which also keeps queries safe. */
  function cleanWords(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9&'.\- ]+/g, " ").split(/\s+/).map((w) => w.replace(/^[.'-]+|[.'-]+$/g, "")).filter(Boolean);
  }

  function soqlString(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  function nameFieldsOf(src) { return src.name ? [src.name] : [src.last, src.first]; }

  /*
   * Socrata query URL for one source. The server filters on the longest word of
   * the last name or business name; matchLocal() then applies the full rule.
   * Returns null if the query is too short to search.
   */
  function buildLocalUrl(src, query) {
    // Split on punctuation so "Smith-Jones" also finds "SMITH JONES", and "O'Hara" finds "OHARA".
    const parts = wordsOf(cleanWords(query.last).join(" "));
    if (!parts.length || parts.join("").length < 2) return null;
    const key = parts.slice().sort((a, b) => b.length - a.length)[0];
    const field = src.name || src.last;
    const select = [src.name, src.first, src.last, src.amount, src.date, src.city, src.st].filter(Boolean).join(",");
    const conds = [`upper(${field}) like ${soqlString("%" + key + "%")}`];
    // A first name narrows big lists on the server too (an initial is enough to match).
    const first = wordsOf(cleanWords(query.first).join(" "))[0];
    if (first) conds.push(`upper(${src.first || src.name}) like ${soqlString("%" + first[0] + "%")}`);
    const p = new URLSearchParams({ $select: select, $where: conds.join(" AND "), $limit: String(LOCAL_LIMIT) });
    return `https://${src.domain}/resource/${src.dataset}.json?${p}`;
  }

  function recordName(src, rec) {
    if (src.name) return String(rec[src.name] || "").trim();
    return [rec[src.first], rec[src.last]].filter(Boolean).join(" ").trim();
  }

  function wordsOf(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9&]+/g, " ").split(" ").filter(Boolean); }

  /*
   * Every word of the last name / business name must start a word in the record.
   * A first name, if given, must start some other word (initials match too).
   */
  function matchLocal(src, rec, query) {
    const recWords = wordsOf(recordName(src, rec));
    if (!recWords.length) return false;
    const lastWords = wordsOf(cleanWords(query.last).join(" "));
    if (!lastWords.length) return false;
    const used = new Set();
    for (const lw of lastWords) {
      const i = recWords.findIndex((w, idx) => !used.has(idx) && w.startsWith(lw));
      if (i < 0) return false;
      used.add(i);
    }
    const first = wordsOf(cleanWords(query.first).join(" "))[0];
    if (first) {
      const ok = recWords.some((w, idx) => !used.has(idx) && (w.startsWith(first) || (w.length === 1 && first.startsWith(w))));
      if (!ok) return false;
    }
    return true;
  }

  function toCents(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }
  function toDate(v) { const m = String(v || "").match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ""; }

  function toLocalResult(src, rec) {
    return {
      source: src.id, place: src.place, state: src.state,
      name: recordName(src, rec),
      cents: src.amount ? toCents(rec[src.amount]) : null,
      date: src.date ? toDate(rec[src.date]) : "",
      location: [src.city && rec[src.city], src.st && rec[src.st]].filter(Boolean).join(", "),
    };
  }

  /* Filter one source's raw rows to matches, newest first. */
  function localResults(src, rows, query) {
    if (!Array.isArray(rows)) throw new Error("Unexpected response from " + src.place);
    return rows.filter((r) => matchLocal(src, r, query)).map((r) => toLocalResult(src, r))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.name.localeCompare(b.name));
  }

  function validateLocalSources(list) {
    const errors = [];
    const ids = new Set();
    for (const s of list) {
      if (ids.has(s.id)) errors.push(`${s.id}: duplicate id`);
      ids.add(s.id);
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s.domain)) errors.push(`${s.id}: bad domain`);
      if (!/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(s.dataset)) errors.push(`${s.id}: bad dataset id`);
      if (!s.name && !(s.first && s.last)) errors.push(`${s.id}: needs a name field or first+last`);
      for (const f of [s.name, s.first, s.last, s.amount, s.date, s.city, s.st]) if (f && !/^[a-z_][a-z0-9_]*$/.test(f)) errors.push(`${s.id}: bad field ${f}`);
      if (!/^https:\/\//.test(s.claimUrl)) errors.push(`${s.id}: claimUrl must be https`);
      if (!s.claim) errors.push(`${s.id}: missing claim instructions`);
    }
    return errors;
  }

  const api = { LOCAL_SOURCES, LOCAL_LIMIT, cleanWords, soqlString, buildLocalUrl, matchLocal, toLocalResult, localResults, validateLocalSources, nameFieldsOf };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FYFLocal = api;
})(typeof self !== "undefined" ? self : this);
