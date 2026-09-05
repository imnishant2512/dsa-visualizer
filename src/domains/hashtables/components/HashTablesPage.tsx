import { useCallback, useMemo, useState } from 'react';
import { useInteractiveStructure } from '../../../engine/useInteractiveStructure';
import { OperationHistoryPanel } from '../../../shared/components/OperationHistoryPanel';
import { RunBar } from '../../../shared/components/RunBar';
import { NO_STEPS, stepKindsByName } from '../../../shared/components/stepKinds';
import { usePlaybackKeys } from '../../../shared/hooks/usePlaybackKeys';
import { PseudocodePanel } from '../../../shared/components/PseudocodePanel';
import { StatsPanel } from '../../../shared/components/StatsPanel';
import { SPEED_MS } from '../../../shared/utils/randomArray';
import {
  LOAD_THRESHOLD,
  hashEngine,
  liveKeys,
  nextCapacity,
  replayLog,
  type HashLogEntry,
} from '../engine';
import { narrateHashStep } from '../narrate';
import { HASH_OPERATIONS, insertPseudocode } from '../operations';
import {
  HASH_STAT_KEYS,
  hashOf,
  type HashArgs,
  type HashState,
  type HashStep,
  type HashStrategy,
} from '../types';
import { Narration } from '../../../shared/components/Narration';
import { BucketRows } from './BucketRows';
import { ReferenceTable } from './ReferenceTable';
import styles from './HashTablesPage.module.css';

const STAT_LABELS = [
  { key: 'hashes', label: 'Hashes' },
  { key: 'probes', label: 'Probes' },
  { key: 'collisions', label: 'Collisions' },
  { key: 'writes', label: 'Writes' },
];

const INITIAL_SIZE = 11;
const SEED = [5, 16, 22, 9];

/** The seeded keys, as log entries — so they replay like everything else. */
const SEED_LOG: HashLogEntry[] = SEED.map((key) => ({ kind: 'insert', key }));

export function HashTablesPage() {
  const [strategy, setStrategy] = useState<HashStrategy>('probing');
  const [size, setSize] = useState(INITIAL_SIZE);
  const [key, setKey] = useState(27);
  const [speedMs, setSpeedMs] = useState<number>(SPEED_MS.default * 5);
  const [playing, setPlaying] = useState(false);

  /*
   * Everything committed before the last rebuild. The controller's own history
   * covers what has happened since, and is cleared by reset() — so the two
   * together are the log, and the log is what the table is derived from.
   */
  const [baseLog, setBaseLog] = useState<HashLogEntry[]>(SEED_LOG);

  const stopPlaying = useCallback(() => setPlaying(false), []);
  const initial = useMemo(() => replayLog(SEED_LOG, 'probing', INITIAL_SIZE), []);

  // Explicit generics: TArgs is only reachable through `perform`, so without
  // them it infers `unknown` and the history stops being usable as a log.
  const table = useInteractiveStructure<HashState, HashStep, HashArgs>({
    engine: hashEngine,
    statKeys: HASH_STAT_KEYS,
    initialState: initial,
    speedMs,
    playing,
    onIdle: stopPlaying,
  });

  const args: HashArgs = { key };
  const state = table.displayState;

  const entryFor = (operationId: string, opArgs: HashArgs): HashLogEntry => ({
    kind: operationId === 'remove' ? 'remove' : 'insert',
    key: opArgs.key,
  });

  /*
   * The log, assembled from what survived the last rebuild plus what the
   * controller has committed since. Lookups are dropped: they animate and they
   * belong in the history panel, but replaying them would only be theatre.
   */
  const committedLog = useMemo<HashLogEntry[]>(
    () => [
      ...baseLog,
      ...table.history
        .filter((record) => !record.readOnly)
        .map((record) => entryFor(record.operationId, record.args)),
    ],
    [baseLog, table.history],
  );

  /*
   * An operation in flight has not been committed yet — the controller folds
   * it in when the *next* operation starts. A rebuild is at least as big an
   * event as the next operation, so it commits the pending one too; without
   * this, inserting a key and immediately switching strategy silently dropped
   * the key you had just watched go in.
   *
   * The reference panel deliberately stays on the committed log, so it does
   * not show a key as placed while its animation is still running.
   */
  const logForRebuild = useMemo<HashLogEntry[]>(
    () =>
      table.active && !table.active.readOnly
        ? [...committedLog, entryFor(table.active.operationId, table.active.args)]
        : committedLog,
    [committedLog, table.active],
  );

  const otherStrategy: HashStrategy = strategy === 'probing' ? 'chaining' : 'probing';
  const reference = useMemo(
    () => replayLog(committedLog, otherStrategy, size),
    [committedLog, otherStrategy, size],
  );

  const run = (operationId: string) => {
    const operation = HASH_OPERATIONS.find((o) => o.id === operationId);
    if (!operation) return;
    table.perform(operation, args);
    setPlaying(true);
  };

  /*
   * Rebuilds the table from the whole log under a new strategy or capacity.
   *
   * Switching strategy used to call reset() with a fresh seeded table, which
   * threw away every key the moment you tried to compare the two layouts —
   * and comparing the two layouts is the only reason the toggle exists. The
   * log is replayed instead, so the same keys land wherever the other strategy
   * would have put them.
   */
  const rebuild = (nextStrategy: HashStrategy, nextSize: number) => {
    setPlaying(false);
    setBaseLog(logForRebuild);
    setStrategy(nextStrategy);
    setSize(nextSize);
    table.reset(replayLog(logForRebuild, nextStrategy, nextSize));
  };

  const rehash = () => {
    const grown = nextCapacity(size);
    setPlaying(false);
    const next: HashLogEntry[] = [...logForRebuild, { kind: 'rehash', size: grown }];
    setBaseLog(next);
    setSize(grown);
    table.reset(replayLog(next, strategy, grown));
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
  const load = count / size;
  const overloaded = load > LOAD_THRESHOLD;
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
          Both strategies use the same hash — <code>key % {size}</code> — and differ only in what
          they do when two keys land in the same bucket. Try inserting 5, 16 and 27: all three hash
          to bucket 5. Switching strategy replays your log rather than discarding it.
        </p>
      </header>

      <div className={styles.setup}>
        <div className={styles.tools}>
          {(['probing', 'chaining'] as HashStrategy[]).map((option) => (
            <button
              key={option}
              className={strategy === option ? styles.toolActive : undefined}
              aria-pressed={strategy === option}
              onClick={() => rebuild(option, size)}
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
          <span className={styles.hash}>→ bucket {hashOf(key, size)}</span>
        </label>

        <div className={styles.ops}>
          {HASH_OPERATIONS.map((operation) => (
            <button key={operation.id} onClick={() => run(operation.id)}>
              {operation.label(args)}
            </button>
          ))}
        </div>

        <button
          className={overloaded ? styles.rehashUrgent : styles.rehash}
          onClick={rehash}
          title={`Grow the table to ${nextCapacity(size)} buckets and re-insert every key`}
        >
          Rehash to {nextCapacity(size)}
        </button>

        <button
          className={styles.reset}
          onClick={() => {
            setPlaying(false);
            setBaseLog(SEED_LOG);
            setSize(INITIAL_SIZE);
            table.reset(replayLog(SEED_LOG, strategy, INITIAL_SIZE));
          }}
        >
          Reset table
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
          Load factor{' '}
          <strong className={overloaded ? styles.overloaded : undefined}>{load.toFixed(2)}</strong>
        </span>
        {/*
          A standing condition, not a step. It sits beside the number it is
          about rather than in the narration line, which is describing whatever
          the cursor is on and would otherwise have to fight it for the slot.
        */}
        {overloaded && (
          <span className={styles.loadWarning}>
            {load.toFixed(2)} is past {LOAD_THRESHOLD.toFixed(2)} — probe sequences are getting
            long. Rehashing to {nextCapacity(size)} would shorten them.
          </span>
        )}
        {state.hashKey !== null && (
          <span className={styles.metric}>
            hash({state.hashKey}) <strong>{hashOf(state.hashKey, size)}</strong>
          </span>
        )}
      </div>

      {/*
        A refusal — "27 is already in the table", "table is full" — is not the
        same kind of message as a running commentary, and used to be rendered
        in the same muted blue as everything else.
      */}
      <Narration
        tag={table.active ? `Step ${Math.max(0, table.frame.cursor + 1)}` : 'Ready'}
        tone={state.note ? 'refusal' : 'neutral'}
      >
        {state.note ?? narrateHashStep(table.currentStep, state)}
      </Narration>

      <div className={styles.workspace}>
        <div className={styles.left}>
          <BucketRows state={state} currentStep={table.currentStep} />
        </div>

        <div className={styles.readouts}>
          <ReferenceTable
            state={reference}
            label={otherStrategy === 'probing' ? 'Linear probing' : 'Chaining'}
            note={
              otherStrategy === 'chaining'
                ? 'Chaining keeps every colliding key in its home bucket, so nothing moves — the chain just gets longer.'
                : 'Probing pushes a colliding key into the next free bucket, so keys land away from their home.'
            }
          />
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
