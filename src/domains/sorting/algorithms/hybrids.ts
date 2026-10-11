import { SortCtx as Ctx } from '../engine';
import type { SortStep } from '../types';
import { defineSort } from './define';
import { heapSortRange } from './heap';
import { insertionPass } from './insertionFamily';
import { mergeRange } from './merge';
import { partitionLomuto } from './quick';

/**
 * The two production-grade hybrids, composed from the generators above rather
 * than reimplemented — which is the point: they are strategies over existing
 * sorts, not new algorithms.
 */

export const timSort = defineSort({
  id: 'tim',
  label: 'Timsort (simplified)',
  summary:
    'Insertion-sorts small runs, then merges them pairwise — the strategy behind Python and Java sorts.',
  complexity: { time: 'O(n log n), O(n) on sorted input', space: 'O(n)' },
  pseudocode: [
    'RUN = small block size',
    'for each block of RUN elements:',
    '  insertion sort the block',
    'size = RUN',
    'while size < n:',
    '  merge each adjacent pair of size-length runs',
    '  size = size * 2',
  ],
  *generate(_state, input) {
    const ctx = new Ctx(input.values);
    const n = ctx.length;
    if (n === 0) return;

    // Real Timsort uses 32-64; scaled down here so the run structure is visible.
    const RUN = n <= 64 ? 8 : 32;

    for (let start = 0; start < n; start += RUN) {
      const end = Math.min(start + RUN - 1, n - 1);
      yield* ctx.note(`insertion run [${start}, ${end}]`, 2);
      yield* ctx.setRange({ lo: start, hi: end, role: 'active' }, 2);
      yield* insertionPass(ctx, start, end, 1, { read: 2, compare: 2, shift: 2, place: 2 });
    }

    for (let size = RUN; size < n; size *= 2) {
      yield* ctx.note(`merging runs of ${size}`, 5);
      for (let lo = 0; lo < n; lo += 2 * size) {
        const mid = Math.min(lo + size - 1, n - 1);
        const hi = Math.min(lo + 2 * size - 1, n - 1);
        if (mid < hi) yield* mergeRange(ctx, lo, mid, hi);
      }
    }

    yield* ctx.note(null, 6);
    yield* ctx.setRange(null, 6);
    yield* ctx.markAllSorted(6);
  },
});

export const introSort = defineSort({
  id: 'intro',
  label: 'Introsort (simplified)',
  summary:
    'Quicksort that switches to heapsort when recursion runs too deep and to insertion sort when ranges get small — C++ std::sort’s strategy.',
  complexity: { time: 'O(n log n) guaranteed', space: 'O(log n)' },
  pseudocode: [
    'introSort(lo, hi, depthLimit):',
    '  if size <= 16: insertion sort the range',
    '  else if depthLimit == 0: heapsort the range',
    '  else:',
    '    p = partition(lo, hi)',
    '    introSort(lo, p-1, depthLimit-1)',
    '    introSort(p+1, hi, depthLimit-1)',
  ],
  *generate(_state, input) {
    const ctx = new Ctx(input.values);
    const n = ctx.length;
    if (n === 0) return;
    const SMALL = 16;

    function* sort(lo: number, hi: number, depth: number): Generator<SortStep> {
      if (lo > hi) return;
      if (lo === hi) {
        yield* ctx.markSorted([lo], 5);
        return;
      }
      const size = hi - lo + 1;

      if (size <= SMALL) {
        yield* ctx.note(`small range → insertion sort [${lo}, ${hi}]`, 1);
        yield* ctx.setRange({ lo, hi, role: 'active' }, 1);
        yield* insertionPass(ctx, lo, hi, 1, { read: 1, compare: 1, shift: 1, place: 1 });
        yield* ctx.markSorted(
          Array.from({ length: size }, (_, i) => lo + i),
          1,
        );
        return;
      }

      if (depth === 0) {
        yield* ctx.note(`depth limit → heapsort [${lo}, ${hi}]`, 2);
        yield* ctx.setRange({ lo, hi, role: 'active' }, 2);
        yield* heapSortRange(ctx, lo, hi);
        return;
      }

      const p = yield* partitionLomuto(ctx, lo, hi);
      yield* sort(lo, p - 1, depth - 1);
      yield* sort(p + 1, hi, depth - 1);
    }

    const depthLimit = 2 * Math.floor(Math.log2(n) || 1);
    yield* sort(0, n - 1, depthLimit);
    yield* ctx.note(null, 6);
    yield* ctx.setRange(null, 6);
    yield* ctx.markAllSorted(6);
  },
});
