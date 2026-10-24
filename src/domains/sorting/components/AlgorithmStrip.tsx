import { FAMILY_BY_ID, SORT_ALGORITHMS, SORT_GROUPS, SORT_PROFILE } from '../registry';
import type { SortAlgorithm } from '../types';
import styles from './AlgorithmStrip.module.css';

interface AlgorithmStripProps {
  def: SortAlgorithm;
  open: boolean;
  onToggle(): void;
  onSelect(id: string): void;
  /** Rendered at the right of the strip — race mode's entry point. */
  action?: React.ReactNode;
  /** Shown when the chosen algorithm forced the array smaller. */
  capNote?: string | null;
}

/**
 * Which algorithm is loaded, what family it belongs to, and what it costs —
 * stated once, at the top, instead of being spread across a `<select>` whose
 * closed state showed only a name.
 *
 * The picker underneath is a CSS grid of `repeat(auto-fill, minmax(168px, 1fr))`
 * rather than flex with a basis. With flex, the columns changed width as they
 * wrapped, so widening the window by ten pixels re-laid out every chip and the
 * one you were aiming at moved. Grid tracks are computed once for the row.
 */
export function AlgorithmStrip({
  def,
  open,
  onToggle,
  onSelect,
  action,
  capNote,
}: AlgorithmStripProps) {
  const profile = SORT_PROFILE[def.id];

  return (
    <section className={styles.strip}>
      <div className={styles.identity}>
        <div className={styles.name}>
          <span className={styles.kicker}>Algorithm</span>
          <span className={styles.title}>{def.label}</span>
          <span className={styles.family}>{FAMILY_BY_ID[def.id]}</span>
          {profile && <span className={styles.bigO}>O({profile.bigO})</span>}
          <button type="button" className={styles.change} onClick={onToggle} aria-expanded={open}>
            {open
              ? 'Close'
              : `Change — ${SORT_ALGORITHMS.length} in ${SORT_GROUPS.length} families`}
          </button>
        </div>
        {action}
      </div>

      {open && (
        <div className={styles.picker}>
          {SORT_GROUPS.map((group) => (
            <div key={group.label} className={styles.familyColumn}>
              <div className={styles.familyLabel}>{group.label}</div>
              {group.algorithms.map((algorithm) => {
                const selected = algorithm.id === def.id;
                return (
                  <button
                    type="button"
                    key={algorithm.id}
                    className={`${styles.chip} ${selected ? styles.chipOn : ''}`}
                    aria-pressed={selected}
                    onClick={() => onSelect(algorithm.id)}
                  >
                    <span className={styles.chipName}>{algorithm.label}</span>
                    {/* The cost is on every chip, so the choice can be made on
                        something other than whether the name is familiar. */}
                    <span className={styles.chipBigO}>{SORT_PROFILE[algorithm.id]?.bigO}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <p className={styles.summary}>{def.summary}</p>

      {capNote && <p className={styles.capNote}>{capNote}</p>}
    </section>
  );
}
