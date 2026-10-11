## What this changes

<!-- One or two sentences. What is different after this merges? -->

## Why

<!-- The problem or the motivation. Link an issue with "Closes #123" if there is one. -->

## How to check it

<!-- The steps a reviewer (or future you) takes to see it working. -->

1.
2.

## Checklist

- [ ] `npm run verify` passes (format, lint, knip, typecheck, tests with coverage, build)
- [ ] `npm run test:e2e` passes, if the change touches pages, layout, workers or the CSP
- [ ] New or changed behaviour has a test
- [ ] Steps stay exactly reversible — stepping backwards unwinds state and stats
- [ ] Any new visualization state is distinguishable in greyscale, not by hue alone
- [ ] Text on the accent uses `--accent-fill`; accent-coloured text uses `--accent-soft`
- [ ] Nothing new is loaded from another origin (or the CSP change is in this PR)
- [ ] `CHANGELOG.md` has an entry, if a visitor would notice the change
- [ ] README updated if a feature, algorithm or script changed
