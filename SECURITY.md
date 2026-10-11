# Security policy

## Supported versions

Only the live site, https://sorting-visualization-29fd0.web.app, and the tip
of `main` are supported. Fixes are not backported to older releases.

## Reporting a vulnerability

Please report privately, through GitHub's
[private vulnerability reporting](https://github.com/imnishant2512/dsa-visualizer/security/advisories/new)
(Security tab → _Report a vulnerability_). Do not open a public issue for a
security problem.

Include the URL or code path involved, the steps to reproduce, and what an
attacker could do with it. Expect an acknowledgement within a week. Once a fix
ships, the advisory is published with credit, unless you would rather not be
named.

## What is in scope

The site is static and has no accounts, server or database. The parts that
handle untrusted input are the ones worth looking at:

- **The code IDE.** JavaScript you write runs in a Web Worker created from a
  `blob:` URL. The worker is terminated after five seconds, and the sort
  recorder also has a step cap. An escape from that worker into the page is in
  scope.
- **Wandbox.** Code in the compiled languages (C++, Java, Go, Rust, Python) is
  sent to wandbox.org to compile, and the toolbar says so before it happens.
  Code reaching wandbox without that disclosure, or anything else leaving the
  browser, is in scope.
- **The Content-Security-Policy** in `firebase.json`. A way to load or run
  script from another origin is in scope.
- **URL parameters.** Sorting and searching rebuild their state from the
  query string, so a crafted link that causes script execution is in scope.

Wandbox's own security, and denial of service against the visitor's own tab
(for example, picking the largest input size), are out of scope.

## Dependencies

Dependabot proposes updates weekly. CI fails a pull request whose production
dependencies have a high-severity advisory (`npm audit --omit=dev`).
