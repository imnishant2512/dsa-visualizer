import { describe, expect, it } from 'vitest';
import { narrateSeqStep } from './narrate';
import type { SeqState } from './types';

const seq = (items: number[]): SeqState => ({
  items,
  pointer: null,
  foundIndex: null,
  note: null,
});

describe('narrateSeqStep', () => {
  it('says nothing shifted when the removed element was last', () => {
    /*
     * Every stack pop removes the last element, so a blanket "shifting
     * everything after it left" misdescribed the one operation a stack exists
     * for. `state` is the array after the removal.
     */
    expect(narrateSeqStep({ kind: 'removeAt', index: 3, prevValue: 12 }, seq([1, 2, 3]))).toMatch(
      /nothing followed it, so nothing shifted/,
    );
  });

  it('counts what actually moved when removing from the middle', () => {
    expect(narrateSeqStep({ kind: 'removeAt', index: 1, prevValue: 7 }, seq([1, 3, 4]))).toBe(
      'Removed 7 from index 1, shifting the 2 after it left.',
    );
  });

  it('distinguishes an append from an insert that shifts', () => {
    expect(narrateSeqStep({ kind: 'insertAt', index: 3, value: 9 }, seq([1, 2, 3, 9]))).toMatch(
      /nothing had to move/,
    );
    expect(narrateSeqStep({ kind: 'insertAt', index: 0, value: 9 }, seq([9, 1, 2, 3]))).toBe(
      'Inserted 9 at index 0, shifting the 3 after it right.',
    );
  });
});
