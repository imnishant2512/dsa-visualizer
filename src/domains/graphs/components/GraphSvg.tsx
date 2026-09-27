import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { GraphState, GraphStep } from '../types';
import styles from './GraphSvg.module.css';

const NODE_R = 19;
/** Below this, a press-and-release on a node is a click, not a drag. */
const DRAG_THRESHOLD = 4;
/** Where along an edge its weight is printed, as a fraction from `from`. */
const LABEL_AT = 0.4;

export interface PendingMark {
  /** The node or edge the pending action is anchored to. */
  nodeId?: string;
  edgeId?: string;
  /** What the canvas should say next to it — "now pick the goal". */
  caption: string;
}

interface GraphSvgProps {
  state: GraphState;
  currentStep: GraphStep | null;
  width: number;
  height: number;
  startId: string | null;
  endId: string | null;
  /**
   * An action half-done — a first edge endpoint chosen, a start awaiting its
   * goal, an edge picked for reweighting. Drawn on the canvas, next to the
   * thing it is about, rather than in a sentence above the canvas that the
   * eye has to leave the graph to read.
   */
  pending: PendingMark | null;
  /** Nodes can be dragged; a drop commits one undoable move. */
  draggable: boolean;
  onCanvasClick(x: number, y: number): void;
  onNodeClick(id: string): void;
  onNodeMove(id: string, x: number, y: number): void;
  onEdgeClick(id: string): void;
}

interface Drag {
  id: string;
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  moved: boolean;
}

export function GraphSvg({
  state,
  currentStep,
  width,
  height,
  startId,
  endId,
  pending,
  draggable,
  onCanvasClick,
  onNodeClick,
  onNodeMove,
  onEdgeClick,
}: GraphSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  /*
   * A drag in progress is local and uncommitted: the node follows the pointer
   * and its edges follow the node, but nothing enters the history until the
   * drop. One move is one undoable operation, not one per pointer event.
   */
  const [drag, setDrag] = useState<Drag | null>(null);

  const visited = new Set(state.visited);
  // Frontier entries stay in the list once visited, so filter them here rather
  // than mutating state — that is what keeps every step exactly invertible.
  const frontier = new Set(state.frontier.filter((id) => !visited.has(id)));
  const pathEdges = new Set(state.pathEdges);
  const adding = currentStep?.kind === 'addNode' ? currentStep.id : null;

  const positionOf = (id: string) => {
    if (drag && drag.id === id && drag.moved) return { x: drag.x, y: drag.y };
    return state.nodes[id];
  };

  /** Pointer position in the SVG's own coordinate space. */
  const toLocal = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: clientX, y: clientY };
    const scale = width / rect.width;
    return {
      x: Math.round(Math.min(width - NODE_R, Math.max(NODE_R, (clientX - rect.left) * scale))),
      y: Math.round(Math.min(height - NODE_R, Math.max(NODE_R, (clientY - rect.top) * scale))),
    };
  };

  const nodeClass = (id: string) => {
    if (pending?.nodeId === id) return styles.pending;
    if (id === startId) return styles.start;
    if (id === endId) return styles.end;
    if (state.pointer === id || id === adding) return styles.active;
    if (visited.has(id)) return styles.visited;
    if (frontier.has(id)) return styles.frontier;
    return styles.node;
  };

  const handleBackground = (event: MouseEvent<SVGRectElement>) => {
    const { x, y } = toLocal(event.clientX, event.clientY);
    onCanvasClick(x, y);
  };

  const beginDrag = (id: string, event: PointerEvent<SVGGElement>) => {
    if (!draggable) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const { x, y } = toLocal(event.clientX, event.clientY);
    setDrag({ id, pointerId: event.pointerId, originX: x, originY: y, x, y, moved: false });
  };

  const continueDrag = (event: PointerEvent<SVGGElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { x, y } = toLocal(event.clientX, event.clientY);
    const moved =
      drag.moved || Math.hypot(x - drag.originX, y - drag.originY) > DRAG_THRESHOLD;
    setDrag({ ...drag, x, y, moved });
  };

  const endDrag = (id: string, event: PointerEvent<SVGGElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      if (!draggable) onNodeClick(id);
      return;
    }
    setDrag(null);
    if (drag.moved) onNodeMove(id, drag.x, drag.y);
    else onNodeClick(id);
  };

  const pendingEdge = pending?.edgeId ? state.edges[pending.edgeId] : undefined;
  const pendingAnchor = pending?.nodeId
    ? positionOf(pending.nodeId)
    : pendingEdge
      ? (() => {
          const a = positionOf(pendingEdge.from);
          const b = positionOf(pendingEdge.to);
          return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : undefined;
        })()
      : undefined;

  return (
    <div className={styles.wrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={styles.svg}
        role="img"
        aria-label="Graph"
      >
        <rect x={0} y={0} width={width} height={height} fill="transparent" onClick={handleBackground} />

        {Object.entries(state.edges).map(([id, edge]) => {
          const a = positionOf(edge.from);
          const b = positionOf(edge.to);
          if (!a || !b) return null;
          const cls =
            pending?.edgeId === id
              ? styles.pendingEdge
              : pathEdges.has(id)
                ? styles.pathEdge
                : styles.edge;
          return (
            <g key={id} className={cls}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              {/* Fat transparent line so thin edges are still clickable. */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={styles.hit}
                onClick={() => onEdgeClick(id)}
              />
              {/*
                Labelled 40% of the way along rather than at the midpoint.
                Edges that cross at their centres — every diameter of the
                sample graph does — put their midpoints on the same pixel, so
                three weights printed as one unreadable "7". Now that weights
                can be set by hand, which chord weighs what has to be legible.
              */}
              <text
                x={a.x + (b.x - a.x) * LABEL_AT}
                y={a.y + (b.y - a.y) * LABEL_AT - 5}
                textAnchor="middle"
              >
                {edge.weight}
                {edge.manual ? '*' : ''}
              </text>
            </g>
          );
        })}

        {Object.keys(state.nodes).map((id) => {
          const node = positionOf(id);
          if (!node) return null;
          return (
            <g
              key={id}
              className={`${nodeClass(id)} ${draggable ? styles.draggable : ''}`}
              onPointerDown={(event) => beginDrag(id, event)}
              onPointerMove={continueDrag}
              onPointerUp={(event) => endDrag(id, event)}
              onPointerCancel={() => setDrag(null)}
            >
              <circle cx={node.x} cy={node.y} r={NODE_R} />
              <text x={node.x} y={node.y + 4} textAnchor="middle">
                {state.nodes[id].label}
              </text>
              {state.dist[id] !== undefined && Number.isFinite(state.dist[id]) && (
                <text x={node.x} y={node.y - NODE_R - 5} textAnchor="middle" className={styles.dist}>
                  {state.dist[id]}
                </text>
              )}
            </g>
          );
        })}

        {pending && pendingAnchor && (
          <text
            x={pendingAnchor.x}
            y={pendingAnchor.y + NODE_R + 18}
            textAnchor="middle"
            className={styles.pendingCaption}
          >
            {pending.caption}
          </text>
        )}
      </svg>
    </div>
  );
}
