// Checks that every source URL still loads.
//   ok           2xx/3xx
//   unconfirmed  the site refused or stalled an automated request (401/403/405/429, 5xx, timeout),
//                so the link can't be confirmed either way; many agency sites do this to bots
//   broken       404/410, other 4xx, unknown domain, or refused connection
// Exits 1 only when a link is definitely broken. Writes a Markdown table to the GitHub job summary.
import { createRequire } from "node:module";
import { appendFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { SOURCES } = require("../src/registry.js");
const UA = "Mozilla/5.0 (compatible; FindYourFunds-linkcheck/1.0; +https://github.com/DanielAPayne/FindYourFunds)";

async function check(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { "user-agent": UA, accept: "text/html" } });
    res.body?.cancel().catch(() => {});
    const code = res.status;
    if (code < 400) return { code, result: "ok" };
    if ([401, 403, 405, 429].includes(code) || code >= 500) return { code, result: "unconfirmed" };
    return { code, result: "broken" };
  } catch (e) {
    if (e.name === "AbortError") return { code: "timeout", result: "unconfirmed" };
    const cause = (e.cause && e.cause.code) || "error";
    const definite = ["ENOTFOUND", "ECONNREFUSED", "ERR_INVALID_URL", "CERT_HAS_EXPIRED"].includes(cause);
    return { code: cause, result: definite ? "broken" : "unconfirmed" };
  } finally {
    clearTimeout(timer);
  }
}

// One request at a time per host (some agency sites rate-limit), hosts in parallel,
// and one retry after a pause for anything that doesn't come back ok.
const unique = [...new Set(SOURCES.map((s) => s.url))];
const byHost = new Map();
for (const u of unique) { const h = new URL(u).host; if (!byHost.has(h)) byHost.set(h, []); byHost.get(h).push(u); }
const results = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await Promise.all([...byHost.values()].map(async (urls) => {
  for (const u of urls) {
    let r = await check(u);
    if (r.result !== "ok") { await sleep(3000); r = await check(u); }
    results.set(u, r);
  }
}));

const rows = SOURCES.map((s) => ({ id: s.id, url: s.url, ...results.get(s.url) }));
const broken = rows.filter((r) => r.result === "broken");
const unconfirmed = rows.filter((r) => r.result === "unconfirmed");
const okCount = rows.length - broken.length - unconfirmed.length;
for (const r of rows) console.log(`${r.result.padEnd(12)} ${String(r.code).padEnd(10)} ${r.id}  ${r.url}`);
console.log(`\n${rows.length} sources: ${okCount} ok, ${unconfirmed.length} unconfirmed, ${broken.length} broken`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ["## Source link check", "", `${okCount} ok · ${unconfirmed.length} unconfirmed (site refused or stalled an automated check) · ${broken.length} broken`, ""];
  const list = [...broken, ...unconfirmed];
  if (list.length) {
    md.push("| Result | Code | Source | URL |", "|---|---|---|---|");
    for (const r of list) md.push(`| ${r.result} | ${r.code} | ${r.id} | ${r.url} |`);
  }
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n") + "\n");
}
process.exit(broken.length ? 1 : 0);
