# Find Your Funds — Complete Development Specification

Repository: DanielAPayne/FindYourFunds · November 16, 2026

Progress against this specification is tracked in [ROADMAP.md](ROADMAP.md).

## 1. What needs to change

Find Your Funds must evolve from a directory of places to search into an automated financial discovery, verification, and recovery platform.

The system should have five core capabilities:

1. **Discover:** Search authorized databases and records for possible funds owed to an individual or business.
2. **Verify:** Determine whether a result belongs to the claimant, whether it remains available, and what evidence is needed.
3. **Recover:** Prepare claims, complete authorized submissions where supported, and guide the user through required identity checks.
4. **Monitor:** Recheck sources for new opportunities, pending claims, deadlines, and payments.
5. **Reconcile:** Confirm actual payments received, eliminate duplicates, and maintain an auditable financial ledger.

The ideal user experience is straightforward: establish a verified profile once, authorize searches, and receive a prioritized list of actionable opportunities instead of dozens of websites to investigate manually.

### Target system architecture

- **User identity and authorization:** names, prior locations, employment, owned works, eligibility facts
- **Source connectors:** official APIs, approved feeds, databases
- **Evidence ingestion:** statements, royalty reports, contracts
- **Discovery engine:** scheduled searches and opportunity detection
- **Matching engine:** identity, ownership, eligibility, duplicates
- **Verified opportunity and claim ledger:** source evidence, amount, confidence, deadline, claim status
- **Claim preparation → Authorized submission → Payment confirmation**

One fundamental constraint shapes the architecture: there is no universal government database or API that can automatically identify and recover every form of unclaimed money. Agencies maintain separate records, search rules, verification procedures, and payment systems. The U.S. Treasury explicitly confirms this fragmentation.

Consequently, the system must automate what is technically and legally accessible, and provide reliable assisted workflows for everything else.

## 2. Existing application: required corrections

These changes should precede the development of new features.

| Priority | Required change | Reason |
|---|---|---|
| P0 | Remove discontinued Treasury Hunt search instructions | Treasury Hunt ended September 30, 2025; redirect users to state unclaimed-property programs |
| P0 | Replace Benefits.gov with USA.gov Benefit Finder | Benefits.gov was retired in 2024 |
| P0 | Correct "government sources only" language | The directory includes commercial websites |
| P0 | Change "$ found" to separate verified and unverified balances | The current total counts any entered amount |
| P0 | Replace positional source identifiers | Adding or reordering resources can misassociate stored records |
| P0 | Add confirmation and export before Reset | Current Reset clears all tracking data immediately |
| P0 | Remove unsupported guarantees about safety, refunds, and eligibility | Such claims require source-specific verification |
| P1 | Add direct Illinois, Michigan, and other state-specific searches | Generic directory links create unnecessary manual work |
| P1 | Establish source health and last-verified timestamps | Prevent broken or outdated resources |
| P1 | Correct search/status inconsistencies | Current checkbox and status values can disagree |
| P1 | Fix currency parsing and totals | Negative signs are discarded and duplicate amounts can be counted |
| P1 | Distinguish eligibility from a possible match | Profile tags do not establish eligibility |
| P1 | Add encrypted export/import or authenticated synchronization | Browser-only storage is vulnerable to accidental loss |
| P1 | Remove unused filtering logic and add automated tests | Reduce defects before expanding features |
| P2 | Improve accessibility, mobile forms, search, and filtering | Needed for reliable public use |
| P2 | Serve fonts locally or simplify privacy disclosures | External font requests conflict with absolute privacy claims |

P0 = blocking issue; P1 = necessary for a reliable launch; P2 = next development priority.

An additional copy correction is important: the application must not say all legitimate money is free to claim in every circumstance. Official state unclaimed-property searches and claims are generally free, but other processes may involve professional fees, court costs, tax obligations, or required paid services.

## 3. Build the actual money-discovery engine

The current 61 links should become a structured source registry. Each source needs a defined method for obtaining information, verifying an opportunity, and beginning recovery.

### 3.1 Sources to integrate

| Priority | Source category | Discovery capability to build |
|---|---|---|
| P0 | State unclaimed property | Search approved data sources using name variants, location history, and business names |
| P0 | Music royalties | Compare recorded works and rightsholder information against royalty databases |
| P0 | Unpaid wages | Search known employers and recovered-wage records |
| P0 | Lost retirement accounts | Locate former retirement-plan administrators and benefit records |
| P1 | Tax refunds | Analyze authorized tax records and identify missing refunds or credits |
| P1 | Class-action settlements | Match documented purchases and services against eligible settlement classes |
| P1 | Court and bankruptcy funds | Search available court records and identify possible claimants |
| P1 | Insurance proceeds | Identify potential unpaid policies through authorized inquiry workflows |
| P1 | Government benefits | Evaluate eligibility using current program rules |
| P1 | Grants and assistance | Identify genuinely open opportunities that match the claimant |
| P2 | Municipal and county funds | Search property-tax overpayments, utility deposits, and other local receivables |
| P2 | Business receivables | Analyze invoices, contracts, credits, and outstanding payments |
| P2 | Rebates and reimbursements | Match qualifying transactions to available programs |
| P3 | Commercial financial incentives | Separate optional earning opportunities from money already owed |

### 3.2 Integration feasibility

| Source | Practical integration | Limitation |
|---|---|---|
| Illinois I-CASH | Official search and claim-status portal | Automated access must be independently authorized |
| Michigan Unclaimed Property | Official searches and online claims | Similar-name results require identity evidence |
| The Mechanical Licensing Collective | Public Search API and bulk-data programs | Access and permitted usage must be established |
| U.S. Department of Labor — Workers Owed Wages | Employer-based lookup and guided claim workflow | Identity documentation and claimant action required |
| DOL Retirement Savings Lost and Found | User-directed, identity-verified lookup | Restricted to the verified claimant; not a general public search |
| IRS refunds | User-authorized records and assisted official workflows | Private taxpayer data; identity verification required |

The MLC is especially promising because it already offers a Public Search API and bulk machine-readable data. Illinois and Michigan both provide official search and claim systems. The DOL retirement database requires identity-proofed Login.gov access and does not establish that benefits are actually owed.

Each integration needs an explicit classification:

- **API** — documented, authorized API access.
- **BULK_DATA** — permitted downloadable datasets.
- **USER_AUTHORIZED** — supported account access or explicit data import.
- **ASSISTED** — user opens the official portal and completes protected steps.
- **UNAVAILABLE** — no reliable permitted automated access established.

There should be no automated CAPTCHA bypassing, credential sharing, impersonation, or unsupported mass scraping. Those approaches would jeopardize both reliability and access to the underlying services.

### 3.3 Music royalty discovery — dedicated subsystem

Build functionality to ingest a songwriter's and producer's catalog and inspect possible royalty gaps across:

- **The MLC:** U.S. streaming mechanical royalties and missing ownership shares.
- **ASCAP, BMI, SESAC, GMR**, and applicable foreign performing-rights organizations.
- **SoundExchange:** eligible digital sound-recording performance royalties and applicable producer allocations.
- **Distributors and publishing administrators:** reported versus contractually expected payments.
- **Synchronization licensing:** film, TV, advertisements, and other licensed uses.
- **Master-recording income, producer royalties, neighboring rights**, and other contractual receivables.

The Copyright Office confirms that the MLC handles certain mechanical royalties and that the law provides a separate royalty mechanism for eligible producers through SoundExchange. These are different rights and payment systems.

The subsystem should store ISRC, ISWC, IPI/CAE identifiers, song titles, alternate titles, artists, writers, publishers, ownership shares, contracts, and available royalty statements. It should detect missing registrations, unmatched works, inconsistent ownership shares, and discrepancies between royalty statements and recorded rights. It must not assume that an unregistered song necessarily has money available to claim.

## 4. Identity, ownership, and matching

The new system needs an optional, verified personal or business profile containing:

| Data | Purpose |
|---|---|
| Legal name and known aliases | Name matching |
| Historical names and locations | Earlier accounts and unclaimed property |
| Former employers | Wage and retirement searches |
| Business names and ownership relationships | Business receivables |
| Music and creative works | Royalty discovery |
| Financial institutions previously used | Lost account investigation |
| Applicable family or estate relationships | Lawful inherited-property claims |
| Current eligibility facts | Grants, credits, and benefits |
| Supporting documents | Ownership and eligibility verification |

Sensitive identifiers should be collected only when necessary for a specific authorized process. Name-only matches must never be treated as proven ownership.

Matching engine requirements:

1. Normalize names without eliminating meaningful differences.
2. Compare aliases, addresses, employment, dates, and available identifiers.
3. Recognize misspellings and business-name variations.
4. Distinguish individuals who happen to share a name.
5. Use document evidence to strengthen or reject possible matches.
6. Detect records appearing in multiple databases.
7. Explain why a match was identified.
8. Require stronger evidence before labeling a result verified.
9. Allow manual rejection, correction, and appeal of matching decisions.
10. Record the provenance of every fact and every change.

The matching engine should report both a match-confidence estimate and an independent verification state. A high-confidence name-and-address match is still not an agency-confirmed entitlement.

## 5. Claim and recovery engine

Required claim lifecycle:

1. **Potential match discovered** — a source provides a record connected to the user's search profile
2. **Match reviewed** — identity and ownership evidence is assessed
3. **Eligibility established** — applicable criteria and source requirements are evaluated
4. **Claim package prepared** — required documents, fields, and instructions are assembled
5. **Claimant approves** — the user reviews the claim and authorizes submission
6. **Claim submitted** — through an authorized integration or directly on the official website
7. **Claim monitored** — status, requests for information, deadlines, and responses are recorded
8. **Payment verified** — funds are confirmed as received by the rightful payee

Functions to implement:

- Generate a requirements checklist for each claim.
- Prepopulate claim forms where legally and technically permitted.
- Prepare PDFs, cover letters, ownership statements, and supporting documentation.
- Validate required fields before submission.
- Identify document deficiencies and missing signatures.
- Track claim numbers, agency correspondence, and deadlines.
- Draft responses when agencies request further documentation.
- Automatically submit through explicitly authorized interfaces where available.
- Require user approval for consequential actions.
- Provide resubmission and appeal workflows for rejected claims.
- Maintain an immutable history of submissions and responses.

Payment collection should remain with the official payer. Find Your Funds should not redirect proceeds to a platform-controlled bank account or represent that funds have been recovered before the payee confirms receipt.

## 6. Recovery ledger

Replace the single running total with a ledger distinguishing money discovered from money actually received: potential matches, documented claims, approved but unpaid, and payments received. Records must support partial payments, deductions, currency conversion, interest, reopened claims, appeals, and duplicate claims.

**Critical rule: a potential balance must never be represented as available cash.**

## 7. Software architecture

| Component | Recommendation |
|---|---|
| Frontend | React / Next.js with TypeScript |
| API | Python FastAPI |
| Database | PostgreSQL |
| Background processing | Temporal or a durable task queue |
| Search and record matching | PostgreSQL full-text/trigram search initially |
| Document processing | Python PDF/document parsing and structured extraction |
| File storage | Private encrypted object storage |
| Authentication | Established identity provider with MFA and passkey support |
| Source integrations | Independently versioned connector modules |
| AI assistance | Evidence-grounded extraction, normalization, and claim preparation |
| Monitoring | Centralized logs, metrics, alerts, and audit trails |
| CI/CD | GitHub Actions, testing, security checks, and controlled deployment |

The existing GitHub Pages site can remain the public information and onboarding interface. The private backend must be hosted separately or run through a controlled local application, because a static site cannot run recurring jobs, safely hold integration credentials, or maintain a secure central recovery database.

Data models: User, IdentityProfile, NameAlias, AddressHistory, Employment, Business, OwnedAsset, Source, SourceConnector, SearchRun, CandidateMatch, Evidence, EligibilityAssessment, Consent, Claim, ClaimEvent, Document, Payment, Deadline, Notification, AuditEvent. Every discovered opportunity preserves the original source, retrieval date, exact search criteria, evidence reference, and current verification status.

## 8. Continuous discovery and monitoring

- Scheduled execution per source, respecting its permitted access limits.
- New-data detection and incremental searches.
- Retry and recovery for failed searches.
- Deduplication across successive runs.
- Monitoring for newly published settlements and grant opportunities.
- Claim deadline, document-request, and status-change alerts by email or push.
- Source-availability monitoring.
- Automatic suspension of connectors after authorization failures or material source changes.

Scheduling must be source-aware. A job must distinguish `SEARCH_COMPLETED_NO_MATCH` from `SEARCH_UNAVAILABLE`; failed or blocked searches cannot be counted as proof that no money exists.

## 9. Evidence and eligibility engine

For each opportunity, track the precise criteria, the authoritative rule and its effective date, which criteria are satisfied by documented evidence, unknown facts, whether the program is accepting claims, the deadline, conflicting benefits or exclusions, whether it was already claimed, and the next evidence-gathering action.

Use deterministic rules for eligibility whenever possible. AI should extract information, identify inconsistencies, and explain requirements, not invent eligibility conclusions. Maintain independent states for potentially eligible, requires verification, confirmed eligible, and ineligible.

## 10. Privacy, security, and legal controls

Launch-blocking once private financial or identity information is collected: explicit per-source consent; strong authentication with MFA; minimized, encrypted sensitive data; per-user isolation and role-based access; managed secrets never in public code or browser storage; timestamped audit records; export, deletion, retention, and backup controls; explicit claim authorization; third-party terms and licensing reviews; no unnecessary custody of money or banking credentials; compliance with privacy, consumer-protection, and unclaimed-property finder laws; dependency checks, penetration testing, incident response, and recovery testing.

An important product decision is whether Find Your Funds remains a personal tool or operates as a public service. A public system handling sensitive records from multiple users has substantially greater security, governance, and legal obligations.

## 11. User interface

Organize around actions and outcomes: Dashboard (verified opportunities, active claims, payments received, urgent actions), Discovery (authorized searches, coverage, results and failures), Claims (evidence, forms, submissions, deadlines, correspondence), Recovery Ledger, and Profile & Permissions. Include a search-coverage report showing which sources were checked successfully and which were unavailable.

## 12. Testing and operations

Automated tests for name and business matching (including identical-name false positives), eligibility rules and effective dates, deduplication and reconciliation, financial calculations and partial payments, form generation and validation, connector authorization failures, source schema changes, retries and interrupted jobs, access control and cross-user isolation, deletion/export/backup/recovery, accessibility and mobile use, and end-to-end claim workflows using synthetic or authorized test data.

Each connector needs an owner, review interval, last successful check, and documented integration permissions. The project needs staging and production environments, branch protection, reproducible deployments, CI, error alerts, and an incident-response procedure.

## 13. Implementation roadmap

1. **Weeks 1–2 — Stabilize the existing application.** Correct sources, repair tracking and totals, stable identifiers, tests, source registry and schemas. *Exit: trustworthy directory and tracker with a passing test suite.*
2. **Weeks 3–5 — Discovery foundation.** Backend, consent, profiles, connectors, jobs, evidence storage, matching; start with The MLC plus assisted Illinois and Michigan workflows. *Exit: repeatable searches producing auditable candidate records.*
3. **Weeks 6–9 — Recovery workflows.** Eligibility rules, document extraction, claim preparation, approvals, authorized submissions, status tracking. *Exit: a complete claim workflow tested through agency confirmation using an authorized case.*
4. **Weeks 10–14 — Monitoring and coverage.** Recurring searches, notifications, payment reconciliation, more integrations, security hardening, production controls. *Exit: persistent operation, measured coverage, reliable tracking of claims and payments.*

Planning estimate: roughly 10–14 weeks for a narrow MVP with a small experienced team. Data-provider permissions, real claim validation, and security reviews are the largest uncertainties.

## 14. Completion criteria

| Capability | Required proof |
|---|---|
| Actual discovery | A source returns real candidate records without manual re-entry |
| Match quality | Known positive and negative test cases, including false-positive measurements |
| Verification | Every confirmed claim has attributable evidence |
| Claim preparation | Correct forms and documents for supported workflows |
| Submission | Verified receipt or acknowledgement from an authorized destination |
| Monitoring | Automatic detection and reporting of relevant changes |
| Financial accuracy | Payments reconciled without counting unverified or duplicate amounts |
| Security | Independent security review and passing access-control tests |
| Reliability | Repeated scheduled runs with measured success and failure rates |
| Recovery | At least one real claim completed and payment independently confirmed, subject to an eligible claim existing |

The last criterion cannot be guaranteed on a deadline, because neither the availability of a valid claim nor an agency's payment decision is controlled by the software.

## Final recommendation

Build in two layers: an automated discovery and evidence engine that finds potential money through authorized sources and produces verifiable results, and a claim-execution and recovery engine that prepares submissions, manages approvals, tracks correspondence, and confirms payments. Prioritize state unclaimed property, music royalties, unpaid wages, and retirement accounts.

Measure the product by verified opportunities, valid claims submitted, successful recoveries, time saved, and the rate of incorrect matches, not by link counts or theoretical dollars.

**The next milestone is demonstrating that Find Your Funds can independently identify a plausible financial entitlement from an authorized source, document why it may belong to the user, and prepare a legitimate claim.**
