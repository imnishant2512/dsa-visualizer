import { useCallback, useMemo, useState } from 'react';
import { useInteractiveStructure } from '../../../engine/useInteractiveStructure';
import { OperationHistoryPanel } from '../../../shared/components/OperationHistoryPanel';
import { RunBar } from '../../../shared/components/RunBar';
import { NO_STEPS, stepKindsByName } from '../../../shared/components/stepKinds';
import { usePlaybackKeys } from '../../../shared/hooks/usePlaybackKeys';
import { PseudocodePanel } from '../../../shared/components/PseudocodePanel';
import { StatsPanel } from '../../../shared/components/StatsPanel';
import { SPEED_MS } from '../../../shared/utils/randomArray';
import { heapEngine, initHeapState, initTreeState, nodeHeight, treeEngine } from '../engine';
import { AVL_OPERATIONS, BST_OPERATIONS, HEAP_OPERATIONS } from '../operations';
import { HEAP_STAT_KEYS, TREE_STAT_KEYS, type TreeArgs } from '../types';
import { HeapSvg } from './HeapSvg';
import { TreeSvg } from './TreeSvg';
import styles from './TreesPage.module.css';

type Mode = 'bst' | 'avl' | 'heap';

const MODES: Array<{ id: Mode; label: string; blurb: string }> = [
  {
    id: 'bst',
    label: 'Binary search tree',
    blurb:
      'Ordered but unbalanced: inserting sorted data degenerates it into a linked list. Try inserting 1, 2, 3, 4, 5 in order.',
  },
  {
    id: 'avl',
    label: 'AVL tree',
    blurb:
      'A BST that rotates itself back into balance after every insert and delete. Rotations step through one pointer change at a time.',
  },
  {
    id: 'heap',
    label: 'Heap',
    blurb:
      'Stored as a flat array, drawn as the complete tree that array implies. Only the root ordering matters, not left-to-right order.',
  },
];

const TREE_LABELS = [
  { key: 'comparisons', label: 'Comparisons' },
  { key: 'links', label: 'Pointer writes' },
  { key: 'visits', label: 'Visits' },
];

const HEAP_LABELS = [
  { key: 'comparisons', label: 'Comparisons' },
  { key: 'swaps', label: 'Swaps' },
  { key: 'writes', label: 'Writes' },
];

const TREE_SEED = [50, 30, 70, 20, 40, 60, 80];
const HEAP_SEED = [42, 33, 27, 15, 11, 8, 19];

export function TreesPage() {
  const [mode, setMode] = useState<Mode>('bst');
  const [value, setValue] = useState(45);
  const [minHeap, setMinHeap] = useState(false);
  const [speedMs, setSpeedMs] = useState<number>(SPEED_MS.default * 4);
  const [playing, setPlaying] = useState(false);

  const stopPlaying = useCallback(() => setPlaying(false), []);
  const isHeap = mode === 'heap';

  // Only the controller for the visible tab may play. An idle controller with
  // `playing` true would report itself finished and stop the shared clock.
  const tree = useInteractiveStructure({
    engine: treeEngine,
    statKeys: TREE_STAT_KEYS,
    initialState: useMemo(() => initTreeState(TREE_SEED), []),
    speedMs,
    playing: playing && !isHeap,
    onIdle: stopPlaying,
  });

  const heap = useInteractiveStructure({
    engine: heapEngine,
    statKeys: HEAP_STAT_KEYS,
    initialState: useMemo(() => initHeapState(HEAP_SEED), []),
    speedMs,
    playing: playing && isHeap,
    onIdle: stopPlaying,
  });

  const controller = isHeap ? heap : tree;
  const operations = isHeap ? HEAP_OPERATIONS : mode === 'avl' ? AVL_OPERATIONS : BST_OPERATIONS;
  const args: TreeArgs = { value, min: minHeap };

  const run = (operationId: string) => {
    const operation = operations.find((o) => o.id === operationId);
    if (!operation) return;
    if (isHeap) heap.perform(operation as never, args);
    else tree.perform(operation as never, args);
    setPlaying(true);
  };

  usePlaybackKeys({
    onToggle: () => setPlaying((p) => !p),
    onStepBack: () => {
      setPlaying(false);
      controller.prev();
    },
    onStepForward: () => {
      setPlaying(false);
      controller.next();
    },
  });

  const modeMeta = MODES.find((m) => m.id === mode)!;
  const height = isHeap
    ? heap.displayState.items.length === 0
      ? 0
      : Math.floor(Math.log2(heap.displayState.items.length)) + 1
    : nodeHeight(tree.displayState, tree.displayState.rootId);


  const activeSteps = controller.active?.steps ?? NO_STEPS;
  const stepKinds = useMemo(() => stepKindsByName(activeSteps), [activeSteps]);
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1>Trees</h1>
        <p>
          Insert, delete and search against a live structure. Each operation animates against the
          tree as it stands now, and “undo last” rolls a committed operation back entirely.
        </p>
      </header>

      <nav className={styles.tabs}>
        {MODES.map((entry) => (
          <button
            key={entry.id}
            className={mode === entry.id ? styles.tabActive : styles.tab}
            onClick={() => {
              setPlaying(false);
              setMode(entry.id);
            }}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <p className={styles.blurb}>{modeMeta.blurb}</p>

      <div className={styles.setup}>
        <label>
          Value
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className={styles.number}
          />
        </label>

        {isHeap && (
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={minHeap}
              onChange={(e) => {
                setPlaying(false);
                setMinHeap(e.target.checked);
              }}
            />
            Min-heap
          </label>
        )}

        <div className={styles.ops}>
          {operations.map((operation) => (
            <button key={operation.id} onClick={() => run(operation.id)}>
              {operation.label(args)}
            </button>
          ))}
        </div>

        <button
          className={styles.reset}
          onClick={() => {
            setPlaying(false);
            if (isHeap) heap.reset(initHeapState(HEAP_SEED));
            else tree.reset(initTreeState(TREE_SEED));
          }}
        >
          Reset
        </button>
      </div>

      <RunBar
        summary={controller.active?.label ?? 'No operation running'}
        isPlaying={playing}
        canStepBack={controller.canStepBack}
        canStepForward={controller.canStepForward}
        cursor={controller.frame.cursor}
        totalSteps={controller.totalSteps}
        speedMs={speedMs}
        onToggle={() => setPlaying((p) => !p)}
        onStepBack={() => {
          setPlaying(false);
          controller.prev();
        }}
        onStepForward={() => {
          setPlaying(false);
          controller.next();
        }}
        onSpeedChange={setSpeedMs}
        onSeek={(cursor) => {
          setPlaying(false);
          controller.seekTo(cursor);
        }}
        resets={[
          {
            label: 'Rewind',
            title: 'Back to the start of this operation',
            disabled: !controller.active,
            onClick: () => {
              setPlaying(false);
              controller.seekTo(-1);
            },
          },
          {
            label: 'Cancel operation',
            title: 'Drop the operation in flight — the tree is left untouched',
            disabled: !controller.active,
            danger: true,
            onClick: () => {
              setPlaying(false);
              controller.cancel();
            },
          },
        ]}
        stepKinds={stepKinds}
      />

      <div className={styles.workspace}>
        <div className={styles.left}>
          {isHeap ? (
            <HeapSvg state={heap.displayState} currentStep={heap.currentStep} />
          ) : (
            <TreeSvg state={tree.displayState} currentStep={tree.currentStep} />
          )}

          <div className={styles.readoutRow}>
            <span className={styles.metric}>
              Height <strong>{height}</strong>
            </span>
            <span className={styles.metric}>
              Nodes{' '}
              <strong>
                {isHeap
                  ? heap.displayState.items.length
                  : Object.keys(tree.displayState.nodes).length}
              </strong>
            </span>
            {controller.displayState.note && (
              <span className={styles.note}>{controller.displayState.note}</span>
            )}
          </div>
        </div>

        <div className={styles.readouts}>
          <StatsPanel stats={controller.frame.stats} labels={isHeap ? HEAP_LABELS : TREE_LABELS} />
          <PseudocodePanel
            lines={controller.active?.pseudocode ?? ['Run an operation to see its steps.']}
            activeLine={controller.frame.currentLine}
            title={controller.active?.label ?? 'Pseudocode'}
          />
          <OperationHistoryPanel
            history={controller.history}
            activeLabel={controller.active?.label ?? null}
            onUndo={() => {
              setPlaying(false);
              controller.undoLast();
            }}
            canUndo={controller.canUndo}
          />
        </div>
      </div>
    </div>
  );
}
