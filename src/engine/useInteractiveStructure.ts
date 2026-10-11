import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { initFrame, seek, stepBack, stepForward } from './player';
import type { Frame, StepEngine } from './types';
import { usePlaybackTicker } from './usePlaybackTicker';

/**
 * One user-triggered operation against a persistent structure — "Insert 7",
 * "Search 12". Read-only operations still animate and land in the history, but
 * they leave the structure untouched.
 */
export interface StructureOperation<TState, TStep, TArgs> {
  id: string;
  label(args: TArgs): string;
  /**
   * Name for a control that triggers the operation, where `label`'s
   * argument-specific phrasing ("BFS from A") is too long. Falls back to
   * `label` when absent, so a control can never be left without a name.
   */
  shortLabel?: string;
  pseudocode: string[];
  /** Pure: yields steps against the *current* structure. */
  generate(state: TState, args: TArgs): Generator<TStep>;
  /** Traversals and searches inspect without mutating. */
  readOnly?: boolean;
  /**
   * Why this operation cannot run right now, or null if it can.
   *
   * Pure, and checked *before* the operation is offered rather than after it
   * has been run. Popping an empty stack used to animate a no-op and then
   * report the failure afterwards, in the same informational blue as a
   * success — so the control said "Pop", you pressed it, and the structure
   * silently did nothing. A reason here lets the page disable the control and
   * say what would make it work.
   */
  refuse?(state: TState, args: TArgs): string | null;
}

export interface OperationRecord<TState, TStep, TArgs = unknown> {
  key: number;
  label: string;
  /**
   * What was run, and with what. The label is written to be read ("Insert 27")
   * and parsing it back is not a contract; these two are. A domain that wants
   * its history to be the source of truth — replaying it against a different
   * configuration, say — needs to be able to re-issue the operation, not just
   * describe it.
   */
  operationId: string;
  args: TArgs;
  steps: TStep[];
  stateBefore: TState;
  stateAfter: TState;
  readOnly: boolean;
}

interface ActiveOperation<TState, TStep, TArgs> {
  label: string;
  operationId: string;
  args: TArgs;
  pseudocode: string[];
  steps: TStep[];
  stateBefore: TState;
  readOnly: boolean;
}

interface InteractiveState<TState, TStep, TArgs> {
  /** Committed structure — what survives between operations. */
  structure: TState;
  history: OperationRecord<TState, TStep, TArgs>[];
  /** Ephemeral, mid-flight operation. Not folded into `structure` until commit. */
  active: ActiveOperation<TState, TStep, TArgs> | null;
  /** Cursor over the active operation (or a trivial frame over the structure). */
  frame: Frame<TState>;
  nextKey: number;
  /** How many `perform` actions this state has absorbed. See the idle effect. */
  performed: number;
}

type Action<TState, TStep, TArgs> =
  | { type: 'perform'; operation: StructureOperation<TState, TStep, TArgs>; args: TArgs }
  | { type: 'forward' }
  | { type: 'back' }
  | { type: 'seek'; cursor: number }
  | { type: 'commit' }
  | { type: 'cancel' }
  | { type: 'undo' }
  | { type: 'reset'; structure: TState };

/**
 * Operation mode, built on the same cursor primitives as batch mode.
 *
 * Three actions that are easy to conflate are kept distinct here:
 *  - stepping back inside the active operation (scrubs the cursor),
 *  - cancelling the active operation (structure untouched),
 *  - undoing the last *committed* operation (restores its stateBefore).
 */
export function useInteractiveStructure<TState, TStep, TArgs>({
  engine,
  statKeys,
  initialState,
  speedMs,
  playing,
  onIdle,
}: {
  engine: StepEngine<TState, TStep>;
  statKeys: readonly string[];
  initialState: TState;
  speedMs: number;
  playing: boolean;
  /** Called when the active operation runs out of steps. */
  onIdle?: () => void;
}) {
  const reducer = useCallback(
    (
      state: InteractiveState<TState, TStep, TArgs>,
      action: Action<TState, TStep, TArgs>,
    ): InteractiveState<TState, TStep, TArgs> => {
      const commit = (
        s: InteractiveState<TState, TStep, TArgs>,
      ): InteractiveState<TState, TStep, TArgs> => {
        if (!s.active) return s;
        const { steps, stateBefore, readOnly, label, operationId, args } = s.active;
        const end =
          steps.length === 0
            ? initFrame(stateBefore, statKeys, 0)
            : seek(stateBefore, steps, engine, steps.length - 1, statKeys);
        // Read-only operations discard their visual marks on commit.
        const stateAfter = readOnly ? stateBefore : end.state;
        return {
          structure: stateAfter,
          history: [
            ...s.history,
            { key: s.nextKey, label, operationId, args, steps, stateBefore, stateAfter, readOnly },
          ],
          active: null,
          frame: initFrame(stateAfter, statKeys, 0),
          nextKey: s.nextKey + 1,
          performed: s.performed,
        };
      };

      switch (action.type) {
        case 'perform': {
          // Starting a new operation commits whatever was still in flight.
          const base = commit(state);
          const steps = [...action.operation.generate(base.structure, action.args)];
          return {
            ...base,
            performed: state.performed + 1,
            active: {
              label: action.operation.label(action.args),
              operationId: action.operation.id,
              args: action.args,
              pseudocode: action.operation.pseudocode,
              steps,
              stateBefore: base.structure,
              readOnly: action.operation.readOnly ?? false,
            },
            frame: initFrame(base.structure, statKeys, steps.length),
          };
        }

        case 'forward':
          if (!state.active) return state;
          return { ...state, frame: stepForward(state.frame, state.active.steps, engine) };

        case 'back':
          if (!state.active) return state;
          return { ...state, frame: stepBack(state.frame, state.active.steps, engine) };

        case 'seek': {
          if (!state.active) return state;
          const { steps, stateBefore } = state.active;
          return {
            ...state,
            frame:
              action.cursor < 0
                ? initFrame(stateBefore, statKeys, steps.length)
                : seek(stateBefore, steps, engine, action.cursor, statKeys),
          };
        }

        case 'commit':
          return commit(state);

        case 'cancel':
          if (!state.active) return state;
          return {
            ...state,
            active: null,
            frame: initFrame(state.structure, statKeys, 0),
          };

        case 'undo': {
          // An in-flight operation is discarded before any committed one.
          if (state.active) {
            return { ...state, active: null, frame: initFrame(state.structure, statKeys, 0) };
          }
          const last = state.history[state.history.length - 1];
          if (!last) return state;
          return {
            ...state,
            structure: last.stateBefore,
            history: state.history.slice(0, -1),
            frame: initFrame(last.stateBefore, statKeys, 0),
          };
        }

        case 'reset':
          return {
            structure: action.structure,
            history: [],
            active: null,
            frame: initFrame(action.structure, statKeys, 0),
            nextKey: 0,
            performed: state.performed,
          };

        default:
          return state;
      }
    },
    [engine, statKeys],
  );

  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    structure: initialState,
    history: [],
    active: null,
    frame: initFrame(initialState, statKeys, 0),
    nextKey: 0,
    performed: 0,
  }));

  /*
   * Operations requested, counted synchronously in the event handler — ahead
   * of the render that absorbs them. Compared with `state.performed` below.
   */
  const requested = useRef(0);

  const totalSteps = state.active?.steps.length ?? 0;
  const atEnd = state.frame.cursor >= totalSteps - 1;

  const advance = useCallback((count: number) => {
    // Operations are short (1-20 steps), so batching rarely kicks in here —
    // but sharing the ticker keeps the speed slider meaning the same thing
    // everywhere.
    for (let i = 0; i < count; i++) dispatch({ type: 'forward' });
  }, []);

  usePlaybackTicker({
    playing,
    speedMs,
    enabled: Boolean(state.active) && !atEnd,
    onAdvance: advance,
  });

  /*
   * Stop the clock once the operation has run out — unless a newer one has
   * already been requested.
   *
   * This effect belongs to the render in which the old operation reached its
   * end, and React runs it asynchronously. If the next operation was started
   * in that gap, its handler queued "play" first and this effect then queued
   * "stop" after it, so the new operation loaded and sat paused for good. It
   * took a click landing in a window of a frame or two, which is exactly what
   * the 4x preset made likely. A request the state has not absorbed yet means
   * this effect is describing an operation that is already superseded.
   */
  useEffect(() => {
    if (state.performed !== requested.current) return;
    if (playing && (atEnd || !state.active)) onIdle?.();
  }, [playing, atEnd, state.active, state.performed, onIdle]);

  const api = useMemo(
    () => ({
      perform: (operation: StructureOperation<TState, TStep, TArgs>, args: TArgs) => {
        requested.current += 1;
        dispatch({ type: 'perform', operation, args });
      },
      next: () => dispatch({ type: 'forward' }),
      prev: () => dispatch({ type: 'back' }),
      seekTo: (cursor: number) => dispatch({ type: 'seek', cursor }),
      commit: () => dispatch({ type: 'commit' }),
      cancel: () => dispatch({ type: 'cancel' }),
      undoLast: () => dispatch({ type: 'undo' }),
      reset: (structure: TState) => dispatch({ type: 'reset', structure }),
    }),
    [],
  );

  /*
   * What the *next* operation will run against.
   *
   * `perform` commits whatever is in flight before generating, so an operation
   * chosen while another is still animating sees that one's result, not the
   * last committed structure. A page deciding which operations to offer has to
   * ask the same question — otherwise the fourth pop of a four-item stack is
   * still offered, because three of them have not committed yet.
   */
  const pendingStructure = useMemo(() => {
    if (!state.active) return state.structure;
    const { steps, stateBefore, readOnly } = state.active;
    if (readOnly || steps.length === 0) return stateBefore;
    return seek(stateBefore, steps, engine, steps.length - 1, statKeys).state;
  }, [state.active, state.structure, engine, statKeys]);

  return {
    ...api,
    /** What to render: the mid-operation frame when one is active. */
    displayState: state.active ? state.frame.state : state.structure,
    structure: state.structure,
    pendingStructure,
    history: state.history,
    active: state.active,
    frame: state.frame,
    currentStep:
      state.active && state.frame.cursor >= 0 ? state.active.steps[state.frame.cursor] : null,
    totalSteps,
    canStepForward: Boolean(state.active) && !atEnd,
    canStepBack: Boolean(state.active) && state.frame.cursor >= 0,
    canUndo: state.history.length > 0 || Boolean(state.active),
  };
}
