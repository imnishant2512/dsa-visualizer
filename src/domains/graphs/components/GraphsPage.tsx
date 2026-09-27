import { useCallback, useMemo, useState } from 'react';
import { useInteractiveStructure } from '../../../engine/useInteractiveStructure';
import { OperationHistoryPanel } from '../../../shared/components/OperationHistoryPanel';
import { RunBar } from '../../../shared/components/RunBar';
import { NO_STEPS, stepKindsByName } from '../../../shared/components/stepKinds';
import { usePlaybackKeys } from '../../../shared/hooks/usePlaybackKeys';
import { PseudocodePanel } from '../../../shared/components/PseudocodePanel';
import { StatsPanel } from '../../../shared/components/StatsPanel';
import { SPEED_MS } from '../../../shared/utils/randomArray';
import { graphEngine, sampleGraph } from '../engine';
import {
  GRAPH_RUN_OPERATIONS,
  addEdge,
  addNode,
  moveNode,
  removeEdge,
  removeNode,
  setEdgeWeight,
} from '../operations';
import { narrateGraphStep } from '../narrate';
import {
  GRAPH_STAT_KEYS,
  heuristicViolation,
  type GraphArgs,
  type GraphState,
  type GraphStep,
} from '../types';
import { Narration } from '../../../shared/components/Narration';
import { GraphSvg, type PendingMark } from './GraphSvg';
import styles from './GraphsPage.module.css';

const WIDTH = 760;
const HEIGHT = 360;

const STAT_LABELS = [
  { key: 'visited', label: 'Visited' },
  { key: 'discovered', label: 'Discovered' },
  { key: 'relaxations', label: 'Relaxations' },
  { key: 'edits', label: 'Graph edits' },
];

type Tool = 'select' | 'node' | 'edge' | 'weight' | 'delete';

const TOOL_LABEL: Record<Tool, string> = {
  select: 'Start / goal · drag',
  node: 'Add node',
  edge: 'Add edge',
  weight: 'Set weight',
  delete: 'Delete',
};

const TOOL_HINTS: Record<Tool, string> = {
  select: 'Click a node to set the start, then another to set the goal. Drag any node to move it.',
  node: 'Click anywhere on the canvas to drop a new node.',
  edge: 'Click two nodes to connect them. Weight comes from the distance between them.',
  weight:
    'Click an edge, then type its weight. A hand-set weight is marked * and stops following the distance.',
  delete: 'Click a node or an edge to remove it.',
};

export function GraphsPage() {
  const [tool, setTool] = useState<Tool>('select');
  const [startId, setStartId] = useState<string | null>('g0');
  const [endId, setEndId] = useState<string | null>('g4');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The edge picked by the weight tool, and the weight being typed for it. */
  const [weightEdgeId, setWeightEdgeId] = useState<string | null>(null);
  const [weightDraft, setWeightDraft] = useState('');
  const [speedMs, setSpeedMs] = useState<number>(SPEED_MS.default * 3);
  const [playing, setPlaying] = useState(false);

  const stopPlaying = useCallback(() => setPlaying(false), []);
  const initial = useMemo(() => sampleGraph(WIDTH, HEIGHT), []);

  // Explicit generics so `refuse` and the history see real GraphArgs.
  const graph = useInteractiveStructure<GraphState, GraphStep, GraphArgs>({
    engine: graphEngine,
    statKeys: GRAPH_STAT_KEYS,
    initialState: initial,
    speedMs,
    playing,
    onIdle: stopPlaying,
  });

  const state = graph.displayState;

  const perform = (operation: Parameters<typeof graph.perform>[0], args: Partial<GraphArgs>) => {
    graph.perform(operation, {
      x: 0,
      y: 0,
      nodeId: null,
      edgeId: null,
      from: startId,
      to: endId,
      ...args,
    });
    setPlaying(true);
  };

  const handleCanvasClick = (x: number, y: number) => {
    if (tool !== 'node') return;
    perform(addNode, { x, y });
  };

  const handleNodeClick = (id: string) => {
    if (tool === 'delete') {
      if (id === startId) setStartId(null);
      if (id === endId) setEndId(null);
      perform(removeNode, { nodeId: id });
      return;
    }
    if (tool === 'edge') {
      if (selectedId === null) {
        setSelectedId(id);
        return;
      }
      perform(addEdge, { from: selectedId, to: id });
      setSelectedId(null);
      return;
    }
    if (tool === 'select') {
      // First click sets the start, second sets the goal.
      if (startId === null || (startId !== null && endId !== null)) {
        setStartId(id);
        setEndId(null);
      } else if (id !== startId) {
        setEndId(id);
      }
    }
  };

  const handleEdgeClick = (id: string) => {
    if (tool === 'delete') {
      perform(removeEdge, { edgeId: id });
      return;
    }
    if (tool === 'weight') {
      setWeightEdgeId(id);
      setWeightDraft(String(graph.pendingStructure.edges[id]?.weight ?? ''));
    }
  };

  const handleNodeMove = (id: string, x: number, y: number) => {
    perform(moveNode, { nodeId: id, x, y });
  };

  const weightArgs = useMemo<GraphArgs>(
    () => ({
      x: 0,
      y: 0,
      nodeId: null,
      edgeId: weightEdgeId,
      from: startId,
      to: endId,
      weight: weightDraft.trim() === '' ? undefined : Number(weightDraft),
    }),
    [weightEdgeId, weightDraft, startId, endId],
  );
  const weightRefusal = setEdgeWeight.refuse?.(graph.pendingStructure, weightArgs) ?? null;

  const applyWeight = () => {
    if (weightRefusal) return;
    perform(setEdgeWeight, weightArgs);
    setWeightEdgeId(null);
  };

  /*
   * Checked against the graph the next operation will see. When a hand-set
   * weight undercuts an edge's straight-line length, A*'s estimate can
   * overestimate and it may return a route that is not the shortest while
   * still looking like it worked. It is withdrawn in favour of Dijkstra, and
   * this says so for as long as it is true, not only during the run: the
   * run's own "shortest path costs" note overwrites the one-step explanation.
   */
  const violation = heuristicViolation(graph.pendingStructure);
  const violationText = violation
    ? (() => {
        const edge = graph.pendingStructure.edges[violation.edgeId];
        const nodes = graph.pendingStructure.nodes;
        const name = `${nodes[edge.from]?.label ?? edge.from}–${nodes[edge.to]?.label ?? edge.to}`;
        return `A* is withdrawn while edge ${name} weighs ${violation.weight}, under its straight-line length of ${violation.straight.toFixed(1)}: the estimate could overestimate and return a longer route. The A* button runs Dijkstra instead.`;
      })()
    : null;

  /** What the canvas is waiting for, drawn beside the node or edge it concerns. */
  const pending: PendingMark | null =
    tool === 'edge' && selectedId
      ? { nodeId: selectedId, caption: 'now pick a second node' }
      : tool === 'weight' && weightEdgeId
        ? { edgeId: weightEdgeId, caption: 'type the weight' }
        : tool === 'select' && startId && !endId
          ? { nodeId: startId, caption: 'now pick the goal' }
          : null;

  usePlaybackKeys({
    onToggle: () => setPlaying((p) => !p),
    onStepBack: () => {
      setPlaying(false);
      graph.prev();
    },
    onStepForward: () => {
      setPlaying(false);
      graph.next();
    },
  });

  const runnable = startId !== null && state.nodes[startId] !== undefined;


  const activeSteps = graph.active?.steps ?? NO_STEPS;
  const stepKinds = useMemo(() => stepKindsByName(activeSteps), [activeSteps]);
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1>Graphs</h1>
        <p>
          Build a graph and run traversals on it. Editing the graph goes through the same replay
          engine as the algorithms do, so “undo last” rolls back an added node or a deleted edge
          exactly like it rolls back a search.
        </p>
      </header>

      <div className={styles.setup}>
        <div className={styles.tools}>
          {(['select', 'node', 'edge', 'weight', 'delete'] as Tool[]).map((option) => (
            <button
              key={option}
              className={tool === option ? styles.toolActive : undefined}
              aria-pressed={tool === option}
              onClick={() => {
                setTool(option);
                setSelectedId(null);
                setWeightEdgeId(null);
              }}
            >
              {TOOL_LABEL[option]}
            </button>
          ))}
        </div>

        {tool === 'weight' && weightEdgeId && (
          <form
            className={styles.weightForm}
            onSubmit={(event) => {
              event.preventDefault();
              applyWeight();
            }}
          >
            <label>
              Weight
              <input
                type="number"
                min={1}
                step={1}
                value={weightDraft}
                aria-invalid={Boolean(weightRefusal) || undefined}
                onChange={(event) => setWeightDraft(event.target.value)}
                className={styles.weightInput}
                autoFocus
              />
            </label>
            <button
              type="submit"
              disabled={Boolean(weightRefusal)}
              title={weightRefusal ?? undefined}
            >
              Set
            </button>
          </form>
        )}

        <div className={styles.ops}>
          {GRAPH_RUN_OPERATIONS.map((operation) => (
            <button
              key={operation.id}
              disabled={!runnable}
              title={operation.id === 'astar' && violationText ? violationText : undefined}
              onClick={() => perform(operation, {})}
            >
              {/*
                * This was a ternary over three known ids that fell through to
                * "A*" for anything else, so the four operations added after it
                * was written all rendered as "A*". The name now comes from the
                * operation itself, which cannot go stale.
                */}
              {operation.shortLabel ??
                operation.label({
                  x: 0,
                  y: 0,
                  nodeId: null,
                  edgeId: null,
                  from: startId,
                  to: endId,
                })}
            </button>
          ))}
        </div>

        <button
          className={styles.reset}
          onClick={() => {
            setPlaying(false);
            setStartId('g0');
            setEndId('g4');
            setSelectedId(null);
            setWeightEdgeId(null);
            graph.reset(sampleGraph(WIDTH, HEIGHT));
          }}
        >
          Reset graph
        </button>
      </div>

      <p className={styles.hint}>{TOOL_HINTS[tool]}</p>

      {violationText && <p className={styles.withdrawn}>{violationText}</p>}

      <Narration
        tag={graph.active && graph.frame.cursor >= 0 ? `Step ${graph.frame.cursor + 1}` : 'Ready'}
      >
        {narrateGraphStep(graph.currentStep, state)}
      </Narration>

      <RunBar
        summary={graph.active?.label ?? 'No operation running'}
        isPlaying={playing}
        canStepBack={graph.canStepBack}
        canStepForward={graph.canStepForward}
        cursor={graph.frame.cursor}
        totalSteps={graph.totalSteps}
        speedMs={speedMs}
        onToggle={() => setPlaying((p) => !p)}
        onStepBack={() => {
          setPlaying(false);
          graph.prev();
        }}
        onStepForward={() => {
          setPlaying(false);
          graph.next();
        }}
        onSpeedChange={setSpeedMs}
        onSeek={(cursor) => {
          setPlaying(false);
          graph.seekTo(cursor);
        }}
        resets={[
          {
            label: 'Rewind',
            title: 'Back to the start of this operation',
            disabled: !graph.active,
            onClick: () => {
              setPlaying(false);
              graph.seekTo(-1);
            },
          },
          {
            label: 'Cancel operation',
            title: 'Drop the operation in flight — the graph is left untouched',
            disabled: !graph.active,
            danger: true,
            onClick: () => {
              setPlaying(false);
              graph.cancel();
            },
          },
        ]}
        stepKinds={stepKinds}
      />

      <div className={styles.readoutRow}>
        <span className={styles.metric}>
          Start <strong>{startId ? (state.nodes[startId]?.label ?? '—') : '—'}</strong>
        </span>
        <span className={styles.metric}>
          Goal <strong>{endId ? (state.nodes[endId]?.label ?? '—') : '—'}</strong>
        </span>
        <span className={styles.metric}>
          Nodes <strong>{Object.keys(state.nodes).length}</strong>
        </span>
        <span className={styles.metric}>
          Edges <strong>{Object.keys(state.edges).length}</strong>
        </span>
        {state.note && !graph.active && <span className={styles.note}>{state.note}</span>}
      </div>

      <div className={styles.workspace}>
        <div className={styles.left}>
          <GraphSvg
            state={state}
            currentStep={graph.currentStep}
            width={WIDTH}
            height={HEIGHT}
            startId={startId}
            endId={endId}
            pending={pending}
            draggable={tool === 'select'}
            onCanvasClick={handleCanvasClick}
            onNodeClick={handleNodeClick}
            onNodeMove={handleNodeMove}
            onEdgeClick={handleEdgeClick}
          />
        </div>

        <div className={styles.readouts}>
          <StatsPanel stats={graph.frame.stats} labels={STAT_LABELS} />
          <PseudocodePanel
            lines={graph.active?.pseudocode ?? ['Run a traversal to see its steps.']}
            activeLine={graph.frame.currentLine}
            title={graph.active?.label ?? 'Pseudocode'}
          />
          <OperationHistoryPanel
            history={graph.history}
            activeLabel={graph.active?.label ?? null}
            onUndo={() => {
              setPlaying(false);
              graph.undoLast();
            }}
            canUndo={graph.canUndo}
          />
        </div>
      </div>

      <p className={styles.footnote}>
        Derived weights are the on-screen distance rounded <em>up</em>, so every edge weighs at
        least its straight line and A*’s estimate can never overestimate — it returns
        Dijkstra’s route while visiting fewer nodes. A weight set by hand (marked *) can break
        that, and A* steps aside when it does.
      </p>
    </div>
  );
}
