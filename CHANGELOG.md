# Changelog

Notable changes to the site, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) as it applies to a website: a major
version is a change a returning visitor would notice as a different product,
a minor version adds something, and a patch fixes something.

Releasing is described in [CONTRIBUTING.md](CONTRIBUTING.md#releasing).

## [2.0.0] — 2026-10-24

The redesign, and the move to a production release process.

### Added

- **Redesigned interface** across every page: a warm dark palette with one
  vermillion accent, the Archivo typeface, a shared run bar with speed presets
  and named resets, and a plain-language narration line for every step.
- **Sorting:** an algorithm picker grouped by family, and a verdict comparing
  each run's measured count with its Big-O prediction.
- **Race mode:** both runs on one clock, with a strip showing how far apart
  they are.
- **Hash tables:** changing strategy or rehashing replays the operation log;
  a reference table shows the other strategy; a load-factor warning.
- **Pathfinding:** draw with the pointer or the keyboard; five maze presets,
  each guaranteed to have a route.
- **Graphs:** editable edge weights and draggable nodes. A* is withdrawn, with
  a written notice, while a hand-set weight would make its heuristic wrong.
- **Code IDE:** a _Visualize a sort_ tab. Your own sort is recorded in a
  sandboxed worker and replayed on the same engine as the built-in ones, then
  checked for correctness.
- A 404 page, and an error page that keeps the navigation usable when a page
  fails.
- Link-preview metadata and image.

### Changed

- Each domain page loads on demand. The entry bundle is 357 kB, down from
  475 kB.
- The web font is bundled, so the site makes no third-party requests.
- Every page meets WCAG 2.1 AA text contrast.

### Fixed

- A* returned non-shortest paths on the default graph: edge weights rounded
  down, which made its heuristic inadmissible.
- An operation started just as the previous one finished could load but stay
  paused.
- In the trees page, subtrees no longer move while a rotation is running.
- A mistyped URL showed the homepage instead of saying the page was not found.
- The Linear nav item lost its highlight on three of its four tabs.

### Security

- A Content-Security-Policy and the standard hardening headers on every
  response.
- The IDE says before any code leaves the browser for wandbox.org.
- `monaco-editor` 0.57 and a patched `dompurify`. `npm audit` is clean,
  dev dependencies included.

## [1.0.0] — 2026-09-05

The rebuild from a five-algorithm sorting page into a visualizer for data
structures and algorithms.

### Added

- One replay engine for every domain: each algorithm emits exactly reversible
  steps, so every run can be paused, stepped backwards and scrubbed.
- Sorting (17 algorithms) with race mode, searching (5), pathfinding (6),
  linear structures, trees (BST, AVL, heaps), hash tables, and graphs
  (8 algorithms).
- A six-language code IDE.
- Shareable links that reproduce a run from a seed.
- A colour-blind-safe palette.
- Deployment to Firebase Hosting.

[2.0.0]: https://github.com/imnishant2512/dsa-visualizer/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/imnishant2512/dsa-visualizer/releases/tag/v1.0.0
