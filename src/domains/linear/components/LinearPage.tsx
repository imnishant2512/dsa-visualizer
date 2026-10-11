import { useCallback, useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useInteractiveStructure } from '../../../engine/useInteractiveStructure';
import { OperationHistoryPanel } from '../../../shared/components/OperationHistoryPanel';
import { RunBar } from '../../../shared/components/RunBar';
import { NO_STEPS, stepKindsByName } from '../../../shared/components/stepKinds';
import { usePlaybackKeys } from '../../../shared/hooks/usePlaybackKeys';
import { PseudocodePanel } from '../../../shared/components/PseudocodePanel';
import { StatsPanel } from '../../../shared/components/StatsPanel';
import { SPEED_MS } from '../../../shared/utils/randomArray';
import { initListState, initSeqState, listEngine, seqEngine } from '../engine';
import { LIST_OPERATIONS, SEQ_OPERATIONS, type OpArgs } from '../operations';
import { LINEAR_STAT_KEYS, type LinearVariant } from '../types';
import { Narration } from '../../../shared/components/Narration';
import { narrateLinearStep } from '../narrate';
import { ListView } from './ListView';
import { SeqView } from './SeqView';
import styles from './LinearPage.module.css';

const TABS: Array<{ variant: LinearVariant; label: string; blurb: string }> = [
  {
    variant: 'array',
    label: 'Array',
    blurb:
      'Random access is O(1), but inserting or removing in the middle shifts everything after it.',
  },
  {
    variant: 'stack',
    label: 'Stack',
    blurb: 'Last in, first out. Both push and pop touch only the top, so both are O(1).',
  },
  {
    variant: 'queue',
    label: 'Queue',
    blurb:
      'First in, first out. Backed by a plain array, dequeue costs O(n) because the rest shifts left.',
  },
  {
    variant: 'linked-list',
    label: 'Linked list',
    blurb:
      'Inserting at the head is O(1), but reaching any other position means walking the chain.',
  },
];

const STAT_LABELS = [
  { key: 'reads', label: 'Reads' },
  { key: 'writes', label: 'Writes' },
  { key: 'comparisons', label: 'Comparisons' },
  { key: 'pointerMoves', label: 'Pointer moves' },
];

const SEED = [12, 7, 25, 4];

export function LinearPage() {
  const params = useParams();
  const variant = (TABS.find((t) => t.variant === params.variant)?.variant ??
    'array') as LinearVariant;
  const tab = TABS.find((t) => t.variant === variant)!;

  const [value, setValue] = useState(9);
  const [index, setIndex] = useState(1);
  const [speedMs, setSpeedMs] = useState<number>(SPEED_MS.default * 4);
  const [playing, setPlaying] = useState(false);

  const stopPlaying = useCallback(() => setPlaying(false), []);
  const isList = variant === 'linked-list';

  // Both controllers are always instantiated (hooks can't be conditional), but
  // only the visible one may play — an idle controller with `playing` true
  // would report itself finished and stop the shared clock.
  const seq = useInteractiveStructure({
    engine: seqEngine,
    statKeys: LINEAR_STAT_KEYS,
    initialState: useMemo(() => initSeqState(SEED), []),
    speedMs,
    playing: playing && !isList,
    onIdle: stopPlaying,
  });

  const list = useInteractiveStructure({
    engine: listEngine,
    statKeys: LINEAR_STAT_KEYS,
    initialState: useMemo(() => initListState(SEED), []),
    speedMs,
    playing: playing && isList,
    onIdle: stopPlaying,
  });

  const controller = isList ? list : seq;
  const operations = isList
    ? LIST_OPERATIONS
    : SEQ_OPERATIONS[variant as 'array' | 'stack' | 'queue'];

  const args: OpArgs = useMemo(() => ({ value, index }), [value, index]);

  /*
   * Why each operation cannot run, checked against the structure as it stands.
   *
   * The page used to offer every operation unconditionally, run the impossible
   * ones, and report the failure afterwards in the same informational blue as
   * a success — so "Pop" on an empty stack looked like it had worked. Asking
   * first means the control is honest about what it will do.
   */
  const refusals = useMemo(() => {
    // The structure the next operation will see, which includes whatever is
    // still animating — `perform` commits that before it generates.
    const state = isList ? list.pendingStructure : seq.pendingStructure;
    const reasons = new Map<string, string>();
    for (const operation of operations) {
      const reason = (operation as { refuse?: (s: never, a: OpArgs) => string | null }).refuse?.(
        state as never,
        args,
      );
      if (reason) reasons.set(operation.id, reason);
    }
    return reasons;
  }, [operations, isList, list.pendingStructure, seq.pendingStructure, args]);

  const runOperation = (operationId: string) => {
    const operation = operations.find((o) => o.id === operationId);
    if (!operation || refusals.has(operationId)) return;
    // A new operation commits whatever was still in flight, then plays.
    if (isList) list.perform(operation as never, args);
    else seq.perform(operation as never, args);
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

  // Only the array exposes positional operations; everything else works at the ends.
  const needsIndex = variant === 'array';
  const indexOutOfRange = needsIndex && (index < 0 || index > seq.pendingStructure.items.length);

  const activeSteps = controller.active?.steps ?? NO_STEPS;
  const stepKinds = useMemo(() => stepKindsByName(activeSteps), [activeSteps]);
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1>Linear structures</h1>
        <p>
          Each operation animates against the structure as it stands, then stays in the history.
          Step back inside a running operation, or undo a committed one entirely — they are
          different things, and both work here.
        </p>
      </header>

      <nav className={styles.tabs}>
        {TABS.map((entry) => (
          <NavLink
            key={entry.variant}
            to={`/linear/${entry.variant}`}
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
          >
            {entry.label}
          </NavLink>
        ))}
      </nav>

      <p className={styles.blurb}>{tab.blurb}</p>

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
        {needsIndex && (
          <label>
            Index
            <input
              type="number"
              value={index}
              min={0}
              max={seq.pendingStructure.items.length}
              aria-invalid={indexOutOfRange || undefined}
              aria-describedby="linear-index-range"
              onChange={(e) => setIndex(Number(e.target.value))}
              className={`${styles.number} ${indexOutOfRange ? styles.invalid : ''}`}
            />
            {/*
              The valid range, next to the field, rather than a failure message
              after the fact. It is the same sentence either way — showing it
              before turns a report into an instruction.
            */}
            <span
              id="linear-index-range"
              className={indexOutOfRange ? styles.rangeBad : styles.range}
            >
              0–{seq.pendingStructure.items.length}
            </span>
          </label>
        )}

        <div className={styles.ops}>
          {operations.map((operation) => {
            const reason = refusals.get(operation.id);
            return (
              <button
                key={operation.id}
                onClick={() => runOperation(operation.id)}
                disabled={Boolean(reason)}
                title={reason}
              >
                {operation.label(args)}
              </button>
            );
          })}
        </div>

        <button
          className={styles.reset}
          onClick={() => {
            setPlaying(false);
            if (isList) list.reset(initListState(SEED));
            else seq.reset(initSeqState(SEED));
          }}
        >
          Reset
        </button>
      </div>

      {/*
        A refusal gets its own surface: the reason an operation cannot run is
        not the same kind of message as a report of one that did.
      */}
      <Narration
        tag={controller.active ? `Step ${Math.max(0, controller.frame.cursor + 1)}` : 'Ready'}
        tone={controller.displayState.note ? 'refusal' : 'neutral'}
      >
        {controller.displayState.note ??
          narrateLinearStep(controller.currentStep, controller.displayState, isList)}
      </Narration>

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
            title: 'Drop the operation in flight — the structure is left untouched',
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
          {isList ? (
            <ListView state={list.displayState} currentStep={list.currentStep} />
          ) : (
            <SeqView
              state={seq.displayState}
              currentStep={seq.currentStep}
              variant={variant as 'array' | 'stack' | 'queue'}
            />
          )}

          {controller.displayState.note && (
            <div className={styles.note}>{controller.displayState.note}</div>
          )}
        </div>

        <div className={styles.readouts}>
          <StatsPanel stats={controller.frame.stats} labels={STAT_LABELS} />
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
