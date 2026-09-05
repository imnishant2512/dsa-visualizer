import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { buildSteps } from '../../../engine/player';
import { useStepCursor } from '../../../engine/useStepPlayer';
import { Narration } from '../../../shared/components/Narration';
import { RunBar } from '../../../shared/components/RunBar';
import { ShareLink } from '../../../shared/components/ShareLink';
import { usePlaybackKeys } from '../../../shared/hooks/usePlaybackKeys';
import { randomSeed } from '../../../shared/utils/random';
import {
  ARRAY_SHAPES,
  ARRAY_SIZE,
  SPEED_MS,
  isArrayShape,
  makeArray,
  type ArrayShape,
} from '../../../shared/utils/randomArray';
import { KIND_LABEL, type VisualKind } from '../../../shared/components/stepKinds';
import { sortEngine } from '../engine';
import { narrateSortStep, sortVisualKind } from '../narrate';
import { MAX_SIZE_BY_ID, SORT_BY_ID, SORT_ALGORITHMS } from '../registry';
import { SORT_STAT_KEYS } from '../types';
import { AlgorithmStrip } from './AlgorithmStrip';
import { RaceView } from './RaceView';
import { SortPanel } from './SortPanel';
import styles from './SortingPage.module.css';

function readInt(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Stable identity, so panel B's memo does not rebuild while race mode is off. */
const EMPTY_INPUT = { values: [] as number[] };

function readAlgorithm(value: string | null): string | null {
  return value && SORT_ALGORITHMS.some((a) => a.id === value) ? value : null;
}

export function SortingPage() {
  const [params, setParams] = useSearchParams();

  // Initial state comes from the URL when present, so a shared link reproduces
  // the exact run. The array travels as a seed rather than 45 numbers.
  const [seed, setSeed] = useState<number>(() => readInt(params.get('seed')) ?? randomSeed());
  const [size, setSize] = useState<number>(
    () => readInt(params.get('size')) ?? ARRAY_SIZE.default,
  );
  const [shape, setShape] = useState<ArrayShape>(() =>
    isArrayShape(params.get('shape')) ? (params.get('shape') as ArrayShape) : 'random',
  );
  const [speedMs, setSpeedMs] = useState<number>(SPEED_MS.default);
  const [playing, setPlaying] = useState(false);
  const [raceMode, setRaceMode] = useState(() => Boolean(params.get('vs')));
  const [idA, setIdA] = useState(() => readAlgorithm(params.get('algo')) ?? 'quick');
  const [idB, setIdB] = useState(() => readAlgorithm(params.get('vs')) ?? 'merge');
  // Purely presentational: the run bar carries a one-line summary, and this is
  // whether the controls behind that summary are showing.
  const [setupOpen, setSetupOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const baseArray = useMemo(() => makeArray(shape, size, seed), [shape, size, seed]);

  // One input object shared by both players: in race mode each algorithm must
  // start from the identical array for the comparison to mean anything.
  const input = useMemo(() => ({ values: baseArray }), [baseArray]);
  const maxValue = useMemo(() => Math.max(1, ...baseArray), [baseArray]);

  const defA = SORT_BY_ID[idA];
  const defB = SORT_BY_ID[idB];

  const runA = useMemo(() => buildSteps(defA, input), [defA, input]);
  /*
   * Generated against an empty array unless race mode is on. Panel B used to
   * build its full step list on every input change whether or not anyone could
   * see it — a second 22,000-step bubble sort on each keystroke of the size
   * slider.
   */
  const runB = useMemo(
    () => buildSteps(defB, raceMode ? input : EMPTY_INPUT),
    [defB, input, raceMode],
  );

  /*
   * One clock for both runs.
   *
   * Two players ticking at the same ms-per-step means the shorter run finishes
   * first and then sits there while the other keeps going, which makes the
   * comparison a stopwatch on step *count* — a number already printed above
   * each chart. Pacing both to the longer run's length instead means they
   * advance through the same percentage of themselves at the same moment, so
   * anything visibly different between the two charts is a real difference in
   * how the algorithms behave rather than in how many steps they emit.
   *
   * The speed control keeps meaning what it says for the longer run; the
   * shorter one is stretched to match it.
   */
  const raceLength = raceMode ? Math.max(runA.steps.length, runB.steps.length) : 0;
  const paceFor = (length: number) =>
    raceMode && length > 0 ? speedMs * (raceLength / length) : speedMs;

  const playerA = useStepCursor({
    ...runA,
    engine: sortEngine,
    statKeys: SORT_STAT_KEYS,
    speedMs: paceFor(runA.steps.length),
    playing,
  });

  const playerB = useStepCursor({
    ...runB,
    engine: sortEngine,
    statKeys: SORT_STAT_KEYS,
    speedMs: paceFor(runB.steps.length),
    playing: playing && raceMode,
  });

  const allFinished = !playerA.canStepForward && (!raceMode || !playerB.canStepForward);

  // Stop the shared clock only once every active player has finished, so the
  // faster algorithm showing "Done" doesn't freeze the slower one. Adjusted
  // during render rather than in an effect: it converges immediately and never
  // commits a frame that claims to be playing when nothing is left to play.
  if (playing && allFinished) setPlaying(false);

  // Bogo sort is the only algorithm with a hard size ceiling; picking it (in
  // either panel) clamps the array rather than freezing the tab.
  const sizeCap = Math.min(
    MAX_SIZE_BY_ID[idA] ?? ARRAY_SIZE.max,
    raceMode ? (MAX_SIZE_BY_ID[idB] ?? ARRAY_SIZE.max) : ARRAY_SIZE.max,
  );

  const regenerate = (shapeToUse: ArrayShape, sizeToUse: number, capToUse = sizeCap) => {
    setPlaying(false);
    setSize(Math.min(sizeToUse, capToUse));
    setShape(shapeToUse);
    setSeed(randomSeed());
  };

  /** Keeps the address bar in step, so the current run is always linkable. */
  useEffect(() => {
    const next = new URLSearchParams();
    next.set('algo', idA);
    next.set('size', String(size));
    next.set('shape', shape);
    next.set('seed', String(seed));
    if (raceMode) next.set('vs', idB);
    // replace, not push — this would otherwise flood the back button.
    setParams(next, { replace: true });
  }, [idA, idB, size, shape, seed, raceMode, setParams]);

  /** Selecting an algorithm can tighten the size ceiling, so re-clamp here. */
  const selectAlgorithm = (panel: 'a' | 'b', id: string) => {
    setPlaying(false);
    setPickerOpen(false);
    if (panel === 'a') setIdA(id);
    else setIdB(id);

    const nextCap = Math.min(
      MAX_SIZE_BY_ID[panel === 'a' ? id : idA] ?? ARRAY_SIZE.max,
      raceMode ? (MAX_SIZE_BY_ID[panel === 'b' ? id : idB] ?? ARRAY_SIZE.max) : ARRAY_SIZE.max,
    );
    if (size > nextCap) regenerate(shape, nextCap, nextCap);
  };

  const handleToggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (allFinished) {
      playerA.reset();
      if (raceMode) playerB.reset();
    }
    setPlaying(true);
  };

  /*
   * Race mode's cursor is a position in the longer run; the shorter run is
   * seeked to the same fraction of itself. Stepping "one step" therefore means
   * one step of the longer run and however much of the shorter one that is
   * worth — which is the only reading under which the two stay level.
   */
  const raceSeek = (leadCursor: number) => {
    const lead = Math.max(-1, Math.min(leadCursor, raceLength - 1));
    const fraction = raceLength > 0 ? (lead + 1) / raceLength : 0;
    const toCursor = (length: number) => Math.round(fraction * length) - 1;
    playerA.seekTo(runA.steps.length === raceLength ? lead : toCursor(runA.steps.length));
    playerB.seekTo(runB.steps.length === raceLength ? lead : toCursor(runB.steps.length));
  };

  /** Where the shared cursor sits: always the longer run's own position. */
  const raceCursor =
    runA.steps.length >= runB.steps.length ? playerA.frame.cursor : playerB.frame.cursor;

  const handleStepForward = () => {
    setPlaying(false);
    if (raceMode) {
      raceSeek(raceCursor + 1);
      return;
    }
    playerA.next();
  };

  const handleStepBack = () => {
    setPlaying(false);
    if (raceMode) {
      raceSeek(raceCursor - 1);
      return;
    }
    playerA.prev();
  };

  const handleRewind = () => {
    setPlaying(false);
    playerA.reset();
    playerB.reset();
  };

  usePlaybackKeys({
    onToggle: handleToggle,
    onStepBack: handleStepBack,
    onStepForward: handleStepForward,
  });

  const shapeLabel = ARRAY_SHAPES.find((option) => option.id === shape)?.label ?? 'Random';
  const stepKinds = useMemo(() => playerA.steps.map(sortVisualKind), [playerA.steps]);
  const stepKindsB = useMemo(() => playerB.steps.map(sortVisualKind), [playerB.steps]);
  const raceStepKinds = runA.steps.length >= runB.steps.length ? stepKinds : stepKindsB;

  /*
   * The legend named all seven states on every algorithm, so counting sort —
   * which never swaps and never reads into a buffer — advertised four states
   * it cannot produce. Derived from the run itself, it now describes only what
   * this algorithm on this input actually emits.
   */
  const emittedKinds = useMemo(() => {
    const kinds = new Set<VisualKind>();
    for (const kind of stepKinds) if (kind !== 'idle') kinds.add(kind);
    return kinds;
  }, [stepKinds]);

  /*
   * The race's own sentence. "Who won" is not the step count — a run that
   * emits fewer steps can still touch the array more — so it is settled on
   * array accesses, and the step counts are reported alongside rather than
   * standing in for the result.
   */
  const racePct = raceLength > 0 ? (raceCursor + 1) / raceLength : 0;
  const accessDiff = (playerA.frame.stats.accesses ?? 0) - (playerB.frame.stats.accesses ?? 0);
  const raceFinished = !playerA.canStepForward && !playerB.canStepForward;
  const raceVerdict =
    raceCursor < 0
      ? 'Press play — both runs advance at the same percentage of their own length.'
      : raceFinished
        ? accessDiff === 0
          ? `Dead heat: ${defA.label} and ${defB.label} touched the array the same number of times.`
          : `${accessDiff > 0 ? defB.label : defA.label} won on array accesses by ${Math.abs(accessDiff).toLocaleString()} — ${defA.label} took ${runA.steps.length.toLocaleString()} steps, ${defB.label} took ${runB.steps.length.toLocaleString()}.`
        : `${defA.label} is ${(playerA.frame.stats.comparisons ?? 0).toLocaleString()} comparisons in; ${defB.label} is ${(playerB.frame.stats.comparisons ?? 0).toLocaleString()}.`;

  const capNote =
    MAX_SIZE_BY_ID[idA] !== undefined
      ? `${defA.label} is capped at ${MAX_SIZE_BY_ID[idA]} elements — its runtime is unbounded, so a larger array would not finish.`
      : null;

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <div className={styles.introText}>
          <h1>Sorting</h1>
          <p>
            Seventeen algorithms, one reversible run — every comparison is a step you can walk
            backwards.
          </p>
        </div>
        {/* Two facts that frame everything below: how long this run is, and
            how big the input is. Both change the moment setup changes. */}
        <div className={styles.headStats}>
          <div className={styles.headStat}>
            <div className={styles.headValue}>{playerA.totalSteps.toLocaleString()}</div>
            <div className={styles.headLabel}>Steps in this run</div>
          </div>
          <div className={styles.headStat}>
            <div className={styles.headValue}>{size}</div>
            <div className={styles.headLabel}>Elements</div>
          </div>
        </div>
      </header>

      <AlgorithmStrip
        def={defA}
        open={pickerOpen}
        onToggle={() => setPickerOpen((open) => !open)}
        onSelect={(id) => selectAlgorithm('a', id)}
        capNote={capNote}
        action={
          <label className={styles.raceToggle}>
            <input
              type="checkbox"
              checked={raceMode}
              onChange={(e) => {
                setPlaying(false);
                setRaceMode(e.target.checked);
              }}
            />
            Race {defA.label} against another
          </label>
        }
      />

      <RunBar
        summary={`${defA.label} · ${size} · ${shapeLabel} · seed ${seed}`}
        onEditSetup={() => setSetupOpen((open) => !open)}
        setupOpen={setupOpen}
        isPlaying={playing}
        canStepBack={raceMode ? raceCursor >= 0 : playerA.canStepBack}
        canStepForward={
          raceMode ? raceCursor < raceLength - 1 : playerA.canStepForward
        }
        cursor={raceMode ? raceCursor : playerA.frame.cursor}
        totalSteps={raceMode ? raceLength : playerA.totalSteps}
        speedMs={speedMs}
        onToggle={handleToggle}
        onStepBack={handleStepBack}
        onStepForward={handleStepForward}
        onSpeedChange={setSpeedMs}
        /*
         * Scrubbing works in race mode too. It was disabled on the grounds
         * that one cursor cannot mean the same thing for two runs of
         * different lengths — true of a raw step index, but the shared clock
         * already answers it: the cursor is a fraction of each run, and both
         * are seeked to it.
         */
        onSeek={(cursor) => {
          setPlaying(false);
          if (raceMode) raceSeek(cursor);
          else playerA.seekTo(cursor);
        }}
        resets={[
          { label: 'Rewind', onClick: handleRewind, title: 'Back to step 0, same array' },
          {
            label: 'New array',
            onClick: () => regenerate(shape, size),
            danger: true,
            title: 'Discard this run and generate a fresh array',
          },
        ]}
        // Painted from whichever run the shared cursor tracks, so the strip
        // and the slider are in the same coordinate space.
        stepKinds={raceMode ? raceStepKinds : stepKinds}
      />

      {setupOpen && (
        <div className={styles.setup}>
          <label className={styles.sizeField}>
            <span className={styles.fieldLabel}>Size — {size}</span>
            <input
              type="range"
              min={ARRAY_SIZE.min}
              max={sizeCap}
              value={size}
              onChange={(e) => {
                const next = Number(e.target.value);
                setSize(next);
                regenerate(shape, next);
              }}
            />
          </label>

          {/*
            Shapes as a segmented row rather than a <select>: there are four of
            them, they are the thing you change most while comparing
            algorithms, and a dropdown hides three of the four behind a click.
          */}
          <div className={styles.shapeField}>
            <span className={styles.fieldLabel} id="sorting-shape-label">
              Input shape
            </span>
            <div className={styles.shapes} role="group" aria-labelledby="sorting-shape-label">
              {ARRAY_SHAPES.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={`${styles.shape} ${shape === option.id ? styles.shapeOn : ''}`}
                  aria-pressed={shape === option.id}
                  onClick={() => regenerate(option.id, size)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.setupActions}>
            <button className={styles.newArray} onClick={() => regenerate(shape, size)}>
              New array
            </button>
            <ShareLink />
          </div>
        </div>
      )}

      {raceMode ? (
        <Narration tag={`${Math.round(racePct * 100)}%`}>{raceVerdict}</Narration>
      ) : (
        <Narration tag={playerA.frame.cursor >= 0 ? `Step ${playerA.frame.cursor + 1}` : 'Ready'}>
          {narrateSortStep(playerA.currentStep, playerA.frame.state)}
        </Narration>
      )}

      {raceMode ? (
        <RaceView
          defA={defA}
          defB={defB}
          playerA={playerA}
          playerB={playerB}
          maxValue={maxValue}
          onSelect={selectAlgorithm}
        />
      ) : (
        <SortPanel
          def={defA}
          frame={playerA.frame}
          currentStep={playerA.currentStep}
          maxValue={maxValue}
          size={size}
          onAlgorithmChange={(id) => selectAlgorithm('a', id)}
          finished={!playerA.canStepForward}
        />
      )}

      <footer className={styles.legend}>
        {LEGEND_ORDER.filter((kind) => emittedKinds.has(kind)).map((kind) => (
          <Legend key={kind} swatch={kind} label={LEGEND_LABEL[kind]} />
        ))}
        <Legend swatch="idle" label="Untouched" />
      </footer>
    </div>
  );
}

/** Fixed order, so the legend does not reshuffle when the algorithm changes. */
const LEGEND_ORDER: VisualKind[] = ['compare', 'swap', 'write', 'read', 'bucket', 'sorted'];

/** Longer than the run bar's tag, which has to fit in a 9px-padded chip. */
const LEGEND_LABEL: Record<string, string> = {
  ...KIND_LABEL,
  compare: 'Comparing',
  swap: 'Swapping',
  write: 'Writing',
  read: 'Reading into buffer',
  bucket: 'Bucketing',
  sorted: 'In final position',
};

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className={styles.legendItem}>
      <i className={styles.swatch} style={{ background: `var(--v-${swatch})` }} />
      {label}
    </span>
  );
}
