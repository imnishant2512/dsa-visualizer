import type { SortCtx } from '../engine';
import { SortCtx as Ctx } from '../engine';
import type { SortStep } from '../types';
import { defineSort } from './define';

const LINES = { build: 1, compare: 3, swap: 4, extract: 7 };

/** Sifts a[root] down within the heap occupying [lo, lo+size). */
export function* siftDown(
  ctx: SortCtx,
  lo: number,
  root: number,
  size: number,
): Generator<SortStep> {
  let parent = root;
  for (;;) {
    const left = 2 * (parent - lo) + 1 + lo;
    const right = left + 1;
    let largest = parent;

    if (left - lo < size) {
      yield* ctx.compare(left, largest, LINES.compare);
      if (ctx.at(left) > ctx.at(largest)) largest = left;
    }
    if (right - lo < size) {
      yield* ctx.compare(right, largest, LINES.compare);
      if (ctx.at(right) > ctx.at(largest)) largest = right;
    }
    if (largest === parent) return;

    yield* ctx.swap(parent, largest, LINES.swap);
    parent = largest;
  }
}

/** Heapsort over [lo, hi]. Exported so Introsort can fall back to it. */
export function* heapSortRange(ctx: SortCtx, lo: number, hi: number): Generator<SortStep> {
  const size = hi - lo + 1;
  for (let i = Math.floor(size / 2) - 1; i >= 0; i--) {
    yield* siftDown(ctx, lo, lo + i, size);
  }
  for (let end = size - 1; end > 0; end--) {
    yield* ctx.swap(lo, lo + end, LINES.extract);
    yield* ctx.markSorted([lo + end], LINES.extract);
    yield* siftDown(ctx, lo, lo, end);
  }
  yield* ctx.markSorted([lo], LINES.extract);
}

export const heapSort = defineSort({
  id: 'heap',
  label: 'Heap Sort',
  summary:
    'Builds a max-heap in place, then repeatedly swaps the root to the end and re-heapifies.',
  complexity: { time: 'O(n log n)', space: 'O(1)' },
  pseudocode: [
    'build max-heap:',
    '  for i = n/2-1 down to 0: siftDown(i, n)',
    'siftDown(i, size):',
    '  compare a[i] with its children',
    '  if a child is larger: swap and continue down',
    'sort:',
    '  for end = n-1 down to 1:',
    '    swap a[0], a[end]; siftDown(0, end)',
  ],
  *generate(_state, input) {
    const ctx = new Ctx(input.values);
    if (ctx.length > 0) yield* heapSortRange(ctx, 0, ctx.length - 1);
    yield* ctx.markAllSorted(LINES.extract);
  },
});
