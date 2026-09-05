import type { SortAlgorithm } from './types';
import { bogoSort, bubbleSort, cocktailSort, combSort, gnomeSort } from './algorithms/bubbleFamily';
import { insertionSort, shellSort } from './algorithms/insertionFamily';
import { cycleSort, selectionSort } from './algorithms/selectionFamily';
import { mergeSort } from './algorithms/merge';
import { quickSort } from './algorithms/quick';
import { heapSort } from './algorithms/heap';
import { introSort, timSort } from './algorithms/hybrids';
import { bucketSort, countingSort, radixSort } from './algorithms/nonComparison';

export interface SortGroup {
  label: string;
  algorithms: SortAlgorithm[];
}

/** Grouped by family — the grouping mirrors how the generators share machinery. */
export const SORT_GROUPS: SortGroup[] = [
  { label: 'Bubble family', algorithms: [bubbleSort, cocktailSort, combSort, gnomeSort] },
  { label: 'Insertion family', algorithms: [insertionSort, shellSort] },
  { label: 'Selection family', algorithms: [selectionSort, cycleSort] },
  { label: 'Divide & conquer', algorithms: [mergeSort, quickSort, heapSort] },
  { label: 'Hybrids', algorithms: [timSort, introSort] },
  { label: 'Non-comparison', algorithms: [countingSort, radixSort, bucketSort] },
  { label: 'For fun', algorithms: [bogoSort] },
];

/**
 * Bogo sort's runtime is unbounded, so the page clamps the array size whenever
 * it is selected. Nothing else has a size ceiling.
 */
export const MAX_SIZE_BY_ID: Record<string, number> = { bogo: 6 };

export const SORT_ALGORITHMS: SortAlgorithm[] = SORT_GROUPS.flatMap((g) => g.algorithms);

export const SORT_BY_ID: Record<string, SortAlgorithm> = Object.fromEntries(
  SORT_ALGORITHMS.map((a) => [a.id, a]),
);

/**
 * Presentation facts about each algorithm that the generators have no business
 * carrying: a compact bound for the identity strip and picker chips, and a
 * rough work estimate so a finished run can be held against its own bound.
 *
 * `complexity.time` already exists on the definition, but it is prose written
 * to be read ("O(n²), O(n) on nearly-sorted input") and does not fit a 168px
 * chip. `bigO` is the same claim at chip width.
 *
 * `measures` names the counter the bound is actually about, and it is not the
 * same one for every family. Counting sort performs no comparisons at all, so
 * holding it against a predicted comparison count reported "100% under budget"
 * on every run — true, and completely uninformative. For the non-comparison
 * sorts the bound describes array traffic, so that is what gets compared.
 *
 * `predict` carries the standard leading term with the constant its own
 * analysis gives (n²/2 for the quadratic family, n(n-1)/2 for selection's
 * exact count), and nothing else — no fitting to this implementation. That is
 * why the verdict bands around it are wide: agreeing with a constant-free
 * bound within a factor of two is the strongest claim it can support.
 */
export interface SortProfile {
  bigO: string;
  /** Which measured counter the prediction should be read against. */
  measures: 'comparisons' | 'accesses';
  predict(n: number): number;
}

const nLogN = (n: number) => n * Math.log2(Math.max(2, n));
const halfNSquared = (n: number) => (n * n) / 2;

export const SORT_PROFILE: Record<string, SortProfile> = {
  bubble: { bigO: 'n²', measures: 'comparisons', predict: halfNSquared },
  cocktail: { bigO: 'n²', measures: 'comparisons', predict: halfNSquared },
  gnome: { bigO: 'n²', measures: 'comparisons', predict: halfNSquared },
  comb: { bigO: 'n log n', measures: 'comparisons', predict: nLogN },
  // Insertion's average is half the quadratic family's, because it stops at
  // the first element that is already smaller rather than scanning the pass.
  insertion: { bigO: 'n²', measures: 'comparisons', predict: (n) => (n * n) / 4 },
  shell: { bigO: 'n^1.3', measures: 'comparisons', predict: (n) => 2 * Math.pow(Math.max(2, n), 1.3) },
  // Selection's count is exact and input-independent: it always scans the
  // whole unsorted remainder, which is the reason it never beats its bound.
  selection: { bigO: 'n²', measures: 'comparisons', predict: (n) => (n * (n - 1)) / 2 },
  cycle: { bigO: 'n²', measures: 'comparisons', predict: (n) => n * n },
  merge: { bigO: 'n log n', measures: 'comparisons', predict: nLogN },
  quick: { bigO: 'n log n', measures: 'comparisons', predict: nLogN },
  heap: { bigO: 'n log n', measures: 'comparisons', predict: (n) => 1.5 * nLogN(n) },
  tim: { bigO: 'n log n', measures: 'comparisons', predict: nLogN },
  intro: { bigO: 'n log n', measures: 'comparisons', predict: nLogN },

  // Array traffic, not comparisons — see `measures` above. Counting reads the
  // input once and writes it back once; radix repeats that per digit place;
  // bucket scatters, sorts within buckets, and gathers.
  counting: { bigO: 'n + k', measures: 'accesses', predict: (n) => 2 * n },
  radix: { bigO: 'd · n', measures: 'accesses', predict: (n) => 6 * n },
  bucket: { bigO: 'n + k', measures: 'accesses', predict: (n) => 10 * n },

  // Capped, because n! at even n=8 overflows the readout long before it
  // overflows anything else.
  bogo: {
    bigO: '(n+1)!',
    measures: 'comparisons',
    predict: (n) => Math.min(200_000, n * factorial(n)),
  },
};

function factorial(n: number): number {
  let total = 1;
  for (let i = 2; i <= n; i++) total *= i;
  return total;
}

/** Which family panel an algorithm lives under, derived from the groups above. */
export const FAMILY_BY_ID: Record<string, string> = Object.fromEntries(
  SORT_GROUPS.flatMap((group) => group.algorithms.map((a) => [a.id, group.label])),
);
