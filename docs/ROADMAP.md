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

## Phase 2: Discovery foundation (not started)

Backend (FastAPI + PostgreSQL), consent management, profiles, connector framework with the
`API / BULK_DATA / USER_AUTHORIZED / ASSISTED / UNAVAILABLE` classification, job processing,
evidence storage, and matching. First integrations: The MLC (public search API and bulk data,
subject to its terms) alongside assisted Illinois and Michigan workflows.

Decisions needed before it starts:

1. **Personal tool or public service.** A public system holding other people's identity and
   financial records carries much heavier security, legal, and compliance obligations
   (SPEC §10), including state finder/asset-recovery laws.
2. **Hosting and spend.** A backend needs paid hosting, a database, encrypted storage, and an
   identity provider. GitHub Pages stays the public front end.
3. **Data-provider permissions.** MLC API terms and any state data access must be confirmed
   before automated use. No CAPTCHA bypassing, credential sharing, or unsupported scraping.

## Phase 3: Recovery workflows (not started)

Eligibility rules, document extraction, claim preparation, approvals, authorized submission,
status tracking.

## Phase 4: Monitoring and coverage (not started)

Scheduled source-aware searches, notifications, payment reconciliation, security hardening.
