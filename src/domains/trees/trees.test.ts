import { describe, expect, it } from 'vitest';
import type { StepEngine } from '../../engine/types';
import {
  countNodes,
  heapEngine,
  initHeapState,
  initTreeState,
  inorderValues,
  nodeHeight,
  treeEngine,
} from './engine';
import { layoutTree } from './layout';
import {
  AVL_OPERATIONS,
  BST_OPERATIONS,
  HEAP_OPERATIONS,
  avlDelete,
  avlInsert,
  bstDelete,
  bstInsert,
  bstSearch,
  heapExtract,
  heapInsert,
  inorderTraversal,
  levelorderTraversal,
  postorderTraversal,
  preorderTraversal,
} from './operations';
import type { HeapState, TreeArgs, TreeState } from './types';

function apply<TState, TStep>(
  engine: StepEngine<TState, TStep>,
  generate: (state: TState, args: TreeArgs) => Generator<TStep>,
  state: TState,
  args: Partial<TreeArgs> = {},
): TState {
  const full: TreeArgs = { value: 0, min: false, ...args };
  let current = state;
  for (const step of generate(state, full)) current = engine.applyStep(current, step);
  return current;
}

const runTree = (
  state: TreeState,
  op: (typeof BST_OPERATIONS)[number],
  args: Partial<TreeArgs> = {},
) => apply(treeEngine, op.generate, state, args);

const runHeap = (
  state: HeapState,
  op: (typeof HEAP_OPERATIONS)[number],
  args: Partial<TreeArgs> = {},
) => apply(heapEngine, op.generate, state, args);

/** Every node's left subtree is smaller and right subtree larger. */
function isValidBst(state: TreeState): boolean {
  const values = inorderValues(state);
  for (let i = 1; i < values.length; i++) if (values[i - 1] >= values[i]) return false;
  return true;
}

function isBalanced(state: TreeState): boolean {
  return Object.keys(state.nodes).every((id) => {
    const node = state.nodes[id];
    return Math.abs(nodeHeight(state, node.leftId) - nodeHeight(state, node.rightId)) <= 1;
  });
}

function isReachable(state: TreeState): boolean {
  return layoutTree(state).detached.length === 0;
}

describe('BST', () => {
  it('keeps values sorted in order after inserts', () => {
    let state = initTreeState([]);
    for (const value of [50, 30, 70, 20, 40, 60, 80]) {
      state = runTree(state, bstInsert, { value });
    }
    expect(inorderValues(state)).toEqual([20, 30, 40, 50, 60, 70, 80]);
    expect(isValidBst(state)).toBe(true);
  });

  it('ignores duplicate inserts', () => {
    let state = initTreeState([10, 5, 15]);
    state = runTree(state, bstInsert, { value: 10 });
    expect(countNodes(state)).toBe(3);
    expect(state.note).toMatch(/already/);
  });

  it.each([
    ['a leaf', 20],
    ['a node with one child', 30],
    ['a node with two children', 50],
    ['the root', 50],
  ])('deletes %s and stays a valid BST', (_label, value) => {
    let state = initTreeState([50, 30, 70, 20, 40, 60, 80, 35]);
    const before = inorderValues(state);
    state = runTree(state, bstDelete, { value });
    expect(isValidBst(state)).toBe(true);
    expect(inorderValues(state)).toEqual(before.filter((v) => v !== value));
    expect(countNodes(state)).toBe(before.length - 1);
    expect(isReachable(state)).toBe(true);
  });

  it('survives a long randomised insert/delete sequence', () => {
    let state = initTreeState([]);
    const mirror = new Set<number>();
    for (let i = 0; i < 80; i++) {
      const value = Math.floor(Math.random() * 40);
      if (Math.random() < 0.62) {
        state = runTree(state, bstInsert, { value });
        mirror.add(value);
      } else {
        state = runTree(state, bstDelete, { value });
        mirror.delete(value);
      }
      expect(isValidBst(state)).toBe(true);
      expect(inorderValues(state)).toEqual([...mirror].sort((a, b) => a - b));
      expect(countNodes(state)).toBe(mirror.size);
    }
  });

  it('empties completely and refills', () => {
    let state = initTreeState([5, 3, 8]);
    for (const value of [5, 3, 8]) state = runTree(state, bstDelete, { value });
    expect(state.rootId).toBeNull();
    expect(countNodes(state)).toBe(0);

    state = runTree(state, bstInsert, { value: 42 });
    expect(inorderValues(state)).toEqual([42]);
  });

  it('finds present values and reports absent ones', () => {
    const state = initTreeState([50, 30, 70]);
    expect(runTree(state, bstSearch, { value: 30 }).foundId).not.toBeNull();
    expect(runTree(state, bstSearch, { value: 31 }).foundId).toBeNull();
  });
});

describe('AVL', () => {
  it('stays balanced through ascending inserts (the worst case for a plain BST)', () => {
    let state = initTreeState([]);
    for (let value = 1; value <= 20; value++) {
      state = runTree(state, avlInsert, { value });
      expect(isValidBst(state)).toBe(true);
      expect(isBalanced(state)).toBe(true);
      expect(isReachable(state)).toBe(true);
    }
    // 20 nodes balanced fits in 5 levels; an unbalanced BST would be 20 deep.
    expect(nodeHeight(state, state.rootId)).toBeLessThanOrEqual(5);
  });

  it('stays balanced through descending inserts', () => {
    let state = initTreeState([]);
    for (let value = 20; value >= 1; value--) {
      state = runTree(state, avlInsert, { value });
      expect(isBalanced(state)).toBe(true);
    }
    expect(isValidBst(state)).toBe(true);
  });

  it('stays balanced through a randomised insert/delete sequence', () => {
    let state = initTreeState([]);
    const mirror = new Set<number>();
    for (let i = 0; i < 80; i++) {
      const value = Math.floor(Math.random() * 30);
      if (Math.random() < 0.62) {
        state = runTree(state, avlInsert, { value });
        mirror.add(value);
      } else {
        state = runTree(state, avlDelete, { value });
        mirror.delete(value);
      }
      expect(isValidBst(state)).toBe(true);
      expect(isBalanced(state)).toBe(true);
      expect(isReachable(state)).toBe(true);
      expect(inorderValues(state)).toEqual([...mirror].sort((a, b) => a - b));
    }
  });
});

describe('traversals', () => {
  const state = initTreeState([50, 30, 70, 20, 40, 60, 80]);
  const values = (result: TreeState) => result.visited.map((id) => result.nodes[id].value);

  it('in-order yields sorted values', () => {
    expect(values(runTree(state, inorderTraversal))).toEqual([20, 30, 40, 50, 60, 70, 80]);
  });

  it('pre-order yields root first', () => {
    expect(values(runTree(state, preorderTraversal))).toEqual([50, 30, 20, 40, 70, 60, 80]);
  });

  it('post-order yields root last', () => {
    expect(values(runTree(state, postorderTraversal))).toEqual([20, 40, 30, 60, 80, 70, 50]);
  });

  it('level-order yields breadth-first', () => {
    expect(values(runTree(state, levelorderTraversal))).toEqual([50, 30, 70, 20, 40, 60, 80]);
  });

  it('visits every node exactly once', () => {
    for (const op of [
      inorderTraversal,
      preorderTraversal,
      postorderTraversal,
      levelorderTraversal,
    ]) {
      const result = runTree(state, op);
      expect(new Set(result.visited).size).toBe(countNodes(state));
    }
  });
});

describe('heap', () => {
  it.each([
    ['max', false],
    ['min', true],
  ])('%s-heap keeps the winner at the root', (_label, min) => {
    let state = initHeapState([]);
    const values = [15, 3, 27, 8, 42, 1, 19, 6];
    for (const value of values) state = runHeap(state, heapInsert, { value, min });
    expect(state.items[0]).toBe(min ? Math.min(...values) : Math.max(...values));
  });

  it.each([
    ['max', false],
    ['min', true],
  ])('%s-heap maintains the heap property at every node', (_label, min) => {
    let state = initHeapState([]);
    for (const value of [15, 3, 27, 8, 42, 1, 19, 6, 33, 11]) {
      state = runHeap(state, heapInsert, { value, min });
    }
    const holds = (s: HeapState) =>
      s.items.every((value, i) => {
        if (i === 0) return true;
        const parent = s.items[Math.floor((i - 1) / 2)];
        return min ? parent <= value : parent >= value;
      });
    expect(holds(state)).toBe(true);

    for (let i = 0; i < 4; i++) {
      state = runHeap(state, heapExtract, { min });
      expect(holds(state)).toBe(true);
    }
  });

  it.each([
    ['max', false],
    ['min', true],
  ])('%s-heap extracts in sorted order', (_label, min) => {
    let state = initHeapState([]);
    const values = [15, 3, 27, 8, 42, 1, 19];
    for (const value of values) state = runHeap(state, heapInsert, { value, min });

    const extracted: number[] = [];
    while (state.items.length > 0) {
      extracted.push(state.items[0]);
      state = runHeap(state, heapExtract, { min });
    }
    expect(extracted).toEqual([...values].sort((a, b) => (min ? a - b : b - a)));
  });

  it('reports an empty heap instead of breaking', () => {
    expect(runHeap(initHeapState([]), heapExtract).note).toMatch(/empty/);
  });
});

describe('step inversion', () => {
  it.each(BST_OPERATIONS.map((op) => [op.id, op] as const))('bst/%s inverts exactly', (_id, op) => {
    const state = initTreeState([50, 30, 70, 20, 40, 60, 80, 35]);
    let current = state;
    for (const step of op.generate(state, { value: 30, min: false })) {
      const before = structuredClone(current);
      const after = treeEngine.applyStep(current, step);
      expect(treeEngine.invertStep(after, step)).toEqual(before);
      current = after;
    }
  });

  it.each(AVL_OPERATIONS.map((op) => [op.id, op] as const))('avl/%s inverts exactly', (_id, op) => {
    // A tree that will actually need rotations when 5 is inserted or removed.
    let state = initTreeState([]);
    for (let value = 1; value <= 12; value++) state = runTree(state, avlInsert, { value });

    let current = state;
    for (const step of op.generate(state, { value: 5, min: false })) {
      const before = structuredClone(current);
      const after = treeEngine.applyStep(current, step);
      expect(treeEngine.invertStep(after, step)).toEqual(before);
      current = after;
    }
  });

  it.each(HEAP_OPERATIONS.map((op) => [op.id, op] as const))(
    'heap/%s inverts exactly',
    (_id, op) => {
      const state = initHeapState([42, 33, 27, 15, 11, 8, 19]);
      let current = state;
      for (const step of op.generate(state, { value: 50, min: false })) {
        const before = structuredClone(current);
        const after = heapEngine.applyStep(current, step);
        expect(heapEngine.invertStep(after, step)).toEqual(before);
        current = after;
      }
    },
  );
});

describe('pseudocode mapping', () => {
  it('every emitted line index is in range', () => {
    const tree = initTreeState([50, 30, 70, 20, 40]);
    for (const op of [...BST_OPERATIONS, ...AVL_OPERATIONS]) {
      for (const step of op.generate(tree, { value: 30, min: false })) {
        const line = treeEngine.lineFor?.(step);
        if (line !== undefined) expect(line, op.id).toBeLessThan(op.pseudocode.length);
      }
    }
    const heap = initHeapState([42, 33, 27]);
    for (const op of HEAP_OPERATIONS) {
      for (const step of op.generate(heap, { value: 50, min: false })) {
        const line = heapEngine.lineFor?.(step);
        if (line !== undefined) expect(line, op.id).toBeLessThan(op.pseudocode.length);
      }
    }
  });
});
