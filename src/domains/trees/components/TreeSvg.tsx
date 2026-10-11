import { NODE_RADIUS, balanceOf, layoutTree } from '../layout';
import type { TreeState, TreeStep } from '../types';
import styles from './TreeSvg.module.css';

interface TreeSvgProps {
  state: TreeState;
  currentStep: TreeStep | null;
  /** AVL work turns on the balance factor, so it is shown while that runs. */
  showBalance?: boolean;
  /** 0.7–1.6. Fifteen nodes need about 700px of width in a 220px box. */
  zoom?: number;
}

type Point = { x: number; y: number };

export function TreeSvg({ state, currentStep, showBalance = false, zoom = 1 }: TreeSvgProps) {
  const layout = layoutTree(state);
  const comparing = currentStep?.kind === 'compare' ? currentStep.id : null;
  const visitedSet = new Set(state.visited);

  // Every node is laid out, attached or not — see `layoutTree`.
  const positionOf = (id: string): Point | undefined => layout.positions[id];

  const detachedSet = new Set(layout.detached);

  /** The edge this step is rewriting, drawn in the accent while it happens. */
  const rewriting =
    currentStep?.kind === 'link'
      ? { parentId: currentStep.parentId, childId: currentStep.childId ?? currentStep.prevChildId }
      : null;

  const classFor = (id: string) => {
    if (state.foundId === id) return styles.found;
    if (comparing === id) return styles.comparing;
    if (state.pointer === id) return styles.pointer;
    if (visitedSet.has(id)) return styles.visited;
    return styles.node;
  };

  const height = Math.max(layout.height, 120);
  const width = Math.max(layout.width, 320);

  return (
    <div className={styles.wrap}>
      {state.rootId === null && layout.detached.length === 0 && (
        <p className={styles.empty}>Empty tree — insert a value to begin.</p>
      )}

      <svg
        className={styles.svg}
        viewBox={`0 0 ${width} ${height}`}
        width={width * zoom}
        height={height * zoom}
        role="img"
        aria-label="Tree diagram"
      >
        {/* Edges first so nodes paint over them. */}
        {Object.entries(state.nodes).map(([id, node]) =>
          (['leftId', 'rightId'] as const).map((key) => {
            const childId = node[key];
            const from = positionOf(id);
            const to = childId ? positionOf(childId) : undefined;
            if (!from || !to || !childId) return null;
            const isRewriting = rewriting?.parentId === id && rewriting.childId === childId;
            return (
              <line
                key={`${id}-${key}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className={`${styles.edge} ${isRewriting ? styles.edgeRewriting : ''} ${
                  detachedSet.has(childId) ? styles.edgeDetached : ''
                }`}
              />
            );
          }),
        )}

        {Object.keys(state.nodes).map((id) => {
          const pos = positionOf(id);
          if (!pos) return null;
          const detached = detachedSet.has(id);
          const balance = showBalance && !detached ? balanceOf(state, id) : null;
          return (
            <g key={id} className={`${classFor(id)} ${detached ? styles.detached : ''}`}>
              <circle cx={pos.x} cy={pos.y} r={NODE_RADIUS} />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle">
                {state.nodes[id].value}
              </text>
              {balance !== null && (
                <text
                  x={pos.x + NODE_RADIUS + 2}
                  y={pos.y - NODE_RADIUS + 4}
                  className={Math.abs(balance) > 1 ? styles.balanceBad : styles.balance}
                >
                  {balance > 0 ? `+${balance}` : balance}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
