# Roadmap

The governing document is [SPEC.md](SPEC.md). This file tracks where the work stands.

## Phase 1: Stabilize the existing application

Exit criterion: a trustworthy directory and tracker with a passing test suite.
**Status: complete in v0.3.0**, pending CI on the merge commit.

### P0 (blocking)

| Item | Status | Notes |
|---|---|---|
| Remove Treasury Hunt instructions | Done | Ended Sept 30, 2025 (confirmed on TreasuryDirect). The savings-bond card now points to state programs and TreasuryDirect's lost-bond process. A registry test fails if it returns. |
| Replace Benefits.gov with USA.gov Benefit Finder | Done | Old Benefits.gov tracking migrates to the Benefit Finder card without overwriting real data. |
| Correct "government sources only" | Done | Every card shows who runs the site: Government, Official partner, Nonprofit, or Commercial. |
| Separate verified and unverified balances | Done | Four buckets: possible matches, claims filed, approved but unpaid, payments received. Amounts count only in their status's bucket. |
| Stable source identifiers | Done | Records are keyed by slug ids. v2 positional data (`c<group>_<index>`) migrates automatically and conservatively; nothing becomes "received". |
| Confirm and export before Reset | Done | "Clear all" opens an in-page confirmation with "Download a backup first". |
| Remove unsupported guarantees | Done | Free/safety/eligibility copy rewritten; fees for court, estate, and tax processes are disclosed. |

### P1 (needed for a reliable launch)

| Item | Status | Notes |
|---|---|---|
| Direct Illinois, Michigan, and other state searches | Done for IL, MI, CA | Other states via the NAUPA directory. More direct entries can be added to `src/registry.js`. |
| Source health and last-verified timestamps | Done | Each card shows its link-checked date. `npm run check-links` runs weekly in GitHub Actions and fails on definite breakage. Per-source owner and review interval are not yet tracked. |
| Search/status inconsistency | Done | One status field is the single source of truth; the separate checkbox is gone. |
| Currency parsing and totals | Done | Negatives, parentheses, commas, and cents are parsed into integer cents. Invalid input is flagged, not guessed. A reference number on two sources is counted once. |
| Distinguish eligibility from a possible match | Done | "May apply to you" replaces "For you"; copy states tags never decide eligibility. |
| Encrypted export/import | Done | AES-GCM with a PBKDF2-derived key. Authenticated sync needs a backend (Phase 2). |
| Remove dead filter logic, add tests | Done | 18 unit tests in `test/`, run in CI on every push and pull request. |

### P2

| Item | Status |
|---|---|
| Accessibility | Partial: labelled inputs, live regions for totals and errors, visible focus, reduced motion. A full audit (screen reader pass, contrast check in both themes) is still open. |
| Mobile forms | Done: verified at 375px with no horizontal scroll; ledger stops being sticky on phones. |
| Search and filtering | Done: text search across sources plus the tag filter. |
| Fonts and privacy disclosures | Done: system fonts only, so the page makes no third-party requests on load. |

## Decision: free public use, no stored personal data (Nov 16, 2026)

The goal is free public use. Rather than the spec's account-based backend (SPEC §7), which would
mean paying indefinitely to hold strangers' identity and financial records and carrying the
obligations in SPEC §10, the public service works like this:

- **No accounts and no server-side personal data.** Tracking stays in the visitor's browser.
- **Discovery runs in the browser** against official data that the project republishes as
  static files. Visitors download a dataset slice and search it on their own device, so
  what they type is never sent to us or anyone else.
- **Keys stay out of the page.** Where a data provider requires an API key, a scheduled GitHub
  Action holds it as a repository secret and publishes the processed data with the site.
- **Hosting stays free** (GitHub Pages and Actions).

Sources whose data isn't published in a form we're allowed to reuse stay `ASSISTED`. The spec's
claim-preparation and account features would need a backend and are deferred until there is a
way to fund and govern one.

### Source research (Nov 16, 2026)

| Source | Finding | Classification |
|---|---|---|
| DOL Wage and Hour enforcement data | Every concluded case since FY2005 with employer, back wages, and workers owed. Public domain, updated quarterly, via DOL's Open Data API with a free key. | `BULK_DATA`, built |
| State unclaimed property | No state found that publishes its owner list as open data (Texas requires an emailed request). Official sites block automated searches. | `ASSISTED` |
| City and county unclaimed funds | Some local registers are open data (for example Austin, TX on Socrata). | Candidate for `BULK_DATA` |
| The MLC | Public Search API is in beta and requires an access application; governed by the Musical Works Database Terms of Use. | Pending your application |
| FDIC failed banks | Public, keyless API (api.fdic.gov), 4,117 failures and assistance transactions since 1934, with how each was resolved. | `BULK_DATA`, built |

## Phase 2: Discovery foundation (in progress)

| Item | Status |
|---|---|
| Back-wage lead finder (DOL WHD) | Live since Nov 16, 2026: 208,500 cases with back wages from 370,964 DOL records. Monthly refresh; DOL rate-limits, so a full download takes about 30 minutes. |
| Failed-bank check (FDIC) | Built. Explains each resolution type in plain language and flags the ones where unclaimed money is plausible (payouts, insured-deposit transfers, insured-only assumptions). Monthly refresh, no key. |
| Data pipelines | `scripts/build-whd.mjs` and `scripts/build-fdic.mjs` with monthly workflows. Both refuse to publish if fields change or data comes back short, and leave files untouched when nothing changed. |
| Guards against test data | Tests fail if published data looks like a sample fixture. |
| Local funds (Socrata) | Not started |
| The MLC | Blocked on an access application |

## Phase 3: Recovery workflows (not started)

Eligibility rules, document extraction, claim preparation, approvals, authorized submission,
status tracking.

## Phase 4: Monitoring and coverage (not started)

Scheduled source-aware searches, notifications, payment reconciliation, security hardening.
