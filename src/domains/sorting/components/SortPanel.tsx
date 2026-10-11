import type { Frame } from '../../../engine/types';
import { BarChart, type BarState } from '../../../shared/components/BarChart';
import { PseudocodePanel } from '../../../shared/components/PseudocodePanel';
import { StatsPanel } from '../../../shared/components/StatsPanel';
import { SORT_GROUPS, SORT_PROFILE } from '../registry';
import { highlightsForStep, type SortAlgorithm, type SortState, type SortStep } from '../types';
import styles from './SortPanel.module.css';

const STAT_LABELS = [
  { key: 'comparisons', label: 'Comparisons' },
  { key: 'swaps', label: 'Swaps' },
  { key: 'accesses', label: 'Accesses' },
];

interface SortPanelProps {
  def: SortAlgorithm;
  frame: Frame<SortState>;
  currentStep: SortStep | null;
  maxValue: number;
  /** Number of elements, for the predicted bound. */
  size: number;
  onAlgorithmChange(id: string): void;
  /** Race mode renders two of these side by side, so panels get denser. */
  compact?: boolean;
  finished?: boolean;
}

const COUNTER_NOUN = {
  comparisons: 'comparisons',
  accesses: 'array accesses',
} as const;

/**
 * Holds what the run actually did against the algorithm's own bound.
 *
 * A big-O label on its own is inert — nobody checks it against anything, and
 * it reads the same whether the run confirmed it or embarrassed it. The
 * interesting cases are exactly the ones a static label hides: insertion sort
 * on nearly-sorted input beating its quadratic bound, quicksort on reversed
 * input blowing past n log n, selection sort never moving off its bound at all
 * because its comparison count does not depend on the input.
 *
 * The bands are deliberately wide. `predict` is a constant-free leading term,
 * so landing within a factor of two of it is the strongest agreement it can
 * support; anything tighter would be reporting on the constant, which is not
 * what a bound claims.
 */
function verdictFor(
  def: SortAlgorithm,
  size: number,
  stats: Frame<SortState>['stats'],
  finished: boolean,
): { predicted: number; noun: string; text: string } | null {
  const profile = SORT_PROFILE[def.id];
  if (!profile) return null;

  const predicted = Math.round(profile.predict(size));
  const noun = COUNTER_NOUN[profile.measures];
  if (!finished) {
    return { predicted, noun, text: 'Run to the end to compare measured against predicted.' };
  }

  const measured = stats[profile.measures] ?? 0;
  const ratio = measured / Math.max(1, predicted);
  const text =
    ratio < 0.5
      ? `Beat the bound — ${Math.round((1 - ratio) * 100)}% fewer ${noun} than predicted.`
      : ratio > 2
        ? `Over the bound — ${ratio.toFixed(1)}× the predicted ${noun} on this input shape.`
        : `Matches the predicted bound — ${measured.toLocaleString()} ${noun} against ${predicted.toLocaleString()}.`;
  return { predicted, noun, text };
}

export function SortPanel({
  def,
  frame,
  currentStep,
  maxValue,
  size,
  onAlgorithmChange,
  compact = false,
  finished = false,
}: SortPanelProps) {
  const highlights = highlightsForStep(currentStep);
  const { sorted } = frame.state;
  const profile = SORT_PROFILE[def.id];
  const verdict = verdictFor(def, size, frame.stats, finished);

  const stateFor = (index: number): BarState => {
    const highlight = highlights.get(index);
    if (highlight) return highlight;
    if (sorted[index]) return 'sorted';
    return 'idle';
  };

  return (
    <section className={`${styles.panel} ${compact ? styles.compact : ''}`}>
      {/*
        In single mode the algorithm is named and changed in the identity strip
        at the top of the page, so repeating a picker here would be two
        controls for one piece of state. Race mode still needs one per panel.
      */}
      {compact && (
        <header className={styles.header}>
          <select value={def.id} onChange={(e) => onAlgorithmChange(e.target.value)}>
            {SORT_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.algorithms.map((algorithm) => (
                  <option key={algorithm.id} value={algorithm.id}>
                    {algorithm.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {finished && <span className={styles.done}>Done</span>}
        </header>
      )}

      {/* Chart and pseudocode sit side by side so the highlighted line is
          visible while the bars are moving — stacked, the panel falls below
          the fold and the sync is wasted. */}
      <div className={styles.workspace}>
        <div className={styles.chart}>
          <BarChart
            values={frame.state.values}
            maxValue={maxValue}
            stateFor={stateFor}
            range={frame.state.range}
            showValues={!compact}
          />
        </div>

        <div className={styles.readouts}>
          <StatsPanel
            stats={frame.stats}
            labels={STAT_LABELS}
            note={frame.state.note}
            footer={
              verdict && (
                <div className={styles.verdict}>
                  <div className={styles.predictedRow}>
                    <span>
                      Predicted <code>O({profile.bigO})</code> at n={size}
                    </span>
                    <span className={styles.predicted}>
                      ≈ {verdict.predicted.toLocaleString()} {verdict.noun}
                    </span>
                  </div>
                  <div className={styles.verdictText}>
                    Space {def.complexity?.space ?? '—'} · {verdict.text}
                  </div>
                </div>
              )
            }
          />
          <PseudocodePanel lines={def.pseudocode} activeLine={frame.currentLine} />
        </div>
      </div>
    </section>
  );
}
