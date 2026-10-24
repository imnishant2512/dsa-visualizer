# Contributing

## Branching

This repo uses **GitHub Flow**: `main` is the only long-lived branch, and
everything else is a short-lived branch that merges back into it.

```
main ────●────────●─────────────●──────►  always deployable
          \      /               \
           ●────●   feat/…        ●────●  fix/…
```

### The rules

1. **`main` is always deployable.** It is the branch Firebase Hosting is
   deployed from (`npm run deploy`), so anything merged into it is a candidate
   for production. It is never committed to directly.
2. **Branch off `main` for every change**, however small.
3. **Keep branches short-lived** — a day or two, not weeks. A branch that lives
   long enough to drift is a branch that will merge badly.
4. **Open a pull request** and let CI go green before merging.
5. **Delete the branch after merge.** GitHub does this automatically once the
   setting below is on.

### Branch names

`<type>/<short-kebab-description>`

| Prefix      | For                                                |
| ----------- | -------------------------------------------------- |
| `feat/`     | A new algorithm, domain, or user-facing capability |
| `fix/`      | A bug fix                                          |
| `refactor/` | Restructuring with no behaviour change             |
| `test/`     | Tests only                                         |
| `docs/`     | README, this file, comments                        |
| `chore/`    | Tooling, dependencies, config, CI                  |

Examples:

```
feat/radix-msd-sort
fix/scrubber-drops-last-step
refactor/extract-step-player-cursor
chore/bump-vite-8
```

### Commits

Follow the style already in the log: an imperative, sentence-case subject that
says what the commit does, no type prefix, no trailing period.

```
Add ESLint, and fix the six violations it found
Fix the three UX problems: layout, playback speed, keyboard
Ignore Vite's local cache directory
```

Add a body when the _why_ is not obvious from the subject. Wrap it at 72
columns.

### Merging

**Squash and merge** is the default. A feature branch's intermediate commits
("wip", "fix test") are working notes, not history worth keeping; the squashed
commit is the unit that can be reverted cleanly. Edit the squash subject to
match the commit style above rather than accepting GitHub's generated one.

Rebase your branch on `main` rather than merging `main` into it, so the branch
stays a clean line of work:

```sh
git fetch origin
git rebase origin/main
```

## Setting up

Use the Node version in `.nvmrc` (`nvm use`); anything from 20.19 works.

```sh
npm install      # also installs the pre-commit hook
npm run dev      # http://localhost:5173
```

`npm install` runs `prepare`, which installs a [husky](https://typicode.github.io/husky/)
pre-commit hook. On every commit it runs Prettier and ESLint on the staged
files only, so the hook takes a second or two, not the length of the suite.

## Before you open a PR

Everything CI runs, you can run locally in one command:

```sh
npm run verify
```

That is, in order:

| Script                  | What it checks                                                        |
| ----------------------- | --------------------------------------------------------------------- |
| `npm run format:check`  | Prettier formatting (`npm run format` fixes it)                       |
| `npm run lint`          | ESLint, including the React hooks rules                               |
| `npm run knip`          | Unused files, exports and dependencies                                |
| `npm run typecheck`     | TypeScript for the app and the end-to-end tests                       |
| `npm run test:coverage` | Vitest, failing if coverage drops below the floor in `vite.config.ts` |
| `npm run build`         | The production bundle                                                 |

The end-to-end suite runs separately because it needs Chrome:

```sh
npm run test:e2e   # builds, then drives Chrome against the production bundle
```

CI runs all of it on every PR to `main`, and the PR cannot merge until the
`verify` check passes. It also fails on a high-severity advisory in a
production dependency (`npm audit --omit=dev`).

## Project-specific expectations

These are the invariants the codebase is built on. A change that breaks one of
them needs a very good reason.

- **Steps are exactly reversible.** Algorithms emit discrete steps and the
  player walks a cursor through them. Stepping backwards must unwind state
  _and_ stats precisely — never by replaying from the start.
- **No animation delays inside algorithms.** Timing belongs to the player.
  An algorithm that sleeps cannot be scrubbed, reversed, or re-sped mid-run.
- **Colour is never the only signal.** Visualization states use the Okabe-Ito
  palette and are separated by lightness as well as hue, so they survive
  deuteranopia, protanopia and greyscale.
- **New behaviour comes with a test.** Algorithm tests live next to the
  algorithm; component and hook tests use Testing Library with jsdom.
  Anything that depends on real layout, a real Web Worker or the real
  playback clock belongs in `e2e/`.
- **Every page stays accessible.** The end-to-end suite runs an axe scan of
  every route and fails on any serious or critical WCAG 2.1 AA violation.
  Text on the accent uses `--accent-fill`, and accent-coloured text uses
  `--accent-soft`; the pure `--accent` is for marks without text.
- **Nothing loads from another origin.** The CSP in `firebase.json` is
  `'self'` plus wandbox.org for the IDE. A new font, script or API means
  bundling it, or changing the policy deliberately in the same PR.

## Repository settings

The branching rules above are enforced by a ruleset on `main`, configured in
**Settings → Rules → Rulesets**. For the record, the enforced set is:

- Restrict deletions
- Block force pushes
- Require a pull request before merging, with **0 required approvals** and
  _Require conversation resolution before merging_ on
- Require status checks to pass — `verify` — with _Require branches to be up to
  date before merging_ on

Zero required approvals is deliberate while this is a one-person repo: GitHub
will not let you approve your own pull request, so requiring one approval would
mean bypassing the ruleset on every single merge, which is worse than not having
it. The rule still does the work that matters — no direct pushes to `main`, no
force pushes, no merging red CI. **When a second collaborator joins, raise
required approvals to 1** and turn on _Require review from Code Owners_ and
_Dismiss stale pull request approvals when new commits are pushed_; `CODEOWNERS`
is already in place for that.

Plus, under **Settings → General → Pull Requests**:

- _Allow squash merging_ only — merge commits and rebase merging are both
  turned off, so squash is not merely the convention above but the only button
  available. The ruleset also requires linear history, but admins can bypass a
  ruleset and did once; removing the button is what actually holds.
- _Automatically delete head branches_.

And under **Settings → Code security**, turn on:

- _Private vulnerability reporting_, which [SECURITY.md](SECURITY.md) points
  reporters to;
- _Secret scanning_ and _Push protection_, so a committed credential is
  blocked before it reaches GitHub;
- _Dependabot security updates_, alongside the scheduled version updates.

## Deployment

CI deploys. Nothing else needs to:

- every pull request from a branch in this repo gets a **preview channel**,
  and its URL is posted on the PR; it expires after seven days;
- every push to `main` that passes `verify` is deployed **live**.

Both deploy the exact `dist/` that passed the checks, never a rebuild.

They need one repository secret,
`FIREBASE_SERVICE_ACCOUNT_SORTING_VISUALIZATION_29FD0`, holding the JSON key
of a service account with the _Firebase Hosting Admin_ role. That is the name
the Firebase CLI gives it, and the simplest way to create both is:

```sh
npx firebase-tools init hosting:github
```

That command creates the service account and stores the secret, and it also
writes workflow files. Delete those files: `ci.yml` already does the job.
Until the secret exists, the deploy jobs pass with a notice and change
nothing. `npm run deploy` still deploys by hand from a clean checkout of
`main`.

The production deploy runs in the `production` GitHub environment, so
**Settings → Environments → production** can add a required reviewer or a
wait timer later without touching the workflow.

## Releasing

The site deploys continuously, so a release is a named, documented point in
that stream rather than a gate on shipping. To cut one:

1. On a `chore/release-x.y.z` branch, move the changes into a
   `## [x.y.z] — YYYY-MM-DD` section of `CHANGELOG.md`. Set `"version"` in
   `package.json` to match, and run `npm install` so the lockfile follows.
2. Open a pull request and merge it like any other change.
3. Tag the merge commit and push the tag:

   ```sh
   git checkout main && git pull
   git tag -a vx.y.z -m "vx.y.z"
   git push origin vx.y.z
   ```

The Release workflow checks that the tag matches `package.json`, then
publishes a GitHub release whose notes are that version's changelog section
(`node scripts/release-notes.mjs x.y.z` prints them locally).

## Automated maintenance

- **Dependabot** opens grouped update PRs weekly for npm and monthly for
  GitHub Actions. They go through CI like everything else.
- **CodeQL** scans the TypeScript and the workflows on every PR, on every
  push to `main`, and weekly.
