const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../src/leads.js");
const sample = require("./fixtures/fdic-sample.json"); // real FDIC records

test("parseFdicDate converts FDIC dates and rejects impossible ones", () => {
  assert.equal(L.parseFdicDate("7/17/2026", 2027), "2026-07-17");
  assert.equal(L.parseFdicDate("1/1/1985", 2027), "1985-01-01");
  assert.equal(L.parseFdicDate("12/10/1992", 2027), "1992-12-10");
  assert.equal(L.parseFdicDate("2026-07-17", 2027), "");
  assert.equal(L.parseFdicDate("1/1/3021", 2027), "");
  assert.equal(L.parseFdicDate("", 2027), "");
});

test("buildFdicRows reads the API shape, drops '0' placeholders, newest first", () => {
  const rows = L.buildFdicRows(sample, { maxYear: 2027 });
  assert.equal(rows.length, sample.data.length);
  const dates = rows.map((r) => r[4]);
  assert.deepEqual([...dates].sort().reverse(), dates);
  const payout = L.bankRowToCase(rows.find((r) => r[5] === "PO"));
  assert.equal(payout.acquirer, "", "FDIC uses '0' for payouts with no acquirer");
  const wamu = L.bankRowToCase(rows.find((r) => r[1] === "WASHINGTON MUTUAL BANK"));
  assert.deepEqual([wamu.state, wamu.date, wamu.type, wamu.acquirer], ["NV", "2008-09-25", "PA", "JPMORGAN CHASE BANK, NA"]);
});

test("buildFdicRows refuses data without the fields it relies on", () => {
  assert.throws(() => L.buildFdicRows({ data: [{ data: { NAME: "X" } }] }), /missing expected fields: PSTALP, FAILDATE, RESTYPE1/);
  assert.throws(() => L.buildFdicRows({ nope: 1 }), /Unexpected FDIC response shape/);
});

test("every transaction type in the real data has a plain-language meaning", () => {
  for (const r of L.buildFdicRows(sample, { maxYear: 2027 })) {
    const d = L.describeBankCase(L.bankRowToCase(r));
    assert.ok(L.FDIC_TYPES[r[5]], `no description for ${r[5]}`);
    assert.ok(d.label && d.detail, r[5]);
  }
});

test("titleCase reads naturally and keeps abbreviations", () => {
  assert.equal(L.titleCase("THE COMMUNITY'S BANK"), "The Community's Bank");
  assert.equal(L.titleCase("NCNB TEXAS NATIONAL BANK"), "NCNB Texas National Bank");
  assert.equal(L.titleCase("JPMORGAN CHASE BANK, NA"), "JPMorgan Chase Bank, NA");
  assert.equal(L.titleCase("FIRST REPUBLICBANK-A&M"), "First Republicbank-A&M");
  assert.equal(L.titleCase("KENTLAND FS&LA"), "Kentland FS&LA");
  assert.equal(L.titleCase("FT. WORTH"), "Ft. Worth");
  assert.equal(L.titleCase(""), "");
});

test("describeBankCase flags only resolutions where unclaimed money is plausible", () => {
  const d = (type, acquirer = "JPMORGAN CHASE BANK, NA") => L.describeBankCase({ type, acquirer });
  for (const t of ["PO", "DINB", "IDT", "ABT", "PI"]) assert.equal(d(t).check, true, t);
  for (const t of ["PA", "P&A", "A/A", "OBAM", "REP", "MGR"]) assert.equal(d(t).check, false, t);
  assert.match(d("PA").detail, /JPMorgan Chase Bank, NA/);
  assert.match(d("PO", "").detail, /no successor bank/);
  const unknown = d("XYZ");
  assert.equal(unknown.check, true, "an unrecognized type is worth checking");
  assert.match(unknown.label, /XYZ/);
});

test("searchBanks matches names by word prefix, ranks exact first, filters by state", () => {
  const rows = L.buildFdicRows(sample, { maxYear: 2027 });
  const fr = L.searchBanks(rows, "first republic");
  assert.deepEqual(fr.map((c) => c.name), ["FIRST REPUBLIC BANK", "FIRST REPUBLICBANK-DALLAS, N.A."]);
  assert.equal(fr[0].score, 3);
  assert.deepEqual(L.searchBanks(rows, "first republic", { state: "tx" }).map((c) => c.name), ["FIRST REPUBLICBANK-DALLAS, N.A."]);
  assert.deepEqual(L.searchBanks(rows, "wamu"), [], "no fuzzy nicknames");
  assert.deepEqual(L.searchBanks(rows, "washington mutual").map((c) => c.cert), [rows.find((r) => r[1] === "WASHINGTON MUTUAL BANK")[0]]);
  assert.deepEqual(L.searchBanks(rows, "s"), []);
});

test("published failed-bank data, if present, came from a real FDIC download", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const p = path.join(__dirname, "..", "data", "fdic", "failures.json");
  if (!fs.existsSync(p)) return;
  const f = L.parseFdicFile(JSON.parse(fs.readFileSync(p, "utf8")));
  if (f.status === "not_built") { assert.equal(f.rows.length, 0); return; }
  assert.ok(f.rows.length > 3000, "file looks like test data, not the FDIC's full list");
  assert.equal(f.rows.length, f.source.records_read - f.source.dropped);
});

test("parseFdicFile rejects damaged or mismatched files", () => {
  const good = { format: "fyf-fdic-failures", version: 1, columns: L.FDIC_COLUMNS, rows: [] };
  assert.equal(L.parseFdicFile(good), good);
  assert.throws(() => L.parseFdicFile({}), /missing or damaged/);
  assert.throws(() => L.parseFdicFile({ ...good, columns: [] }), /unexpected layout/);
});
