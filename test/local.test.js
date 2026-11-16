const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../src/local.js");
const sample = require("./fixtures/local-sample.json"); // real rows, business payees only
const src = (id) => F.LOCAL_SOURCES.find((s) => s.id === id);

test("source definitions are valid", () => {
  assert.deepEqual(F.validateLocalSources(F.LOCAL_SOURCES), []);
  for (const s of F.LOCAL_SOURCES) assert.ok(sample[s.dataset], `fixture missing for ${s.id}`);
});

test("cleanWords keeps letters, digits, & ' . - and drops everything else", () => {
  assert.deepEqual(F.cleanWords("o'brien  smith-jones"), ["O'BRIEN", "SMITH-JONES"]);
  assert.deepEqual(F.cleanWords("x%'); DROP--"), ["X", "DROP"]);
  assert.deepEqual(F.cleanWords("  "), []);
});

test("buildLocalUrl filters server-side on the longest word and escapes quotes", () => {
  const u = new URL(F.buildLocalUrl(src("providence-ri"), { last: "Goldin & Assoc" }));
  assert.equal(u.host, "data.providenceri.gov");
  assert.equal(u.pathname, "/resource/4hhd-fzq6.json");
  assert.equal(u.searchParams.get("$where"), "upper(payee_name) like '%GOLDIN%'");
  const q = new URL(F.buildLocalUrl(src("marin-ca"), { last: "O'Hara" })).searchParams.get("$where");
  assert.equal(q, "upper(vendor_name) like '%HARA%'", "punctuation splits words; longest word filters");
  assert.equal(new URL(F.buildLocalUrl(src("marin-ca"), { last: "Smith-Jones" })).searchParams.get("$where"), "upper(vendor_name) like '%SMITH%'");
  assert.equal(F.soqlString("O'HARA"), "'O''HARA'", "single quotes doubled for SoQL");
  assert.equal(new URL(F.buildLocalUrl(src("austin-tx"), { last: "Windsor" })).searchParams.get("$where"), "upper(last) like '%WINDSOR%'");
  assert.equal(new URL(F.buildLocalUrl(src("austin-tx"), { last: "Example", first: "Jane" })).searchParams.get("$where"),
    "upper(last) like '%EXAMPLE%' AND upper(first) like '%J%'", "first name narrows on the server (by initial)");
  assert.equal(new URL(F.buildLocalUrl(src("roseville-ca"), { last: "Example", first: "Jane" })).searchParams.get("$where"),
    "upper(name) like '%EXAMPLE%' AND upper(name) like '%J%'");
  assert.equal(new URL(F.buildLocalUrl(src("roseville-ca"), { last: "Example" })).searchParams.get("$limit"), String(F.LOCAL_LIMIT));
  assert.equal(F.buildLocalUrl(src("marin-ca"), { last: "x" }), null);
  assert.equal(F.buildLocalUrl(src("marin-ca"), { last: "%%" }), null);
});

test("matchLocal: every last-name word must start a word; first name must start another", () => {
  const p = src("roseville-ca");
  const rec = { name: "EXAMPLE, JANE Q" };
  assert.ok(F.matchLocal(p, rec, { last: "example" }));
  assert.ok(F.matchLocal(p, rec, { last: "example", first: "jane" }));
  assert.ok(F.matchLocal(p, rec, { last: "example", first: "j" }));
  assert.ok(F.matchLocal(p, { name: "EXAMPLE J" }, { last: "example", first: "jane" }), "an initial matches a first name");
  assert.ok(!F.matchLocal(p, rec, { last: "example", first: "john" }));
  assert.ok(!F.matchLocal(p, rec, { last: "ample" }), "middle-of-word matches are rejected");
  assert.ok(!F.matchLocal(p, { name: "EXAMPLE" }, { last: "example", first: "example" }), "first name can't reuse the last-name word");
  assert.ok(F.matchLocal(p, { name: "SMITH JONES, ALEX" }, { last: "Smith-Jones", first: "Alex" }), "hyphenated input matches spaced names");
  assert.ok(F.matchLocal(p, { name: "O'HARA, PAT" }, { last: "O'Hara" }));
});

test("matchLocal composes first + last for sources with separate fields", () => {
  const a = src("austin-tx");
  assert.ok(F.matchLocal(a, { first: "JANE", last: "EXAMPLE" }, { last: "example", first: "jane" }));
  assert.ok(F.matchLocal(a, { last: "1200 WINDSOR LLC" }, { last: "1200 windsor" }));
});

test("localResults normalizes real rows from every source", () => {
  for (const s of F.LOCAL_SOURCES) {
    const rows = sample[s.dataset];
    const word = F.cleanWords((s.name ? rows[0][s.name] : rows[0][s.last]))[0];
    const res = F.localResults(s, rows, { last: word });
    assert.ok(res.length >= 1, `${s.id}: expected a match for ${word}`);
    const r = res[0];
    assert.equal(r.place, s.place);
    if (s.amount) assert.ok(Number.isInteger(r.cents) && r.cents > 0, `${s.id}: amount`);
    else assert.equal(r.cents, null);
    if (s.date) assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
  }
  const prov = F.localResults(src("providence-ri"), sample["4hhd-fzq6"], { last: "goldin" });
  assert.equal(prov[0].location, "PROVIDENCE, RI");
  assert.equal(prov[0].cents, 24720);
});

test("localResults rejects a malformed response", () => {
  assert.throws(() => F.localResults(src("marin-ca"), { error: true }, { last: "x" }), /Unexpected response/);
});
