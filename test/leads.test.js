const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../src/leads.js");
const sample = require("./fixtures/whd-sample.json");

test("normalizeEmployer drops legal suffixes and punctuation, keeps real words", () => {
  assert.equal(L.normalizeEmployer("ACME FOODS INC."), "acme foods");
  assert.equal(L.normalizeEmployer("Acme Restaurant Group, LLC"), "acme restaurant group");
  assert.equal(L.normalizeEmployer("Bob's Tire & Auto"), "bobs tire and auto");
  assert.equal(L.normalizeEmployer("The Company"), "the company", "a name made only of suffixes is kept whole");
  assert.equal(L.normalizeEmployer(""), "");
});

test("checkWhdFields accepts DOL field names and reports what's missing", () => {
  const found = L.checkWhdFields(sample);
  assert.equal(found.back_wages, "bw_atp_amt");
  assert.equal(found.state, "st_cd");
  assert.throws(() => L.checkWhdFields([{ id: 1, name: "x" }]), /missing expected fields: case_id.*Fields present: id, name/);
});

test("buildWhdShards keeps only cases with back wages, by U.S. state, newest first", () => {
  const shards = L.buildWhdShards(sample);
  assert.deepEqual(Object.keys(shards).sort(), ["IL", "MI"]);
  assert.equal(shards.MI.length, 1, "zero-back-wage case dropped");
  assert.equal(shards.IL.length, 3);
  assert.equal(shards.IL[0][0], "1005", "most recent findings first");
  const bob = L.rowToCase(shards.MI[0]);
  assert.equal(bob.back_wages_cents, 340000);
  assert.equal(bob.zip, "48201");
  assert.equal(bob.employees, 5);
  assert.deepEqual(shards.IL.map((r) => r[0]), ["1005", "1001", "1002"]);
  assert.equal(L.rowToCase(shards.IL[1]).zip, "60601", "ZIP+4 trimmed to 5 digits");
});

test("buildWhdShards blanks impossible dates so typos don't sort as newest", () => {
  const base = { case_id: "9", legal_name: "Typo Co", st_cd: "OH", bw_atp_amt: "10" };
  const shards = L.buildWhdShards([
    { ...base, case_id: "a", findings_start_date: "0200-10-30", findings_end_date: "3021-05-01" },
    { ...base, case_id: "b", findings_start_date: "1900-01-07", findings_end_date: "2027-06-30" },
    { ...base, case_id: "c", findings_start_date: "2020-01-01", findings_end_date: "2021-01-01" },
  ], { maxYear: 2027 });
  const byId = Object.fromEntries(shards.OH.map((r) => [r[0], r]));
  assert.deepEqual([byId.a[5], byId.a[6]], ["", ""]);
  assert.deepEqual([byId.b[5], byId.b[6]], ["", "2027-06-30"]);
  assert.equal(shards.OH[shards.OH.length - 1][0], "a", "undated case sorts last");
});

test("searchEmployer matches legal or trade names by word prefix", () => {
  const { IL, MI } = L.buildWhdShards(sample);
  assert.deepEqual(L.searchEmployer(IL, "acme").map((c) => c.case_id).sort(), ["1001", "1002", "1005"]);
  assert.deepEqual(L.searchEmployer(IL, "acme diner").map((c) => c.case_id).sort(), ["1001", "1005"]);
  assert.deepEqual(L.searchEmployer(IL, "acme foods inc").map((c) => c.case_id), ["1002"]);
  assert.deepEqual(L.searchEmployer(MI, "bob's tire").map((c) => c.case_id), ["1003"]);
  assert.deepEqual(L.searchEmployer(MI, "robert smith").map((c) => c.case_id), ["1003"]);
  assert.deepEqual(L.searchEmployer(IL, "nonexistent"), []);
  assert.deepEqual(L.searchEmployer(IL, "a"), [], "one-letter queries return nothing");
});

test("searchEmployer ranks exact names first and can narrow by city", () => {
  const { IL } = L.buildWhdShards(sample);
  const r = L.searchEmployer(IL, "acme foods");
  assert.equal(r[0].case_id, "1002");
  assert.equal(r[0].score, 3);
  assert.deepEqual(L.searchEmployer(IL, "acme", { city: "chicago" }).map((c) => c.case_id).sort(), ["1001", "1005"]);
});

test("published back-wage data, if present, came from a real DOL download", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const idxPath = path.join(__dirname, "..", "data", "whd", "index.json");
  if (!fs.existsSync(idxPath)) return; // not built yet: the page shows the "not available yet" state
  const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
  assert.equal(idx.format, "fyf-whd-index");
  if (idx.status === "not_built") {
    assert.deepEqual(idx.states, {}, "placeholder index must not list states");
    assert.deepEqual(fs.readdirSync(path.dirname(idxPath)), ["index.json"], "placeholder must have no state files");
    return;
  }
  assert.ok(idx.source.records_read > 10000, "index looks like test data, not a real DOL download");
  for (const [st, info] of Object.entries(idx.states)) {
    const shard = L.parseShard(JSON.parse(fs.readFileSync(path.join(path.dirname(idxPath), info.file), "utf8")));
    assert.equal(shard.state, st);
    assert.equal(shard.rows.length, info.cases);
    assert.ok(!shard.rows.some((r) => ["1001", "1002", "1003", "1005"].includes(r[0]) && r[1].startsWith("Acme")), "fixture rows leaked into published data");
  }
});

test("parseShard rejects damaged or mismatched files", () => {
  const good = { format: "fyf-whd-shard", version: 1, columns: L.WHD_COLUMNS, rows: [] };
  assert.equal(L.parseShard(good), good);
  assert.throws(() => L.parseShard(null), /missing or damaged/);
  assert.throws(() => L.parseShard({ ...good, columns: ["x"] }), /unexpected layout/);
});
