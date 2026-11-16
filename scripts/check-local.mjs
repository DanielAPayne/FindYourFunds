// Confirms each city/county source still works the way the app expects:
// the dataset exists, has every field we query, answers a sample query,
// and was updated recently. Exits 1 if any source is broken; stale lists are warnings.
import { createRequire } from "node:module";
import { appendFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const F = require("../src/local.js");
const UA = "Mozilla/5.0 (compatible; FindYourFunds-check/1.0; +https://github.com/DanielAPayne/FindYourFunds)";
const STALE_DAYS = 400;

async function getJson(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const rows = [];
for (const s of F.LOCAL_SOURCES) {
  const r = { id: s.id, place: `${s.place}, ${s.state}`, result: "ok", note: "" };
  try {
    const meta = await getJson(`https://${s.domain}/api/views/${s.dataset}.json`);
    const have = new Set((meta.columns || []).map((c) => c.fieldName));
    const need = [s.name, s.first, s.last, s.amount, s.date, s.city, s.st].filter(Boolean);
    const missing = need.filter((f) => !have.has(f));
    if (missing.length) throw new Error(`missing fields: ${missing.join(", ")}`);
    const sample = await getJson(F.buildLocalUrl(s, { last: "LLC" }));
    if (!Array.isArray(sample)) throw new Error("sample query didn't return a list");
    const updated = meta.rowsUpdatedAt ? new Date(meta.rowsUpdatedAt * 1000) : null;
    const age = updated ? Math.round((Date.now() - updated) / 86400000) : null;
    r.note = updated ? `rows updated ${updated.toISOString().slice(0, 10)} (${age} days ago)` : "update date not published";
    if (age !== null && age > STALE_DAYS) r.result = "stale";
  } catch (e) {
    r.result = "broken";
    r.note = e.message;
  }
  rows.push(r);
  console.log(`${r.result.padEnd(7)} ${r.id.padEnd(14)} ${r.note}`);
}

const broken = rows.filter((r) => r.result === "broken");
const stale = rows.filter((r) => r.result === "stale");
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ["## City and county sources", "", "| Result | Source | Detail |", "|---|---|---|", ...rows.map((r) => `| ${r.result} | ${r.place} | ${r.note} |`), ""];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
}
console.log(`\n${rows.length} sources: ${rows.length - broken.length - stale.length} ok, ${stale.length} stale, ${broken.length} broken`);
process.exit(broken.length ? 1 : 0);
