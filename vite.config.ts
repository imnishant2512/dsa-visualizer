import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import firebase from './firebase.json';

/*
 * `vite preview` serves the same site-wide headers Firebase Hosting does —
 * the CSP above all — so the end-to-end suite, which runs against preview,
 * fails on anything the production policy would block. firebase.json stays
 * the single source of truth.
 */
const hostingHeaders = Object.fromEntries(
  firebase.hosting.headers
    .filter((rule) => rule.source === '**')
    .flatMap((rule) => rule.headers.map((header) => [header.key, header.value])),
);

export default defineConfig({
  plugins: [react()],
  preview: { headers: hostingHeaders },
  test: {
    // Hook tests need a DOM; the algorithm tests are environment-agnostic.
    environment: 'jsdom',
    // Playback is driven by requestAnimationFrame, which jsdom only provides
    // when it is pretending to be a visual browser.
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    /*
     * Process CSS Modules so their rules actually apply in jsdom. Without
     * this, `getComputedStyle` reports browser defaults and a stylesheet
     * cannot be asserted on at all — which is how a rule setting
     * `flex-direction: row` sat under a comment claiming the opposite,
     * unnoticed. Limited to modules; plain CSS has nothing worth asserting.
     */
    css: { include: [/\.module\.css$/] },
    /*
     * Vitest defaults to 5s. Several page-level tests mount a whole domain in
     * jsdom and drive a real rAF playback loop, which lands within a second or
     * two of that on an idle machine and over it on a busy one — so the suite
     * failed on load rather than on anything being wrong. The work itself is
     * unchanged; only the deadline is honest about what it is measuring.
     */
    testTimeout: 20000,
  },
});
