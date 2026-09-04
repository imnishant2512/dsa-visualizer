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
  removeEdge,
  removeNode,
} from '../operations';
import { GRAPH_STAT_KEYS, type GraphArgs } from '../types';
import { GraphSvg } from './GraphSvg';
import styles from './GraphsPage.module.css';

const WIDTH = 760;
const HEIGHT = 360;

const STAT_LABELS = [
  { key: 'visited', label: 'Visited' },
  { key: 'discovered', label: 'Discovered' },
  { key: 'relaxations', label: 'Relaxations' },
  { key: 'edits', label: 'Graph edits' },
];

type Tool = 'select' | 'node' | 'edge' | 'delete';

const TOOL_HINTS: Record<Tool, string> = {
  select: 'Click a node to set the start, then another to set the goal.',
  node: 'Click anywhere on the canvas to drop a new node.',
  edge: 'Click two nodes to connect them. Weight comes from the distance between them.',
  delete: 'Click a node or an edge to remove it.',
};

export function GraphsPage() {
  const [tool, setTool] = useState<Tool>('select');
  const [startId, setStartId] = useState<string | null>('g0');
  const [endId, setEndId] = useState<string | null>('g4');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [speedMs, setSpeedMs] = useState<number>(SPEED_MS.default * 3);
  const [playing, setPlaying] = useState(false);

  const stopPlaying = useCallback(() => setPlaying(false), []);
  const initial = useMemo(() => sampleGraph(WIDTH, HEIGHT), []);

  const graph = useInteractiveStructure({
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
    if (tool !== 'delete') return;
    perform(removeEdge, { edgeId: id });
  };

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
          {(['select', 'node', 'edge', 'delete'] as Tool[]).map((option) => (
            <button
              key={option}
              className={tool === option ? styles.toolActive : undefined}
              onClick={() => {
                setTool(option);
                setSelectedId(null);
              }}
            >
              {option === 'select'
                ? 'Set start / goal'
                : option === 'node'
                  ? 'Add node'
                  : option === 'edge'
                    ? 'Add edge'
                    : 'Delete'}
            </button>
          ))}
        </div>

        <div className={styles.ops}>
          {GRAPH_RUN_OPERATIONS.map((operation) => (
            <button
              key={operation.id}
              disabled={!runnable}
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
            graph.reset(sampleGraph(WIDTH, HEIGHT));
          }}
        >
          Reset graph
        </button>
      </div>

      <p className={styles.hint}>
        {TOOL_HINTS[tool]}
        {selectedId && tool === 'edge' && (
          <strong> Selected {state.nodes[selectedId]?.label} — click a second node.</strong>
        )}
      </p>

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
        {state.note && <span className={styles.note}>{state.note}</span>}
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
            selectedId={selectedId}
            onCanvasClick={handleCanvasClick}
            onNodeClick={handleNodeClick}
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
        Edge weights are derived from on-screen distance, which keeps A*’s straight-line estimate
        admissible — it can never overestimate, so A* returns the same route as Dijkstra while
        visiting fewer nodes.
      </p>
    </div>
  );
}
