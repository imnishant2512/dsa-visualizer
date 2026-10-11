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

## Before you open a PR

Everything CI runs, you can run locally:

```sh
npm run lint     # ESLint
npm test         # Vitest
npm run build    # tsc -b && vite build — this is the typecheck too
```

CI runs the same three on every PR to `main`, and the PR cannot merge until
they pass.

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
