import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Hook tests need a DOM; the algorithm tests are environment-agnostic.
    environment: 'jsdom',
    // Playback is driven by requestAnimationFrame, which jsdom only provides
    // when it is pretending to be a visual browser.
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
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
