import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function getMatcher(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(QUERY);
}

function subscribe(onChange: () => void): () => void {
  const matcher = getMatcher();
  if (!matcher) return () => {};
  // Safari below 14 only has the deprecated pair, and jsdom's stub has neither.
  if (typeof matcher.addEventListener === 'function') {
    matcher.addEventListener('change', onChange);
    return () => matcher.removeEventListener('change', onChange);
  }
  matcher.addListener(onChange);
  return () => matcher.removeListener(onChange);
}

/**
 * True when the reader has asked the OS for less motion.
 *
 * Playback here is the motion — an unattended run repaints the whole chart
 * dozens of times a second — so this is read by the playback ticker to floor
 * the interval rather than by any CSS transition.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getMatcher()?.matches ?? false,
    // Server/prerender: assume no preference rather than guessing at one.
    () => false,
  );
}
