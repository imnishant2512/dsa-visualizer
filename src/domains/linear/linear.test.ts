import { describe, expect, it } from 'vitest';
import { initFrame, stepBack, stepForward } from '../../engine/player';
import type { StepEngine } from '../../engine/types';
import { initListState, initSeqState, listEngine, listToArray, seqEngine } from './engine';
import {
  LIST_OPERATIONS,
  SEQ_OPERATIONS,
  arrayInsert,
  arrayRemove,
  arraySearch,
  listInsertHead,
  listInsertTail,
  listRemoveValue,
  listSearch,
  queueDequeue,
  queueEnqueue,
  stackPop,
  stackPush,
  type OpArgs,
} from './operations';
import {
  LINEAR_STAT_KEYS,
  type ListState,
  type ListStep,
  type SeqState,
  type SeqStep,
} from './types';

/** Runs one operation to completion and returns the resulting state. */
function apply<TState, TStep>(
  engine: StepEngine<TState, TStep>,
  generate: (state: TState, args: OpArgs) => Generator<TStep>,
  state: TState,
  args: Partial<OpArgs> = {},
): TState {
  const full: OpArgs = { value: 0, index: 0, ...args };
  let current = state;
  for (const step of generate(state, full)) {
    current = engine.applyStep(current, step);
  }
  return current;
}

function runSeq(
  state: SeqState,
  op: (typeof SEQ_OPERATIONS)['array'][number],
  args: Partial<OpArgs> = {},
) {
  return apply(seqEngine, op.generate, state, args);
}

function runList(
  state: ListState,
  op: (typeof LIST_OPERATIONS)[number],
  args: Partial<OpArgs> = {},
) {
  return apply(listEngine, op.generate, state, args);
}

describe('array operations', () => {
  it('inserts at an index like splice', () => {
    let state = initSeqState([1, 2, 3, 4]);
    state = runSeq(state, arrayInsert, { value: 99, index: 2 });
    expect(state.items).toEqual([1, 2, 99, 3, 4]);
  });

  it('appends when the index is past the end', () => {
    let state = initSeqState([1, 2]);
    state = runSeq(state, arrayInsert, { value: 7, index: 10 });
    expect(state.items).toEqual([1, 2, 7]);
  });

  it('removes at an index like splice', () => {
    let state = initSeqState([1, 2, 3, 4]);
    state = runSeq(state, arrayRemove, { index: 1 });
    expect(state.items).toEqual([1, 3, 4]);
  });

  it('leaves the array untouched when removing out of range', () => {
    const state = initSeqState([1, 2, 3]);
    expect(runSeq(state, arrayRemove, { index: 9 }).items).toEqual([1, 2, 3]);
  });

  it('finds a present value and reports a missing one', () => {
    const state = initSeqState([5, 8, 13]);
    expect(runSeq(state, arraySearch, { value: 8 }).foundIndex).toBe(1);
    expect(runSeq(state, arraySearch, { value: 4 }).foundIndex).toBeNull();
  });
});

describe('stack', () => {
  it('is last-in first-out', () => {
    let state = initSeqState([]);
    for (const value of [1, 2, 3]) state = runSeq(state, stackPush, { value });
    expect(state.items).toEqual([1, 2, 3]);

    state = runSeq(state, stackPop);
    expect(state.items).toEqual([1, 2]);
    state = runSeq(state, stackPop);
    expect(state.items).toEqual([1]);
  });

  it('reports underflow instead of breaking', () => {
    const state = runSeq(initSeqState([]), stackPop);
    expect(state.items).toEqual([]);
    expect(state.note).toMatch(/underflow/);
  });
});

describe('queue', () => {
  it('is first-in first-out', () => {
    let state = initSeqState([]);
    for (const value of [1, 2, 3]) state = runSeq(state, queueEnqueue, { value });
    state = runSeq(state, queueDequeue);
    expect(state.items).toEqual([2, 3]);
    state = runSeq(state, queueDequeue);
    expect(state.items).toEqual([3]);
  });

  it('reports underflow instead of breaking', () => {
    expect(runSeq(initSeqState([]), queueDequeue).note).toMatch(/underflow/);
  });
});

describe('linked list', () => {
  it('inserts at the head in reverse order', () => {
    let state = initListState([]);
    for (const value of [1, 2, 3]) state = runList(state, listInsertHead, { value });
    expect(listToArray(state)).toEqual([3, 2, 1]);
  });

  it('inserts at the tail in order', () => {
    let state = initListState([]);
    for (const value of [1, 2, 3]) state = runList(state, listInsertTail, { value });
    expect(listToArray(state)).toEqual([1, 2, 3]);
  });

  it('removes the head, a middle node and the tail', () => {
    const base = initListState([1, 2, 3, 4]);
    expect(listToArray(runList(base, listRemoveValue, { value: 1 }))).toEqual([2, 3, 4]);
    expect(listToArray(runList(base, listRemoveValue, { value: 3 }))).toEqual([1, 2, 4]);
    expect(listToArray(runList(base, listRemoveValue, { value: 4 }))).toEqual([1, 2, 3]);
  });

  it('leaves the list intact when removing a value that is absent', () => {
    const state = runList(initListState([1, 2, 3]), listRemoveValue, { value: 42 });
    expect(listToArray(state)).toEqual([1, 2, 3]);
    expect(state.note).toMatch(/not in the list/);
  });

  it('frees the removed node rather than orphaning it', () => {
    const state = runList(initListState([1, 2, 3]), listRemoveValue, { value: 2 });
    expect(Object.keys(state.nodes)).toHaveLength(2);
  });

  it('empties completely and refills', () => {
    let state = initListState([1, 2]);
    state = runList(state, listRemoveValue, { value: 1 });
    state = runList(state, listRemoveValue, { value: 2 });
    expect(listToArray(state)).toEqual([]);
    expect(state.headId).toBeNull();

    state = runList(state, listInsertTail, { value: 9 });
    expect(listToArray(state)).toEqual([9]);
  });

  it('mirrors an array through a long random sequence', () => {
    let state = initListState([]);
    const mirror: number[] = [];
    for (let i = 0; i < 60; i++) {
      const value = Math.floor(Math.random() * 20);
      const roll = Math.random();
      if (roll < 0.4) {
        state = runList(state, listInsertTail, { value });
        mirror.push(value);
      } else if (roll < 0.7) {
        state = runList(state, listInsertHead, { value });
        mirror.unshift(value);
      } else {
        state = runList(state, listRemoveValue, { value });
        const at = mirror.indexOf(value);
        if (at !== -1) mirror.splice(at, 1);
      }
      expect(listToArray(state)).toEqual(mirror);
    }
  });

  it('finds a present value and reports a missing one', () => {
    const state = initListState([5, 8, 13]);
    const found = runList(state, listSearch, { value: 8 });
    expect(found.foundId).not.toBeNull();
    expect(state.nodes[found.foundId!].value).toBe(8);
    expect(runList(state, listSearch, { value: 4 }).foundId).toBeNull();
  });
});

describe('step inversion', () => {
  const seqCases: Array<
    [string, SeqState, (typeof SEQ_OPERATIONS)['array'][number], Partial<OpArgs>]
  > = Object.entries(SEQ_OPERATIONS).flatMap(([variant, ops]) =>
    ops.map((op): [string, SeqState, (typeof SEQ_OPERATIONS)['array'][number], Partial<OpArgs>] => [
      `${variant}/${op.id}`,
      initSeqState([4, 8, 15, 16, 23]),
      op,
      { value: 15, index: 2 },
    ]),
  );

  it.each(seqCases)('%s inverts every step exactly', (_name, state, op, args) => {
    const full: OpArgs = { value: 0, index: 0, ...args };
    let current = state;
    for (const step of op.generate(state, full) as Generator<SeqStep>) {
      const before = structuredClone(current);
      const after = seqEngine.applyStep(current, step);
      expect(seqEngine.invertStep(after, step)).toEqual(before);
      current = after;
    }
  });

  it.each(LIST_OPERATIONS.map((op) => [op.id, op] as const))(
    'list/%s inverts every step exactly',
    (_id, op) => {
      const state = initListState([4, 8, 15, 16]);
      let current = state;
      for (const step of op.generate(state, { value: 15, index: 1 }) as Generator<ListStep>) {
        const before = structuredClone(current);
        const after = listEngine.applyStep(current, step);
        expect(listEngine.invertStep(after, step)).toEqual(before);
        current = after;
      }
    },
  );

  it('rewinds a full operation back to its starting state', () => {
    const start = initSeqState([4, 8, 15, 16, 23]);
    const steps = [...arrayInsert.generate(start, { value: 42, index: 2 })];
    let frame = initFrame<SeqState>(start, LINEAR_STAT_KEYS, steps.length);
    while (frame.cursor < steps.length - 1) frame = stepForward(frame, steps, seqEngine);
    expect(frame.state.items).toEqual([4, 8, 42, 15, 16, 23]);

    while (frame.cursor >= 0) frame = stepBack(frame, steps, seqEngine);
    expect(frame.state).toEqual(start);
    for (const key of LINEAR_STAT_KEYS) expect(frame.stats[key]).toBe(0);
  });
});

describe('pseudocode mapping', () => {
  it('every emitted line index is in range', () => {
    for (const ops of Object.values(SEQ_OPERATIONS)) {
      for (const op of ops) {
        for (const step of op.generate(initSeqState([1, 2, 3]), { value: 2, index: 1 })) {
          const line = seqEngine.lineFor?.(step);
          if (line !== undefined) expect(line).toBeLessThan(op.pseudocode.length);
        }
      }
    }
    for (const op of LIST_OPERATIONS) {
      for (const step of op.generate(initListState([1, 2, 3]), { value: 2, index: 1 })) {
        const line = listEngine.lineFor?.(step);
        if (line !== undefined) expect(line).toBeLessThan(op.pseudocode.length);
      }
    }
  });
});
