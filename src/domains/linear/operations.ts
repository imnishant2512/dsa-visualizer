import type { StructureOperation } from '../../engine/useInteractiveStructure';
import { listOrder } from './engine';
import type { ListState, ListStep, SeqState, SeqStep } from './types';

export interface OpArgs {
  value: number;
  index: number;
}

export type SeqOperation = StructureOperation<SeqState, SeqStep, OpArgs>;
export type ListOperation = StructureOperation<ListState, ListStep, OpArgs>;

/** Clears any leftover pointer/found marks so each operation starts clean. */
function* clearMarks(state: SeqState): Generator<SeqStep> {
  if (state.pointer !== null) {
    yield { kind: 'pointer', index: null, prevIndex: state.pointer };
  }
  if (state.foundIndex !== null) {
    yield { kind: 'found', index: null, prevIndex: state.foundIndex };
  }
}

/* ------------------------------------------------------------------ array */

export const arrayInsert: SeqOperation = {
  id: 'insert',
  label: ({ value, index }) => `Insert ${value} at ${index}`,
  refuse: (state, { index }) =>
    index < 0 || index > state.items.length
      ? `Index must be between 0 and ${state.items.length} — inserting at ${state.items.length} appends.`
      : null,
  pseudocode: [
    'insertAt(index, value):',
    '  shift every element from index right by one',
    '  a[index] = value',
  ],
  *generate(state, { value, index }) {
    yield* clearMarks(state);
    const at = Math.max(0, Math.min(index, state.items.length));
    // Walking to the insertion point is what makes array inserts O(n).
    for (let i = state.items.length - 1; i >= at; i--) {
      yield { kind: 'pointer', index: i, prevIndex: i === state.items.length - 1 ? null : i + 1, line: 1 };
    }
    yield { kind: 'insertAt', index: at, value, line: 2 };
    yield { kind: 'pointer', index: null, prevIndex: at < state.items.length ? at : null, line: 2 };
  },
};

export const arrayRemove: SeqOperation = {
  id: 'remove',
  label: ({ index }) => `Remove index ${index}`,
  refuse: (state, { index }) =>
    state.items.length === 0
      ? 'The array is empty — there is nothing to remove.'
      : index < 0 || index >= state.items.length
        ? `Index must be between 0 and ${state.items.length - 1}.`
        : null,
  pseudocode: [
    'removeAt(index):',
    '  read a[index]',
    '  shift every element after index left by one',
  ],
  *generate(state, { index }) {
    yield* clearMarks(state);
    if (index < 0 || index >= state.items.length) {
      yield { kind: 'note', note: `index ${index} is out of range`, prevNote: state.note };
      return;
    }
    yield { kind: 'pointer', index, prevIndex: null, line: 1 };
    yield { kind: 'read', index, line: 1 };
    yield { kind: 'removeAt', index, prevValue: state.items[index], line: 2 };
    yield { kind: 'pointer', index: null, prevIndex: index, line: 2 };
  },
};

export const arrayGet: SeqOperation = {
  id: 'get',
  label: ({ index }) => `Read index ${index}`,
  refuse: (state, { index }) =>
    state.items.length === 0
      ? 'The array is empty — there is nothing to read.'
      : index < 0 || index >= state.items.length
        ? `Index must be between 0 and ${state.items.length - 1}.`
        : null,
  readOnly: true,
  pseudocode: ['get(index):', '  return a[index]   // O(1), no walking'],
  *generate(state, { index }) {
    yield* clearMarks(state);
    if (index < 0 || index >= state.items.length) {
      yield { kind: 'note', note: `index ${index} is out of range`, prevNote: state.note };
      return;
    }
    yield { kind: 'pointer', index, prevIndex: null, line: 1 };
    yield { kind: 'read', index, line: 1 };
    yield { kind: 'found', index, prevIndex: null, line: 1 };
  },
};

export const arraySearch: SeqOperation = {
  id: 'search',
  label: ({ value }) => `Search for ${value}`,
  readOnly: true,
  pseudocode: [
    'search(value):',
    '  for i = 0 to n-1',
    '    if a[i] == value: return i',
    '  return not found',
  ],
  *generate(state, { value }) {
    yield* clearMarks(state);
    for (let i = 0; i < state.items.length; i++) {
      yield { kind: 'pointer', index: i, prevIndex: i === 0 ? null : i - 1, line: 1 };
      yield { kind: 'compare', index: i, target: value, line: 2 };
      if (state.items[i] === value) {
        yield { kind: 'found', index: i, prevIndex: null, line: 2 };
        return;
      }
    }
    yield { kind: 'note', note: `${value} is not in the array`, prevNote: state.note, line: 3 };
  },
};

/* ------------------------------------------------------------------ stack */

export const stackPush: SeqOperation = {
  id: 'push',
  label: ({ value }) => `Push ${value}`,
  pseudocode: ['push(value):', '  a[top + 1] = value   // O(1)'],
  *generate(state, { value }) {
    yield* clearMarks(state);
    yield { kind: 'insertAt', index: state.items.length, value, line: 1 };
    yield { kind: 'pointer', index: state.items.length, prevIndex: null, line: 1 };
    yield { kind: 'pointer', index: null, prevIndex: state.items.length, line: 1 };
  },
};

export const stackPop: SeqOperation = {
  id: 'pop',
  label: () => 'Pop',
  refuse: (state) => (state.items.length === 0 ? 'The stack is empty — nothing to pop.' : null),
  pseudocode: ['pop():', '  if empty: underflow', '  return a[top], then shrink   // O(1)'],
  *generate(state) {
    yield* clearMarks(state);
    if (state.items.length === 0) {
      yield { kind: 'note', note: 'stack underflow — nothing to pop', prevNote: state.note, line: 1 };
      return;
    }
    const top = state.items.length - 1;
    yield { kind: 'pointer', index: top, prevIndex: null, line: 2 };
    yield { kind: 'read', index: top, line: 2 };
    yield { kind: 'removeAt', index: top, prevValue: state.items[top], line: 2 };
    yield { kind: 'pointer', index: null, prevIndex: top, line: 2 };
  },
};

export const stackPeek: SeqOperation = {
  id: 'peek',
  label: () => 'Peek',
  refuse: (state) => (state.items.length === 0 ? 'The stack is empty — nothing on top.' : null),
  readOnly: true,
  pseudocode: ['peek():', '  return a[top] without removing it'],
  *generate(state) {
    yield* clearMarks(state);
    if (state.items.length === 0) {
      yield { kind: 'note', note: 'stack is empty', prevNote: state.note, line: 1 };
      return;
    }
    const top = state.items.length - 1;
    yield { kind: 'pointer', index: top, prevIndex: null, line: 1 };
    yield { kind: 'read', index: top, line: 1 };
    yield { kind: 'found', index: top, prevIndex: null, line: 1 };
  },
};

/* ------------------------------------------------------------------ queue */

export const queueEnqueue: SeqOperation = {
  id: 'enqueue',
  label: ({ value }) => `Enqueue ${value}`,
  pseudocode: ['enqueue(value):', '  append value at the back   // O(1)'],
  *generate(state, { value }) {
    yield* clearMarks(state);
    yield { kind: 'insertAt', index: state.items.length, value, line: 1 };
    yield { kind: 'pointer', index: state.items.length, prevIndex: null, line: 1 };
    yield { kind: 'pointer', index: null, prevIndex: state.items.length, line: 1 };
  },
};

export const queueDequeue: SeqOperation = {
  id: 'dequeue',
  label: () => 'Dequeue',
  refuse: (state) => (state.items.length === 0 ? 'The queue is empty — nothing to dequeue.' : null),
  pseudocode: [
    'dequeue():',
    '  if empty: underflow',
    '  take the front value',
    '  shift everything left   // O(n) for a plain array',
  ],
  *generate(state) {
    yield* clearMarks(state);
    if (state.items.length === 0) {
      yield { kind: 'note', note: 'queue underflow — nothing to dequeue', prevNote: state.note, line: 1 };
      return;
    }
    yield { kind: 'pointer', index: 0, prevIndex: null, line: 2 };
    yield { kind: 'read', index: 0, line: 2 };
    yield { kind: 'removeAt', index: 0, prevValue: state.items[0], line: 3 };
    yield { kind: 'pointer', index: null, prevIndex: 0, line: 3 };
  },
};

export const queuePeek: SeqOperation = {
  id: 'front',
  label: () => 'Peek front',
  refuse: (state) => (state.items.length === 0 ? 'The queue is empty — nothing at the front.' : null),
  readOnly: true,
  pseudocode: ['front():', '  return the first value without removing it'],
  *generate(state) {
    yield* clearMarks(state);
    if (state.items.length === 0) {
      yield { kind: 'note', note: 'queue is empty', prevNote: state.note, line: 1 };
      return;
    }
    yield { kind: 'pointer', index: 0, prevIndex: null, line: 1 };
    yield { kind: 'read', index: 0, line: 1 };
    yield { kind: 'found', index: 0, prevIndex: null, line: 1 };
  },
};

/* ------------------------------------------------------------ linked list */

/** Deterministic fresh id, so regenerating an operation gives identical steps. */
function freshId(state: ListState): string {
  let max = -1;
  for (const id of Object.keys(state.nodes)) {
    const n = Number(id.slice(1));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `n${max + 1}`;
}

function* clearListMarks(state: ListState): Generator<ListStep> {
  if (state.pointer !== null) yield { kind: 'pointer', id: null, prevId: state.pointer };
  if (state.foundId !== null) yield { kind: 'found', id: null, prevId: state.foundId };
}

export const listInsertHead: ListOperation = {
  id: 'insert-head',
  label: ({ value }) => `Insert ${value} at head`,
  pseudocode: [
    'insertHead(value):',
    '  node = new Node(value)',
    '  node.next = head',
    '  head = node          // O(1)',
  ],
  *generate(state, { value }) {
    yield* clearListMarks(state);
    const id = freshId(state);
    yield { kind: 'createNode', id, value, nextId: state.headId, line: 1 };
    yield { kind: 'setHead', headId: id, prevHeadId: state.headId, line: 3 };
  },
};

export const listInsertTail: ListOperation = {
  id: 'insert-tail',
  label: ({ value }) => `Insert ${value} at tail`,
  pseudocode: [
    'insertTail(value):',
    '  if head is null: head = new Node(value); return',
    '  walk to the last node   // O(n) — no tail pointer',
    '  last.next = new Node(value)',
  ],
  *generate(state, { value }) {
    yield* clearListMarks(state);
    const id = freshId(state);

    if (state.headId === null) {
      yield { kind: 'createNode', id, value, nextId: null, line: 1 };
      yield { kind: 'setHead', headId: id, prevHeadId: null, line: 1 };
      return;
    }

    const order = listOrder(state);
    let prev: string | null = null;
    for (const nodeId of order) {
      yield { kind: 'pointer', id: nodeId, prevId: prev, line: 2 };
      prev = nodeId;
    }
    const last = order[order.length - 1];
    yield { kind: 'createNode', id, value, nextId: null, line: 3 };
    yield { kind: 'setNext', id: last, nextId: id, prevNextId: null, line: 3 };
    yield { kind: 'pointer', id: null, prevId: last, line: 3 };
  },
};

export const listRemoveValue: ListOperation = {
  id: 'remove',
  label: ({ value }) => `Remove ${value}`,
  refuse: (state, { value }) =>
    state.headId === null
      ? 'The list is empty — there is nothing to remove.'
      : !listOrder(state).some((id) => state.nodes[id].value === value)
        ? `${value} is not in the list.`
        : null,
  pseudocode: [
    'remove(value):',
    '  walk the chain looking for value',
    '  if it is the head: head = head.next',
    '  else: previous.next = node.next',
    '  free the node',
  ],
  *generate(state, { value }) {
    yield* clearListMarks(state);
    const order = listOrder(state);
    let prev: string | null = null;

    for (const nodeId of order) {
      yield { kind: 'pointer', id: nodeId, prevId: prev, line: 1 };
      yield { kind: 'compare', id: nodeId, target: value, line: 1 };

      if (state.nodes[nodeId].value === value) {
        const node = state.nodes[nodeId];
        if (prev === null) {
          yield { kind: 'setHead', headId: node.nextId, prevHeadId: state.headId, line: 2 };
        } else {
          yield {
            kind: 'setNext',
            id: prev,
            nextId: node.nextId,
            prevNextId: state.nodes[prev].nextId,
            line: 3,
          };
        }
        yield { kind: 'pointer', id: null, prevId: nodeId, line: 4 };
        yield { kind: 'deleteNode', id: nodeId, value: node.value, nextId: node.nextId, line: 4 };
        return;
      }
      prev = nodeId;
    }

    yield { kind: 'pointer', id: null, prevId: prev, line: 1 };
    yield { kind: 'note', note: `${value} is not in the list`, prevNote: state.note, line: 1 };
  },
};

export const listSearch: ListOperation = {
  id: 'search',
  label: ({ value }) => `Search for ${value}`,
  refuse: (state) => (state.headId === null ? 'The list is empty — nothing to search.' : null),
  readOnly: true,
  pseudocode: [
    'search(value):',
    '  node = head',
    '  while node is not null',
    '    if node.value == value: return node',
    '    node = node.next     // O(n), no random access',
  ],
  *generate(state, { value }) {
    yield* clearListMarks(state);
    const order = listOrder(state);
    let prev: string | null = null;

    for (const nodeId of order) {
      yield { kind: 'pointer', id: nodeId, prevId: prev, line: 2 };
      yield { kind: 'compare', id: nodeId, target: value, line: 3 };
      if (state.nodes[nodeId].value === value) {
        yield { kind: 'found', id: nodeId, prevId: null, line: 3 };
        return;
      }
      prev = nodeId;
    }
    yield { kind: 'note', note: `${value} is not in the list`, prevNote: state.note, line: 4 };
  },
};

export const listTraverse: ListOperation = {
  id: 'traverse',
  label: () => 'Traverse',
  readOnly: true,
  pseudocode: ['traverse():', '  node = head', '  while node: visit(node); node = node.next'],
  *generate(state) {
    yield* clearListMarks(state);
    let prev: string | null = null;
    for (const nodeId of listOrder(state)) {
      yield { kind: 'pointer', id: nodeId, prevId: prev, line: 2 };
      prev = nodeId;
    }
    yield { kind: 'pointer', id: null, prevId: prev, line: 2 };
  },
};

export const SEQ_OPERATIONS: Record<'array' | 'stack' | 'queue', SeqOperation[]> = {
  array: [arrayInsert, arrayRemove, arrayGet, arraySearch],
  stack: [stackPush, stackPop, stackPeek],
  queue: [queueEnqueue, queueDequeue, queuePeek],
};

export const LIST_OPERATIONS: ListOperation[] = [
  listInsertHead,
  listInsertTail,
  listRemoveValue,
  listSearch,
  listTraverse,
];
