import { useCallback, useMemo, useState } from 'react';
import { useStepPlayer } from '../../../engine/useStepPlayer';
import { RunBar } from '../../../shared/components/RunBar';
import { stepKindsByName } from '../../../shared/components/stepKinds';
import { usePlaybackKeys } from '../../../shared/hooks/usePlaybackKeys';
import { PseudocodePanel } from '../../../shared/components/PseudocodePanel';
import { StatsPanel } from '../../../shared/components/StatsPanel';
import { SPEED_MS } from '../../../shared/utils/randomArray';
import { randomSeed } from '../../../shared/utils/random';
import { PATH_ALGORITHMS, PATH_BY_ID } from '../algorithms';
import { pathEngine } from '../engine';
import { MAZES, generateMaze, type MazeId } from '../mazes';
import { narratePathStep } from '../narrate';
import { HEAVY_WEIGHT, PATH_STAT_KEYS, toIndex } from '../types';
import { Narration } from '../../../shared/components/Narration';
import { Grid, type KeyCommand } from './Grid';
import styles from './PathfindingPage.module.css';

const ROWS = 16;
const COLS = 40;
const SIZE = ROWS * COLS;

const STAT_LABELS = [
  { key: 'visited', label: 'Visited' },
  { key: 'discovered', label: 'Discovered' },
  { key: 'relaxations', label: 'Relaxations' },
  { key: 'pathCells', label: 'Path cells' },
];

type Tool = 'wall' | 'weight' | 'erase';
type Drag = 'paint' | 'start' | 'end' | null;

export function PathfindingPage() {
  // Grid editing lives here, deliberately outside the step engine: painting
  // walls is free-form and shouldn't be something you scrub through.
  const [walls, setWalls] = useState<boolean[]>(() => new Array(SIZE).fill(false));
  const [weights, setWeights] = useState<number[]>(() => new Array(SIZE).fill(1));
  const [start, setStart] = useState(() => toIndex(8, 5, COLS));
  const [end, setEnd] = useState(() => toIndex(8, 34, COLS));

  const [tool, setTool] = useState<Tool>('wall');
  const [drag, setDrag] = useState<Drag>(null);
  const [algorithmId, setAlgorithmId] = useState('astar');
  const [speedMs, setSpeedMs] = useState<number>(SPEED_MS.min + 14);
  const [playing, setPlaying] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  /** Which preset produced the current terrain, for the run bar's summary. */
  const [terrain, setTerrain] = useState<MazeId | 'custom'>('custom');

  const def = PATH_BY_ID[algorithmId];
  const input = useMemo(
    () => ({ rows: ROWS, cols: COLS, walls, weights, start, end }),
    [walls, weights, start, end],
  );

  const player = useStepPlayer({
    def,
    input,
    engine: pathEngine,
    statKeys: PATH_STAT_KEYS,
    speedMs,
    playing,
  });

  // Adjusted during render rather than in an effect: it converges immediately
  // and never commits a frame claiming to play with no steps left.
  if (playing && !player.canStepForward) setPlaying(false);

  const applyTool = useCallback(
    (index: number) => {
      if (index === start || index === end) return;
      if (tool === 'wall') {
        setWalls((prev) => (prev[index] ? prev : prev.map((w, i) => (i === index ? true : w))));
        setWeights((prev) => (prev[index] === 1 ? prev : prev.map((w, i) => (i === index ? 1 : w))));
      } else if (tool === 'weight') {
        setWalls((prev) => (prev[index] ? prev.map((w, i) => (i === index ? false : w)) : prev));
        setWeights((prev) =>
          prev[index] === HEAVY_WEIGHT ? prev : prev.map((w, i) => (i === index ? HEAVY_WEIGHT : w)),
        );
      } else {
        setWalls((prev) => (prev[index] ? prev.map((w, i) => (i === index ? false : w)) : prev));
        setWeights((prev) => (prev[index] === 1 ? prev : prev.map((w, i) => (i === index ? 1 : w))));
      }
    },
    [tool, start, end],
  );

  const handleCellDown = useCallback(
    (index: number) => {
      setPlaying(false);
      if (index === start) {
        setDrag('start');
      } else if (index === end) {
        setDrag('end');
      } else {
        setDrag('paint');
        applyTool(index);
      }
    },
    [applyTool, start, end],
  );

  const handleCellEnter = useCallback(
    (index: number) => {
      if (!drag) return;
      if (drag === 'start') {
        if (index !== end && !walls[index]) setStart(index);
      } else if (drag === 'end') {
        if (index !== start && !walls[index]) setEnd(index);
      } else {
        applyTool(index);
      }
    },
    [drag, applyTool, walls, start, end],
  );

  /*
   * The keyboard equivalents of the pointer tools. Painting is not the only
   * thing the grid does — start and goal have to be placeable too, or the
   * keyboard path can build a maze it cannot pose a question about.
   */
  const handleKeyCommand = useCallback(
    (command: KeyCommand, index: number) => {
      setPlaying(false);
      setTerrain('custom');
      if (command === 'apply') {
        applyTool(index);
        return;
      }
      if (command === 'start') {
        if (index !== end && !walls[index]) setStart(index);
        return;
      }
      if (command === 'end') {
        if (index !== start && !walls[index]) setEnd(index);
        return;
      }
      setTool(command);
    },
    [applyTool, walls, start, end],
  );

  const clearWalls = () => {
    setPlaying(false);
    setTerrain('custom');
    setWalls(new Array(SIZE).fill(false));
    setWeights(new Array(SIZE).fill(1));
  };

  const applyMaze = (id: MazeId) => {
    setPlaying(false);
    const grid = generateMaze(id, { rows: ROWS, cols: COLS, start, end, seed: randomSeed() });
    setWalls(grid.walls);
    setWeights(grid.weights);
    setTerrain(id);
  };

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

  const { state } = player.frame;
  const outcome = state.found
    ? `Route found — cost ${state.pathCost}, ${state.path.filter(Boolean).length} cells`
    : player.frame.isFinished && player.totalSteps > 0
      ? 'No route exists between start and end'
      : null;


  const stepKinds = useMemo(() => stepKindsByName(player.steps), [player.steps]);
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1>Pathfinding</h1>
        <p>
          Drag the <strong>▶</strong> and <strong>◎</strong> markers to move start and goal, or drag
          anywhere to paint. The grid is keyboard-operable too — tab to it, then arrow keys to move
          the cursor, space to apply, <kbd>W</kbd>/<kbd>E</kbd>/<kbd>X</kbd> to switch tool and{' '}
          <kbd>S</kbd>/<kbd>G</kbd> to place start and goal. Editing is deliberately outside the
          replay — only a run is steppable.
        </p>
      </header>

      <RunBar
        summary={`${def.label} · ${COLS}×${ROWS} · ${
          terrain === 'custom'
            ? 'Custom'
            : (MAZES.find((maze) => maze.id === terrain)?.label ?? 'Custom')
        }`}
        onEditSetup={() => setSetupOpen((open) => !open)}
        setupOpen={setupOpen}
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
            title: 'Back to step 0, grid untouched',
            onClick: () => {
              setPlaying(false);
              player.reset();
            },
          },
          {
            label: 'Clear grid',
            title: 'Remove every wall and weight',
            danger: true,
            onClick: clearWalls,
          },
        ]}
        stepKinds={stepKinds}
      />

      {setupOpen && (
        <div className={styles.setup}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Algorithm</span>
            <select
              value={algorithmId}
              onChange={(e) => {
                setPlaying(false);
                setAlgorithmId(e.target.value);
              }}
            >
              {PATH_ALGORITHMS.map((algorithm) => (
                <option key={algorithm.id} value={algorithm.id}>
                  {algorithm.label}
                </option>
              ))}
            </select>
          </label>

          {/*
            Five presets, of which noise is one. It used to be the only option,
            and it is the least useful: uniformly scattered walls give every
            algorithm a short, similar route and never separate them.
          */}
          <div className={styles.field}>
            <span className={styles.fieldLabel} id="pathfinding-terrain-label">
              Terrain
            </span>
            <div className={styles.terrain} role="group" aria-labelledby="pathfinding-terrain-label">
              {MAZES.map((maze) => (
                <button
                  type="button"
                  key={maze.id}
                  className={`${styles.preset} ${terrain === maze.id ? styles.presetOn : ''}`}
                  aria-pressed={terrain === maze.id}
                  title={maze.blurb}
                  onClick={() => applyMaze(maze.id)}
                >
                  {maze.label}
                </button>
              ))}
            </div>
          </div>

          <p className={styles.algorithmNote}>
            {def.summary}{' '}
            {!def.weighted && (
              <em>Ignores terrain weights — it treats every open cell as equal.</em>
            )}
          </p>
        </div>
      )}

      <Narration
        tag={player.frame.cursor >= 0 ? `Step ${player.frame.cursor + 1}` : 'Ready'}
      >
        {narratePathStep(player.currentStep, state)}
      </Narration>

      <div className={styles.workspace}>
        <div className={styles.left}>
          {/*
            The tool rail sits against the canvas rather than in a settings row
            above it, so the control and the thing it acts on are one object.
          */}
          <div className={styles.canvas}>
            <div className={styles.rail} role="group" aria-label="Drawing tool">
              {(['wall', 'weight', 'erase'] as Tool[]).map((option) => (
                <button
                  type="button"
                  key={option}
                  className={`${styles.railButton} ${tool === option ? styles.railActive : ''}`}
                  aria-pressed={tool === option}
                  onClick={() => setTool(option)}
                  title={
                    option === 'wall'
                      ? 'Wall — impassable (W)'
                      : option === 'weight'
                        ? `Heavy terrain, cost ${HEAVY_WEIGHT} (E)`
                        : 'Erase back to open ground (X)'
                  }
                >
                  {option === 'wall' ? 'Wall' : option === 'weight' ? `×${HEAVY_WEIGHT}` : 'Erase'}
                </button>
              ))}
            </div>

            <Grid
              state={state}
              onCellDown={handleCellDown}
              onCellEnter={handleCellEnter}
              onRelease={() => setDrag(null)}
              onKeyCommand={handleKeyCommand}
            />
          </div>
          {outcome && (
            <div className={state.found ? styles.found : styles.missing}>{outcome}</div>
          )}
        </div>

        <div className={styles.readouts}>
          <StatsPanel stats={player.frame.stats} labels={STAT_LABELS} complexity={def.complexity} />
          <PseudocodePanel lines={def.pseudocode} activeLine={player.frame.currentLine} />
        </div>
      </div>

      <footer className={styles.legend}>
        <Legend color="rgba(86, 180, 233, 0.45)" label="Frontier (discovered)" />
        <Legend color="rgba(204, 121, 167, 0.42)" label="Visited" />
        <Legend color="var(--v-sorted)" label="Final route" />
        <Legend color="#4a5468" label="Wall" />
        <Legend color="rgba(230, 159, 0, 0.28)" label={`Weight ${HEAVY_WEIGHT}`} />
      </footer>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className={styles.legendItem}>
      <i className={styles.swatch} style={{ background: color }} />
      {label}
    </span>
  );
}
