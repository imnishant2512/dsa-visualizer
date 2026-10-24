import { describe, expect, it } from 'vitest';
import { narrateSortStep, sortVisualKind } from './narrate';
import type { SortState, SortStep } from './types';

const state = (values: number[]): SortState => ({
  values,
  sorted: values.map(() => false),
  note: null,
  range: null,
});

describe('narrateSortStep', () => {
  it('reads a comparison off the values, not the indices alone', () => {
    const step: SortStep = { kind: 'compare', indices: [0, 2] };
    expect(narrateSortStep(step, state([5, 9, 3]))).toBe(
      'Compared a[0] (5) with a[2] (3) — out of order.',
    );
  });

  it('reports a swap using the values as they are after it', () => {
    const step: SortStep = { kind: 'swap', a: 0, b: 1 };
    // The frame handed to the narrator is the state after the step applies,
    // which is what makes "now" truthful here.
    expect(narrateSortStep(step, state([2, 7]))).toBe('Swapped a[0] and a[1] — now 2 and 7.');
  });

  it('counts a bulk markSorted rather than listing every index', () => {
    /*
     * Several algorithms mark the whole array in one closing step. Listing
     * them produced a four-line paragraph in an aria-live region, which a
     * screen reader read out index by index as the last word on the run.
     */
    const many: SortStep = { kind: 'markSorted', indices: Array.from({ length: 45 }, (_, i) => i) };
    expect(narrateSortStep(many, state([]))).toBe('45 elements are in their final positions.');

    const few: SortStep = { kind: 'markSorted', indices: [3, 4] };
    expect(narrateSortStep(few, state([]))).toBe('a[3] and a[4] are in their final positions.');
  });

  it('has something to say before the first step', () => {
    expect(narrateSortStep(null, state([1]))).toMatch(/^Ready/);
  });
});

describe('sortVisualKind', () => {
  it('maps context-only steps to the neutral kind', () => {
    expect(sortVisualKind({ kind: 'rangeHighlight', range: null, prevRange: null })).toBe('idle');
    expect(sortVisualKind({ kind: 'passBoundary', note: null, prevNote: null })).toBe('idle');
  });

  it('separates the kinds the legend and tick strip colour by', () => {
    expect(sortVisualKind({ kind: 'compare', indices: [0] })).toBe('compare');
    expect(sortVisualKind({ kind: 'swap', a: 0, b: 1 })).toBe('swap');
    expect(sortVisualKind({ kind: 'set', index: 0, value: 1, prevValue: 2 })).toBe('write');
    expect(sortVisualKind({ kind: 'bucketPlace', index: 0, bucket: 1, place: 0 })).toBe('bucket');
  });
});
