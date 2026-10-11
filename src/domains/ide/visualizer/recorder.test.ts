import { describe, expect, it } from 'vitest';
import { seek } from '../../../engine/player';
import { sortEngine } from '../../sorting/engine';
import { SORT_STAT_KEYS, type SortState } from '../../sorting/types';
import { SORT_TEMPLATE, STEP_CAP, recordSort } from './recorder';
import { checkSorted } from './verdict';

const INPUT = [5, 3, 8, 1, 9, 2];

function initial(values: number[]): SortState {
  return { values: [...values], sorted: values.map(() => false), note: null, range: null };
}

describe('recordSort', () => {
  it('records the template as steps the sorting engine can replay', () => {
    const recording = recordSort(SORT_TEMPLATE, INPUT, STEP_CAP);
    if (!recording.ok) throw new Error(recording.error);

    const end = seek(
      initial(INPUT),
      recording.steps,
      sortEngine,
      recording.steps.length - 1,
      SORT_STAT_KEYS,
    );
    expect(end.state.values).toEqual([1, 2, 3, 5, 8, 9]);
    expect(end.state.sorted.every(Boolean)).toBe(true);
    expect(checkSorted(INPUT, end.state.values)).toEqual({ ok: true });
  });

  it('produces steps that invert exactly, so the user can step backwards', () => {
    /*
     * The engine's stepBack relies on each `set` carrying the value it
     * overwrote and each `markSorted` carrying only fresh indices. A recording
     * that broke either would replay forward correctly and then corrupt the
     * array on the first step back.
     */
    const code = `function* customSort(ctx) {
      yield* ctx.write(0, 42);
      yield* ctx.swap(0, 5);
      yield* ctx.markSorted([1, 2]);
      yield* ctx.markSorted([2, 3]);
      yield* ctx.markAllSorted();
    }`;
    const recording = recordSort(code, INPUT, STEP_CAP);
    if (!recording.ok) throw new Error(recording.error);

    let state = initial(INPUT);
    for (const step of recording.steps) {
      const before = structuredClone(state);
      const after = sortEngine.applyStep(state, step);
      expect(sortEngine.invertStep(after, step)).toEqual(before);
      state = after;
    }
  });

  it('never re-marks an index that is already marked', () => {
    const code = `function* customSort(ctx) {
      yield* ctx.markSorted([0, 1]);
      yield* ctx.markSorted([1, 2]);
      yield* ctx.markAllSorted();
    }`;
    const recording = recordSort(code, INPUT, STEP_CAP);
    if (!recording.ok) throw new Error(recording.error);
    const marks = recording.steps.flatMap((s) => (s.kind === 'markSorted' ? s.indices : []));
    expect(new Set(marks).size).toBe(marks.length);
    expect(marks.sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('stops a sort that yields forever at the step cap', () => {
    const code = `function* customSort(ctx) { while (true) yield* ctx.compare(0, 1); }`;
    const recording = recordSort(code, INPUT, 1000);
    expect(recording.ok).toBe(false);
    if (!recording.ok) expect(recording.error).toMatch(/Stopped after 1,000 steps/);
  });

  it('names a bad index instead of quietly reading undefined', () => {
    const code = `function* customSort(ctx) { yield* ctx.compare(0, ctx.length); }`;
    const recording = recordSort(code, INPUT, STEP_CAP);
    expect(recording.ok).toBe(false);
    if (!recording.ok)
      expect(recording.error).toMatch(
        /compare\(0, 6\): 6 is not an index — valid indices are 0 to 5/,
      );
  });

  it('explains a missing or non-generator customSort', () => {
    const missing = recordSort('function sortIt() {}', INPUT, STEP_CAP);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/No customSort found/);

    const plain = recordSort('function customSort(ctx) { return 1; }', INPUT, STEP_CAP);
    expect(plain.ok).toBe(false);
    if (!plain.ok) expect(plain.error).toMatch(/must be a generator/);
  });

  it('reports a syntax error rather than throwing out of the page', () => {
    const broken = recordSort('function* customSort(ctx) { yield* ', INPUT, STEP_CAP);
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error).toMatch(/SyntaxError/);
  });

  it('closes over nothing, so it survives being stringified into a worker', () => {
    // Rebuilding the function from its own source is what the worker does.
    const rebuilt = new Function(`return (${recordSort.toString()});`)() as typeof recordSort;
    const recording = rebuilt(SORT_TEMPLATE, INPUT, STEP_CAP);
    expect(recording.ok).toBe(true);
  });
});

describe('checkSorted', () => {
  it('passes a sorted rearrangement', () => {
    expect(checkSorted([3, 1, 2], [1, 2, 3])).toEqual({ ok: true });
  });

  it('names the first pair out of order', () => {
    expect(checkSorted([3, 1, 2], [1, 3, 2])).toEqual({
      ok: false,
      reason: 'Not sorted: a[1] (3) is greater than a[2] (2).',
    });
  });

  it('catches ascending output made of the wrong values', () => {
    // Order-only checking would pass this: it is ascending. It is also wrong.
    const verdict = checkSorted([3, 1, 2], [1, 2, 99]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/not a rearrangement/);
  });
});
