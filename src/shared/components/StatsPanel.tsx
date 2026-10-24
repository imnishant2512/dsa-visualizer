import type { ReactNode } from 'react';
import type { StatCounters } from '../../engine/types';
import styles from './StatsPanel.module.css';

interface StatsPanelProps {
  stats: StatCounters;
  /** Ordered keys to display, with human labels. */
  labels: Array<{ key: string; label: string }>;
  /**
   * Prose complexity, e.g. "O(n²), O(n) on nearly-sorted input".
   *
   * Kept for the domains that have not had their redesign pass yet. Where a
   * page shows the bound beside the algorithm's own name — which is where it
   * belongs, since it is a property of the algorithm and not a measurement —
   * it should stop passing this and use `footer` to hold the *comparison*
   * between what was predicted and what was counted.
   */
  complexity?: { time: string; space: string };
  note?: string | null;
  /** Anything to show under the counters, above the note. */
  footer?: ReactNode;
}

/**
 * Measured numbers only.
 *
 * The counters and the complexity bound used to sit in one box, which quietly
 * implied they were the same kind of fact. They are not: one is counted from
 * this run on this input, the other is a claim about every run. Separating
 * them is what makes it possible to put them back together deliberately, as a
 * verdict.
 */
export function StatsPanel({ stats, labels, complexity, note, footer }: StatsPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.heading}>Measured</div>

      <div className={styles.counters}>
        {labels.map(({ key, label }) => (
          <div key={key} className={styles.counter}>
            <span className={styles.value}>{(stats[key] ?? 0).toLocaleString()}</span>
            <span className={styles.label}>{label}</span>
          </div>
        ))}
      </div>

      {footer && <div className={styles.footer}>{footer}</div>}

      {complexity && (
        <dl className={styles.complexity}>
          <dt>Time</dt>
          <dd>{complexity.time}</dd>
          <dt>Space</dt>
          <dd>{complexity.space}</dd>
        </dl>
      )}

      {note && <div className={styles.note}>{note}</div>}
    </div>
  );
}
