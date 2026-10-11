import { SortCtx } from '../engine';
import { defineSort } from './define';

/**
 * Bubble family: repeated adjacent compare-and-swap passes.
 * Cocktail alternates direction, comb uses a shrinking gap, gnome walks a
 * single pointer backwards instead of nesting loops.
 */

export const bubbleSort = defineSort({
  id: 'bubble',
  label: 'Bubble Sort',
  summary:
    'Repeatedly swaps adjacent out-of-order pairs; the largest value bubbles to the end each pass.',
  complexity: { time: 'O(n²)', space: 'O(1)' },
  pseudocode: [
    'for i = 0 to n-2',
    '  swapped = false',
    '  for j = 0 to n-2-i',
    '    if a[j] > a[j+1]',
    '      swap a[j], a[j+1]; swapped = true',
    '  mark a[n-1-i] as sorted',
    '  if not swapped: break',
  ],
  *generate(_state, input) {
    const ctx = new SortCtx(input.values);
    const n = ctx.length;
    for (let i = 0; i < n - 1; i++) {
      let swapped = false;
      for (let j = 0; j < n - 1 - i; j++) {
        yield* ctx.compare(j, j + 1, 3);
        if (ctx.at(j) > ctx.at(j + 1)) {
          yield* ctx.swap(j, j + 1, 4);
          swapped = true;
        }
      }
      yield* ctx.markSorted([n - 1 - i], 5);
      if (!swapped) break;
    }
    yield* ctx.markAllSorted(6);
  },
});

export const cocktailSort = defineSort({
  id: 'cocktail',
  label: 'Cocktail Shaker Sort',
  summary:
    'Bubble sort that alternates direction each pass, so small values at the tail rise quickly too.',
  complexity: { time: 'O(n²)', space: 'O(1)' },
  pseudocode: [
    'lo = 0; hi = n-1',
    'while lo < hi',
    '  forward pass: swap adjacent pairs lo..hi-1',
    '  mark a[hi] sorted; hi = hi - 1',
    '  backward pass: swap adjacent pairs hi-1..lo',
    '  mark a[lo] sorted; lo = lo + 1',
  ],
  *generate(_state, input) {
    const ctx = new SortCtx(input.values);
    let lo = 0;
    let hi = ctx.length - 1;
    while (lo < hi) {
      let swapped = false;

      yield* ctx.note('forward pass', 2);
      for (let j = lo; j < hi; j++) {
        yield* ctx.compare(j, j + 1, 2);
        if (ctx.at(j) > ctx.at(j + 1)) {
          yield* ctx.swap(j, j + 1, 2);
          swapped = true;
        }
      }
      yield* ctx.markSorted([hi], 3);
      hi--;

      yield* ctx.note('backward pass', 4);
      for (let j = hi; j > lo; j--) {
        yield* ctx.compare(j - 1, j, 4);
        if (ctx.at(j - 1) > ctx.at(j)) {
          yield* ctx.swap(j - 1, j, 4);
          swapped = true;
        }
      }
      yield* ctx.markSorted([lo], 5);
      lo++;

      if (!swapped) break;
    }
    yield* ctx.note(null, 5);
    yield* ctx.markAllSorted(5);
  },
});

export const combSort = defineSort({
  id: 'comb',
  label: 'Comb Sort',
  summary:
    'Bubble sort with a gap that shrinks by ~1.3× each pass, killing off distant small values early.',
  complexity: { time: 'O(n²) worst, ~O(n log n) typical', space: 'O(1)' },
  pseudocode: [
    'gap = n',
    'while gap > 1 or a swap happened',
    '  gap = max(1, floor(gap / 1.3))',
    '  for j = 0 to n-1-gap',
    '    if a[j] > a[j+gap]',
    '      swap a[j], a[j+gap]',
  ],
  *generate(_state, input) {
    const ctx = new SortCtx(input.values);
    const n = ctx.length;
    let gap = n;
    let swapped = true;
    while (gap > 1 || swapped) {
      gap = Math.max(1, Math.floor(gap / 1.3));
      yield* ctx.note(`gap = ${gap}`, 2);
      swapped = false;
      for (let j = 0; j + gap < n; j++) {
        yield* ctx.compare(j, j + gap, 4);
        if (ctx.at(j) > ctx.at(j + gap)) {
          yield* ctx.swap(j, j + gap, 5);
          swapped = true;
        }
      }
    }
    yield* ctx.note(null, 5);
    yield* ctx.markAllSorted(5);
  },
});

export const bogoSort = defineSort({
  id: 'bogo',
  label: 'Bogo Sort',
  summary:
    'Shuffles at random and checks whether it got lucky. Included as a joke — size is capped for your browser’s sake.',
  complexity: { time: 'O((n+1)!) average, unbounded worst', space: 'O(1)' },
  pseudocode: [
    'while not sorted:',
    '  check each adjacent pair',
    '  if any pair is out of order:',
    '    shuffle the whole array and try again',
  ],
  *generate(_state, input) {
    const ctx = new SortCtx(input.values);
    const n = ctx.length;
    // Bogo sort has no useful bound, so cap the work rather than hang the tab.
    // At the 6-element limit the page enforces, 720 permutations means this
    // ceiling is effectively never reached.
    const MAX_SHUFFLES = 5_000;

    for (let attempt = 0; attempt < MAX_SHUFFLES; attempt++) {
      let sorted = true;
      for (let i = 0; i < n - 1; i++) {
        yield* ctx.compare(i, i + 1, 1);
        if (ctx.at(i) > ctx.at(i + 1)) {
          sorted = false;
          break;
        }
      }
      if (sorted) break;

      yield* ctx.note(`shuffle #${attempt + 1}`, 3);
      // Fisher-Yates, emitted as swaps so every shuffle is steppable.
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        if (i !== j) yield* ctx.swap(i, j, 3);
      }
    }

    yield* ctx.note(null, 3);
    yield* ctx.markAllSorted(3);
  },
});

export const gnomeSort = defineSort({
  id: 'gnome',
  label: 'Gnome Sort',
  summary:
    'Walks forward; on finding an out-of-order pair it swaps and steps back until order is restored.',
  complexity: { time: 'O(n²)', space: 'O(1)' },
  pseudocode: [
    'i = 0',
    'while i < n',
    '  if i == 0 or a[i-1] <= a[i]',
    '    i = i + 1',
    '  else',
    '    swap a[i-1], a[i]; i = i - 1',
  ],
  *generate(_state, input) {
    const ctx = new SortCtx(input.values);
    const n = ctx.length;
    let i = 0;
    while (i < n) {
      if (i === 0) {
        i++;
        continue;
      }
      yield* ctx.compare(i - 1, i, 2);
      if (ctx.at(i - 1) <= ctx.at(i)) {
        i++;
      } else {
        yield* ctx.swap(i - 1, i, 5);
        i--;
      }
    }
    yield* ctx.markAllSorted(5);
  },
});
