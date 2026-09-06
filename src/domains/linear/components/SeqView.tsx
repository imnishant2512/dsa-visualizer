import type { SeqState, SeqStep } from '../types';
import styles from './SeqView.module.css';

interface SeqViewProps {
  state: SeqState;
  currentStep: SeqStep | null;
  variant: 'array' | 'stack' | 'queue';
}

/**
 * One renderer for all three sequence structures.
 *
 * A stack is drawn bottom-up from a fixed floor and a queue labels its ends,
 * but the underlying cells are identical — which is the point, since a stack
 * and a queue *are* an array with the ends restricted.
 */
export function SeqView({ state, currentStep, variant }: SeqViewProps) {
  const touched =
    currentStep && 'index' in currentStep && typeof currentStep.index === 'number'
      ? currentStep.index
      : null;

  const cellClass = (index: number) => {
    const classes = [styles.cell];
    if (state.foundIndex === index) classes.push(styles.found);
    else if (touched === index && currentStep?.kind === 'compare') classes.push(styles.compare);
    else if (touched === index && currentStep?.kind === 'read') classes.push(styles.read);
    else if (touched === index && (currentStep?.kind === 'insertAt' || currentStep?.kind === 'removeAt'))
      classes.push(styles.write);
    else if (state.pointer === index) classes.push(styles.pointer);
    return classes.join(' ');
  };

  const endLabel = (index: number) => {
    if (variant === 'stack') return index === state.items.length - 1 ? 'top' : null;
    if (variant === 'queue') {
      if (index === 0) return 'front';
      if (index === state.items.length - 1) return 'back';
    }
    return null;
  };

  return (
    <div className={`${styles.view} ${variant === 'stack' ? styles.stack : ''}`}>
      {state.items.length === 0 && <p className={styles.empty}>Empty — run an operation below.</p>}

      <div className={styles.column}>
        <div className={styles.cells}>
          {state.items.map((value, index) => (
            <div key={index} className={styles.slot}>
              <span className={styles.index}>{index}</span>
              <div className={cellClass(index)}>{value}</div>
              <span className={styles.end}>{endLabel(index)}</span>
            </div>
          ))}
        </div>
        {/* Names the fixed end, so the growing one is unambiguous even empty. */}
        {variant === 'stack' && <span className={styles.base}>base</span>}
      </div>
    </div>
  );
}
