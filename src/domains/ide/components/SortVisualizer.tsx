import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { buildSteps } from '../../../engine/player';
import { useStepCursor } from '../../../engine/useStepPlayer';
import { BarChart, type BarState } from '../../../shared/components/BarChart';
import { Narration } from '../../../shared/components/Narration';
import { RunBar } from '../../../shared/components/RunBar';
import { StatsPanel } from '../../../shared/components/StatsPanel';
import { usePlaybackKeys } from '../../../shared/hooks/usePlaybackKeys';
import { randomSeed } from '../../../shared/utils/random';
import {
  ARRAY_SHAPES,
  SPEED_MS,
  makeArray,
  type ArrayShape,
} from '../../../shared/utils/randomArray';
import { sortEngine } from '../../sorting/engine';
import { narrateSortStep, sortVisualKind } from '../../sorting/narrate';
import { SORT_ALGORITHMS, SORT_BY_ID } from '../../sorting/registry';
import {
  SORT_STAT_KEYS,
  highlightsForStep,
  type SortState,
  type SortStep,
} from '../../sorting/types';
import { SORT_TEMPLATE, recordInWorker } from '../visualizer/recorder';
import { checkSorted } from '../visualizer/verdict';
import css from './SortVisualizer.module.css';

const STORAGE_KEY = 'dsa-visualizer:ide-sort';
const SIZE_RANGE = { min: 5, max: 40, default: 16 };

const STAT_LABELS = [
  { key: 'comparisons', label: 'Comparisons' },
  { key: 'swaps', label: 'Swaps' },
  { key: 'accesses', label: 'Accesses' },
];

const NO_STEPS: SortStep[] = [];

type Recording =
  | { status: 'idle' }
  | { status: 'recording' }
  | { status: 'failed'; error: string }
  | { status: 'ready'; steps: SortStep[]; input: number[]; code: string };

function loadDraft(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? SORT_TEMPLATE;
  } catch {
    return SORT_TEMPLATE;
  }
}

function initialState(values: readonly number[]): SortState {
  return { values: [...values], sorted: values.map(() => false), note: null, range: null };
}

/** Comparisons and swaps a step list adds up to, from the engine's own deltas. */
function tally(steps: readonly SortStep[]): { comparisons: number; swaps: number } {
  let comparisons = 0;
  let swaps = 0;
  for (const step of steps) {
    const delta = sortEngine.statsDelta(step);
    comparisons += delta.comparisons ?? 0;
    swaps += delta.swaps ?? 0;
  }
  return { comparisons, swaps };
}

function signed(value: number): string {
  return value === 0 ? '±0' : `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString()}`;
}

/**
 * Write a sort, and replay it on the same engine as every built-in one.
 *
 * The IDE used to be a generic scratchpad with no relationship to the replay
 * engine that defines every other screen, while the repo carried a complete
 * generator API for exactly this — imported by nothing. Recording the user's
 * generator into ordinary sort steps means their algorithm gets the whole
 * apparatus: play, pause, scrub, step backwards, the tick strip, narration and
 * measured counters. And because it runs on real input, it can be told
 * whether it actually sorted, and how it compares to a built-in on the
 * identical array.
 */
export function SortVisualizer() {
  const [code, setCode] = useState(loadDraft);
  const [size, setSize] = useState(SIZE_RANGE.default);
  const [shape, setShape] = useState<ArrayShape>('random');
  const [seed, setSeed] = useState(2024);
  const [compareId, setCompareId] = useState('insertion');
  /*
   * The template is ours, so it is safe to record on arrival — the page opens
   * with something to play instead of an empty chart. A saved draft is the
   * reader's own code, and runs only when they press Record.
   */
  const [recording, setRecording] = useState<Recording>(() =>
    code === SORT_TEMPLATE ? { status: 'recording' } : { status: 'idle' },
  );
  const [speedMs, setSpeedMs] = useState<number>(SPEED_MS.default);
  const [playing, setPlaying] = useState(false);
  const runToken = useRef(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Blocked or full storage just means the draft is not kept.
    }
  }, [code]);

  const input = useMemo(() => makeArray(shape, size, seed), [shape, size, seed]);

  /** Runs the recording and stores its outcome; state changes only after it resolves. */
  const capture = useCallback(async (source: string, values: number[]) => {
    const token = ++runToken.current;
    const result = await recordInWorker(source, values);
    // Superseded by a newer recording, or by the component going away.
    if (token !== runToken.current) return;
    setRecording(
      result.ok
        ? { status: 'ready', steps: result.steps, input: values, code: source }
        : { status: 'failed', error: result.error },
    );
  }, []);

  const record = () => {
    setPlaying(false);
    setRecording({ status: 'recording' });
    void capture(code, input);
  };

  // Starts the arrival recording the initial state already announced.
  const startedOnMount = useRef(false);
  useEffect(() => {
    if (startedOnMount.current || recording.status !== 'recording') return;
    startedOnMount.current = true;
    void capture(code, input);
    // Mount only: later recordings are started by the Record button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A recording still in flight when the page goes away must not land later.
  useEffect(
    () => () => {
      runToken.current += 1;
    },
    [],
  );

  const ready = recording.status === 'ready' ? recording : null;
  const steps = ready?.steps ?? NO_STEPS;
  const start = useMemo(() => initialState(ready?.input ?? input), [ready, input]);
  const stale = ready !== null && (ready.code !== code || ready.input !== input);

  const player = useStepCursor({
    steps,
    initialState: start,
    engine: sortEngine,
    statKeys: SORT_STAT_KEYS,
    speedMs,
    playing,
  });

  if (playing && !player.canStepForward) setPlaying(false);

  const stepKinds = useMemo(() => steps.map(sortVisualKind), [steps]);
  const maxValue = useMemo(() => Math.max(1, ...start.values), [start]);

  /** Judged on the replayed end state — what the reader actually watches. */
  const verdict = useMemo(() => {
    if (!ready) return null;
    let state = start;
    for (const step of ready.steps) state = sortEngine.applyStep(state, step);
    return checkSorted(ready.input, state.values);
  }, [ready, start]);

  const comparison = useMemo(() => {
    if (!ready) return null;
    const builtin = buildSteps(SORT_BY_ID[compareId], { values: ready.input });
    return { mine: tally(ready.steps), theirs: tally(builtin.steps), theirSteps: builtin.steps.length };
  }, [ready, compareId]);

  const highlights = highlightsForStep(player.currentStep);
  const stateFor = (index: number): BarState =>
    highlights.get(index) ?? (player.frame.state.sorted[index] ? 'sorted' : 'idle');

  usePlaybackKeys({
    onToggle: () => {
      if (!ready) return;
      if (!playing && !player.canStepForward) player.reset();
      setPlaying((p) => !p);
    },
    onStepBack: () => {
      setPlaying(false);
      player.prev();
    },
    onStepForward: () => {
      setPlaying(false);
      player.next();
    },
  });

  const narration =
    recording.status === 'failed'
      ? recording.error
      : recording.status === 'recording'
        ? 'Recording your sort in a sandboxed worker…'
        : recording.status === 'idle'
          ? 'Press Record to run your sort and capture its steps.'
          : narrateSortStep(player.currentStep, player.frame.state);

  const builtinLabel = SORT_BY_ID[compareId]?.label ?? compareId;

  return (
    <div className={css.visualizer}>
      <div className={css.editorPane}>
        <div className={css.paneHead}>
          <span className={css.paneTitle}>customSort.js</span>
          <span className={css.where}>Runs in a sandboxed worker in this tab. Nothing is uploaded.</span>
        </div>
        <div className={css.editor}>
          <Editor
            height="100%"
            language="javascript"
            theme="vs-dark"
            path="customSort.js"
            value={code}
            onChange={(value) => setCode(value ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              padding: { top: 12 },
              scrollBeyondLastLine: false,
            }}
          />
        </div>
        <div className={css.editorActions}>
          <button
            type="button"
            className={css.record}
            onClick={record}
            disabled={recording.status === 'recording'}
          >
            {recording.status === 'recording' ? 'Recording…' : stale ? 'Record again' : 'Record'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCode(SORT_TEMPLATE);
              setRecording({ status: 'idle' });
            }}
          >
            Reset to template
          </button>
          {stale && (
            <span className={css.stale}>
              The code or the input changed since this recording.
            </span>
          )}
        </div>
      </div>

      <div className={css.runPane}>
        <div className={css.inputRow}>
          <label className={css.field}>
            <span>Size — {size}</span>
            <input
              type="range"
              min={SIZE_RANGE.min}
              max={SIZE_RANGE.max}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
          </label>
          <label className={css.field}>
            <span>Shape</span>
            <select value={shape} onChange={(event) => setShape(event.target.value as ArrayShape)}>
              {ARRAY_SHAPES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setSeed(randomSeed())}>
            New array
          </button>
        </div>

        <RunBar
          summary={`Your sort · ${start.values.length} · ${
            ARRAY_SHAPES.find((option) => option.id === shape)?.label ?? 'Random'
          }`}
          isPlaying={playing}
          canStepBack={player.canStepBack}
          canStepForward={player.canStepForward}
          cursor={player.frame.cursor}
          totalSteps={player.totalSteps}
          speedMs={speedMs}
          onToggle={() => {
            if (!playing && !player.canStepForward) player.reset();
            setPlaying((p) => !p);
          }}
          onStepBack={() => {
            setPlaying(false);
            player.prev();
          }}
          onStepForward={() => {
            setPlaying(false);
            player.next();
          }}
          onSpeedChange={setSpeedMs}
          onSeek={(cursor) => {
            setPlaying(false);
            player.seekTo(cursor);
          }}
          resets={[
            {
              label: 'Rewind',
              title: 'Back to step 0',
              disabled: !ready,
              onClick: () => {
                setPlaying(false);
                player.reset();
              },
            },
          ]}
          stepKinds={stepKinds}
        />

        <Narration
          tag={recording.status === 'failed' ? 'Error' : player.frame.cursor >= 0 ? `Step ${player.frame.cursor + 1}` : 'Ready'}
          tone={recording.status === 'failed' ? 'refusal' : 'neutral'}
        >
          {narration}
        </Narration>

        <div className={css.chart}>
          <BarChart
            values={player.frame.state.values}
            maxValue={maxValue}
            stateFor={stateFor}
            range={player.frame.state.range}
            showValues={start.values.length <= 24}
          />
        </div>

        <StatsPanel
          stats={player.frame.stats}
          labels={STAT_LABELS}
          footer={
            ready &&
            verdict &&
            comparison && (
              <div className={css.verdict}>
                <p className={verdict.ok ? css.pass : css.fail}>
                  {verdict.ok
                    ? `Sorted correctly — ${ready.steps.length.toLocaleString()} steps.`
                    : verdict.reason}
                </p>
                <div className={css.against}>
                  <label>
                    Against
                    <select value={compareId} onChange={(event) => setCompareId(event.target.value)}>
                      {SORT_ALGORITHMS.filter((a) => a.id !== 'bogo').map((algorithm) => (
                        <option key={algorithm.id} value={algorithm.id}>
                          {algorithm.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {/* Same input, counted by the same engine — so the difference
                      is the algorithms, not the bookkeeping. */}
                  <span>
                    comparisons <strong>{signed(comparison.mine.comparisons - comparison.theirs.comparisons)}</strong>
                  </span>
                  <span>
                    swaps <strong>{signed(comparison.mine.swaps - comparison.theirs.swaps)}</strong>
                  </span>
                  <span className={css.againstNote}>
                    yours against {builtinLabel} on the identical array
                  </span>
                </div>
              </div>
            )
          }
        />
      </div>
    </div>
  );
}
