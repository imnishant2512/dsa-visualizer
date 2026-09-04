import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStepPlayer } from '../../../engine/useStepPlayer';
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
import { sortEngine } from '../engine';
import { narrateSortStep, sortVisualKind } from '../narrate';
import { MAX_SIZE_BY_ID, SORT_BY_ID, SORT_ALGORITHMS } from '../registry';
import { SORT_STAT_KEYS } from '../types';
import { SortPanel } from './SortPanel';
import styles from './SortingPage.module.css';

function readInt(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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

  const baseArray = useMemo(() => makeArray(shape, size, seed), [shape, size, seed]);

  // One input object shared by both players: in race mode each algorithm must
  // start from the identical array for the comparison to mean anything.
  const input = useMemo(() => ({ values: baseArray }), [baseArray]);
  const maxValue = useMemo(() => Math.max(1, ...baseArray), [baseArray]);

  const playerA = useStepPlayer({
    def: SORT_BY_ID[idA],
    input,
    engine: sortEngine,
    statKeys: SORT_STAT_KEYS,
    speedMs,
    playing,
  });

  const playerB = useStepPlayer({
    def: SORT_BY_ID[idB],
    input,
    engine: sortEngine,
    statKeys: SORT_STAT_KEYS,
    speedMs,
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

  const handleStepForward = () => {
    setPlaying(false);
    playerA.next();
    if (raceMode) playerB.next();
  };

  const handleStepBack = () => {
    setPlaying(false);
    playerA.prev();
    if (raceMode) playerB.prev();
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

  const defA = SORT_BY_ID[idA];
  const shapeLabel = ARRAY_SHAPES.find((option) => option.id === shape)?.label ?? 'Random';
  const stepKinds = useMemo(() => playerA.steps.map(sortVisualKind), [playerA.steps]);

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1>Sorting</h1>
        <p>
          Seventeen sorting algorithms over one replayable engine. Step forward and back through
          every comparison and write, or race two algorithms against the same array.
        </p>
      </header>

      <RunBar
        summary={`${defA.label} · ${size} · ${shapeLabel} · seed ${seed}`}
        onEditSetup={() => setSetupOpen((open) => !open)}
        setupOpen={setupOpen}
        isPlaying={playing}
        canStepBack={playerA.canStepBack || (raceMode && playerB.canStepBack)}
        canStepForward={playerA.canStepForward || (raceMode && playerB.canStepForward)}
        cursor={playerA.frame.cursor}
        totalSteps={playerA.totalSteps}
        speedMs={speedMs}
        onToggle={handleToggle}
        onStepBack={handleStepBack}
        onStepForward={handleStepForward}
        onSpeedChange={setSpeedMs}
        // Scrubbing two runs of different lengths to one cursor is meaningless.
        onSeek={
          raceMode
            ? undefined
            : (cursor) => {
                setPlaying(false);
                playerA.seekTo(cursor);
              }
        }
        seekDisabledReason="Scrubbing is off in race mode — the two runs have different lengths, so one cursor cannot mean the same thing for both."
        resets={[
          { label: 'Rewind', onClick: handleRewind, title: 'Back to step 0, same array' },
          {
            label: 'New array',
            onClick: () => regenerate(shape, size),
            danger: true,
            title: 'Discard this run and generate a fresh array',
          },
        ]}
        // The tick strip is painted from panel A; in race mode the two runs
        // have different lengths, so one strip cannot describe both.
        stepKinds={raceMode ? undefined : stepKinds}
      />

      {setupOpen && (
        <div className={styles.setup}>
          <label>
            Size
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
            <span className={styles.readout}>{size}</span>
          </label>

          <label>
            Shape
            <select
              value={shape}
              onChange={(e) => {
                const next = e.target.value as ArrayShape;
                setShape(next);
                regenerate(next, size);
              }}
            >
              {ARRAY_SHAPES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <ShareLink />

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={raceMode}
              onChange={(e) => {
                setPlaying(false);
                setRaceMode(e.target.checked);
              }}
            />
            Race two algorithms
          </label>
        </div>
      )}

      <Narration tag={playerA.frame.cursor >= 0 ? `Step ${playerA.frame.cursor + 1}` : 'Ready'}>
        {narrateSortStep(playerA.currentStep, playerA.frame.state)}
      </Narration>

      <div className={raceMode ? styles.race : styles.single}>
        <SortPanel
          def={defA}
          frame={playerA.frame}
          currentStep={playerA.currentStep}
          maxValue={maxValue}
          onAlgorithmChange={(id) => selectAlgorithm('a', id)}
          compact={raceMode}
          finished={raceMode && !playerA.canStepForward}
        />

        {raceMode && (
          <SortPanel
            def={SORT_BY_ID[idB]}
            frame={playerB.frame}
            currentStep={playerB.currentStep}
            maxValue={maxValue}
            onAlgorithmChange={(id) => selectAlgorithm('b', id)}
            compact
            finished={!playerB.canStepForward}
          />
        )}
      </div>

      <footer className={styles.legend}>
        <Legend swatch="idle" label="Untouched" />
        <Legend swatch="compare" label="Comparing" />
        <Legend swatch="swap" label="Swapping" />
        <Legend swatch="write" label="Writing" />
        <Legend swatch="read" label="Reading" />
        <Legend swatch="bucket" label="Bucketing" />
        <Legend swatch="sorted" label="In final position" />
      </footer>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className={styles.legendItem}>
      <i className={styles.swatch} style={{ background: `var(--v-${swatch})` }} />
      {label}
    </span>
  );
}
