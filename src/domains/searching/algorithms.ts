import { SearchCtx, initSearchState } from './engine';
import type { SearchAlgorithm, SearchInput, SearchState, SearchStep } from './types';

function defineSearch(config: {
  id: string;
  label: string;
  summary: string;
  complexity: { time: string; space: string };
  /** Every algorithm but linear search needs ascending input. */
  requiresSorted: boolean;
  pseudocode: string[];
  generate(state: SearchState, input: SearchInput): Generator<SearchStep>;
}): SearchAlgorithm & { requiresSorted: boolean } {
  return {
    id: config.id,
    label: config.label,
    summary: config.summary,
    complexity: config.complexity,
    requiresSorted: config.requiresSorted,
    pseudocode: config.pseudocode,
    initState: (input) => initSearchState(input.values),
    generate: config.generate,
  };
}

export const linearSearch = defineSearch({
  id: 'linear',
  label: 'Linear Search',
  summary: 'Checks every element left to right. The only search that works on unsorted data.',
  complexity: { time: 'O(n)', space: 'O(1)' },
  requiresSorted: false,
  pseudocode: ['for i = 0 to n-1', '  if a[i] == target', '    return i', 'return not found'],
  *generate(_state, input) {
    const ctx = new SearchCtx(input.values);
    for (let i = 0; i < ctx.values.length; i++) {
      yield* ctx.probe(i, 0);
      yield* ctx.compare(i, input.target, 1);
      if (ctx.at(i) === input.target) {
        yield* ctx.found(i, 2);
        return;
      }
    }
    yield* ctx.exhausted(3);
  },
});

export const binarySearch = defineSearch({
  id: 'binary',
  label: 'Binary Search',
  summary: 'Halves the candidate window each step by comparing against the middle element.',
  complexity: { time: 'O(log n)', space: 'O(1)' },
  requiresSorted: true,
  pseudocode: [
    'lo = 0; hi = n-1',
    'while lo <= hi',
    '  mid = (lo + hi) / 2',
    '  if a[mid] == target: return mid',
    '  if a[mid] < target: lo = mid + 1',
    '  else: hi = mid - 1',
    'return not found',
  ],
  *generate(_state, input) {
    const ctx = new SearchCtx(input.values);
    let lo = 0;
    let hi = ctx.values.length - 1;
    while (lo <= hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      yield* ctx.probe(mid, 2);
      yield* ctx.compare(mid, input.target, 3);
      if (ctx.at(mid) === input.target) {
        yield* ctx.found(mid, 3);
        return;
      }
      if (ctx.at(mid) < input.target) {
        lo = mid + 1;
        yield* ctx.narrow(lo, hi, 4);
      } else {
        hi = mid - 1;
        yield* ctx.narrow(lo, hi, 5);
      }
    }
    yield* ctx.exhausted(6);
  },
});

export const jumpSearch = defineSearch({
  id: 'jump',
  label: 'Jump Search',
  summary:
    'Leaps ahead in √n blocks until it overshoots, then walks back linearly through one block.',
  complexity: { time: 'O(√n)', space: 'O(1)' },
  requiresSorted: true,
  pseudocode: [
    'step = floor(sqrt(n))',
    'jump forward while a[min(step, n)-1] < target',
    'then scan linearly inside the last block',
    '  if a[i] == target: return i',
    'return not found',
  ],
  *generate(_state, input) {
    const ctx = new SearchCtx(input.values);
    const n = ctx.values.length;
    if (n === 0) {
      yield* ctx.exhausted(4);
      return;
    }
    const step = Math.max(1, Math.floor(Math.sqrt(n)));
    yield* ctx.note(`block size = ${step}`, 0);

    let prev = 0;
    let curr = Math.min(step, n) - 1;
    yield* ctx.probe(curr, 1);
    yield* ctx.compare(curr, input.target, 1);
    while (curr < n - 1 && ctx.at(curr) < input.target) {
      prev = curr + 1;
      curr = Math.min(curr + step, n - 1);
      yield* ctx.narrow(prev, curr, 1);
      yield* ctx.probe(curr, 1);
      yield* ctx.compare(curr, input.target, 1);
    }

    yield* ctx.narrow(prev, curr, 2);
    for (let i = prev; i <= curr; i++) {
      yield* ctx.probe(i, 2);
      yield* ctx.compare(i, input.target, 3);
      if (ctx.at(i) === input.target) {
        yield* ctx.found(i, 3);
        return;
      }
    }
    yield* ctx.exhausted(4);
  },
});

export const interpolationSearch = defineSearch({
  id: 'interpolation',
  label: 'Interpolation Search',
  summary:
    'Guesses where the target should be based on its value, not the midpoint. Very fast on uniform data.',
  complexity: { time: 'O(log log n) uniform, O(n) worst', space: 'O(1)' },
  requiresSorted: true,
  pseudocode: [
    'while lo <= hi and target in [a[lo], a[hi]]',
    '  pos = lo + (target - a[lo]) * (hi - lo) / (a[hi] - a[lo])',
    '  if a[pos] == target: return pos',
    '  if a[pos] < target: lo = pos + 1',
    '  else: hi = pos - 1',
    'return not found',
  ],
  *generate(_state, input) {
    const ctx = new SearchCtx(input.values);
    let lo = 0;
    let hi = ctx.values.length - 1;

    while (lo <= hi && input.target >= ctx.at(lo) && input.target <= ctx.at(hi)) {
      const span = ctx.at(hi) - ctx.at(lo);
      const pos =
        span === 0 ? lo : lo + Math.floor(((input.target - ctx.at(lo)) * (hi - lo)) / span);
      const clamped = Math.max(lo, Math.min(hi, pos));

      yield* ctx.probe(clamped, 1);
      yield* ctx.compare(clamped, input.target, 2);
      if (ctx.at(clamped) === input.target) {
        yield* ctx.found(clamped, 2);
        return;
      }
      if (ctx.at(clamped) < input.target) {
        lo = clamped + 1;
        yield* ctx.narrow(lo, hi, 3);
      } else {
        hi = clamped - 1;
        yield* ctx.narrow(lo, hi, 4);
      }
    }
    yield* ctx.exhausted(5);
  },
});

export const exponentialSearch = defineSearch({
  id: 'exponential',
  label: 'Exponential Search',
  summary: 'Doubles a bound until it passes the target, then binary-searches the range it found.',
  complexity: { time: 'O(log i) for a target at index i', space: 'O(1)' },
  requiresSorted: true,
  pseudocode: [
    'if a[0] == target: return 0',
    'bound = 1',
    'while bound < n and a[bound] <= target: bound = bound * 2',
    'binary search within [bound/2, min(bound, n-1)]',
    'return not found',
  ],
  *generate(_state, input) {
    const ctx = new SearchCtx(input.values);
    const n = ctx.values.length;
    if (n === 0) {
      yield* ctx.exhausted(4);
      return;
    }

    yield* ctx.probe(0, 0);
    yield* ctx.compare(0, input.target, 0);
    if (ctx.at(0) === input.target) {
      yield* ctx.found(0, 0);
      return;
    }

    let bound = 1;
    while (bound < n) {
      yield* ctx.probe(bound, 2);
      yield* ctx.compare(bound, input.target, 2);
      if (ctx.at(bound) > input.target) break;
      bound *= 2;
      yield* ctx.note(`bound = ${bound}`, 2);
    }

    let lo = Math.floor(bound / 2);
    let hi = Math.min(bound, n - 1);
    yield* ctx.narrow(lo, hi, 3);

    while (lo <= hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      yield* ctx.probe(mid, 3);
      yield* ctx.compare(mid, input.target, 3);
      if (ctx.at(mid) === input.target) {
        yield* ctx.found(mid, 3);
        return;
      }
      if (ctx.at(mid) < input.target) lo = mid + 1;
      else hi = mid - 1;
      yield* ctx.narrow(lo, hi, 3);
    }
    yield* ctx.exhausted(4);
  },
});

export const SEARCH_ALGORITHMS = [
  linearSearch,
  binarySearch,
  jumpSearch,
  interpolationSearch,
  exponentialSearch,
];

export const SEARCH_BY_ID: Record<string, (typeof SEARCH_ALGORITHMS)[number]> = Object.fromEntries(
  SEARCH_ALGORITHMS.map((a) => [a.id, a]),
);
