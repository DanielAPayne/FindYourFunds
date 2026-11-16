// Generates find-your-funds-tracker.csv from the source registry.
// `node scripts/build-csv.mjs --check` exits 1 if the committed file is out of date.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const R = require("../src/registry.js");
const OUT = fileURLToPath(new URL("../find-your-funds-tracker.csv", import.meta.url));
const KIND = { owed: "Money that may already be yours", eligibility: "Programs you may qualify for", optional: "Optional ways to earn" };

const esc = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cats = Object.fromEntries(R.CATEGORIES.map((c) => [c.id, c]));
const header = ["Section", "Category", "Source", "Run by", "Free to search", "How you search", "Website", "Link checked",
  "Status", "Amount", "Reference", "Date", "Notes"];
const rows = [header];
for (const c of R.CATEGORIES) {
  for (const s of R.SOURCES.filter((x) => x.cat === c.id)) {
    rows.push([KIND[c.kind], c.title, s.name, R.TYPE_LABELS[s.type], s.free ? "Yes" : "Check site",
      R.ACCESS_LABELS[s.access], s.url, s.checked, "", "", "", "", ""]);
  }
}
const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== csv) { console.error("find-your-funds-tracker.csv is out of date. Run: npm run build:csv"); process.exit(1); }
  console.log("CSV is up to date.");
} else {
  writeFileSync(OUT, csv);
  console.log(`Wrote ${rows.length - 1} sources to find-your-funds-tracker.csv`);
}
