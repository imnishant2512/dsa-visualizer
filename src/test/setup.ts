import { configure } from '@testing-library/react';

/*
 * `waitFor` and the `findBy*` queries carry their own deadline, separate from
 * vitest's `testTimeout`, and it defaults to one second. Page tests that drive
 * a real requestAnimationFrame playback loop sit well inside that on an idle
 * machine and outside it when twenty-odd test files run in parallel — so
 * individual tests kept failing on load while the behaviour under test was
 * fine. Five seconds is still a deadline; it just stops measuring the machine.
 */
configure({ asyncUtilTimeout: 5000 });
