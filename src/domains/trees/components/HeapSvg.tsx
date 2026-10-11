import { useState } from 'react';
import { NODE_RADIUS, layoutHeap, parentOfIndex } from '../layout';
import type { HeapState, HeapStep } from '../types';
import styles from './TreeSvg.module.css';

interface HeapSvgProps {
  state: HeapState;
  currentStep: HeapStep | null;
}

const WIDTH = 760;

/** A heap is stored as an array; this draws the complete tree that array implies. */
export function HeapSvg({ state, currentStep }: HeapSvgProps) {
  const layout = layoutHeap(state.items.length, WIDTH);

  /*
   * The tree and the array are the same object, and the arithmetic joining
   * them — parent at (i-1)/2, children at 2i+1 and 2i+2 — is the whole reason
   * a heap can be array-backed. Both views were drawn with nothing connecting
   * them, so the relationship had to be taken on trust. Hovering either one
   * lights up the family and states the arithmetic.
   */
  const [hover, setHover] = useState<number | null>(null);
  const family =
    hover === null
      ? null
      : {
          index: hover,
          parent: hover > 0 ? parentOfIndex(hover) : null,
          left: 2 * hover + 1 < state.items.length ? 2 * hover + 1 : null,
          right: 2 * hover + 2 < state.items.length ? 2 * hover + 2 : null,
        };
  const related = new Set<number>(
    family
      ? [family.index, family.parent, family.left, family.right].filter(
          (i): i is number => i !== null,
        )
      : [],
  );

  const touched = new Set<number>();
  if (currentStep?.kind === 'compare') {
    touched.add(currentStep.a);
    touched.add(currentStep.b);
  }
  const swapping = new Set<number>();
  if (currentStep?.kind === 'swap') {
    swapping.add(currentStep.a);
    swapping.add(currentStep.b);
  }

  const classFor = (index: number) => {
    if (swapping.has(index)) return styles.found;
    if (touched.has(index)) return styles.comparing;
    if (related.has(index)) return styles.related;
    if (state.pointer === index) return styles.pointer;
    return styles.node;
  };

  return (
    <div className={styles.wrap}>
      {state.items.length === 0 && <p className={styles.empty}>Empty heap — insert a value.</p>}

      <svg
        className={styles.svg}
        viewBox={`0 0 ${WIDTH} ${Math.max(layout.height, 120)}`}
        width={WIDTH}
        height={Math.max(layout.height, 120)}
        role="img"
        aria-label="Heap diagram"
      >
        {layout.positions.map((pos, index) => {
          if (index === 0) return null;
          const parent = layout.positions[parentOfIndex(index)];
          return (
            <line
              key={`e${index}`}
              x1={parent.x}
              y1={parent.y}
              x2={pos.x}
              y2={pos.y}
              className={styles.edge}
            />
          );
        })}

        {layout.positions.map((pos, index) => (
          <g
            key={index}
            className={classFor(index)}
            onPointerEnter={() => setHover(index)}
            onPointerLeave={() => setHover(null)}
          >
            <circle cx={pos.x} cy={pos.y} r={NODE_RADIUS} />
            <text x={pos.x} y={pos.y + 4} textAnchor="middle">
              {state.items[index]}
            </text>
            <text
              x={pos.x}
              y={pos.y - NODE_RADIUS - 5}
              textAnchor="middle"
              className={styles.heapIndex}
            >
              {index}
            </text>
          </g>
        ))}
      </svg>

      <div className={styles.arrayStrip}>
        {state.items.map((value, index) => (
          <span
            key={index}
            className={
              swapping.has(index) || touched.has(index)
                ? styles.cellHot
                : related.has(index)
                  ? styles.cellRelated
                  : styles.cell
            }
            onPointerEnter={() => setHover(index)}
            onPointerLeave={() => setHover(null)}
          >
            <em>{index}</em>
            {value}
          </span>
        ))}
      </div>

      <p className={styles.arithmetic} aria-live="polite">
        {family ? (
          <>
            <code>i = {family.index}</code> · parent{' '}
            <code>
              ⌊({family.index}−1)/2⌋ = {family.parent === null ? '— it is the root' : family.parent}
            </code>{' '}
            · left <code>2i+1 = {family.left ?? `${2 * family.index + 1}, past the end`}</code> ·
            right <code>2i+2 = {family.right ?? `${2 * family.index + 2}, past the end`}</code>
          </>
        ) : (
          'Hover a node or an array cell to see how the two views index each other.'
        )}
      </p>
    </div>
  );
}
