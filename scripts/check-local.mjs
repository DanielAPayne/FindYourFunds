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
    const need = F.selectFields(s);
    let have, updated = null;
    if (s.platform === "socrata") {
      const meta = await getJson(`https://${s.domain}/api/views/${s.dataset}.json`);
      have = new Set((meta.columns || []).map((c) => c.fieldName));
      if (meta.rowsUpdatedAt) updated = new Date(meta.rowsUpdatedAt * 1000);
    } else if (s.platform === "arcgis") {
      const meta = await getJson(`${s.layer}?f=json`);
      if (meta.error) throw new Error(meta.error.message || "layer error");
      have = new Set((meta.fields || []).map((f) => f.name));
      const edit = meta.editingInfo && (meta.editingInfo.dataLastEditDate || meta.editingInfo.lastEditDate);
      if (edit) updated = new Date(edit);
    } else {
      const res = await fetch(s.csvUrl, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rowsCsv = F.parseCsv(await res.text());
      if (!rowsCsv.length) throw new Error("CSV is empty");
      have = new Set(Object.keys(rowsCsv[0]));
      const item = await getJson(`https://www.arcgis.com/sharing/rest/content/items/${s.itemId}?f=json`);
      if (item.modified) updated = new Date(item.modified);
    }
    const missing = need.filter((f) => !have.has(f));
    if (missing.length) throw new Error(`missing fields: ${missing.join(", ")}`);
    if (s.platform !== "csv") {
      const body = await getJson(F.buildLocalUrl(s, { last: "LLC" }));
      F.parseLocalResponse(s, body); // throws on an error response
    }
    const age = updated ? Math.round((Date.now() - updated) / 86400000) : null;
    r.note = updated ? `rows updated ${updated.toISOString().slice(0, 10)} (${age} days ago)` : "update date not published";
    if (age !== null && age > STALE_DAYS) r.result = "stale";
  } catch (e) {
    r.result = "broken";
    r.note = e.message;
  }
  rows.push(r);
  console.log(`${r.result.padEnd(7)} ${r.id.padEnd(20)} ${r.note}`);
}

const broken = rows.filter((r) => r.result === "broken");
const stale = rows.filter((r) => r.result === "stale");
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ["## City and county sources", "", "| Result | Source | Detail |", "|---|---|---|", ...rows.map((r) => `| ${r.result} | ${r.place} | ${r.note} |`), ""];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
}
console.log(`\n${rows.length} sources: ${rows.length - broken.length - stale.length} ok, ${stale.length} stale, ${broken.length} broken`);
process.exit(broken.length ? 1 : 0);
