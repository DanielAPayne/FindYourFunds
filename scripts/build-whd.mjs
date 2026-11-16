// Builds the back-wage lead index from DOL Wage and Hour "Enforcement" data.
//
//   DOL_API_KEY=... node scripts/build-whd.mjs            fetch from DOL's Open Data API
//   node scripts/build-whd.mjs --from-file raw.json       build from a saved JSON array (testing)
//   node scripts/build-whd.mjs --out <dir>                output directory (default: data/whd)
//
// Output: <out>/index.json and one <out>/<STATE>.json per state. Only cases with
// back wages owed are kept, and only the fields the lead finder shows.
// Fails if DOL's data is missing the fields we rely on, rather than publishing a broken index.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const L = require("../src/leads.js");

const API = "https://apiprod.dol.gov/v4/get/WHD/enforcement/json";
const DATASET_PAGE = "https://dataportal.dol.gov/";
const PAGE = 10000;
const MAX_PAGES = 200;

function arg(name) { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; }
const outDir = arg("--out") || fileURLToPath(new URL("../data/whd", import.meta.url));
const fromFile = arg("--from-file");

async function fetchPage(key, offset, withFields) {
  const p = new URLSearchParams({ "X-API-KEY": key, limit: String(PAGE), offset: String(offset) });
  if (withFields) p.set("fields", Object.values(L.WHD_SOURCE_FIELDS).map((n) => n[0]).join(","));
  const MAX_ATTEMPTS = 8;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${API}?${p}`, { headers: { "X-API-KEY": key, accept: "application/json" } });
    if (res.status === 401 || res.status === 403) throw new Error(`DOL API refused the key (HTTP ${res.status}). Check the DOL_API_KEY secret.`);
    if (res.status === 400 && withFields) return null; // field list not accepted; caller retries without it
    if (res.ok) {
      const body = await res.json();
      const rows = Array.isArray(body) ? body : body.data;
      if (!Array.isArray(rows)) throw new Error(`Unexpected DOL API response shape: ${JSON.stringify(body).slice(0, 200)}`);
      return rows;
    }
    if (attempt === MAX_ATTEMPTS) throw new Error(`DOL API error HTTP ${res.status} at offset ${offset} after ${MAX_ATTEMPTS} attempts`);
    // Rate limited or a transient error: honor Retry-After, else back off 30s, 60s, 120s... (capped at 5 min).
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter, 600) * 1000
      : Math.min(30000 * 2 ** (attempt - 1), 300000);
    console.log(`HTTP ${res.status} at offset ${offset}; waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})`);
    await sleep(waitMs);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSE_BETWEEN_PAGES_MS = 6000; // stay under DOL's per-minute limit

async function fetchAll(key) {
  let withFields = true;
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let rows = await fetchPage(key, all.length, withFields);
    if (rows === null) { withFields = false; rows = await fetchPage(key, all.length, false); }
    if (page === 0) L.checkWhdFields(rows);
    all.push(...rows);
    console.log(`fetched ${all.length}`);
    if (rows.length < PAGE) break;
    await sleep(PAUSE_BETWEEN_PAGES_MS);
  }
  console.log(`fetched ${all.length} records`);
  return all;
}

let records;
if (fromFile) {
  records = JSON.parse(readFileSync(fromFile, "utf8"));
} else {
  const key = process.env.DOL_API_KEY;
  if (!key) { console.error("DOL_API_KEY is not set."); process.exit(2); }
  records = await fetchAll(key);
}
if (!records.length) { console.error("No records returned; not publishing an empty index."); process.exit(1); }
L.checkWhdFields(records);

const shards = L.buildWhdShards(records);
const generated = new Date().toISOString();
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith(".json")) unlinkSync(join(outDir, f));

const states = {};
let total = 0;
for (const [st, rows] of Object.entries(shards).sort()) {
  const file = `${st}.json`;
  const body = JSON.stringify({ format: "fyf-whd-shard", version: 1, state: st, generated, columns: L.WHD_COLUMNS, rows });
  writeFileSync(join(outDir, file), body);
  states[st] = { file, cases: rows.length, bytes: Buffer.byteLength(body) };
  total += rows.length;
}
writeFileSync(join(outDir, "index.json"), JSON.stringify({
  format: "fyf-whd-index", version: 1, generated,
  source: { name: "U.S. Department of Labor, Wage and Hour Division: Enforcement data", url: DATASET_PAGE, records_read: records.length },
  total_cases: total, states,
}, null, 2) + "\n");
console.log(`wrote ${Object.keys(states).length} state files, ${total} cases with back wages, to ${outDir}`);
