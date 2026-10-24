import { useMemo } from 'react';
import { KIND_LABEL, colorForKind, textOnKind, type VisualKind } from './stepKinds';
import styles from './RunBar.module.css';

/**
 * A reset control, named by what it actually destroys.
 *
 * The old bar shipped "Restart", "Clear run" and "Cancel operation" as three
 * names for one prop plus a separate "Reset" beside it, so no two pages agreed
 * on what the button next to Play would do. Callers now pass the specific verb:
 * "Rewind" (cursor only), "Cancel operation", "Commit", or a `danger` one like
 * "New array" / "Clear grid" / "Reset structure" that goes back to seed.
 */
export interface RunBarReset {
  label: string;
  onClick(): void;
  /** Back-to-seed. Styled apart and pushed to the far end. */
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}

export interface RunBarProps {
  /** One line describing what is loaded — "Quick Sort · 45 · Random · seed 2024". */
  summary: string;
  /** Present only when the page has setup controls to expand underneath. */
  onEditSetup?(): void;
  setupOpen?: boolean;

  isPlaying: boolean;
  canStepBack: boolean;
  canStepForward: boolean;
  /** -1 before the first step, matching Frame.cursor. */
  cursor: number;
  totalSteps: number;
  speedMs: number;
  onToggle(): void;
  onStepBack(): void;
  onStepForward(): void;
  onSpeedChange(ms: number): void;
  onSeek?(cursor: number): void;
  /** Why scrubbing is unavailable, shown on the disabled slider. */
  seekDisabledReason?: string;
  resets: RunBarReset[];
  /**
   * One visual kind per step, in step order. Drives the tick strip and the
   * current-step tag; omitting it just leaves the strip unpainted.
   */
  stepKinds?: readonly VisualKind[];
}

/**
 * Speed as three named presets rather than a raw slider.
 *
 * The slider it replaces was inverted — dragging right lowered the delay — and
 * unlabelled, so "faster" and "further right" had to be learned. A preset can
 * be aimed at, is reachable by keyboard in one tab stop, and reads back the
 * real number beside it.
 */
const SPEED_PRESETS = [
  { label: '0.25×', ms: 240 },
  { label: '1×', ms: 60 },
  { label: '4×', ms: 12 },
] as const;

/** Slices in the tick strip. ~96 spans read as a timeline; more reads as noise. */
const TICK_BUCKETS = 96;

function formatDuration(ms: number): string {
  if (ms < 950) return `${Math.max(1, Math.round(ms / 100) / 10)}s`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}

interface Tick {
  kind: VisualKind | null;
  past: boolean;
}

/**
 * Collapses the step list into fixed-width slices, each taking the colour of
 * the kind that dominates it. At 1,109 steps across 96 slices that is roughly
 * a dozen steps a slice, which is enough to make quicksort's partition passes
 * and merge's write runs visible as bands before you play anything.
 */
function buildTicks(stepKinds: readonly VisualKind[] | undefined, cursor: number): Tick[] {
  const total = stepKinds?.length ?? 0;
  if (!stepKinds || total === 0) {
    return Array.from({ length: TICK_BUCKETS }, () => ({ kind: null, past: false }));
  }
  return Array.from({ length: TICK_BUCKETS }, (_, bucket) => {
    const from = Math.floor((bucket * total) / TICK_BUCKETS);
    const to = Math.max(from + 1, Math.floor(((bucket + 1) * total) / TICK_BUCKETS));

    const tally = new Map<VisualKind, number>();
    for (let s = from; s < to && s < total; s++) {
      const kind = stepKinds[s];
      tally.set(kind, (tally.get(kind) ?? 0) + 1);
    }
    let kind: VisualKind | null = null;
    let best = 0;
    for (const [candidate, count] of tally) {
      if (count > best) {
        best = count;
        kind = candidate;
      }
    }
    return { kind, past: from <= cursor };
  });
}

/**
 * The single control surface for both batch runs and an interactive domain's
 * active operation — identical props either way, which is what keeps the two
 * modes honestly sharing one engine.
 *
 * Four zones across the top (setup summary, transport, speed, resets) over a
 * full-width scrub lane. The scrub lane is the part that earns its space: a
 * bare slider says only "somewhere in the middle", while the tick strip under
 * it says which *phase* of the algorithm you are about to land in.
 */
export function RunBar({
  summary,
  onEditSetup,
  setupOpen = false,
  isPlaying,
  canStepBack,
  canStepForward,
  cursor,
  totalSteps,
  speedMs,
  onToggle,
  onStepBack,
  onStepForward,
  onSpeedChange,
  onSeek,
  seekDisabledReason,
  resets,
  stepKinds,
}: RunBarProps) {
  const remaining = Math.max(0, totalSteps - 1 - cursor);
  const atEnd = totalSteps > 0 && !canStepForward;
  const currentKind = cursor >= 0 ? stepKinds?.[cursor] : undefined;

  const ticks = useMemo(() => buildTicks(stepKinds, cursor), [stepKinds, cursor]);

  // Slider space is 0..totalSteps, where 0 is "before the first step" — one
  // position wider than the cursor's own -1..totalSteps-1, so that the readout
  // beside it can say "Step 412 / 1,109" and mean it.
  const sliderValue = cursor + 1;

  const eta = isPlaying
    ? remaining > 0
      ? `≈ ${formatDuration(remaining * speedMs)} left`
      : ''
    : totalSteps > 0
      ? `${remaining.toLocaleString()} steps remaining`
      : '';

  return (
    <div className={styles.bar}>
      <div className={styles.zones}>
        <div className={styles.setup}>
          <span className={styles.zoneLabel}>Run setup</span>
          <div className={styles.setupLine}>
            <span className={styles.summary}>{summary}</span>
            {onEditSetup && (
              <button
                type="button"
                className={styles.edit}
                onClick={onEditSetup}
                aria-expanded={setupOpen}
              >
                {setupOpen ? 'Close' : 'Edit'}
              </button>
            )}
          </div>
        </div>

        <div className={styles.transport}>
          <button
            type="button"
            className={styles.icon}
            onClick={onStepBack}
            disabled={!canStepBack}
            title="Step back one operation (←)"
            aria-label="Step back"
          >
            ‹
          </button>
          <button
            type="button"
            className={styles.play}
            onClick={onToggle}
            disabled={!canStepForward && !isPlaying && !atEnd}
            title="Play or pause (Space)"
          >
            {isPlaying ? 'Pause' : atEnd ? 'Replay' : 'Play'}
          </button>
          <button
            type="button"
            className={styles.icon}
            onClick={onStepForward}
            disabled={!canStepForward}
            title="Step forward one operation (→)"
            aria-label="Step forward"
          >
            ›
          </button>
        </div>

        <div className={styles.speed}>
          <span className={styles.zoneLabel} id="runbar-speed-label">
            Speed
          </span>
          <div className={styles.speedRow}>
            <div className={styles.segmented} role="group" aria-labelledby="runbar-speed-label">
              {SPEED_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  className={`${styles.segment} ${speedMs === preset.ms ? styles.segmentOn : ''}`}
                  aria-pressed={speedMs === preset.ms}
                  onClick={() => onSpeedChange(preset.ms)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <span className={styles.msLabel}>{speedMs} ms / step</span>
          </div>
        </div>

        <div className={styles.resets}>
          {resets.map((reset) => (
            <button
              type="button"
              key={reset.label}
              className={reset.danger ? styles.danger : styles.ghost}
              onClick={reset.onClick}
              disabled={reset.disabled}
              title={reset.title}
            >
              {reset.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.lane}>
        <div className={styles.laneHead}>
          <div className={styles.counterGroup}>
            <span className={styles.zoneLabel}>Step</span>
            <span className={styles.counter}>
              {sliderValue.toLocaleString()} / {totalSteps.toLocaleString()}
            </span>
            {currentKind && (
              <span
                className={styles.kind}
                style={{ background: colorForKind(currentKind), color: textOnKind(currentKind) }}
              >
                {KIND_LABEL[currentKind]}
              </span>
            )}
          </div>
          <span className={styles.eta}>{eta}</span>
        </div>

        <input
          type="range"
          className={styles.scrub}
          min={0}
          max={Math.max(0, totalSteps)}
          value={sliderValue}
          disabled={!onSeek || totalSteps === 0}
          title={!onSeek ? seekDisabledReason : undefined}
          aria-label="Scrub through the run"
          onChange={(event) => onSeek?.(Number(event.target.value) - 1)}
        />

        <div className={styles.ticks} aria-hidden>
          {ticks.map((tick, index) => (
            <span
              // Fixed-length strip: index is the identity here, there is no list to reorder.
              key={index}
              className={styles.tick}
              style={{
                background: tick.kind ? colorForKind(tick.kind) : 'var(--hairline)',
                opacity: tick.past ? 1 : 0.28,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
