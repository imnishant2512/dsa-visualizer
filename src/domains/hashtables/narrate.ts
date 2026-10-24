import type { HashState, HashStep } from './types';

/**
 * One plain-English sentence for the step the cursor is on.
 *
 * The page's whole subject is *where a key ends up and why*, and that
 * information lived entirely in which row lit up. A probe sequence is
 * especially hard to read from colour alone: three rows flash in turn and
 * nothing says they were the same search walking forward.
 */
export function narrateHashStep(step: HashStep | null, state: HashState): string {
  if (!step) return 'Pick a key and run an operation against the table.';

  switch (step.kind) {
    case 'hash':
      return `hash(${step.key}) = ${step.key} % ${state.size} = ${step.bucket} — start at bucket ${step.bucket}.`;
    case 'probe':
      return `Bucket ${(step.bucket - 1 + state.size) % state.size} was taken, so probe forward to bucket ${step.bucket} — attempt ${step.attempt + 1}.`;
    case 'collision':
      return `Bucket ${step.bucket} is already occupied — a collision.`;
    case 'place':
      return state.strategy === 'chaining'
        ? `Appended ${step.key} to bucket ${step.bucket}'s chain, at position ${step.pos}.`
        : `Placed ${step.key} in bucket ${step.bucket}.`;
    case 'remove':
      return step.tombstone
        ? `Removed ${step.key} from bucket ${step.bucket}, leaving a tombstone — emptying the slot would cut the probe chain and hide keys past it.`
        : `Spliced ${step.key} out of bucket ${step.bucket}'s chain.`;
    case 'found':
      return step.at === null
        ? 'Nothing here.'
        : `Found it in bucket ${step.at.bucket}${step.at.pos > 0 ? `, position ${step.at.pos} of the chain` : ''}.`;
    case 'note':
      return step.note ?? '';
    case 'clear':
      return 'Cleared the marks from the last operation.';
  }
}
