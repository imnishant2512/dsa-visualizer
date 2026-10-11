import type { StructureOperation } from '../../engine/useInteractiveStructure';
import { TreeCtx } from './engine';
import type { HeapState, HeapStep, TreeArgs, TreeState, TreeStep } from './types';

export type TreeOperation = StructureOperation<TreeState, TreeStep, TreeArgs>;
export type HeapOperation = StructureOperation<HeapState, HeapStep, TreeArgs>;

/** Wipes pointer/found/visited marks so each operation starts from a clean slate. */
function* clearMarks(ctx: TreeCtx): Generator<TreeStep> {
  yield* ctx.pointer(null);
  yield* ctx.found(null);
  yield* ctx.clearVisited();
  yield* ctx.note(null);
}

/* -------------------------------------------------------------------- BST */

const BST_INSERT_CODE = [
  'insert(value):',
  '  if tree is empty: root = new Node(value)',
  '  walk down: value < node ? go left : go right',
  '  attach the new node at the empty slot',
];

function* descendToSlot(
  ctx: TreeCtx,
  value: number,
): Generator<TreeStep, { parentId: string; side: 'left' | 'right' } | null> {
  let cursor = ctx.rootId!;
  for (;;) {
    yield* ctx.pointer(cursor, 2);
    yield* ctx.compare(cursor, value, 2);
    const node = ctx.nodes[cursor];

    if (value === node.value) return null;
    const side = value < node.value ? 'left' : 'right';
    const next = side === 'left' ? node.leftId : node.rightId;
    if (next === null) return { parentId: cursor, side };
    cursor = next;
  }
}

/**
 * Whether a value is present, for `refuse()`. Pure and step-free: it answers
 * "can this operation run" before anything animates, which is the point.
 */
function hasValue(state: TreeState, value: number): boolean {
  return Object.values(state.nodes).some((node) => node.value === value);
}

export const bstInsert: TreeOperation = {
  id: 'insert',
  label: ({ value }) => `Insert ${value}`,
  refuse: (state, { value }) =>
    hasValue(state, value) ? `${value} is already in the tree — a BST holds each key once.` : null,
  pseudocode: BST_INSERT_CODE,
  *generate(state, { value }) {
    const ctx = new TreeCtx(state);
    yield* clearMarks(ctx);

    const id = ctx.freshId();
    if (ctx.rootId === null) {
      yield* ctx.createNode(id, value, 1);
      yield* ctx.setRoot(id, 1);
      return;
    }

    const slot = yield* descendToSlot(ctx, value);
    if (slot === null) {
      yield* ctx.note(`${value} is already in the tree`, 2);
      yield* ctx.pointer(null, 2);
      return;
    }
    yield* ctx.createNode(id, value, 3);
    yield* ctx.link(slot.parentId, slot.side, id, 3);
    yield* ctx.pointer(null, 3);
  },
};

export const bstSearch: TreeOperation = {
  id: 'search',
  label: ({ value }) => `Search ${value}`,
  readOnly: true,
  pseudocode: [
    'search(value):',
    '  node = root',
    '  while node is not null',
    '    if value == node.value: found',
    '    node = value < node.value ? node.left : node.right',
    '  not found',
  ],
  *generate(state, { value }) {
    const ctx = new TreeCtx(state);
    yield* clearMarks(ctx);

    let cursor = ctx.rootId;
    while (cursor !== null) {
      yield* ctx.pointer(cursor, 2);
      yield* ctx.compare(cursor, value, 3);
      const node = ctx.nodes[cursor];
      if (node.value === value) {
        yield* ctx.found(cursor, 3);
        return;
      }
      cursor = value < node.value ? node.leftId : node.rightId;
    }
    yield* ctx.pointer(null, 5);
    yield* ctx.note(`${value} is not in the tree`, 5);
  },
};

const BST_DELETE_CODE = [
  'delete(value):',
  '  find the node (and its parent)',
  '  two children: copy in the in-order successor',
  '    then delete that successor instead',
  '  otherwise: splice the single child into its place',
];

/** Shared by BST and AVL delete; returns the id whose subtree changed height. */
function* deleteValue(ctx: TreeCtx, value: number): Generator<TreeStep, string | null> {
  let cursor = ctx.rootId;
  while (cursor !== null) {
    yield* ctx.pointer(cursor, 1);
    yield* ctx.compare(cursor, value, 1);
    const node = ctx.nodes[cursor];
    if (node.value === value) break;
    cursor = value < node.value ? node.leftId : node.rightId;
  }

  if (cursor === null) {
    yield* ctx.pointer(null, 1);
    yield* ctx.note(`${value} is not in the tree`, 1);
    return null;
  }

  let target = cursor;
  const node = ctx.nodes[target];

  if (node.leftId !== null && node.rightId !== null) {
    // Two children: take the in-order successor's value, then delete it instead.
    let successor = node.rightId;
    while (ctx.nodes[successor].leftId !== null) {
      yield* ctx.pointer(successor, 2);
      successor = ctx.nodes[successor].leftId!;
    }
    yield* ctx.pointer(successor, 2);
    yield* ctx.setValue(target, ctx.nodes[successor].value, 2);
    target = successor;
  }

  const doomed = ctx.nodes[target];
  const child = doomed.leftId ?? doomed.rightId;
  const parent = ctx.parentOf(target);
  yield* ctx.replaceChild(parent, target, child, 4);
  yield* ctx.pointer(null, 4);
  yield* ctx.deleteNode(target, 4);
  return parent;
}

export const bstDelete: TreeOperation = {
  id: 'delete',
  label: ({ value }) => `Delete ${value}`,
  refuse: (state, { value }) =>
    state.rootId === null
      ? 'The tree is empty — there is nothing to delete.'
      : !hasValue(state, value)
        ? `${value} is not in the tree.`
        : null,
  pseudocode: BST_DELETE_CODE,
  *generate(state, { value }) {
    const ctx = new TreeCtx(state);
    yield* clearMarks(ctx);
    yield* deleteValue(ctx, value);
  },
};

/* -------------------------------------------------------------------- AVL */

const AVL_CODE = [
  'insert / delete as in a BST',
  'then walk back up to the root:',
  '  balance = height(left) - height(right)',
  '  if balance > 1: right-rotate (LR needs a left-rotate first)',
  '  if balance < -1: left-rotate (RL needs a right-rotate first)',
];

/**
 * Rotations are emitted as individual link changes rather than one atomic
 * "rotate" step, so you can step through the pointer surgery one edge at a time.
 */
function* rotateRight(ctx: TreeCtx, y: string): Generator<TreeStep, string> {
  const parent = ctx.parentOf(y);
  const x = ctx.nodes[y].leftId!;
  const t2 = ctx.nodes[x].rightId;

  yield* ctx.note(`rotate right around ${ctx.nodes[y].value}`, 3);
  yield* ctx.link(y, 'left', t2, 3);
  yield* ctx.link(x, 'right', y, 3);
  yield* ctx.replaceChild(parent, y, x, 3);
  return x;
}

function* rotateLeft(ctx: TreeCtx, x: string): Generator<TreeStep, string> {
  const parent = ctx.parentOf(x);
  const y = ctx.nodes[x].rightId!;
  const t2 = ctx.nodes[y].leftId;

  yield* ctx.note(`rotate left around ${ctx.nodes[x].value}`, 4);
  yield* ctx.link(x, 'right', t2, 4);
  yield* ctx.link(y, 'left', x, 4);
  yield* ctx.replaceChild(parent, x, y, 4);
  return y;
}

/** Rebalances from `startId` up to the root. */
function* rebalanceUpward(ctx: TreeCtx, startId: string | null): Generator<TreeStep> {
  let cursor = startId;
  while (cursor !== null) {
    const parent = ctx.parentOf(cursor);
    yield* ctx.pointer(cursor, 2);
    const balance = ctx.balance(cursor);

    /*
     * The four cases are named before the pointer surgery starts. "Rotate
     * right around 30" describes a mechanism; "left-left" names the shape that
     * made it necessary, which is the part worth recognising next time.
     */
    if (balance > 1) {
      const left = ctx.nodes[cursor].leftId!;
      const leftHeavy = ctx.balance(left) < 0;
      yield* ctx.note(
        `${leftHeavy ? 'Left-right' : 'Left-left'} case at ${ctx.nodes[cursor].value} — balance ${balance}`,
        leftHeavy ? 4 : 3,
      );
      if (leftHeavy) yield* rotateLeft(ctx, left);
      yield* rotateRight(ctx, cursor);
    } else if (balance < -1) {
      const right = ctx.nodes[cursor].rightId!;
      const rightHeavy = ctx.balance(right) > 0;
      yield* ctx.note(
        `${rightHeavy ? 'Right-left' : 'Right-right'} case at ${ctx.nodes[cursor].value} — balance ${balance}`,
        rightHeavy ? 3 : 4,
      );
      if (rightHeavy) yield* rotateRight(ctx, right);
      yield* rotateLeft(ctx, cursor);
    }
    cursor = parent;
  }
  yield* ctx.pointer(null, 2);
}

export const avlInsert: TreeOperation = {
  id: 'avl-insert',
  label: ({ value }) => `Insert ${value}`,
  refuse: (state, { value }) =>
    hasValue(state, value) ? `${value} is already in the tree — a BST holds each key once.` : null,
  pseudocode: AVL_CODE,
  *generate(state, { value }) {
    const ctx = new TreeCtx(state);
    yield* clearMarks(ctx);

    const id = ctx.freshId();
    if (ctx.rootId === null) {
      yield* ctx.createNode(id, value, 0);
      yield* ctx.setRoot(id, 0);
      return;
    }

    const slot = yield* descendToSlot(ctx, value);
    if (slot === null) {
      yield* ctx.note(`${value} is already in the tree`, 0);
      yield* ctx.pointer(null, 0);
      return;
    }
    yield* ctx.createNode(id, value, 0);
    yield* ctx.link(slot.parentId, slot.side, id, 0);
    yield* rebalanceUpward(ctx, slot.parentId);
  },
};

export const avlDelete: TreeOperation = {
  id: 'avl-delete',
  label: ({ value }) => `Delete ${value}`,
  refuse: (state, { value }) =>
    state.rootId === null
      ? 'The tree is empty — there is nothing to delete.'
      : !hasValue(state, value)
        ? `${value} is not in the tree.`
        : null,
  pseudocode: AVL_CODE,
  *generate(state, { value }) {
    const ctx = new TreeCtx(state);
    yield* clearMarks(ctx);
    const from = yield* deleteValue(ctx, value);
    if (ctx.rootId !== null) yield* rebalanceUpward(ctx, from ?? ctx.rootId);
  },
};

/* ------------------------------------------------------------- traversals */

function makeTraversal(
  id: string,
  label: string,
  pseudocode: string[],
  order: (ctx: TreeCtx, id: string | null) => Generator<TreeStep>,
): TreeOperation {
  return {
    id,
    label: () => label,
    readOnly: true,
    pseudocode,
    *generate(state) {
      const ctx = new TreeCtx(state);
      yield* clearMarks(ctx);
      yield* order(ctx, ctx.rootId);
      yield* ctx.pointer(null, 1);
    },
  };
}

export const inorderTraversal = makeTraversal(
  'inorder',
  'In-order',
  [
    'inorder(node):',
    '  inorder(node.left)',
    '  visit(node)   // sorted for a BST',
    '  inorder(node.right)',
  ],
  function* walk(ctx, id): Generator<TreeStep> {
    if (id === null) return;
    yield* walk(ctx, ctx.nodes[id].leftId);
    yield* ctx.pointer(id, 2);
    yield* ctx.visit(id, 2);
    yield* walk(ctx, ctx.nodes[id].rightId);
  },
);

export const preorderTraversal = makeTraversal(
  'preorder',
  'Pre-order',
  ['preorder(node):', '  visit(node)', '  preorder(node.left)', '  preorder(node.right)'],
  function* walk(ctx, id): Generator<TreeStep> {
    if (id === null) return;
    yield* ctx.pointer(id, 1);
    yield* ctx.visit(id, 1);
    yield* walk(ctx, ctx.nodes[id].leftId);
    yield* walk(ctx, ctx.nodes[id].rightId);
  },
);

export const postorderTraversal = makeTraversal(
  'postorder',
  'Post-order',
  ['postorder(node):', '  postorder(node.left)', '  postorder(node.right)', '  visit(node)'],
  function* walk(ctx, id): Generator<TreeStep> {
    if (id === null) return;
    yield* walk(ctx, ctx.nodes[id].leftId);
    yield* walk(ctx, ctx.nodes[id].rightId);
    yield* ctx.pointer(id, 3);
    yield* ctx.visit(id, 3);
  },
);

export const levelorderTraversal = makeTraversal(
  'levelorder',
  'Level-order',
  [
    'levelorder():',
    '  queue = [root]',
    '  while queue is not empty:',
    '    node = queue.shift(); visit(node)',
    '    queue.push(node.left, node.right)',
  ],
  function* walk(ctx, rootId): Generator<TreeStep> {
    if (rootId === null) return;
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      yield* ctx.pointer(id, 3);
      yield* ctx.visit(id, 3);
      const node = ctx.nodes[id];
      if (node.leftId) queue.push(node.leftId);
      if (node.rightId) queue.push(node.rightId);
    }
  },
);

export const BST_OPERATIONS: TreeOperation[] = [
  bstInsert,
  bstDelete,
  bstSearch,
  inorderTraversal,
  preorderTraversal,
  postorderTraversal,
  levelorderTraversal,
];

export const AVL_OPERATIONS: TreeOperation[] = [
  avlInsert,
  avlDelete,
  bstSearch,
  inorderTraversal,
  levelorderTraversal,
];

/* ------------------------------------------------------------------- heap */

const parentIndex = (i: number) => Math.floor((i - 1) / 2);

/** True when `a` should sit above `b` in the heap. */
const ordered = (a: number, b: number, min: boolean) => (min ? a < b : a > b);

export const heapInsert: HeapOperation = {
  id: 'heap-insert',
  label: ({ value }) => `Insert ${value}`,
  pseudocode: [
    'insert(value):',
    '  append value at the end',
    '  while it beats its parent:',
    '    swap it with the parent   // sift up',
  ],
  *generate(state, { value, min }) {
    if (state.pointer !== null) {
      yield { kind: 'pointer', index: null, prevIndex: state.pointer };
    }
    if (state.note !== null) yield { kind: 'note', note: null, prevNote: state.note };

    const items = [...state.items];
    yield { kind: 'push', value, line: 1 };
    items.push(value);

    let i = items.length - 1;
    let prevPointer: number | null = null;
    while (i > 0) {
      const parent = parentIndex(i);
      yield { kind: 'pointer', index: i, prevIndex: prevPointer, line: 2 };
      prevPointer = i;
      yield { kind: 'compare', a: i, b: parent, line: 2 };
      if (!ordered(items[i], items[parent], min)) break;
      yield { kind: 'swap', a: i, b: parent, line: 3 };
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
    yield { kind: 'pointer', index: null, prevIndex: prevPointer, line: 3 };
  },
};

export const heapExtract: HeapOperation = {
  id: 'heap-extract',
  label: ({ min }) => `Extract ${min ? 'min' : 'max'}`,
  refuse: (state) => (state.items.length === 0 ? 'The heap is empty — nothing to extract.' : null),
  pseudocode: [
    'extract():',
    '  take the root',
    '  move the last element to the root',
    '  while a child beats it:',
    '    swap with the better child   // sift down',
  ],
  *generate(state, { min }) {
    if (state.pointer !== null) {
      yield { kind: 'pointer', index: null, prevIndex: state.pointer };
    }
    if (state.note !== null) yield { kind: 'note', note: null, prevNote: state.note };

    const items = [...state.items];
    if (items.length === 0) {
      yield { kind: 'note', note: 'heap is empty', prevNote: null, line: 1 };
      return;
    }

    yield { kind: 'pointer', index: 0, prevIndex: null, line: 1 };
    if (items.length === 1) {
      yield { kind: 'pointer', index: null, prevIndex: 0, line: 1 };
      yield { kind: 'pop', prevValue: items[0], line: 1 };
      return;
    }

    yield { kind: 'swap', a: 0, b: items.length - 1, line: 2 };
    [items[0], items[items.length - 1]] = [items[items.length - 1], items[0]];
    const removed = items.pop()!;
    yield { kind: 'pop', prevValue: removed, line: 2 };

    let i = 0;
    let prevPointer: number | null = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let best = i;

      if (left < items.length) {
        yield { kind: 'compare', a: left, b: best, line: 3 };
        if (ordered(items[left], items[best], min)) best = left;
      }
      if (right < items.length) {
        yield { kind: 'compare', a: right, b: best, line: 3 };
        if (ordered(items[right], items[best], min)) best = right;
      }
      if (best === i) break;

      yield { kind: 'swap', a: i, b: best, line: 4 };
      [items[i], items[best]] = [items[best], items[i]];
      i = best;
      yield { kind: 'pointer', index: i, prevIndex: prevPointer, line: 4 };
      prevPointer = i;
    }
    yield { kind: 'pointer', index: null, prevIndex: prevPointer, line: 4 };
  },
};

export const heapPeek: HeapOperation = {
  id: 'heap-peek',
  label: ({ min }) => `Peek ${min ? 'min' : 'max'}`,
  refuse: (state) => (state.items.length === 0 ? 'The heap is empty — nothing at the root.' : null),
  readOnly: true,
  pseudocode: ['peek():', '  the root is always the winner   // O(1)'],
  *generate(state) {
    if (state.items.length === 0) {
      yield { kind: 'note', note: 'heap is empty', prevNote: state.note, line: 1 };
      return;
    }
    yield { kind: 'pointer', index: 0, prevIndex: state.pointer, line: 1 };
  },
};

export const HEAP_OPERATIONS: HeapOperation[] = [heapInsert, heapExtract, heapPeek];
