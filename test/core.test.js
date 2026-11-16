const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/registry.js");
const C = require("../src/core.js");

const ids = R.SOURCES.map((s) => s.id);

test("registry is valid", () => {
  assert.deepEqual(C.validateRegistry(R), []);
});

test("every v2 positional key maps to a current source", () => {
  // The v2 layout had 25 groups; these are its group sizes in order.
  const sizes = [2, 2, 5, 2, 4, 4, 2, 2, 3, 5, 1, 3, 2, 1, 1, 3, 1, 3, 2, 1, 1, 1, 3, 5, 2];
  const map = C.buildLegacyMap(R.SOURCES, R.LEGACY_ALIASES);
  const missing = [];
  sizes.forEach((n, g) => { for (let i = 0; i < n; i++) if (!map[`c${g}_${i}`]) missing.push(`c${g}_${i}`); });
  assert.deepEqual(missing, []);
  for (const id of Object.values(map)) assert.ok(ids.includes(id) || R.RETIRED_IDS.includes(id), `${id} is not a current or retired source`);
  for (const id of R.RETIRED_IDS) assert.ok(!ids.includes(id), `${id} is retired but still listed`);
});

test("discontinued sources are gone", () => {
  assert.ok(!R.SOURCES.some((s) => /treasury hunt/i.test(s.name)));
  assert.ok(!R.SOURCES.some((s) => s.url.includes("benefits.gov")));
});

test("parseAmount handles formats, negatives, and bad input", () => {
  assert.deepEqual(C.parseAmount(""), { cents: null, error: null });
  assert.deepEqual(C.parseAmount("  "), { cents: null, error: null });
  assert.equal(C.parseAmount("125").cents, 12500);
  assert.equal(C.parseAmount("$1,234.56").cents, 123456);
  assert.equal(C.parseAmount("1234.5").cents, 123450);
  assert.equal(C.parseAmount(".75").cents, 75);
  assert.equal(C.parseAmount("-12.50").cents, -1250);
  assert.equal(C.parseAmount("$-12").cents, -1200);
  assert.equal(C.parseAmount("-$12").cents, -1200);
  assert.equal(C.parseAmount("(12.50)").cents, -1250);
  assert.equal(C.parseAmount("-0").cents, 0);
  for (const bad of ["abc", "12.345", "1,23", "$", "12-3", "1.2.3"]) {
    const p = C.parseAmount(bad);
    assert.equal(p.cents, null, bad);
    assert.ok(p.error, bad);
  }
});

test("formatCents", () => {
  assert.equal(C.formatCents(0), "$0.00");
  assert.equal(C.formatCents(123456), "$1,234.56");
  assert.equal(C.formatCents(-1250), "-$12.50");
});

test("ledger keeps buckets separate and never counts unverified money as received", () => {
  const records = {
    "missingmoney": { status: "possible", amount: "100" },
    "il-icash": { status: "claim_filed", amount: "50.25" },
    "mi-unclaimed": { status: "approved", amount: "20" },
    "ca-claimit": { status: "received", amount: "10" },
    "dol-wow": { status: "searched_none", amount: "999" },
    "pbgc-unclaimed": { status: "todo", amount: "999" },
    "rrb": { status: "rejected", amount: "999" },
  };
  const t = C.computeTotals(records, ids);
  assert.deepEqual(t.buckets, { potential: 10000, filed: 5025, approved: 2000, received: 1000 });
});

test("ledger subtracts negative corrections", () => {
  const t = C.computeTotals({
    "ca-claimit": { status: "received", amount: "100" },
    "mi-unclaimed": { status: "received", amount: "-15" },
  }, ids);
  assert.equal(t.buckets.received, 8500);
});

test("ledger counts a reference number once across sources", () => {
  const t = C.computeTotals({
    "missingmoney": { status: "possible", amount: "80", ref: "IL-123 456" },
    "il-icash": { status: "possible", amount: "80", ref: "il-123456" },
  }, ids);
  assert.equal(t.buckets.potential, 8000);
  assert.equal(t.duplicates.length, 1);
  assert.equal(t.duplicates[0].id, "il-icash");
});

test("ledger reports invalid amounts instead of guessing", () => {
  const t = C.computeTotals({ "missingmoney": { status: "possible", amount: "lots" } }, ids);
  assert.equal(t.buckets.potential, 0);
  assert.deepEqual(t.invalid, ["missingmoney"]);
});

test("coverage separates searched, no match, unavailable, and not started", () => {
  const t = C.computeTotals({
    "missingmoney": { status: "searched_none" },
    "il-icash": { status: "unavailable" },
    "mi-unclaimed": { status: "possible" },
    "ghost-source": { status: "received", amount: "5" },
  }, ids);
  assert.equal(t.counts.total, ids.length);
  assert.equal(t.counts.searched, 2);
  assert.equal(t.counts.noMatch, 1);
  assert.equal(t.counts.unavailable, 1);
  assert.equal(t.counts.todo, ids.length - 3);
  assert.equal(t.buckets.received, 0, "records for unknown ids are ignored");
});

test("migration maps v2 data to stable ids conservatively", () => {
  const map = C.buildLegacyMap(R.SOURCES, R.LEGACY_ALIASES);
  const out = C.migrateLegacy({
    c1_0: { searched: true, status: "claimed", amount: "50", notes: "filed 3/1" },
    c1_1: { searched: true, status: "todo", amount: "", notes: "" },
    c2_0: { searched: false, status: "claiming", amount: "12", notes: "" },
    c3_0: { searched: true, status: "none", amount: "", notes: "" },
    c13_0: { searched: false, status: "todo", amount: "", notes: "" },
    c99_9: { searched: true, status: "claimed", amount: "1" },
  }, map);
  assert.deepEqual(out["missingmoney"], { status: "claim_filed", amount: "50", notes: "filed 3/1", ref: "" });
  assert.equal(out["naupa-directory"].status, "searched_none");
  assert.equal(out["irs-refunds"].status, "possible");
  assert.equal(out["usa-benefit-finder"].status, "searched_none");
  assert.equal(out["treasury-savings-bonds"], undefined, "blank records are dropped");
  assert.ok(!Object.values(out).some((r) => r.status === "received"));
});

test("a retired alias never overwrites the current source's data", () => {
  const map = C.buildLegacyMap(R.SOURCES, R.LEGACY_ALIASES);
  const aliasKeys = Object.keys(R.LEGACY_ALIASES);
  const current = { searched: true, status: "claiming", amount: "40", notes: "real" };
  const retired = { searched: true, status: "none", amount: "", notes: "" };
  const a = C.migrateLegacy({ c0_1: current, c3_0: retired }, map, aliasKeys);
  const b = C.migrateLegacy({ c3_0: retired, c0_1: current }, map, aliasKeys);
  assert.equal(a["usa-benefit-finder"].notes, "real");
  assert.equal(b["usa-benefit-finder"].notes, "real");
  const onlyAlias = C.migrateLegacy({ c3_0: retired }, map, aliasKeys);
  assert.equal(onlyAlias["usa-benefit-finder"].status, "searched_none");
});

test("mayApply only flags sources tagged for a selected situation", () => {
  const vet = R.SOURCES.find((s) => s.id === "va-unclaimed-insurance");
  const general = R.SOURCES.find((s) => s.id === "missingmoney");
  assert.equal(C.mayApply(vet, { veteran: true }), true);
  assert.equal(C.mayApply(vet, { student: true }), false);
  assert.equal(C.mayApply(general, { veteran: true }), false);
  assert.equal(C.mayApply(vet, {}), false);
});

test("matchesQuery searches name, description, host, and category", () => {
  const s = R.SOURCES.find((x) => x.id === "il-icash");
  assert.ok(C.matchesQuery(s, "State unclaimed property", "illinois"));
  assert.ok(C.matchesQuery(s, "State unclaimed property", "unclaimed"));
  assert.ok(C.matchesQuery(s, "State unclaimed property", ""));
  assert.ok(!C.matchesQuery(s, "State unclaimed property", "royalt"));
});

test("sanitizeRecords drops unknown statuses and junk", () => {
  const out = C.sanitizeRecords({ a: { status: "hacked", amount: 5, notes: "x" }, b: null, c: "str" });
  assert.deepEqual(out, { a: { status: "todo", amount: "", ref: "", notes: "x" } });
});

test("plain backup round-trips", async () => {
  const state = { records: { rrb: { status: "possible", amount: "12", ref: "", notes: "n" } }, profile: { fedrr: true } };
  const b = await C.makeBackup(state, "");
  assert.equal(b.encrypted, false);
  const back = await C.readBackup(JSON.stringify(b), "");
  assert.deepEqual(back.records, state.records);
  assert.deepEqual(back.profile, state.profile);
});

test("encrypted backup round-trips and rejects a wrong passphrase", async () => {
  const state = { records: { rrb: { status: "received", amount: "99.99", ref: "R1", notes: "" } }, profile: {} };
  const b = await C.makeBackup(state, "correct horse");
  assert.equal(b.encrypted, true);
  assert.ok(!JSON.stringify(b).includes("99.99"), "plaintext must not appear in the encrypted backup");
  const back = await C.readBackup(JSON.stringify(b), "correct horse");
  assert.deepEqual(back.records, state.records);
  await assert.rejects(C.readBackup(JSON.stringify(b), "wrong"), /Wrong passphrase/);
  await assert.rejects(C.readBackup(JSON.stringify(b), ""), /encrypted/);
});

test("readBackup rejects files that aren't backups", async () => {
  await assert.rejects(C.readBackup("not json", ""), /isn't a Find Your Funds backup/);
  await assert.rejects(C.readBackup(JSON.stringify({ hello: 1 }), ""), /isn't a Find Your Funds backup/);
});
