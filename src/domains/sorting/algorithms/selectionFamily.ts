import { SortCtx } from '../engine';
import { defineSort } from './define';

/**
 * Selection family: find where a value belongs by scanning, then place it
 * directly. Selection picks the minimum per pass; Cycle computes each value's
 * final rank so it performs the theoretical minimum number of writes.
 */

export const selectionSort = defineSort({
  id: 'selection',
  label: 'Selection Sort',
  summary: 'Scans for the smallest remaining value each pass and swaps it into place.',
  complexity: { time: 'O(n²)', space: 'O(1)' },
  pseudocode: [
    'for i = 0 to n-1',
    '  min = i',
    '  for j = i+1 to n-1',
    '    if a[j] < a[min]',
    '      min = j',
    '  swap a[i], a[min]',
    '  mark a[i] as sorted',
  ],
  *generate(_state, input) {
    const ctx = new SortCtx(input.values);
    const n = ctx.length;
    for (let i = 0; i < n; i++) {
      let min = i;
      for (let j = i + 1; j < n; j++) {
        yield* ctx.compare(j, min, 3);
        if (ctx.at(j) < ctx.at(min)) min = j;
      }
      if (min !== i) yield* ctx.swap(i, min, 5);
      yield* ctx.markSorted([i], 6);
    }
    yield* ctx.markAllSorted(6);
  },
});

export const cycleSort = defineSort({
  id: 'cycle',
  label: 'Cycle Sort',
  summary:
    'Computes each value’s final rank and rotates cycles into place — the fewest writes of any sort.',
  complexity: { time: 'O(n²)', space: 'O(1)' },
  pseudocode: [
    'for cycleStart = 0 to n-2',
    '  item = a[cycleStart]',
    '  pos = cycleStart + count of a[i] < item',
    '  if pos == cycleStart: continue',
    '  skip duplicates of item',
    '  write item into a[pos], carry the old value',
    '  repeat until the cycle returns to cycleStart',
  ],
  *generate(_state, input) {
    const ctx = new SortCtx(input.values);
    const n = ctx.length;

    for (let cycleStart = 0; cycleStart < n - 1; cycleStart++) {
      yield* ctx.read(cycleStart, 1);
      let item = ctx.at(cycleStart);

      // Rank the held value against the rest of the array.
      let pos = cycleStart;
      for (let i = cycleStart + 1; i < n; i++) {
        yield* ctx.compareScalar(i, item, 2);
        if (ctx.at(i) < item) pos++;
      }

      if (pos === cycleStart) {
        yield* ctx.markSorted([cycleStart], 3);
        continue;
      }

      while (pos < n - 1 && item === ctx.at(pos)) pos++;
      let carried = ctx.at(pos);
      yield* ctx.set(pos, item, 5);
      item = carried;

      // Keep rotating until the carried value belongs back at cycleStart.
      while (pos !== cycleStart) {
        pos = cycleStart;
        for (let i = cycleStart + 1; i < n; i++) {
          yield* ctx.compareScalar(i, item, 6);
          if (ctx.at(i) < item) pos++;
        }
        while (pos < n - 1 && item === ctx.at(pos)) pos++;
        carried = ctx.at(pos);
        yield* ctx.set(pos, item, 6);
        item = carried;
      }
      yield* ctx.markSorted([cycleStart], 6);
    }
    yield* ctx.markAllSorted(6);
  },
});
