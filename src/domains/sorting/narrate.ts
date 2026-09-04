import type { VisualKind } from '../../shared/components/stepKinds';
import type { SortState, SortStep } from './types';

/**
 * Sorting's step kinds projected onto the shared visual vocabulary.
 *
 * `rangeHighlight` and `passBoundary` change only the surrounding context —
 * which partition is active, which digit place a radix pass is on — so they
 * take the neutral kind rather than inventing a colour for "nothing moved".
 */
export function sortVisualKind(step: SortStep): VisualKind {
  switch (step.kind) {
    case 'compare':
      return 'compare';
    case 'swap':
      return 'swap';
    case 'set':
      return 'write';
    case 'read':
      return 'read';
    case 'bucketPlace':
      return 'bucket';
    case 'markSorted':
      return 'sorted';
    case 'rangeHighlight':
    case 'passBoundary':
      return 'idle';
  }
}

const ROLE_PHRASE: Record<string, string> = {
  active: 'the active range',
  pivot: 'the pivot partition',
  left: 'the left half',
  right: 'the right half',
  bucket: 'the current bucket',
};

function list(indices: number[]): string {
  return indices.map((i) => `a[${i}]`).join(' and ');
}

/**
 * One plain-English sentence for the step the cursor is on.
 *
 * `state` is the state *after* the step, which is what makes "now 12 and 5"
 * truthful for a swap and "wrote 88" truthful for a set. Comparisons and reads
 * don't move anything, so before and after are the same array for them.
 */
export function narrateSortStep(step: SortStep | null, state: SortState): string {
  if (!step) {
    return 'Ready — press play, or step through one comparison at a time.';
  }
  const values = state.values;

  switch (step.kind) {
    case 'compare': {
      if (step.scalar !== undefined) {
        const [i] = step.indices;
        const held = values[i];
        return `Compared a[${i}] (${held}) against the held key ${step.scalar} — ${
          held <= step.scalar ? 'already in order.' : 'out of order.'
        }`;
      }
      const [i, j] = step.indices;
      if (j === undefined) return `Inspected a[${i}] (${values[i]}).`;
      const x = values[i];
      const y = values[j];
      return `Compared a[${i}] (${x}) with a[${j}] (${y}) — ${
        x <= y ? 'already in order.' : 'out of order.'
      }`;
    }
    case 'swap':
      return `Swapped a[${step.a}] and a[${step.b}] — now ${values[step.a]} and ${values[step.b]}.`;
    case 'set':
      return `Wrote ${step.value} into a[${step.index}], replacing ${step.prevValue}.`;
    case 'read':
      return `Read a[${step.index}] (${values[step.index]}) into the buffer.`;
    case 'bucketPlace':
      return `Placed a[${step.index}] (${values[step.index]}) into bucket ${step.bucket} on digit place ${step.place}.`;
    case 'markSorted': {
      if (step.indices.length === 1) {
        return `a[${step.indices[0]}] is in its final position.`;
      }
      return `${list(step.indices)} are in their final positions.`;
    }
    case 'rangeHighlight': {
      if (!step.range) return 'Finished with that range.';
      const { lo, hi, role } = step.range;
      return `Now working on a[${lo}..${hi}] — ${ROLE_PHRASE[role] ?? role}.`;
    }
    case 'passBoundary':
      return step.note ?? 'Starting the next pass.';
  }
}
