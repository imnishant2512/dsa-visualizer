import type { TreeState } from './types';

export const NODE_RADIUS = 17;
export const X_SPACING = 46;
export const Y_SPACING = 62;

export interface TreeLayout {
  positions: Record<string, { x: number; y: number }>;
  /** Nodes not reachable from the root — mid-rotation, an edge is briefly detached. */
  detached: string[];
  width: number;
  height: number;
}

/**
 * In-order x-positioning: each node's x is its rank in an in-order walk, its y
 * its depth. Simple, deterministic and it never lets two nodes overlap.
 *
 * The walk covers *every* node, not only those reachable from the root. A
 * rotation detaches a subtree for a step or two, and those nodes used to be
 * dropped from the layout and parked in a row at the bottom-left under a 10px
 * caption — so the most instructive moment in the app, the pointer surgery
 * itself, rendered as circles jumping to an unrelated corner and back.
 *
 * Walking the fragments too works because a rotation preserves in-order
 * sequence: the values do not change places, only the edges between them do.
 * Ordering the fragments by their smallest value therefore lands every node at
 * very nearly the x it already had, so a detached subtree stays put and simply
 * dims — which is what "briefly unreferenced" actually looks like.
 */
export function layoutTree(state: TreeState): TreeLayout {
  const positions: Record<string, { x: number; y: number }> = {};
  const seen = new Set<string>();
  let column = 0;
  let maxDepth = 0;

  const walk = (id: string | null, depth: number) => {
    // The guard also protects against a malformed cycle rather than hanging.
    if (id === null || seen.has(id) || !state.nodes[id]) return;
    seen.add(id);
    const node = state.nodes[id];
    walk(node.leftId, depth + 1);
    positions[id] = { x: column * X_SPACING + NODE_RADIUS + 8, y: depth * Y_SPACING + NODE_RADIUS + 8 };
    column += 1;
    maxDepth = Math.max(maxDepth, depth);
    walk(node.rightId, depth + 1);
  };

  /*
   * Which nodes hang off the real root, established before anything is placed
   * — that is what makes a node "detached", and it is independent of where the
   * layout decides to draw it.
   */
  const reachable = new Set<string>();
  const mark = (id: string | null) => {
    if (id === null || reachable.has(id) || !state.nodes[id]) return;
    reachable.add(id);
    mark(state.nodes[id].leftId);
    mark(state.nodes[id].rightId);
  };
  mark(state.rootId);

  /*
   * Every fragment's own root is a node nothing points at. Walking all of them
   * in one pass, ordered by their smallest value, is what keeps a detached
   * subtree where it was: a rotation preserves in-order sequence, so the
   * values do not change places even while the edges between them do.
   */
  const referenced = new Set<string>();
  for (const node of Object.values(state.nodes)) {
    if (node.leftId) referenced.add(node.leftId);
    if (node.rightId) referenced.add(node.rightId);
  }

  const minValue = (id: string, guard = new Set<string>()): number => {
    if (!state.nodes[id] || guard.has(id)) return Infinity;
    guard.add(id);
    const node = state.nodes[id];
    return Math.min(
      node.value,
      node.leftId ? minValue(node.leftId, guard) : Infinity,
      node.rightId ? minValue(node.rightId, guard) : Infinity,
    );
  };

  const roots = Object.keys(state.nodes)
    .filter((id) => !referenced.has(id))
    .sort((a, b) => minValue(a) - minValue(b));

  // A fragment was hanging off something a step ago, so it starts a level down.
  for (const id of roots) walk(id, id === state.rootId ? 0 : 1);

  // Anything still unplaced is inside a cycle; draw it rather than lose it.
  for (const id of Object.keys(state.nodes)) if (!seen.has(id)) walk(id, 1);

  return {
    positions,
    detached: Object.keys(state.nodes).filter((id) => !reachable.has(id)),
    width: Math.max(column, 1) * X_SPACING + NODE_RADIUS * 2,
    height: (maxDepth + 1) * Y_SPACING + NODE_RADIUS * 2,
  };
}

export interface HeapLayout {
  positions: Array<{ x: number; y: number }>;
  width: number;
  height: number;
}

/** A heap is a complete binary tree, so positions come straight from the index. */
export function layoutHeap(count: number, width: number): HeapLayout {
  const levels = count === 0 ? 1 : Math.floor(Math.log2(count)) + 1;
  const positions = Array.from({ length: count }, (_, i) => {
    const depth = Math.floor(Math.log2(i + 1));
    const offset = i - (2 ** depth - 1);
    const slots = 2 ** depth;
    return {
      x: ((offset + 0.5) / slots) * width,
      y: depth * Y_SPACING + NODE_RADIUS + 8,
    };
  });
  return { positions, width, height: levels * Y_SPACING + NODE_RADIUS * 2 };
}

export function parentOfIndex(i: number): number {
  return Math.floor((i - 1) / 2);
}

/**
 * Subtree height, counted in nodes. Used for the balance factor an AVL run
 * turns on — which was computed inside the operation generator and thrown
 * away, so the number driving every rotation was never visible.
 */
export function heightOf(state: TreeState, id: string | null): number {
  if (id === null || !state.nodes[id]) return 0;
  const node = state.nodes[id];
  return 1 + Math.max(heightOf(state, node.leftId), heightOf(state, node.rightId));
}

/** Left height minus right height. Beyond ±1, AVL rotates. */
export function balanceOf(state: TreeState, id: string): number {
  const node = state.nodes[id];
  if (!node) return 0;
  return heightOf(state, node.leftId) - heightOf(state, node.rightId);
}
