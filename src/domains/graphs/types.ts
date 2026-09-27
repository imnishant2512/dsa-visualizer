export interface GraphNode {
  x: number;
  y: number;
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
  /**
   * Set by hand rather than derived from on-screen distance. A manual weight
   * no longer tracks the geometry, so moving a node leaves it alone — and it
   * is the only kind of weight that can break A*'s heuristic.
   */
  manual?: boolean;
}

/**
 * Flat maps rather than nested adjacency objects: adding or removing an edge is
 * then a single-entry insert or delete, which makes the inverse trivial.
 */
export interface GraphState {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
  /** Traversal results — all append-only, so all invert by popping. */
  visited: string[];
  frontier: string[];
  pathEdges: string[];
  dist: Record<string, number>;
  pointer: string | null;
  note: string | null;
}

export type GraphStep =
  | { kind: 'addNode'; id: string; node: GraphNode; line?: number }
  | { kind: 'removeNode'; id: string; node: GraphNode; line?: number }
  | { kind: 'addEdge'; id: string; edge: GraphEdge; line?: number }
  | { kind: 'removeEdge'; id: string; edge: GraphEdge; line?: number }
  | {
      kind: 'moveNode';
      id: string;
      x: number;
      y: number;
      prevX: number;
      prevY: number;
      line?: number;
    }
  | { kind: 'visit'; id: string; line?: number }
  | { kind: 'frontier'; id: string; line?: number }
  | { kind: 'relax'; id: string; dist: number; prevDist: number | undefined; line?: number }
  | { kind: 'pathEdge'; id: string; line?: number }
  | { kind: 'pointer'; id: string | null; prevId: string | null; line?: number }
  | {
      kind: 'clear';
      prevVisited: string[];
      prevFrontier: string[];
      prevPathEdges: string[];
      prevDist: Record<string, number>;
      prevPointer: string | null;
      prevNote: string | null;
      line?: number;
    }
  | { kind: 'note'; note: string | null; prevNote: string | null; line?: number };

export interface GraphArgs {
  x: number;
  y: number;
  nodeId: string | null;
  edgeId: string | null;
  from: string | null;
  to: string | null;
  /** For setting an edge's weight by hand. */
  weight?: number;
}

export const GRAPH_STAT_KEYS = ['visited', 'discovered', 'relaxations', 'edits'] as const;

/** On-screen pixels per unit of edge weight. */
export const DISTANCE_SCALE = 42;

export function euclidean(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * A derived weight: the straight-line distance, rounded *up*.
 *
 * This rounded to nearest, under a comment claiming it kept A*'s heuristic
 * admissible. It did not. A* is only guaranteed an optimal route when the
 * straight-line estimate never exceeds the true remaining cost, which holds
 * exactly when every edge weighs at least its own straight-line length.
 * Rounding to nearest put every edge of the default graph *under* it — a
 * 2.35-unit edge weighed 2 — so the estimate could overestimate before a
 * single weight was edited. Ceiling keeps every derived edge on the right
 * side of that line.
 */
export function weightBetween(a: GraphNode, b: GraphNode): number {
  return Math.max(1, Math.ceil(euclidean(a, b) / DISTANCE_SCALE - 1e-9));
}

export interface HeuristicViolation {
  edgeId: string;
  weight: number;
  straight: number;
}

/**
 * The first edge that could make A*'s straight-line estimate overestimate,
 * or null if there is none.
 *
 * By the triangle inequality, if every edge weighs at least its own
 * straight-line length, then no route can be cheaper than the straight line
 * to the goal and the estimate is admissible. One edge below that line breaks
 * the guarantee — and a hand-set weight is exactly how that happens.
 */
export function heuristicViolation(state: {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
}): HeuristicViolation | null {
  for (const [edgeId, edge] of Object.entries(state.edges)) {
    const a = state.nodes[edge.from];
    const b = state.nodes[edge.to];
    if (!a || !b) continue;
    const straight = euclidean(a, b) / DISTANCE_SCALE;
    if (edge.weight < straight - 1e-9) return { edgeId, weight: edge.weight, straight };
  }
  return null;
}
