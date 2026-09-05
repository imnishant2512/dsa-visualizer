import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildSteps, initFrame, seek, stepBack, stepForward, stepForwardBy } from './player';
import type { AlgorithmDefinition, Frame, StepEngine } from './types';
import { usePlaybackTicker } from './usePlaybackTicker';

export interface UseStepCursorArgs<TState, TStep> {
  /** Already drained. Must be a stable reference — identity resets the cursor. */
  steps: readonly TStep[];
  initialState: TState;
  /** Must be a stable reference (module-level const per domain). */
  engine: StepEngine<TState, TStep>;
  statKeys: readonly string[];
  /** Delay between ticks in ms; changing it takes effect immediately mid-run. */
  speedMs: number;
  /**
   * Playback is controlled by the caller, not the hook, so one Play button can
   * drive several players at once (race mode).
   */
  playing: boolean;
  /** Fired while `playing` once this player has no steps left. */
  onFinished?: () => void;
}

export interface UseStepPlayerArgs<TInput, TState, TStep>
  extends Omit<UseStepCursorArgs<TState, TStep>, 'steps' | 'initialState'> {
  def: AlgorithmDefinition<TInput, TState, TStep>;
  input: TInput;
}

export interface StepPlayer<TState, TStep> {
  frame: Frame<TState>;
  steps: readonly TStep[];
  /** The step the cursor currently sits on — the one being displayed. */
  currentStep: TStep | null;
  totalSteps: number;
  canStepForward: boolean;
  canStepBack: boolean;
  next(): void;
  prev(): void;
  reset(): void;
  seekTo(cursor: number): void;
}

/**
 * Walks a cursor through a step list that someone else already built.
 *
 * Split out from `useStepPlayer` because race mode has to know how long both
 * runs are *before* it can decide how fast to play either — the two are paced
 * against each other. With generation folded into the player there was no
 * point at which a caller could see one length without having started the
 * other player, and building the lists twice to find out would have doubled
 * the work on every input change.
 */
export function useStepCursor<TState, TStep>({
  steps,
  initialState,
  engine,
  statKeys,
  speedMs,
  playing,
  onFinished,
}: UseStepCursorArgs<TState, TStep>): StepPlayer<TState, TStep> {
  const [frame, setFrame] = useState<Frame<TState>>(() =>
    initFrame(initialState, statKeys, steps.length),
  );

  // A new algorithm or input rewinds to a fresh frame. Adjusting during render
  // rather than in an effect means the stale frame is never committed — React
  // re-runs this component immediately instead of painting the old steps first.
  const [renderedSteps, setRenderedSteps] = useState(steps);
  if (steps !== renderedSteps) {
    setRenderedSteps(steps);
    setFrame(initFrame(initialState, statKeys, steps.length));
  }

  const atEnd = frame.cursor >= steps.length - 1;

  const advance = useCallback(
    (count: number) => setFrame((current) => stepForwardBy(current, steps, engine, count)),
    [steps, engine],
  );

  usePlaybackTicker({ playing, speedMs, enabled: !atEnd, onAdvance: advance });

  // Report completion so the owner can flip its own play state off.
  useEffect(() => {
    if (playing && atEnd) onFinished?.();
  }, [playing, atEnd, onFinished]);

  const next = useCallback(() => {
    setFrame((current) => stepForward(current, steps, engine));
  }, [steps, engine]);

  const prev = useCallback(() => {
    setFrame((current) => stepBack(current, steps, engine));
  }, [steps, engine]);

  const reset = useCallback(() => {
    setFrame(initFrame(initialState, statKeys, steps.length));
  }, [initialState, statKeys, steps.length]);

  const seekTo = useCallback(
    (cursor: number) => {
      setFrame(
        cursor < 0
          ? initFrame(initialState, statKeys, steps.length)
          : seek(initialState, steps, engine, cursor, statKeys),
      );
    },
    [initialState, steps, engine, statKeys],
  );

  return {
    frame,
    steps,
    currentStep: frame.cursor >= 0 ? steps[frame.cursor] : null,
    totalSteps: steps.length,
    canStepForward: !atEnd,
    canStepBack: frame.cursor >= 0,
    next,
    prev,
    reset,
    seekTo,
  };
}

/**
 * Batch-mode player: builds the full step list once per (def, input) and walks
 * a cursor through it. Pause is just not ticking, step-back is one invertStep,
 * and a speed change re-arms the interval without disturbing the cursor.
 */
export function useStepPlayer<TInput, TState, TStep>({
  def,
  input,
  ...rest
}: UseStepPlayerArgs<TInput, TState, TStep>): StepPlayer<TState, TStep> {
  const { steps, initialState } = useMemo(() => buildSteps(def, input), [def, input]);
  return useStepCursor({ steps, initialState, ...rest });
}
