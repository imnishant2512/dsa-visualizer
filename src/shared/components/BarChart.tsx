import { memo } from 'react';
import styles from './BarChart.module.css';

export type BarState =
  'idle' | 'compare' | 'swap' | 'write' | 'read' | 'bucket' | 'sorted' | 'found' | 'excluded';

interface BarChartProps {
  values: number[];
  maxValue: number;
  /** Per-index visual state; called once per bar per render. */
  stateFor: (index: number) => BarState;
  /** Inclusive index window shaded as the active region. */
  range?: { lo: number; hi: number } | null;
  /** Shows numeric labels when the bars are wide enough to fit them. */
  showValues?: boolean;
}

/**
 * Bars flex to fill the container, so an array of 8 and an array of 200 both
 * fit without overflowing — the fixed 10px width in the original project is
 * what made large arrays spill off screen.
 */
function BarChartImpl({ values, maxValue, stateFor, range, showValues }: BarChartProps) {
  const labelled = showValues && values.length <= 40;

  return (
    <div className={styles.chart} role="img" aria-label={`Array of ${values.length} values`}>
      {values.map((value, index) => {
        const inRange = range ? index >= range.lo && index <= range.hi : false;
        return (
          <div
            key={index}
            className={`${styles.slot} ${inRange ? styles.inRange : ''}`}
            style={{ height: `${(value / maxValue) * 100}%` }}
          >
            {labelled && <span className={styles.value}>{value}</span>}
            <div className={`${styles.bar} ${styles[stateFor(index)]}`} />
          </div>
        );
      })}
    </div>
  );
}

export const BarChart = memo(BarChartImpl);
