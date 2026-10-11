import type { SortCtx } from '../engine';
import { SortCtx as Ctx } from '../engine';
import type { SortStep } from '../types';
import { defineSort } from './define';

/**
 * Insertion pass over indices [lo, hi] with a stride of `gap`.
 *
 * gap === 1 is plain insertion sort; gap > 1 is one Shell pass. Reused by
 * Shell, Timsort's run building and Bucket sort's per-bucket sort.
 */
export function* insertionPass(
  ctx: SortCtx,
  lo: number,
  hi: number,
  gap = 1,
  lines = { read: 1, compare: 3, shift: 4, place: 6 },
): Generator<SortStep> {
  for (let i = lo + gap; i <= hi; i++) {
    yield* ctx.read(i, lines.read);
    const key = ctx.at(i);
    let j = i - gap;
    while (j >= lo) {
      yield* ctx.compareScalar(j, key, lines.compare);
      if (ctx.at(j) <= key) break;
      yield* ctx.set(j + gap, ctx.at(j), lines.shift);
      j -= gap;
    }
    yield* ctx.set(j + gap, key, lines.place);
  }
}

export const insertionSort = defineSort({
  id: 'insertion',
  label: 'Insertion Sort',
  summary: 'Grows a sorted prefix, sliding each new value left until it lands in place.',
  complexity: { time: 'O(n²), O(n) on nearly-sorted input', space: 'O(1)' },
  pseudocode: [
    'for i = 1 to n-1',
    '  key = a[i]',
    '  j = i - 1',
    '  while j >= 0 and a[j] > key',
    '    a[j+1] = a[j]',
    '    j = j - 1',
    '  a[j+1] = key',
  ],
  *generate(_state, input) {
    const ctx = new Ctx(input.values);
    yield* insertionPass(ctx, 0, ctx.length - 1, 1, { read: 1, compare: 3, shift: 4, place: 6 });
    yield* ctx.markAllSorted(6);
  },
});

export const shellSort = defineSort({
  id: 'shell',
  label: 'Shell Sort',
  summary:
    'Insertion sort over progressively smaller gaps, so values travel far early and little at the end.',
  complexity: { time: '~O(n^1.3) with this gap sequence', space: 'O(1)' },
  pseudocode: [
    'gap = floor(n / 2)',
    'while gap >= 1',
    '  for i = gap to n-1',
    '    key = a[i]; j = i - gap',
    '    while j >= 0 and a[j] > key',
    '      a[j+gap] = a[j]; j = j - gap',
    '    a[j+gap] = key',
    '  gap = floor(gap / 2)',
  ],
  *generate(_state, input) {
    const ctx = new Ctx(input.values);
    const n = ctx.length;
    for (let gap = Math.floor(n / 2); gap >= 1; gap = Math.floor(gap / 2)) {
      yield* ctx.note(`gap = ${gap}`, 1);
      yield* insertionPass(ctx, 0, n - 1, gap, { read: 3, compare: 4, shift: 5, place: 6 });
    }
    yield* ctx.note(null, 7);
    yield* ctx.markAllSorted(7);
  },
});
