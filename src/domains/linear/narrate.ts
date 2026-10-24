import type { ListState, ListStep, SeqState, SeqStep } from './types';

/**
 * One plain-English sentence for the step the cursor is on.
 *
 * The distinction these structures exist to teach — that a stack touches one
 * end and an array insert shifts everything after it — is carried by cells
 * sliding sideways, which is exactly the part a screen reader cannot see and
 * a paused run does not show.
 */
export function narrateSeqStep(step: SeqStep | null, state: SeqState): string {
  if (!step) return 'Pick a value and run an operation.';
  switch (step.kind) {
    case 'insertAt':
      return step.index >= state.items.length - 1
        ? `Appended ${step.value} at index ${step.index} — nothing had to move.`
        : `Inserted ${step.value} at index ${step.index}, shifting the ${
            state.items.length - step.index - 1
          } after it right.`;
    case 'removeAt':
      /*
       * `state` is the array after the removal, so anything still at or past
       * the removed index is what had to shift. Removing the last element —
       * every stack pop, and an array remove at the end — shifts nothing, and
       * saying otherwise misdescribes the one operation a stack is for.
       */
      return step.index < state.items.length
        ? `Removed ${step.prevValue} from index ${step.index}, shifting the ${
            state.items.length - step.index
          } after it left.`
        : `Removed ${step.prevValue} from index ${step.index} — nothing followed it, so nothing shifted.`;
    case 'read':
      return `Read index ${step.index} — ${state.items[step.index]}.`;
    case 'compare':
      return `Compared index ${step.index} (${state.items[step.index]}) against ${step.target}.`;
    case 'pointer':
      return step.index === null
        ? 'Released the cursor.'
        : `Cursor moved to index ${step.index}.`;
    case 'found':
      return step.index === null ? 'Nothing marked.' : `Found it at index ${step.index}.`;
    case 'note':
      return step.note ?? '';
  }
}

export function narrateListStep(step: ListStep | null, state: ListState): string {
  if (!step) return 'Pick a value and run an operation.';
  const valueOf = (id: string) => state.nodes[id]?.value ?? '?';

  switch (step.kind) {
    case 'createNode':
      return `Allocated a node holding ${step.value}.`;
    case 'deleteNode':
      return `Freed the node holding ${step.value}.`;
    case 'setNext':
      return step.nextId === null
        ? `Node ${valueOf(step.id)} now ends the chain.`
        : `Node ${valueOf(step.id)} now points at ${valueOf(step.nextId)}.`;
    case 'setHead':
      return step.headId === null
        ? 'The list is now empty.'
        : `Head now points at ${valueOf(step.headId)}.`;
    case 'pointer':
      return step.id === null
        ? 'Released the cursor.'
        : `Walked to the node holding ${valueOf(step.id)} — there is no random access here.`;
    case 'compare':
      return `Compared ${valueOf(step.id)} against ${step.target}.`;
    case 'found':
      return step.id === null ? 'Nothing marked.' : `Found ${valueOf(step.id)}.`;
    case 'note':
      return step.note ?? '';
  }
}

/** Dispatches on which structure is on screen, so the page has one call site. */
export function narrateLinearStep(
  step: SeqStep | ListStep | null,
  state: SeqState | ListState,
  isList: boolean,
): string {
  return isList
    ? narrateListStep(step as ListStep | null, state as ListState)
    : narrateSeqStep(step as SeqStep | null, state as SeqState);
}
