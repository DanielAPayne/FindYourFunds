# Find Your Funds

A free worklist for finding money that may be owed to you: unclaimed property, uncashed
refunds, lost retirement accounts, unpaid wages, music royalties, and programs you may
qualify for. Every source is labeled by who runs it, and nothing you track leaves your
browser.

**Live site:** https://danielapayne.github.io/FindYourFunds/

## What it does today

- **67 sources in 26 categories**, grouped as *money that may already be yours*, *programs
  you may qualify for*, and *optional ways to earn*. Each card shows who runs the site
  (government, official partner, nonprofit, commercial), whether searching is free, how
  you search it, and when the link was last checked.
- **Tags** for your situation flag sources worth a look. They never decide eligibility.
- **A tracker per source**: one status (not searched, no match, couldn't complete,
  possible match, claim filed, approved, received, not mine), an amount, a reference
  number, and notes.
- **A four-part ledger** that keeps possible matches, filed claims, approved amounts, and
  payments received separate. A reference number found on two sources is counted once.
- **Backup, restore, and clear**, with optional passphrase encryption (AES-GCM).

- **A failed-bank check**: enter a bank you used, and the page searches the FDIC's list of
  failed and assisted banks since 1934 and explains what happened to depositors' money.
- **A back-wage check**: enter a past employer and state, and the page searches U.S.
  Department of Labor enforcement records on your device for cases where that employer was
  found to owe back wages. It turns on once the DOL data is first downloaded.

Other sources are searched on their official sites. See [docs/ROADMAP.md](docs/ROADMAP.md)
and the full specification in [docs/SPEC.md](docs/SPEC.md).

### Turning on the back-wage data

1. Register for a free API key at https://dataportal.dol.gov.
2. In the repository settings, add a secret named `DOL_API_KEY` with that key.
3. Run the **Refresh back-wage data** workflow from the Actions tab. It then runs monthly.

## Privacy

No account and no server. Tags and tracking are stored in the browser's local storage and
are not sent anywhere by this site. The page loads no third-party scripts or fonts. Sites
you open from it have their own privacy policies.

## Development

Plain HTML and JavaScript, no build step.

```
src/registry.js   every source, with stable ids, labels, and link-check dates
src/core.js       pure logic: amounts, ledger, migration, backups (tested)
src/app.js        page behavior
index.html        markup and styles
test/             unit tests (node --test)
scripts/          link checker and tracker CSV generator
```

```bash
npm test               # unit tests
npm run check-links    # confirm every source URL still loads
npm run build:csv      # regenerate find-your-funds-tracker.csv from the registry
```

To add a source, add an entry to `src/registry.js` with a new unique `id`, run the tests,
and regenerate the CSV. Never reuse or change an existing `id`; tracking data is keyed by it.

CI runs the tests and checks the CSV on every push and pull request. A weekly workflow
re-checks every source link.

This is an information tool, not legal or financial advice.

When releasing, bump `version` in `package.json` and the matching `?v=` on each script tag in
`index.html` (a test checks they agree), so returning visitors never run cached old scripts
against a new page.
