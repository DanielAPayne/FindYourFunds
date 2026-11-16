# Find Your Funds

A free, private web app that helps anyone track down money they're legitimately
owed — unclaimed property, tax refunds and credits, old pensions, back wages,
savings bonds, benefits they qualify for, and more. Every source it links to is an
official U.S. government or institutional database, and every one is free to use.

**Live site:** https://danielapayne.github.io/FindYourFunds/

## How it works

1. **Say who you are** — tap the tags that describe you (student, veteran, homeowner,
   renter, parent, 65+, low income, and so on). The app flags the sources most likely
   to hold money for you.
2. **Search the sources** — open each official site and search your name, former
   names, and relatives whose heir you are.
3. **Track and claim** — mark what you've searched, log amounts found, and keep notes.
   A running total shows at the top. You claim directly on the official site — always
   free.

## Privacy

This app has no backend and no accounts. Your profile and tracking are stored only in
your own browser (localStorage) and never leave your device. It never asks for your
Social Security number, bank details, or payment.

## Honest scope

Legitimate "free money" is only ever one of three things: money already yours that got
separated from you, benefits or credits you qualify for but aren't collecting, or
grants for a specific purpose. No database hands money to someone who isn't owed it.
You never pay to claim your own money — ignore any "finder" or "recovery" company that
wants a cut.

## Tech

A single static `index.html` — no build step, no dependencies beyond Google Fonts.
Open it locally or host it anywhere static files are served. `found-money-tracker.csv`
is a printable/offline version of the source list.

Sources current as of 2026.
