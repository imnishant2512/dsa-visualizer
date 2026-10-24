import type { HashState, HashStep } from '../types';
import styles from './BucketRows.module.css';

interface BucketRowsProps {
  state: HashState;
  currentStep: HashStep | null;
}

export function BucketRows({ state, currentStep }: BucketRowsProps) {
  const collided = new Set(state.collided);
  /*
   * The two strategies were drawn identically, which hid the only thing that
   * distinguishes them. Chaining hangs a connected chain off the bucket — the
   * bucket holds a list, and it can hold many. Probing keeps exactly one slot
   * per row, because the whole idea is that a colliding key goes into a
   * *different* row.
   */
  const chaining = state.strategy === 'chaining';
  const placing = currentStep?.kind === 'place' ? currentStep.bucket : null;
  const removing = currentStep?.kind === 'remove' ? currentStep.bucket : null;

  const rowClass = (bucket: number) => {
    const classes = [styles.row];
    if (state.foundAt?.bucket === bucket) classes.push(styles.found);
    else if (placing === bucket || removing === bucket) classes.push(styles.writing);
    else if (state.cursor === bucket) classes.push(styles.cursor);
    else if (collided.has(bucket)) classes.push(styles.collided);
    return classes.join(' ');
  };

  return (
    <div className={`${styles.table} ${chaining ? styles.chainingTable : styles.probingTable}`}>
      {state.buckets.map((slots, bucket) => (
        <div key={bucket} className={rowClass(bucket)}>
          <span className={styles.index}>{bucket}</span>
          <div className={styles.chain}>
            {slots.length === 0 && <span className={styles.emptySlot}>empty</span>}
            {slots.map((slot, pos) => (
              <span
                key={pos}
                data-linked={chaining && pos > 0 ? '' : undefined}
                className={
                  slot.state === 'tombstone'
                    ? styles.tombstone
                    : state.foundAt?.bucket === bucket && state.foundAt.pos === pos
                      ? styles.hitSlot
                      : styles.slot
                }
                title={slot.state === 'tombstone' ? 'tombstone — probing must continue past it' : undefined}
              >
                {slot.state === 'tombstone' ? `✕ ${slot.key}` : slot.key}
              </span>
            ))}
            {collided.has(bucket) && <span className={styles.collisionTag}>collision</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
