import type { StatCounters, StepEngine } from '../../engine/types';
import type { ListState, ListStep, SeqState, SeqStep } from './types';

export const seqEngine: StepEngine<SeqState, SeqStep> = {
  applyStep(state, step) {
    switch (step.kind) {
      case 'insertAt': {
        const items = [...state.items];
        items.splice(step.index, 0, step.value);
        return { ...state, items };
      }
      case 'removeAt': {
        const items = [...state.items];
        items.splice(step.index, 1);
        return { ...state, items };
      }
      case 'pointer':
        return { ...state, pointer: step.index };
      case 'found':
        return { ...state, foundIndex: step.index };
      case 'note':
        return { ...state, note: step.note };
      default:
        return state;
    }
  },

  invertStep(state, step) {
    switch (step.kind) {
      case 'insertAt': {
        const items = [...state.items];
        items.splice(step.index, 1);
        return { ...state, items };
      }
      case 'removeAt': {
        const items = [...state.items];
        items.splice(step.index, 0, step.prevValue);
        return { ...state, items };
      }
      case 'pointer':
        return { ...state, pointer: step.prevIndex };
      case 'found':
        return { ...state, foundIndex: step.prevIndex };
      case 'note':
        return { ...state, note: step.prevNote };
      default:
        return state;
    }
  },

  statsDelta(step): Partial<StatCounters> {
    switch (step.kind) {
      case 'insertAt':
      case 'removeAt':
        return { writes: 1 };
      case 'read':
        return { reads: 1 };
      case 'compare':
        return { comparisons: 1, reads: 1 };
      case 'pointer':
        return { pointerMoves: 1 };
      default:
        return {};
    }
  },

  lineFor: (step) => step.line,
};

export const listEngine: StepEngine<ListState, ListStep> = {
  applyStep(state, step) {
    switch (step.kind) {
      case 'createNode':
        return {
          ...state,
          nodes: { ...state.nodes, [step.id]: { value: step.value, nextId: step.nextId } },
        };
      case 'deleteNode': {
        const nodes = { ...state.nodes };
        delete nodes[step.id];
        return { ...state, nodes };
      }
      case 'setNext':
        return {
          ...state,
          nodes: { ...state.nodes, [step.id]: { ...state.nodes[step.id], nextId: step.nextId } },
        };
      case 'setHead':
        return { ...state, headId: step.headId };
      case 'pointer':
        return { ...state, pointer: step.id };
      case 'found':
        return { ...state, foundId: step.id };
      case 'note':
        return { ...state, note: step.note };
      default:
        return state;
    }
  },

  invertStep(state, step) {
    switch (step.kind) {
      case 'createNode': {
        const nodes = { ...state.nodes };
        delete nodes[step.id];
        return { ...state, nodes };
      }
      case 'deleteNode':
        // The step carries the node's contents, so restoring is exact.
        return {
          ...state,
          nodes: { ...state.nodes, [step.id]: { value: step.value, nextId: step.nextId } },
        };
      case 'setNext':
        return {
          ...state,
          nodes: {
            ...state.nodes,
            [step.id]: { ...state.nodes[step.id], nextId: step.prevNextId },
          },
        };
      case 'setHead':
        return { ...state, headId: step.prevHeadId };
      case 'pointer':
        return { ...state, pointer: step.prevId };
      case 'found':
        return { ...state, foundId: step.prevId };
      case 'note':
        return { ...state, note: step.prevNote };
      default:
        return state;
    }
  },

  statsDelta(step): Partial<StatCounters> {
    switch (step.kind) {
      case 'createNode':
      case 'deleteNode':
      case 'setNext':
      case 'setHead':
        return { writes: 1 };
      case 'compare':
        return { comparisons: 1, reads: 1 };
      case 'pointer':
        return { pointerMoves: 1 };
      default:
        return {};
    }
  },

  lineFor: (step) => step.line,
};

export function initSeqState(items: number[] = []): SeqState {
  return { items: [...items], pointer: null, foundIndex: null, note: null };
}

export function initListState(values: number[] = []): ListState {
  const nodes: Record<string, ListNodeEntry> = {};
  let headId: string | null = null;
  let prevId: string | null = null;

  values.forEach((value, index) => {
    const id = `n${index}`;
    nodes[id] = { value, nextId: null };
    if (prevId === null) headId = id;
    else nodes[prevId].nextId = id;
    prevId = id;
  });

  return { nodes, headId, pointer: null, foundId: null, note: null };
}

type ListNodeEntry = { value: number; nextId: string | null };

/** Walks the chain from the head; used by rendering and by the tests. */
export function listToArray(state: ListState): number[] {
  const out: number[] = [];
  let cursor = state.headId;
  const guard = new Set<string>();
  while (cursor !== null && !guard.has(cursor)) {
    guard.add(cursor);
    out.push(state.nodes[cursor].value);
    cursor = state.nodes[cursor].nextId;
  }
  return out;
}

export function listOrder(state: ListState): string[] {
  const out: string[] = [];
  let cursor = state.headId;
  const guard = new Set<string>();
  while (cursor !== null && !guard.has(cursor)) {
    guard.add(cursor);
    out.push(cursor);
    cursor = state.nodes[cursor].nextId;
  }
  return out;
}
