import type { HashState } from '../types';
import styles from './ReferenceTable.module.css';

interface ReferenceTableProps {
  state: HashState;
  label: string;
  note: string;
}

/**
 * The other strategy, holding the same keys, at a glance.
 *
 * The strategy toggle only means anything if you can see what the alternative
 * would have done with your keys — and the page previously answered that by
 * destroying them. Showing both at once removes the need to switch at all for
 * the common case, and makes switching a deliberate choice about which one you
 * want to step through rather than a gamble.
 *
 * Deliberately not interactive and deliberately smaller: it is a reference,
 * not a second workspace.
 */
export function ReferenceTable({ state, label, note }: ReferenceTableProps) {
  return (
    <div>
      <div className={styles.heading}>{label} — same keys</div>
      <div className={styles.rows}>
        {state.buckets.map((slots, bucket) => {
          const live = slots.filter((slot) => slot.state === 'occupied');
          const tombs = slots.length - live.length;
          return (
            <div key={bucket} className={styles.row}>
              <span className={styles.index}>{bucket}</span>
              <span className={live.length === 0 ? styles.empty : styles.filled}>
                {live.length === 0
                  ? tombs > 0
                    ? '✕'
                    : '·'
                  : live.map((slot) => slot.key).join(' → ')}
              </span>
            </div>
          );
        })}
      </div>
      <div className={styles.note}>{note}</div>
    </div>
  );
}
