import { balanceOf } from './layout';
import type { HeapState, HeapStep, TreeState, TreeStep } from './types';

/**
 * One plain-English sentence for the step the cursor is on.
 *
 * A rotation is four pointer changes in a row, and watching circles move does
 * not say which pointer was rewritten or why. This does.
 */
export function narrateTreeStep(step: TreeStep | null, state: TreeState): string {
  if (!step) return 'Pick a value and run an operation against the tree.';
  const valueOf = (id: string | null) =>
    id !== null && state.nodes[id] ? String(state.nodes[id].value) : '—';

  switch (step.kind) {
    case 'createNode':
      return `Allocated a node holding ${step.value}.`;
    case 'deleteNode':
      return `Freed the node holding ${step.node.value}.`;
    case 'link':
      return step.childId === null
        ? `Cleared ${valueOf(step.parentId)}'s ${step.side} pointer.`
        : `Pointed ${valueOf(step.parentId)}'s ${step.side} at ${valueOf(step.childId)}${
            step.prevChildId ? `, replacing ${valueOf(step.prevChildId)}` : ''
          }.`;
    case 'setRoot':
      return step.rootId === null
        ? 'The tree is now empty.'
        : `${valueOf(step.rootId)} is now the root.`;
    case 'setValue':
      return `Overwrote ${step.prevValue} with ${step.value} — the standard two-child delete, which copies the successor's value rather than moving the node.`;
    case 'compare': {
      const value = state.nodes[step.id]?.value;
      if (value === undefined) return `Compared against ${step.target}.`;
      return `Compared ${step.target} with ${value} — go ${
        step.target === value ? 'nowhere, this is it' : step.target < value ? 'left' : 'right'
      }.`;
    }
    case 'pointer':
      return step.id === null
        ? 'Released the cursor.'
        : `At ${valueOf(step.id)}, balance ${balanceOf(state, step.id)}.`;
    case 'found':
      return step.id === null ? 'Not in the tree.' : `Found ${valueOf(step.id)}.`;
    case 'visit':
      return `Visited ${valueOf(step.id)} — output so far: ${state.visited
        .map((id) => valueOf(id))
        .join(', ')}.`;
    case 'clearVisited':
      return 'Cleared the traversal output.';
    case 'note':
      return step.note ?? '';
  }
}

export function narrateHeapStep(step: HeapStep | null, state: HeapState): string {
  if (!step) return 'Pick a value and run an operation against the heap.';
  switch (step.kind) {
    case 'push':
      return `Appended ${step.value} at index ${state.items.length - 1}, then sift it up.`;
    case 'pop':
      return `Took ${step.prevValue} off the root, then sift the last element down into its place.`;
    case 'swap':
      return `Swapped index ${step.a} with index ${step.b} — ${state.items[step.a]} and ${state.items[step.b]}.`;
    case 'compare':
      return `Compared index ${step.a} (${state.items[step.a]}) with index ${step.b} (${state.items[step.b]}).`;
    case 'pointer':
      return step.index === null ? 'Released the cursor.' : `Sifting at index ${step.index}.`;
    case 'note':
      return step.note ?? '';
  }
}
