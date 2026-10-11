import type { SearchState, SearchStep } from './types';

/**
 * One plain-English sentence for the step the cursor is on.
 *
 * A search is a sequence of eliminations, and the elimination is the part a
 * bar chart shows worst: a window shrinking by half is a dozen bars dimming at
 * once with nothing saying why. Each sentence says what was read and what it
 * ruled out.
 */
export function narrateSearchStep(
  step: SearchStep | null,
  state: SearchState,
  target: number,
): string {
  const n = state.values.length;
  if (!step) {
    return `Looking for ${target} in ${n} ascending values. Press play, or step through one probe at a time.`;
  }
  const at = (i: number) => state.values[i];

  switch (step.kind) {
    case 'probe':
      return `Read a[${step.index}] (${at(step.index)}).`;
    case 'compare': {
      const value = at(step.index);
      if (value === target) return `a[${step.index}] is ${value} — a match.`;
      return value < target
        ? `a[${step.index}] is ${value}, below ${target} — everything at or left of it is out.`
        : `a[${step.index}] is ${value}, above ${target} — everything at or right of it is out.`;
    }
    case 'narrow': {
      const left = Math.max(0, step.hi - step.lo + 1);
      return left === 0
        ? 'The window is empty — nothing left to check.'
        : `Window narrowed to a[${step.lo}…${step.hi}] — ${left} of ${n} still in play.`;
    }
    case 'found':
      return `Found ${target} at index ${step.index} after ${state.probed.length} ${
        state.probed.length === 1 ? 'probe' : 'probes'
      }.`;
    case 'exhausted':
      // The outcome box beneath the chart gives the totals; this is the
      // moment itself, so it says why the search stopped rather than repeat them.
      return `The window closed with nothing left in it — ${target} was never there.`;
    case 'note':
      return step.note ?? '';
  }
}
