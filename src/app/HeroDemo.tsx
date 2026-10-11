import { useEffect, useMemo, useReducer, useState } from 'react';
import { buildSteps, initFrame, stepBack, stepForward } from '../engine/player';
import type { Frame } from '../engine/types';
import { BarChart, type BarState } from '../shared/components/BarChart';
import { colorForKind } from '../shared/components/stepKinds';
import { usePrefersReducedMotion } from '../shared/hooks/usePrefersReducedMotion';
import { makeArray } from '../shared/utils/randomArray';
import { bubbleSort } from '../domains/sorting/algorithms/bubbleFamily';
import { sortEngine } from '../domains/sorting/engine';
import { narrateSortStep, sortVisualKind } from '../domains/sorting/narrate';
import { SORT_STAT_KEYS, highlightsForStep, type SortState } from '../domains/sorting/types';
import styles from './HeroDemo.module.css';

const HERO_SIZE = 18;
const HERO_SEED = 2024;
/** Milliseconds per tick, and steps per tick — about five seconds a direction. */
export const HERO_TICK_MS = 45;
const STEPS_PER_TICK = 2;
/** Ticks to hold at each end, so the change of direction is visible. */
const HOLD_TICKS = 18;

interface LoopState {
  frame: Frame<SortState>;
  direction: 1 | -1;
  hold: number;
}

/**
 * The claim the whole app rests on, demonstrated instead of described.
 *
 * The landing page used to open with a paragraph explaining that every step
 * is exactly reversible. This runs a real bubble sort — the same generator,
 * engine and `invertStep` the sorting page uses, not a canned animation —
 * forward to the end and then *backward* to the start, with the counter
 * visibly counting down and the direction named. Nothing here is special-cased
 * for the demo; if reversal were approximate anywhere, it would show here.
 */
export function HeroDemo() {
  const reducedMotion = usePrefersReducedMotion();
  const { steps, initialState } = useMemo(
    () => buildSteps(bubbleSort, { values: makeArray('random', HERO_SIZE, HERO_SEED) }),
    [],
  );
  const kinds = useMemo(() => steps.map(sortVisualKind), [steps]);
  const maxValue = useMemo(() => Math.max(1, ...initialState.values), [initialState]);

  const [loop, dispatch] = useReducer(
    (current: LoopState): LoopState => {
      if (current.hold > 0) return { ...current, hold: current.hold - 1 };
      let { frame } = current;
      for (let i = 0; i < STEPS_PER_TICK; i++) {
        if (current.direction === 1) {
          if (frame.cursor >= steps.length - 1) {
            return { frame, direction: -1, hold: HOLD_TICKS };
          }
          frame = stepForward(frame, steps, sortEngine);
        } else {
          if (frame.cursor < 0) return { frame, direction: 1, hold: HOLD_TICKS };
          frame = stepBack(frame, steps, sortEngine);
        }
      }
      return { ...current, frame };
    },
    undefined,
    (): LoopState => ({
      frame: initFrame(initialState, SORT_STAT_KEYS, steps.length),
      direction: 1,
      hold: 0,
    }),
  );

  /*
   * Reduced motion means no autoplay — the reader starts it if they want it.
   * The choice is the reader's after that, in either direction.
   */
  const [userChoice, setUserChoice] = useState<boolean | null>(null);
  const looping = userChoice ?? !reducedMotion;

  useEffect(() => {
    if (!looping) return;
    const id = window.setInterval(() => dispatch(), HERO_TICK_MS);
    return () => window.clearInterval(id);
  }, [looping]);

  const { frame, direction } = loop;
  const currentStep = frame.cursor >= 0 ? steps[frame.cursor] : null;
  const highlights = highlightsForStep(currentStep);
  const stateFor = (index: number): BarState =>
    highlights.get(index) ?? (frame.state.sorted[index] ? 'sorted' : 'idle');

  const buckets = 80;
  const ticks = Array.from({ length: buckets }, (_, bucket) => {
    const at = Math.floor((bucket * steps.length) / buckets);
    return { kind: kinds[at], past: at <= frame.cursor };
  });

  return (
    <figure className={styles.demo} aria-label="A bubble sort replaying forward and then backward">
      <div className={styles.head}>
        <span className={styles.caption}>Bubble sort · {HERO_SIZE} elements</span>
        <span className={styles.readout}>
          <span className={direction === 1 ? styles.forward : styles.reverse}>
            {direction === 1 ? 'forward' : 'reverse'}
          </span>
          <span className={styles.counter}>
            {Math.max(0, frame.cursor + 1)} / {steps.length}
          </span>
        </span>
      </div>

      <div className={styles.chart}>
        <BarChart
          values={frame.state.values}
          maxValue={maxValue}
          stateFor={stateFor}
          range={null}
          showValues={false}
        />
      </div>

      <div className={styles.ticks} aria-hidden>
        {ticks.map((tick, index) => (
          <span
            // A fixed strip; the index is the identity.
            key={index}
            style={{
              background: tick.kind ? colorForKind(tick.kind) : 'var(--hairline)',
              opacity: tick.past ? 1 : 0.28,
            }}
          />
        ))}
      </div>

      <figcaption className={styles.note}>
        {/* Deliberately not a live region: it changes ~20 times a second. */}
        {narrateSortStep(currentStep, frame.state)}
      </figcaption>

      <button
        type="button"
        className={styles.toggle}
        aria-pressed={looping}
        onClick={() => setUserChoice(!looping)}
      >
        {looping ? 'Pause the loop' : 'Play the loop'}
      </button>
    </figure>
  );
}
