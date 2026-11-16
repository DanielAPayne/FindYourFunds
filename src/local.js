/*
 * Find Your Funds — city and county unclaimed-money lists.
 *
 * These lists name the people owed money, and governments remove entries once
 * they're claimed. So instead of copying them (which would keep names in git
 * history forever), the browser queries each government's own published source
 * directly. The name a visitor types goes to those government sources, which
 * publish the lists for exactly this purpose.
 *
 * Platforms:
 *   socrata  query the dataset's SODA API (filtered on the server)
 *   arcgis   query the feature service layer (filtered on the server)
 *   csv      download a small published CSV and search it in the browser
 */
(function (root) {
  const LOCAL_LIMIT = 500;

  const LOCAL_SOURCES = [
    { id: "providence-ri", platform: "socrata", place: "City of Providence", state: "RI", domain: "data.providenceri.gov", dataset: "4hhd-fzq6",
      what: "City checks not cashed after a year", names: ["payee_name"], amount: "payment_amount", date: "check_date", city: "city", st: "state",
      claim: "Call the City of Providence Treasurer at 401-680-5000.", claimUrl: "https://data.providenceri.gov/d/4hhd-fzq6" },
    { id: "ramsey-mn", platform: "socrata", place: "Ramsey County", state: "MN", domain: "data.ramseycountymn.gov", dataset: "ea8s-irrm",
      what: "County checks not cashed within six months", names: ["payee_name"], amount: "check_amount", date: "oldest_check_date",
      claim: "Email Ramsey County Finance at askba@ramseycounty.us. A lost or destroyed check needs an affidavit.", claimUrl: "https://data.ramseycountymn.gov/d/ea8s-irrm" },
    { id: "marin-ca", platform: "socrata", place: "Marin County", state: "CA", domain: "data.marincounty.gov", dataset: "er4x-svwp",
      what: "County checks not cashed within six months", names: ["vendor_name"], amount: "amount", date: "check_date",
      claim: "Lost or uncashed checks can be reissued with an affidavit up to 2 years and 6 months after issue; older checks need the original.",
      claimUrl: "https://www.marincounty.gov/departments/finance/accounts-payable/request-payment/replace-lost-or-outdated-check" },
    { id: "sonoma-ca", platform: "socrata", place: "Sonoma County", state: "CA", domain: "data.sonomacounty.ca.gov", dataset: "7zt2-w5w6",
      what: "Stale-dated county checks (private payments such as welfare and payroll are not listed)", names: ["payeename"], amount: "issueamount", date: "issuedate",
      claim: "Request a replacement check from the Auditor-Controller-Treasurer-Tax Collector.",
      claimUrl: "https://sonomacounty.ca.gov/administrative-support-and-fiscal-services/auditor-controller-treasurer-tax-collector" },
    { id: "roseville-ca", platform: "socrata", place: "City of Roseville", state: "CA", domain: "data.roseville.ca.us", dataset: "vtyn-52t8",
      what: "Stale-dated city checks", names: ["name"], amount: "amount", date: "date",
      claim: "Contact the City of Roseville Finance Department.", claimUrl: "https://data.roseville.ca.us/d/vtyn-52t8" },
    { id: "austin-tx", platform: "socrata", place: "City of Austin", state: "TX", domain: "datahub.austintexas.gov", dataset: "h3i4-5e5v",
      what: "Unclaimed city property (names only; amounts aren't published)", first: "first", last: "last",
      claim: "Claim through the City of Austin's unclaimed property page.", claimUrl: "https://www.austintexas.gov/services/search-unclaimed-property" },
    { id: "sacramento-ucf", platform: "arcgis", place: "Sacramento County", list: "unclaimed funds", state: "CA", itemId: "c54f32af209040f8a658252a99607903",
      layer: "https://services1.arcgis.com/5NARefyPVtAeuJPU/arcgis/rest/services/County_Unclaimed_Funds/FeatureServer/0",
      what: "County unclaimed funds, including court-ordered and estate funds", names: ["Name"], amount: "Amount", ref: "Reference_Number",
      extras: [["Department_Name", "Held by"], ["Email_for_Inquiries", "Ask"]],
      claim: "Each entry lists the county department holding it and the email to contact.", claimUrl: "https://www.arcgis.com/home/item.html?id=c54f32af209040f8a658252a99607903" },
    { id: "sacramento-warrants", platform: "arcgis", place: "Sacramento County", list: "uncashed warrants", state: "CA", itemId: "7eba7c39e6dd47afbf26d7be27625b43",
      layer: "https://services1.arcgis.com/5NARefyPVtAeuJPU/arcgis/rest/services/Unclaimed_Warrant_Listing_March_2026___Sac_County___Open_Data_Report/FeatureServer/0",
      what: "County checks (warrants) not cashed within six months", names: ["Name_of_the_payee", "Additional_Payee_Name"], amount: "Amount", date: "Pmnt_date", ref: "Warrant__",
      claim: "Lost county warrants can be reissued up to two and a half years after issue; see the Auditor-Controller's page.",
      claimUrl: "https://finance.saccounty.gov/AuditorController/pages/uncashedwarrants.aspx" },
    { id: "raleigh-nc", platform: "arcgis", place: "City of Raleigh", state: "NC", itemId: "d435503f47e24ae99adabcc49471faeb",
      layer: "https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Uncashed_Checks/FeatureServer/0",
      what: "Uncashed city checks", names: ["Name1"], amount: "Pymnt_Amt", date: "Pymnt_dt", address: "Address", ref: "PYMNT_ID_Ref",
      claim: "Contact Raleigh Accounts Payable at 919-996-3210 or accountspayable@raleighnc.gov. Older checks go to North Carolina's unclaimed property program.",
      claimUrl: "https://www.arcgis.com/home/item.html?id=d435503f47e24ae99adabcc49471faeb" },
    { id: "madison-wi", platform: "csv", place: "City of Madison", state: "WI", itemId: "0ae67f0f85e04bebbaac8f91a38c758c",
      csvUrl: "https://www.arcgis.com/sharing/rest/content/items/0ae67f0f85e04bebbaac8f91a38c758c/data",
      what: "City checks outstanding six months or more (private health payments not listed)", names: ["Name"], amount: "Amount", date: "Check Date", city: "City", st: "State", ref: "Check",
      claim: "Contact the City of Madison Finance Department.", claimUrl: "https://www.cityofmadison.com/finance" },
  ];

  /* Uppercase words, letters/digits/&'.- only. Anything else is dropped, which also keeps queries safe. */
  function cleanWords(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9&'.\- ]+/g, " ").split(/\s+/).map((w) => w.replace(/^[.'-]+|[.'-]+$/g, "")).filter(Boolean);
  }
  function wordsOf(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9&]+/g, " ").split(" ").filter(Boolean); }
  function sqlString(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
  const soqlString = sqlString;

  function queryWords(query) {
    const last = wordsOf(cleanWords(query.last).join(" "));
    const first = wordsOf(cleanWords(query.first).join(" "))[0] || "";
    return { last, first };
  }

  /* SQL WHERE clause (works for both SoQL and ArcGIS), or null if the query is too short. */
  function buildWhere(src, query) {
    const { last, first } = queryWords(query);
    if (!last.length || last.join("").length < 2) return null;
    const key = last.slice().sort((a, b) => b.length - a.length)[0];
    const like = (f, v) => `upper(${f}) like ${sqlString("%" + v + "%")}`;
    const anyName = (v) => {
      const fields = src.names || [src.last];
      const parts = fields.map((f) => like(f, v));
      return parts.length > 1 ? `(${parts.join(" OR ")})` : parts[0];
    };
    const conds = [anyName(key)];
    // A first name narrows big lists on the server too (an initial is enough to match).
    if (first) conds.push(src.first ? like(src.first, first[0]) : anyName(first[0]));
    return conds.join(" AND ");
  }

  function selectFields(src) {
    return [...(src.names || []), src.first, src.last, src.amount, src.date, src.city, src.st, src.address, src.ref,
      ...((src.extras || []).map((e) => e[0]))].filter(Boolean);
  }

  /* URL to fetch for one source, or null if the query is too short. */
  function buildLocalUrl(src, query) {
    if (src.platform === "csv") return queryWords(query).last.join("").length >= 2 ? src.csvUrl : null;
    const where = buildWhere(src, query);
    if (!where) return null;
    if (src.platform === "arcgis") {
      const p = new URLSearchParams({ where: where.replace(/\bupper\(/g, "UPPER(").replace(/ like /g, " LIKE "),
        outFields: selectFields(src).join(","), returnGeometry: "false", resultRecordCount: String(LOCAL_LIMIT), f: "json" });
      return `${src.layer}/query?${p}`;
    }
    const p = new URLSearchParams({ $select: selectFields(src).map((f) => f).join(","), $where: where, $limit: String(LOCAL_LIMIT) });
    return `https://${src.domain}/resource/${src.dataset}.json?${p}`;
  }

  /* Minimal RFC 4180 CSV parser: quoted fields, doubled quotes, CRLF or LF. Returns objects keyed by header. */
  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", q = false;
    const s = String(text).replace(/^﻿/, "");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && s[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim());
    return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] === undefined ? "" : r[i]])));
  }

  /* Raw response -> { rows, truncated }. Throws on an error response. */
  function parseLocalResponse(src, body) {
    if (src.platform === "csv") {
      if (typeof body !== "string") throw new Error("Unexpected response from " + src.place);
      return { rows: parseCsv(body), truncated: false };
    }
    if (src.platform === "arcgis") {
      // ArcGIS reports query errors inside a 200 response.
      if (!body || body.error || !Array.isArray(body.features)) {
        throw new Error((body && body.error && body.error.message) || "Unexpected response from " + src.place);
      }
      const rows = body.features.map((f) => f.attributes || {});
      return { rows, truncated: !!body.exceededTransferLimit || rows.length >= LOCAL_LIMIT };
    }
    if (!Array.isArray(body)) throw new Error("Unexpected response from " + src.place);
    return { rows: body, truncated: body.length >= LOCAL_LIMIT };
  }

  function recordNames(src, rec) {
    if (src.names) return src.names.map((f) => String(rec[f] == null ? "" : rec[f]).trim()).filter(Boolean);
    const n = [rec[src.first], rec[src.last]].filter(Boolean).join(" ").trim();
    return n ? [n] : [];
  }

  /*
   * Every word of the last name / business name must start a word in the record.
   * A first name, if given, must start some other word (initials match too).
   * With several name fields (e.g. payee and additional payee), any one may match.
   */
  function matchName(name, query) {
    const recWords = wordsOf(name);
    const { last, first } = queryWords(query);
    if (!recWords.length || !last.length) return false;
    const used = new Set();
    for (const lw of last) {
      const i = recWords.findIndex((w, idx) => !used.has(idx) && w.startsWith(lw));
      if (i < 0) return false;
      used.add(i);
    }
    if (first) return recWords.some((w, idx) => !used.has(idx) && (w.startsWith(first) || (w.length === 1 && first.startsWith(w))));
    return true;
  }
  function matchLocal(src, rec, query) { return recordNames(src, rec).some((n) => matchName(n, query)); }

  function toCents(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(String(v).replace(/[$,]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }
  /* ISO string, epoch milliseconds (ArcGIS), or MM/DD/YYYY -> YYYY-MM-DD. */
  function toDate(v) {
    if (v === undefined || v === null || v === "") return "";
    if (typeof v === "number") { const d = new Date(v); return isNaN(d) ? "" : d.toISOString().slice(0, 10); }
    let m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : "";
  }

  function toLocalResult(src, rec) {
    const val = (f) => (f && rec[f] != null ? String(rec[f]).trim() : "");
    return {
      source: src.id, place: src.place, state: src.state,
      name: recordNames(src, rec).join(" / "),
      cents: src.amount ? toCents(rec[src.amount]) : null,
      date: src.date ? toDate(rec[src.date]) : "",
      location: src.address ? val(src.address) : [val(src.city), val(src.st)].filter(Boolean).join(", "),
      ref: val(src.ref),
      extras: (src.extras || []).map(([f, label]) => ({ label, value: val(f) })).filter((e) => e.value),
    };
  }

  /* Filter one source's rows to matches, newest first. */
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
      if (s.platform === "socrata") {
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s.domain || "")) errors.push(`${s.id}: bad domain`);
        if (!/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(s.dataset || "")) errors.push(`${s.id}: bad dataset id`);
      } else if (s.platform === "arcgis") {
        if (!/^https:\/\/[^\s]+\/(FeatureServer|MapServer)\/\d+$/.test(s.layer || "")) errors.push(`${s.id}: bad layer url`);
      } else if (s.platform === "csv") {
        if (!/^https:\/\//.test(s.csvUrl || "")) errors.push(`${s.id}: bad csv url`);
      } else errors.push(`${s.id}: unknown platform ${s.platform}`);
      if (!(s.names && s.names.length) && !(s.first && s.last)) errors.push(`${s.id}: needs names or first+last`);
      const fieldRe = s.platform === "csv" ? /^[A-Za-z0-9 _#]+$/ : /^[A-Za-z_][A-Za-z0-9_]*$/;
      for (const f of selectFields(s)) if (!fieldRe.test(f)) errors.push(`${s.id}: bad field ${f}`);
      if (!/^https:\/\//.test(s.claimUrl || "")) errors.push(`${s.id}: claimUrl must be https`);
      if (!s.claim) errors.push(`${s.id}: missing claim instructions`);
    }
    return errors;
  }

  const api = {
    LOCAL_SOURCES, LOCAL_LIMIT, cleanWords, soqlString, sqlString, buildWhere, buildLocalUrl, parseCsv, parseLocalResponse,
    matchLocal, recordNames, toDate, toLocalResult, localResults, validateLocalSources, selectFields,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FYFLocal = api;
})(typeof self !== "undefined" ? self : this);
