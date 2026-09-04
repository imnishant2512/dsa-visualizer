import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStepPlayer } from '../../../engine/useStepPlayer';
import { BarChart, type BarState } from '../../../shared/components/BarChart';
import { RunBar } from '../../../shared/components/RunBar';
import { stepKindsByName } from '../../../shared/components/stepKinds';
import { ShareLink } from '../../../shared/components/ShareLink';
import { usePlaybackKeys } from '../../../shared/hooks/usePlaybackKeys';
import { PseudocodePanel } from '../../../shared/components/PseudocodePanel';
import { StatsPanel } from '../../../shared/components/StatsPanel';
import { randomSeed } from '../../../shared/utils/random';
import { ARRAY_SIZE, SPEED_MS, randomSortedArray } from '../../../shared/utils/randomArray';
import { SEARCH_ALGORITHMS, SEARCH_BY_ID } from '../algorithms';
import { searchEngine } from '../engine';
import { SEARCH_STAT_KEYS } from '../types';
import styles from './SearchingPage.module.css';

function readInt(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readAlgorithm(value: string | null): string | null {
  return value && SEARCH_ALGORITHMS.some((a) => a.id === value) ? value : null;
}

const STAT_LABELS = [
  { key: 'comparisons', label: 'Comparisons' },
  { key: 'accesses', label: 'Accesses' },
];

const DEFAULT_SIZE = 30;

/** A value that is actually present, so a fresh array starts with a hit. */
function pickTarget(values: number[]): number {
  return values[Math.floor(Math.random() * values.length)] ?? 0;
}

export function SearchingPage() {
  const [params, setParams] = useSearchParams();

  // Initial state comes from the URL when present, so a shared link reproduces
  // the exact run. The array travels as a seed rather than 30 numbers.
  const [seed, setSeed] = useState<number>(() => readInt(params.get('seed')) ?? randomSeed());
  const [size, setSize] = useState(() => readInt(params.get('size')) ?? DEFAULT_SIZE);
  const [algorithmId, setAlgorithmId] = useState(
    () => readAlgorithm(params.get('algo')) ?? 'binary',
  );

  const values = useMemo(() => randomSortedArray(size, seed), [size, seed]);

  // Default to a target that is actually in the array, so the first run finds
  // something. Chosen alongside the array rather than in a reactive effect.
  const [target, setTarget] = useState<number>(
    () => readInt(params.get('target')) ?? pickTarget(values),
  );
  const [speedMs, setSpeedMs] = useState<number>(SPEED_MS.default * 3);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set('algo', algorithmId);
    next.set('size', String(size));
    next.set('seed', String(seed));
    next.set('target', String(target));
    setParams(next, { replace: true });
  }, [algorithmId, size, seed, target, setParams]);

  const def = SEARCH_BY_ID[algorithmId];

  const input = useMemo(() => ({ values, target }), [values, target]);
  const maxValue = useMemo(() => Math.max(1, ...values), [values]);

  const player = useStepPlayer({
    def,
    input,
    engine: searchEngine,
    statKeys: SEARCH_STAT_KEYS,
    speedMs,
    playing,
  });

  // Adjusted during render rather than in an effect: it converges immediately
  // and never commits a frame claiming to play with no steps left.
  if (playing && !player.canStepForward) setPlaying(false);

  const { state } = player.frame;
  const step = player.currentStep;
  const activeIndex =
    step && (step.kind === 'probe' || step.kind === 'compare') ? step.index : null;

  const stateFor = (index: number): BarState => {
    if (state.foundIndex === index) return 'found';
    if (index === activeIndex) return 'compare';
    if (index < state.lo || index > state.hi) return 'excluded';
    if (state.probed.includes(index)) return 'read';
    return 'idle';
  };

  const regenerate = (nextSize: number) => {
    setPlaying(false);
    const nextSeed = randomSeed();
    setSize(nextSize);
    setSeed(nextSeed);
    setTarget(pickTarget(randomSortedArray(nextSize, nextSeed)));
  };

  const outcome = state.foundIndex !== null
    ? `Found ${target} at index ${state.foundIndex}`
    : state.exhausted
      ? `${target} is not in the array`
      : null;

  const handleToggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (!player.canStepForward) player.reset();
    setPlaying(true);
  };

  const handleStepBack = () => {
    setPlaying(false);
    player.prev();
  };

  const handleStepForward = () => {
    setPlaying(false);
    player.next();
  };

  usePlaybackKeys({
    onToggle: handleToggle,
    onStepBack: handleStepBack,
    onStepForward: handleStepForward,
  });


  const stepKinds = useMemo(() => stepKindsByName(player.steps), [player.steps]);
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1>Searching</h1>
        <p>
          Five search strategies over the same sorted array. Watch the candidate window collapse —
          greyed bars have been ruled out without ever being read.
        </p>
      </header>

      <div className={styles.setup}>
        <label>
          Algorithm
          <select
            value={algorithmId}
            onChange={(e) => {
              setPlaying(false);
              setAlgorithmId(e.target.value);
            }}
          >
            {SEARCH_ALGORITHMS.map((algorithm) => (
              <option key={algorithm.id} value={algorithm.id}>
                {algorithm.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Target
          <input
            type="number"
            value={target}
            onChange={(e) => {
              setPlaying(false);
              setTarget(Number(e.target.value));
            }}
            className={styles.target}
          />
        </label>

        <label>
          Size
          <input
            type="range"
            min={ARRAY_SIZE.min}
            max={80}
            value={size}
            onChange={(e) => {
              const next = Number(e.target.value);
              setSize(next);
              regenerate(next);
            }}
          />
          <span className={styles.readout}>{size}</span>
        </label>

        <button onClick={() => regenerate(size)}>New Array</button>
        <ShareLink />
      </div>

      <p className={styles.summary}>
        {def.summary}{' '}
        {def.requiresSorted && <em>Requires sorted input — this array is always ascending.</em>}
      </p>

      <RunBar
        summary={`${def.label} · ${size} · target ${target}`}
        isPlaying={playing}
        canStepBack={player.canStepBack}
        canStepForward={player.canStepForward}
        cursor={player.frame.cursor}
        totalSteps={player.totalSteps}
        speedMs={speedMs}
        onToggle={handleToggle}
        onStepBack={handleStepBack}
        onStepForward={handleStepForward}
        onSpeedChange={setSpeedMs}
        onSeek={(cursor) => {
          setPlaying(false);
          player.seekTo(cursor);
        }}
        resets={[
          {
            label: 'Rewind',
            title: 'Back to step 0, same array',
            onClick: () => {
              setPlaying(false);
              player.reset();
            },
          },
          {
            label: 'New array',
            title: 'Discard this run and generate a fresh array',
            danger: true,
            onClick: () => regenerate(size),
          },
        ]}
        stepKinds={stepKinds}
      />

      <div className={styles.workspace}>
        <div className={styles.left}>
          <div className={styles.chart}>
            <BarChart
              values={state.values}
              maxValue={maxValue}
              stateFor={stateFor}
              range={state.lo <= state.hi ? { lo: state.lo, hi: state.hi } : null}
              showValues
            />
          </div>
          {outcome && (
            <div className={state.foundIndex !== null ? styles.found : styles.missing}>
              {outcome}
            </div>
          )}
        </div>

        <div className={styles.readouts}>
          <StatsPanel
            stats={player.frame.stats}
            labels={STAT_LABELS}
            complexity={def.complexity}
            note={state.note}
          />
          <PseudocodePanel lines={def.pseudocode} activeLine={player.frame.currentLine} />
        </div>
      </div>
    </div>
  );
}
