const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../src/local.js");
const sample = require("./fixtures/local-sample.json"); // real responses, business payees only
const src = (id) => F.LOCAL_SOURCES.find((s) => s.id === id);

// Which fixture holds each source's real response.
const FIXTURE = {
  "providence-ri": "4hhd-fzq6", "ramsey-mn": "ea8s-irrm", "marin-ca": "er4x-svwp", "sonoma-ca": "7zt2-w5w6",
  "roseville-ca": "vtyn-52t8", "austin-tx": "h3i4-5e5v", "sacramento-ucf": "sac-ucf", "sacramento-warrants": "sac-warrants",
  "raleigh-nc": "raleigh", "madison-wi": "madison-csv",
};

test("source definitions are valid and every source has a real fixture", () => {
  assert.deepEqual(F.validateLocalSources(F.LOCAL_SOURCES), []);
  for (const s of F.LOCAL_SOURCES) assert.ok(sample[FIXTURE[s.id]], `fixture missing for ${s.id}`);
  assert.deepEqual(F.validateLocalSources([{ id: "x", platform: "ftp", names: ["n"], claim: "c", claimUrl: "https://a" }]), ["x: unknown platform ftp"]);
});

test("cleanWords keeps letters, digits, & ' . - and drops everything else", () => {
  assert.deepEqual(F.cleanWords("o'brien  smith-jones"), ["O'BRIEN", "SMITH-JONES"]);
  assert.deepEqual(F.cleanWords("x%'); DROP--"), ["X", "DROP"]);
  assert.deepEqual(F.cleanWords("  "), []);
  assert.equal(F.sqlString("O'HARA"), "'O''HARA'", "single quotes doubled");
});

test("Socrata URLs filter on the longest word, plus first initial", () => {
  const u = new URL(F.buildLocalUrl(src("providence-ri"), { last: "Goldin & Assoc" }));
  assert.equal(u.host, "data.providenceri.gov");
  assert.equal(u.pathname, "/resource/4hhd-fzq6.json");
  assert.equal(u.searchParams.get("$where"), "upper(payee_name) like '%GOLDIN%'");
  assert.equal(new URL(F.buildLocalUrl(src("marin-ca"), { last: "O'Hara" })).searchParams.get("$where"), "upper(vendor_name) like '%HARA%'");
  assert.equal(new URL(F.buildLocalUrl(src("austin-tx"), { last: "Example", first: "Jane" })).searchParams.get("$where"),
    "upper(last) like '%EXAMPLE%' AND upper(first) like '%J%'");
  assert.equal(new URL(F.buildLocalUrl(src("roseville-ca"), { last: "Example" })).searchParams.get("$limit"), String(F.LOCAL_LIMIT));
  assert.equal(F.buildLocalUrl(src("marin-ca"), { last: "x" }), null);
  assert.equal(F.buildLocalUrl(src("marin-ca"), { last: "%%" }), null);
});

test("ArcGIS URLs search every name field and ask for no geometry", () => {
  const u = new URL(F.buildLocalUrl(src("sacramento-warrants"), { last: "Example", first: "Jane" }));
  assert.match(u.pathname, /\/FeatureServer\/0\/query$/);
  assert.equal(u.searchParams.get("where"),
    "(UPPER(Name_of_the_payee) LIKE '%EXAMPLE%' OR UPPER(Additional_Payee_Name) LIKE '%EXAMPLE%') AND (UPPER(Name_of_the_payee) LIKE '%J%' OR UPPER(Additional_Payee_Name) LIKE '%J%')");
  assert.equal(u.searchParams.get("returnGeometry"), "false");
  assert.equal(u.searchParams.get("f"), "json");
  assert.match(u.searchParams.get("outFields"), /Warrant__/);
});

test("CSV sources fetch the whole file and filter in the browser", () => {
  assert.equal(F.buildLocalUrl(src("madison-wi"), { last: "Marios" }), src("madison-wi").csvUrl);
  assert.equal(F.buildLocalUrl(src("madison-wi"), { last: "x" }), null);
});

test("parseCsv handles quoted commas, doubled quotes, CRLF, and a BOM", () => {
  const rows = F.parseCsv('﻿Name,Amount\r\n"201 MARBELLA, LLC",503.25\r\n"SAY ""HI"" INC",1\nPLAIN LLC,2\r\n');
  assert.deepEqual(rows, [
    { Name: "201 MARBELLA, LLC", Amount: "503.25" },
    { Name: 'SAY "HI" INC', Amount: "1" },
    { Name: "PLAIN LLC", Amount: "2" },
  ]);
  assert.deepEqual(F.parseCsv(""), []);
});

test("parseLocalResponse catches ArcGIS errors hidden in a normal response", () => {
  assert.throws(() => F.parseLocalResponse(src("raleigh-nc"), { error: { code: 400, message: "Invalid query" } }), /Invalid query/);
  assert.throws(() => F.parseLocalResponse(src("raleigh-nc"), {}), /Unexpected response/);
  assert.throws(() => F.parseLocalResponse(src("marin-ca"), { error: true }), /Unexpected response/);
  assert.throws(() => F.parseLocalResponse(src("madison-wi"), {}), /Unexpected response/);
  const r = F.parseLocalResponse(src("raleigh-nc"), sample.raleigh);
  assert.equal(r.truncated, true, "exceededTransferLimit marks the list as cut off");
  assert.equal(r.rows.length, 3);
});

test("toDate reads ISO strings, ArcGIS epoch milliseconds, and MM/DD/YYYY", () => {
  assert.equal(F.toDate("2026-03-10T00:00:00.000"), "2026-03-10");
  assert.equal(F.toDate(1720526400000), "2024-07-09");
  assert.equal(F.toDate("01/25/2024"), "2024-01-25");
  assert.equal(F.toDate(""), "");
  assert.equal(F.toDate("soon"), "");
});

test("matchLocal: word-prefix rule, first names, and any of several name fields", () => {
  const p = src("roseville-ca");
  const rec = { name: "EXAMPLE, JANE Q" };
  assert.ok(F.matchLocal(p, rec, { last: "example" }));
  assert.ok(F.matchLocal(p, rec, { last: "example", first: "jane" }));
  assert.ok(F.matchLocal(p, { name: "EXAMPLE J" }, { last: "example", first: "jane" }), "an initial matches");
  assert.ok(!F.matchLocal(p, rec, { last: "example", first: "john" }));
  assert.ok(!F.matchLocal(p, rec, { last: "ample" }), "middle-of-word matches are rejected");
  assert.ok(!F.matchLocal(p, { name: "EXAMPLE" }, { last: "example", first: "example" }));
  assert.ok(F.matchLocal(p, { name: "SMITH JONES, ALEX" }, { last: "Smith-Jones", first: "Alex" }));
  const w = src("sacramento-warrants");
  assert.ok(F.matchLocal(w, { Name_of_the_payee: "ACME TRUST", Additional_Payee_Name: "EXAMPLE, JANE" }, { last: "example", first: "jane" }));
  assert.ok(!F.matchLocal(w, { Name_of_the_payee: "JANE TRUST", Additional_Payee_Name: "EXAMPLE CO" }, { last: "example", first: "jane" }),
    "first and last must match within the same payee name");
  const a = src("austin-tx");
  assert.ok(F.matchLocal(a, { first: "JANE", last: "EXAMPLE" }, { last: "example", first: "jane" }));
});

test("localResults normalizes real responses from every source", () => {
  for (const s of F.LOCAL_SOURCES) {
    const { rows } = F.parseLocalResponse(s, sample[FIXTURE[s.id]]);
    const firstName = F.recordNames(s, rows[0])[0];
    const word = F.cleanWords(firstName).find((x) => x.length >= 3);
    const res = F.localResults(s, rows, { last: word });
    assert.ok(res.length >= 1, `${s.id}: expected a match for ${word}`);
    const r = res[0];
    assert.equal(r.place, s.place);
    if (s.amount) assert.ok(Number.isInteger(r.cents) && r.cents > 0, `${s.id}: amount`);
    else assert.equal(r.cents, null);
    if (s.date) assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, `${s.id}: date`);
  }
  const prov = F.localResults(src("providence-ri"), sample["4hhd-fzq6"], { last: "goldin" });
  assert.deepEqual([prov[0].location, prov[0].cents], ["PROVIDENCE, RI", 24720]);
  const mad = F.localResults(src("madison-wi"), F.parseCsv(sample["madison-csv"]), { last: "marbella" });
  assert.deepEqual([mad[0].name, mad[0].cents, mad[0].date, mad[0].location], ["201 MARBELLA, LLC", 50325, "2024-05-23", "MADISON, WI"]);
  const ucf = F.localResults(src("sacramento-ucf"), F.parseLocalResponse(src("sacramento-ucf"), sample["sac-ucf"]).rows, { last: "clear wireless" });
  assert.ok(ucf[0].ref, "reference number kept");
  assert.deepEqual(ucf[0].extras.map((e) => e.label), ["Held by", "Ask"]);
});
