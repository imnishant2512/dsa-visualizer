import { useState } from 'react';
import type { StepPlayer } from '../../../engine/useStepPlayer';
import { BarChart, type BarState } from '../../../shared/components/BarChart';
import { PseudocodePanel } from '../../../shared/components/PseudocodePanel';
import { SORT_GROUPS } from '../registry';
import { highlightsForStep, type SortAlgorithm, type SortState, type SortStep } from '../types';
import styles from './RaceView.module.css';

export type SortRunner = StepPlayer<SortState, SortStep>;

interface RaceViewProps {
  defA: SortAlgorithm;
  defB: SortAlgorithm;
  playerA: SortRunner;
  playerB: SortRunner;
  maxValue: number;
  onSelect(panel: 'a' | 'b', id: string): void;
}

const METRICS = [
  { key: 'comparisons', label: 'Comparisons' },
  { key: 'swaps', label: 'Swaps' },
  { key: 'accesses', label: 'Array accesses' },
] as const;

/**
 * Which of the two a number belongs to. Deliberately not the accent — the
 * accent means "the control you press", and using it for one competitor would
 * make that one look selected.
 */
const SIDE_COLOR = { a: 'var(--v-read)', b: 'var(--v-bucket)' } as const;

function Side({
  side,
  def,
  player,
  maxValue,
  onSelect,
}: {
  side: 'a' | 'b';
  def: SortAlgorithm;
  player: SortRunner;
  maxValue: number;
  onSelect(id: string): void;
}) {
  const highlights = highlightsForStep(player.currentStep);
  const { sorted } = player.frame.state;
  const finished = !player.canStepForward && player.totalSteps > 0;

  const stateFor = (index: number): BarState => {
    const highlight = highlights.get(index);
    if (highlight) return highlight;
    if (sorted[index]) return 'sorted';
    return 'idle';
  };

  return (
    <div className={styles.side}>
      <div className={styles.sideHead}>
        <div className={styles.sideName}>
          <span className={styles.dot} style={{ background: SIDE_COLOR[side] }} aria-hidden />
          <select
            value={def.id}
            aria-label={`Algorithm in slot ${side.toUpperCase()}`}
            onChange={(event) => onSelect(event.target.value)}
          >
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
        </div>
        {/*
          Each run's own step count, not the shared cursor. The whole point of
          the shared clock is that these two numbers differ while the two runs
          stay level, so both have to be visible.
        */}
        <span className={styles.own}>
          {(player.frame.cursor + 1).toLocaleString()} / {player.totalSteps.toLocaleString()} steps
        </span>
      </div>

      <div className={styles.chart}>
        <BarChart
          values={player.frame.state.values}
          maxValue={maxValue}
          stateFor={stateFor}
          range={player.frame.state.range}
          showValues={false}
        />
      </div>

      {player.frame.state.note && <div className={styles.note}>{player.frame.state.note}</div>}
    </div>
  );
}

/**
 * Two runs of the same array, held level and then differenced.
 *
 * The old race put two full panels side by side, each with its own stats box
 * and its own pseudocode, and left the reader to subtract one column of
 * numbers from the other. The delta strip does the subtraction, names who is
 * ahead, and says by how much.
 */
export function RaceView({ defA, defB, playerA, playerB, maxValue, onSelect }: RaceViewProps) {
  const [codeSide, setCodeSide] = useState<'a' | 'b'>('a');

  const finished = !playerA.canStepForward && !playerB.canStepForward;
  const started = playerA.frame.cursor >= 0 || playerB.frame.cursor >= 0;
  const codeDef = codeSide === 'a' ? defA : defB;
  const codeLine = (codeSide === 'a' ? playerA : playerB).frame.currentLine;

  return (
    <div className={styles.race}>
      <section>
        <div className={styles.heading}>
          Delta — {finished ? 'final' : 'so far, at this point in both runs'}
        </div>
        <div className={styles.deltas}>
          {METRICS.map(({ key, label }) => {
            const a = playerA.frame.stats[key] ?? 0;
            const b = playerB.frame.stats[key] ?? 0;
            const diff = a - b;
            const peak = Math.max(1, a, b);
            return (
              <div key={key} className={styles.delta}>
                <div className={styles.deltaLabel}>{label}</div>
                <div className={styles.deltaRow}>
                  <span className={styles.deltaValue} data-level={diff === 0 || undefined}>
                    {diff === 0 ? '0' : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toLocaleString()}`}
                  </span>
                  <span className={styles.deltaWho}>
                    {diff === 0 ? 'level' : `more for ${diff > 0 ? defA.label : defB.label}`}
                  </span>
                </div>
                {/* Two half-width bars against a shared peak, so the ratio is
                    readable without reading either number. */}
                <div className={styles.bars}>
                  <span
                    className={styles.bar}
                    style={{ width: `${(a / peak) * 50}%`, background: SIDE_COLOR.a }}
                  />
                  <span
                    className={styles.bar}
                    style={{ width: `${(b / peak) * 50}%`, background: SIDE_COLOR.b }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.sides}>
        <Side
          side="a"
          def={defA}
          player={playerA}
          maxValue={maxValue}
          onSelect={(id) => onSelect('a', id)}
        />
        <Side
          side="b"
          def={defB}
          player={playerB}
          maxValue={maxValue}
          onSelect={(id) => onSelect('b', id)}
        />
      </section>

      <section>
        {/*
          One panel, tabbed. Two stacked pseudocode panels competed for the
          same vertical space and each got half of it, so neither showed enough
          lines to follow the highlight.
        */}
        <div className={styles.codeTabs} role="tablist">
          {(['a', 'b'] as const).map((tab) => (
            <button
              type="button"
              key={tab}
              role="tab"
              aria-selected={codeSide === tab}
              className={`${styles.codeTab} ${codeSide === tab ? styles.codeTabOn : ''}`}
              onClick={() => setCodeSide(tab)}
            >
              {tab === 'a' ? defA.label : defB.label}
            </button>
          ))}
        </div>
        <PseudocodePanel lines={codeDef.pseudocode} activeLine={codeLine} />
      </section>

      {!started && (
        <p className={styles.hint}>
          Press play — both runs advance at the same percentage of their own length, so they start
          and finish together however differently long they are.
        </p>
      )}
    </div>
  );
}
