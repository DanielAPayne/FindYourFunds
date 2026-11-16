// Builds the failed-bank list from the FDIC's public BankFind "failures" API (no key needed).
//
//   node scripts/build-fdic.mjs                       fetch from the FDIC
//   node scripts/build-fdic.mjs --from-file raw.json  build from a saved API response (testing)
//   node scripts/build-fdic.mjs --out <file>          output path (default: data/fdic/failures.json)
//
// Refuses to publish if the FDIC's fields change, the record count doesn't match the
// API's own total, or the list is implausibly short.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const L = require("../src/leads.js");

const FIELDS = "CERT,NAME,CITY,PSTALP,FAILDATE,RESTYPE,RESTYPE1,BIDNAME,BIDCITY,BIDSTATE";
const API = `https://api.fdic.gov/banks/failures?fields=${FIELDS}&limit=10000&sort_by=FAILDATE&sort_order=DESC`;
const MIN_RECORDS = 3000;

function arg(name) { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; }
const out = arg("--out") || fileURLToPath(new URL("../data/fdic/failures.json", import.meta.url));
const fromFile = arg("--from-file");

let body;
if (fromFile) {
  body = JSON.parse(readFileSync(fromFile, "utf8"));
} else {
  let res;
  for (let attempt = 1; attempt <= 5; attempt++) {
    res = await fetch(API, { headers: { accept: "application/json" }, redirect: "follow" });
    if (res.ok) break;
    if (attempt === 5) throw new Error(`FDIC API error HTTP ${res.status}`);
    const wait = Math.min(15000 * 2 ** (attempt - 1), 120000);
    console.log(`HTTP ${res.status}; waiting ${wait / 1000}s (attempt ${attempt}/5)`);
    await new Promise((r) => setTimeout(r, wait));
  }
  body = await res.json();
  const total = body && body.totals && body.totals.count;
  const got = Array.isArray(body && body.data) ? body.data.length : 0;
  if (total !== got) throw new Error(`FDIC reported ${total} records but returned ${got}; not publishing a partial list.`);
  if (got < MIN_RECORDS) throw new Error(`Only ${got} records returned; expected at least ${MIN_RECORDS}.`);
}

const recordsRead = Array.isArray(body) ? body.length : body.data.length;
const rows = L.buildFdicRows(body);
try {
  const old = JSON.parse(readFileSync(out, "utf8"));
  if (old.status !== "not_built" && JSON.stringify(old.rows) === JSON.stringify(rows)) {
    console.log(`No change: ${rows.length} banks, same as the published file. Leaving it untouched.`);
    process.exit(0);
  }
} catch (e) { /* no previous file */ }
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({
  format: "fyf-fdic-failures", version: 1, generated: new Date().toISOString(),
  source: { name: "FDIC BankFind Suite: bank failures and assistance transactions", url: "https://banks.data.fdic.gov/bankfind-suite/failures",
    records_read: recordsRead, dropped: recordsRead - rows.length },
  columns: L.FDIC_COLUMNS, rows,
}));
console.log(`wrote ${rows.length} failed or assisted banks to ${out}`);
