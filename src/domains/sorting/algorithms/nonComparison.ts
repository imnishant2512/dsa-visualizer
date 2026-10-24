import { SortCtx as Ctx } from '../engine';
import { defineSort } from './define';
import { insertionPass } from './insertionFamily';

/**
 * Non-comparison sorts. These distribute values by their own digits/keys
 * instead of comparing them, so their `comparisons` counter stays at zero —
 * the exception is Bucket sort, which comparison-sorts inside each bucket.
 */

export const countingSort = defineSort({
  id: 'counting',
  label: 'Counting Sort',
  summary:
    'Tallies how many times each value occurs, then writes values back in ascending order. No comparisons at all.',
  complexity: { time: 'O(n + k)', space: 'O(k)' },
  pseudocode: [
    'for each value v in a: count[v] += 1',
    'k = 0',
    'for v = 0 to max:',
    '  repeat count[v] times:',
    '    a[k] = v; k = k + 1',
  ],
  *generate(_state, input) {
    const ctx = new Ctx(input.values);
    const n = ctx.length;
    if (n === 0) return;

    const counts: number[] = [];
    for (let i = 0; i < n; i++) {
      const value = ctx.at(i);
      yield* ctx.bucketPlace(i, value, 0, 0);
      counts[value] = (counts[value] ?? 0) + 1;
    }

    let k = 0;
    for (let value = 0; value < counts.length; value++) {
      const count = counts[value] ?? 0;
      for (let c = 0; c < count; c++) {
        yield* ctx.set(k, value, 4);
        yield* ctx.markSorted([k], 4);
        k++;
      }
    }
  },
});

export const radixSort = defineSort({
  id: 'radix',
  label: 'Radix Sort (LSD)',
  summary:
    'Distributes values into 10 digit buckets, least-significant digit first, one pass per digit place.',
  complexity: { time: 'O(d · n)', space: 'O(n + k)' },
  pseudocode: [
    'for place = 1, 10, 100, ... up to max:',
    '  empty 10 buckets',
    '  for each value: bucket by (value / place) % 10',
    '  write buckets back left to right,',
    '    preserving order within each bucket',
  ],
  *generate(_state, input) {
    const ctx = new Ctx(input.values);
    const n = ctx.length;
    if (n === 0) return;

    let max = 0;
    for (let i = 0; i < n; i++) {
      yield* ctx.read(i, 0);
      max = Math.max(max, ctx.at(i));
    }

    for (let place = 1; Math.floor(max / place) > 0; place *= 10) {
      yield* ctx.note(`digit place ${place}`, 0);
      const buckets: number[][] = Array.from({ length: 10 }, () => []);

      for (let i = 0; i < n; i++) {
        const digit = Math.floor(ctx.at(i) / place) % 10;
        yield* ctx.bucketPlace(i, digit, place, 2);
        buckets[digit].push(ctx.at(i));
      }

      let k = 0;
      for (let digit = 0; digit < 10; digit++) {
        for (const value of buckets[digit]) {
          yield* ctx.set(k++, value, 3);
        }
      }
    }

    yield* ctx.note(null, 4);
    yield* ctx.markAllSorted(4);
  },
});

export const bucketSort = defineSort({
  id: 'bucket',
  label: 'Bucket Sort',
  summary:
    'Scatters values into range buckets, insertion-sorts each bucket, then concatenates them.',
  complexity: { time: 'O(n + k) average, O(n²) worst', space: 'O(n + k)' },
  pseudocode: [
    'find min and max',
    'scatter each value into one of k range buckets',
    'write buckets back in order',
    'insertion sort each bucket’s slice in place',
  ],
  *generate(_state, input) {
    const ctx = new Ctx(input.values);
    const n = ctx.length;
    if (n === 0) return;

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      yield* ctx.read(i, 0);
      min = Math.min(min, ctx.at(i));
      max = Math.max(max, ctx.at(i));
    }

    const bucketCount = Math.max(1, Math.floor(Math.sqrt(n)));
    const span = max - min + 1;
    const buckets: number[][] = Array.from({ length: bucketCount }, () => []);

    for (let i = 0; i < n; i++) {
      const value = ctx.at(i);
      const b = Math.min(bucketCount - 1, Math.floor(((value - min) / span) * bucketCount));
      yield* ctx.bucketPlace(i, b, 0, 1);
      buckets[b].push(value);
    }

    // Write buckets back in order, then sort each contiguous slice in place.
    let k = 0;
    const ranges: Array<{ lo: number; hi: number }> = [];
    for (let b = 0; b < bucketCount; b++) {
      const lo = k;
      for (const value of buckets[b]) {
        yield* ctx.set(k++, value, 2);
      }
      if (k > lo) ranges.push({ lo, hi: k - 1 });
    }

    for (const { lo, hi } of ranges) {
      yield* ctx.note(`sorting bucket [${lo}, ${hi}]`, 3);
      yield* ctx.setRange({ lo, hi, role: 'bucket' }, 3);
      yield* insertionPass(ctx, lo, hi, 1, { read: 3, compare: 3, shift: 3, place: 3 });
      yield* ctx.markSorted(
        Array.from({ length: hi - lo + 1 }, (_, i) => lo + i),
        3,
      );
    }

    yield* ctx.note(null, 3);
    yield* ctx.setRange(null, 3);
    yield* ctx.markAllSorted(3);
  },
});
