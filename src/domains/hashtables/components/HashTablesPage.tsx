import { useCallback, useMemo, useState } from 'react';
import { useInteractiveStructure } from '../../../engine/useInteractiveStructure';
import { OperationHistoryPanel } from '../../../shared/components/OperationHistoryPanel';
import { RunBar } from '../../../shared/components/RunBar';
import { NO_STEPS, stepKindsByName } from '../../../shared/components/stepKinds';
import { usePlaybackKeys } from '../../../shared/hooks/usePlaybackKeys';
import { PseudocodePanel } from '../../../shared/components/PseudocodePanel';
import { StatsPanel } from '../../../shared/components/StatsPanel';
import { SPEED_MS } from '../../../shared/utils/randomArray';
import { hashEngine, initHashState, liveKeys } from '../engine';
import { HASH_OPERATIONS, insertPseudocode } from '../operations';
import { HASH_STAT_KEYS, hashOf, type HashArgs, type HashStrategy } from '../types';
import { BucketRows } from './BucketRows';
import styles from './HashTablesPage.module.css';

const STAT_LABELS = [
  { key: 'hashes', label: 'Hashes' },
  { key: 'probes', label: 'Probes' },
  { key: 'collisions', label: 'Collisions' },
  { key: 'writes', label: 'Writes' },
];

const SIZE = 11;
const SEED = [5, 16, 22, 9];

export function HashTablesPage() {
  const [strategy, setStrategy] = useState<HashStrategy>('probing');
  const [key, setKey] = useState(27);
  const [speedMs, setSpeedMs] = useState<number>(SPEED_MS.default * 5);
  const [playing, setPlaying] = useState(false);

  const stopPlaying = useCallback(() => setPlaying(false), []);
  const initial = useMemo(() => initHashState('probing', SIZE, SEED), []);

  const table = useInteractiveStructure({
    engine: hashEngine,
    statKeys: HASH_STAT_KEYS,
    initialState: initial,
    speedMs,
    playing,
    onIdle: stopPlaying,
  });

  const args: HashArgs = { key };
  const state = table.displayState;

  const run = (operationId: string) => {
    const operation = HASH_OPERATIONS.find((o) => o.id === operationId);
    if (!operation) return;
    table.perform(operation, args);
    setPlaying(true);
  };

  const switchStrategy = (next: HashStrategy) => {
    setPlaying(false);
    setStrategy(next);
    // The two strategies lay keys out differently, so switching rebuilds the table.
    table.reset(initHashState(next, SIZE, SEED));
  };

  usePlaybackKeys({
    onToggle: () => setPlaying((p) => !p),
    onStepBack: () => {
      setPlaying(false);
      table.prev();
    },
    onStepForward: () => {
      setPlaying(false);
      table.next();
    },
  });

  const count = liveKeys(state).length;
  const pseudocode =
    table.active?.label.startsWith('Insert') === true
      ? insertPseudocode(state.strategy)
      : table.active?.pseudocode;


  const activeSteps = table.active?.steps ?? NO_STEPS;
  const stepKinds = useMemo(() => stepKindsByName(activeSteps), [activeSteps]);
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1>Hash tables</h1>
        <p>
          Both strategies use the same hash — <code>key % {SIZE}</code> — and differ only in what
          they do when two keys land in the same bucket. Try inserting 5, 16 and 27: all three hash
          to bucket 5.
        </p>
      </header>

      <div className={styles.setup}>
        <div className={styles.tools}>
          {(['probing', 'chaining'] as HashStrategy[]).map((option) => (
            <button
              key={option}
              className={strategy === option ? styles.toolActive : undefined}
              onClick={() => switchStrategy(option)}
            >
              {option === 'probing' ? 'Linear probing' : 'Chaining'}
            </button>
          ))}
        </div>

        <label>
          Key
          <input
            type="number"
            value={key}
            onChange={(e) => setKey(Number(e.target.value))}
            className={styles.number}
          />
          <span className={styles.hash}>→ bucket {hashOf(key, SIZE)}</span>
        </label>

        <div className={styles.ops}>
          {HASH_OPERATIONS.map((operation) => (
            <button key={operation.id} onClick={() => run(operation.id)}>
              {operation.label(args)}
            </button>
          ))}
        </div>

        <button
          className={styles.reset}
          onClick={() => {
            setPlaying(false);
            table.reset(initHashState(strategy, SIZE, SEED));
          }}
        >
          Reset
        </button>
      </div>

      <RunBar
        summary={table.active?.label ?? 'No operation running'}
        isPlaying={playing}
        canStepBack={table.canStepBack}
        canStepForward={table.canStepForward}
        cursor={table.frame.cursor}
        totalSteps={table.totalSteps}
        speedMs={speedMs}
        onToggle={() => setPlaying((p) => !p)}
        onStepBack={() => {
          setPlaying(false);
          table.prev();
        }}
        onStepForward={() => {
          setPlaying(false);
          table.next();
        }}
        onSpeedChange={setSpeedMs}
        onSeek={(cursor) => {
          setPlaying(false);
          table.seekTo(cursor);
        }}
        resets={[
          {
            label: 'Rewind',
            title: 'Back to the start of this operation',
            disabled: !table.active,
            onClick: () => {
              setPlaying(false);
              table.seekTo(-1);
            },
          },
          {
            label: 'Cancel operation',
            title: 'Drop the operation in flight — the table is left untouched',
            disabled: !table.active,
            danger: true,
            onClick: () => {
              setPlaying(false);
              table.cancel();
            },
          },
        ]}
        stepKinds={stepKinds}
      />

      <div className={styles.readoutRow}>
        <span className={styles.metric}>
          Keys <strong>{count}</strong>
        </span>
        <span className={styles.metric}>
          Load factor <strong>{(count / SIZE).toFixed(2)}</strong>
        </span>
        {state.hashKey !== null && (
          <span className={styles.metric}>
            hash({state.hashKey}) <strong>{hashOf(state.hashKey, SIZE)}</strong>
          </span>
        )}
        {state.note && <span className={styles.note}>{state.note}</span>}
      </div>

      <div className={styles.workspace}>
        <div className={styles.left}>
          <BucketRows state={state} currentStep={table.currentStep} />
        </div>

        <div className={styles.readouts}>
          <StatsPanel stats={table.frame.stats} labels={STAT_LABELS} />
          <PseudocodePanel
            lines={pseudocode ?? ['Run an operation to see its steps.']}
            activeLine={table.frame.currentLine}
            title={table.active?.label ?? 'Pseudocode'}
          />
          <OperationHistoryPanel
            history={table.history}
            activeLabel={table.active?.label ?? null}
            onUndo={() => {
              setPlaying(false);
              table.undoLast();
            }}
            canUndo={table.canUndo}
          />
        </div>
      </div>

      <p className={styles.footnote}>
        <strong>✕</strong> marks a tombstone. Open addressing cannot simply empty a slot on delete —
        a later probe would stop there and miss keys that had shifted past it.
      </p>
    </div>
  );
}
