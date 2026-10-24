import styles from './Narration.module.css';

export interface NarrationProps {
  /** Short mono prefix — "Step 412", "Ready", "Insert 7". */
  tag: string;
  /** One plain-English sentence about the step the cursor is on. */
  children: React.ReactNode;
  /**
   * A refusal is a request that could not be carried out — popping an empty
   * stack, inserting a duplicate key. It gets its own surface because an error
   * dressed as information reads as information; the previous build reported
   * failures in the same blue note as successes.
   */
  tone?: 'neutral' | 'refusal';
}

/**
 * The running commentary above a visualization.
 *
 * This is the app's largest accessibility gap closed: a screen reader user got
 * nothing at all from a run before, because every piece of state lived in bar
 * heights and fill colours. The data was always there — steps carry their kind
 * and indices, and several domains already built `note` strings — it was only
 * never rendered as text.
 *
 * `aria-live="polite"` rather than `assertive`: at 60ms a step an assertive
 * region would interrupt itself continuously and say nothing useful. Polite
 * announces when the reader is idle, which during playback means roughly one
 * sentence per pause — which is the useful rate.
 */
export function Narration({ tag, children, tone = 'neutral' }: NarrationProps) {
  return (
    <div
      className={`${styles.line} ${tone === 'refusal' ? styles.refusal : ''}`}
      aria-live="polite"
    >
      <span className={styles.tag}>{tag}</span>
      <span className={styles.text}>{children}</span>
    </div>
  );
}
