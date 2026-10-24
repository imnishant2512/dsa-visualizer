import type { StructureOperation } from '../../engine/useInteractiveStructure';
import { edgeBetween, neighboursOf } from './engine';
import type { GraphArgs, GraphState, GraphStep } from './types';
import { DISTANCE_SCALE, euclidean, heuristicViolation, weightBetween } from './types';

export type GraphOperation = StructureOperation<GraphState, GraphStep, GraphArgs>;

function* clearMarks(state: GraphState): Generator<GraphStep> {
  if (
    state.visited.length === 0 &&
    state.frontier.length === 0 &&
    state.pathEdges.length === 0 &&
    Object.keys(state.dist).length === 0 &&
    state.pointer === null &&
    state.note === null
  ) {
    return;
  }
  yield {
    kind: 'clear',
    prevVisited: [...state.visited],
    prevFrontier: [...state.frontier],
    prevPathEdges: [...state.pathEdges],
    prevDist: { ...state.dist },
    prevPointer: state.pointer,
    prevNote: state.note,
  };
}

function freshNodeId(state: GraphState): string {
  let max = -1;
  for (const id of Object.keys(state.nodes)) {
    const n = Number(id.slice(1));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `g${max + 1}`;
}

function nextLabel(state: GraphState): string {
  const used = new Set(Object.values(state.nodes).map((n) => n.label));
  for (let i = 0; i < 26 * 2; i++) {
    const label = i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + (i - 26))}2`;
    if (!used.has(label)) return label;
  }
  return `n${Object.keys(state.nodes).length}`;
}

/* ------------------------------------------------------------ graph edits */

export const addNode: GraphOperation = {
  id: 'add-node',
  label: () => 'Add node',
  pseudocode: ['addNode(x, y):', '  nodes[id] = { x, y }'],
  *generate(state, { x, y }) {
    yield* clearMarks(state);
    const id = freshNodeId(state);
    yield { kind: 'addNode', id, node: { x, y, label: nextLabel(state) }, line: 1 };
  },
};

export const removeNode: GraphOperation = {
  id: 'remove-node',
  label: () => 'Remove node',
  pseudocode: ['removeNode(id):', '  drop every edge touching it', '  delete nodes[id]'],
  *generate(state, { nodeId }) {
    yield* clearMarks(state);
    if (!nodeId || !state.nodes[nodeId]) return;

    // Edges must go first or the graph would keep dangling references.
    for (const [edgeId, edge] of Object.entries(state.edges)) {
      if (edge.from === nodeId || edge.to === nodeId) {
        yield { kind: 'removeEdge', id: edgeId, edge: { ...edge }, line: 1 };
      }
    }
    yield { kind: 'removeNode', id: nodeId, node: { ...state.nodes[nodeId] }, line: 2 };
  },
};

export const addEdge: GraphOperation = {
  id: 'add-edge',
  label: () => 'Add edge',
  pseudocode: [
    'addEdge(a, b):',
    '  weight = ceil(distance(a, b) / scale)',
    '  edges[id] = { a, b, weight }',
  ],
  *generate(state, { from, to }) {
    yield* clearMarks(state);
    if (!from || !to || from === to) return;
    if (!state.nodes[from] || !state.nodes[to]) return;
    if (edgeBetween(state, from, to)) {
      yield { kind: 'note', note: 'those nodes are already connected', prevNote: null, line: 0 };
      return;
    }
    yield {
      kind: 'addEdge',
      id: `${from}-${to}`,
      edge: { from, to, weight: weightBetween(state.nodes[from], state.nodes[to]) },
      line: 2,
    };
  },
};

export const removeEdge: GraphOperation = {
  id: 'remove-edge',
  label: () => 'Remove edge',
  pseudocode: ['removeEdge(id):', '  delete edges[id]'],
  *generate(state, { edgeId }) {
    yield* clearMarks(state);
    if (!edgeId || !state.edges[edgeId]) return;
    yield { kind: 'removeEdge', id: edgeId, edge: { ...state.edges[edgeId] }, line: 1 };
  },
};

/**
 * Set an edge's weight by hand. Expressed as remove-then-add of the same edge,
 * which the engine already inverts exactly, rather than as a new step kind.
 */
export const setEdgeWeight: GraphOperation = {
  id: 'set-weight',
  label: ({ weight }) => `Set weight ${weight ?? '?'}`,
  pseudocode: ['setWeight(edge, w):', '  edges[id].weight = w   // no longer tied to distance'],
  refuse: (state, { edgeId, weight }) =>
    !edgeId || !state.edges[edgeId]
      ? 'Pick an edge first.'
      : weight === undefined || !Number.isInteger(weight) || weight < 1
        ? 'A weight must be a whole number of at least 1.'
        : weight === state.edges[edgeId].weight
          ? 'That is already its weight.'
          : null,
  *generate(state, { edgeId, weight }) {
    yield* clearMarks(state);
    if (!edgeId || !state.edges[edgeId] || weight === undefined) return;
    const edge = state.edges[edgeId];
    yield { kind: 'removeEdge', id: edgeId, edge: { ...edge }, line: 1 };
    yield { kind: 'addEdge', id: edgeId, edge: { ...edge, weight, manual: true }, line: 1 };
  },
};

/**
 * Move a node, carrying its derived edge weights with it.
 *
 * A derived weight is a statement about distance, so it has to follow the
 * node; a manual one is a statement the user made, so it stays put. Left
 * alone, a derived edge dragged longer would fall under its own straight-line
 * length and quietly break A* — the move re-derives it instead.
 */
export const moveNode: GraphOperation = {
  id: 'move-node',
  label: () => 'Move node',
  pseudocode: [
    'moveNode(id, x, y):',
    '  nodes[id].position = (x, y)',
    '  re-derive the weight of each edge that was not set by hand',
  ],
  *generate(state, { nodeId, x, y }) {
    if (!nodeId || !state.nodes[nodeId]) return;
    const node = state.nodes[nodeId];
    if (node.x === x && node.y === y) return;
    yield { kind: 'moveNode', id: nodeId, x, y, prevX: node.x, prevY: node.y, line: 1 };

    const moved = { ...node, x, y };
    for (const [edgeId, edge] of Object.entries(state.edges)) {
      if (edge.manual || (edge.from !== nodeId && edge.to !== nodeId)) continue;
      const other = state.nodes[edge.from === nodeId ? edge.to : edge.from];
      if (!other) continue;
      const weight = weightBetween(moved, other);
      if (weight === edge.weight) continue;
      yield { kind: 'removeEdge', id: edgeId, edge: { ...edge }, line: 2 };
      yield { kind: 'addEdge', id: edgeId, edge: { ...edge, weight }, line: 2 };
    }
  },
};

/* -------------------------------------------------------------- traversal */

export const graphBfs: GraphOperation = {
  id: 'bfs',
  label: ({ from }) => `BFS from ${from ?? '?'}`,
  shortLabel: 'BFS',
  readOnly: true,
  pseudocode: [
    'bfs(start):',
    '  queue = [start]',
    '  while queue is not empty',
    '    node = queue.shift()',
    '    push every unseen neighbour',
  ],
  *generate(state, { from }) {
    yield* clearMarks(state);
    if (!from || !state.nodes[from]) return;

    const seen = new Set([from]);
    const queue = [from];
    let prevPointer: string | null = null;
    yield { kind: 'frontier', id: from, line: 1 };

    while (queue.length > 0) {
      const id = queue.shift()!;
      yield { kind: 'pointer', id, prevId: prevPointer, line: 3 };
      prevPointer = id;
      yield { kind: 'visit', id, line: 3 };
      for (const { to } of neighboursOf(state, id)) {
        if (seen.has(to)) continue;
        seen.add(to);
        queue.push(to);
        yield { kind: 'frontier', id: to, line: 4 };
      }
    }
    yield { kind: 'pointer', id: null, prevId: prevPointer, line: 4 };
  },
};

export const graphDfs: GraphOperation = {
  id: 'dfs',
  label: ({ from }) => `DFS from ${from ?? '?'}`,
  shortLabel: 'DFS',
  readOnly: true,
  pseudocode: [
    'dfs(start):',
    '  stack = [start]',
    '  while stack is not empty',
    '    node = stack.pop()',
    '    push every unseen neighbour',
  ],
  *generate(state, { from }) {
    yield* clearMarks(state);
    if (!from || !state.nodes[from]) return;

    const seen = new Set([from]);
    const stack = [from];
    let prevPointer: string | null = null;
    yield { kind: 'frontier', id: from, line: 1 };

    while (stack.length > 0) {
      const id = stack.pop()!;
      yield { kind: 'pointer', id, prevId: prevPointer, line: 3 };
      prevPointer = id;
      yield { kind: 'visit', id, line: 3 };
      for (const { to } of neighboursOf(state, id)) {
        if (seen.has(to)) continue;
        seen.add(to);
        stack.push(to);
        yield { kind: 'frontier', id: to, line: 4 };
      }
    }
    yield { kind: 'pointer', id: null, prevId: prevPointer, line: 4 };
  },
};

/**
 * Dijkstra and A* share one generator — the heuristic is the only difference.
 * A* is only safe while every edge weighs at least its straight-line length;
 * see `heuristicViolation`, and the fallback in `graphAstar`.
 */
function* shortestPath(
  state: GraphState,
  from: string,
  to: string | null,
  heuristic: (id: string) => number,
): Generator<GraphStep> {
  const dist: Record<string, number> = { [from]: 0 };
  const prevEdge: Record<string, { edgeId: string; from: string }> = {};
  const open = new Set([from]);
  const done = new Set<string>();
  let prevPointer: string | null = null;

  yield { kind: 'frontier', id: from, line: 1 };
  yield { kind: 'relax', id: from, dist: 0, prevDist: undefined, line: 1 };

  while (open.size > 0) {
    let best: string | null = null;
    let bestScore = Infinity;
    for (const candidate of open) {
      const score = dist[candidate] + heuristic(candidate);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best === null) break;

    open.delete(best);
    done.add(best);
    yield { kind: 'pointer', id: best, prevId: prevPointer, line: 2 };
    prevPointer = best;
    yield { kind: 'visit', id: best, line: 2 };

    if (to && best === to) break;

    for (const { edgeId, to: next } of neighboursOf(state, best)) {
      if (done.has(next)) continue;
      const candidate = dist[best] + state.edges[edgeId].weight;
      if (dist[next] !== undefined && candidate >= dist[next]) continue;

      if (!open.has(next)) {
        open.add(next);
        yield { kind: 'frontier', id: next, line: 3 };
      }
      yield { kind: 'relax', id: next, dist: candidate, prevDist: dist[next], line: 4 };
      dist[next] = candidate;
      prevEdge[next] = { edgeId, from: best };
    }
  }

  yield { kind: 'pointer', id: null, prevId: prevPointer, line: 4 };

  if (!to) return;
  if (dist[to] === undefined) {
    yield { kind: 'note', note: 'no route between those nodes', prevNote: null, line: 4 };
    return;
  }

  let cursor = to;
  const chain: string[] = [];
  while (cursor !== from) {
    const link = prevEdge[cursor];
    if (!link) break;
    chain.push(link.edgeId);
    cursor = link.from;
  }
  for (const edgeId of chain.reverse()) {
    yield { kind: 'pathEdge', id: edgeId, line: 4 };
  }
  yield { kind: 'note', note: `shortest path costs ${dist[to]}`, prevNote: null, line: 4 };
}

export const graphDijkstra: GraphOperation = {
  id: 'dijkstra',
  label: ({ from, to }) => `Dijkstra ${from ?? '?'} → ${to ?? '?'}`,
  shortLabel: 'Dijkstra',
  readOnly: true,
  pseudocode: [
    'dijkstra(start, goal):',
    '  dist[start] = 0; open = {start}',
    '  take the open node with the smallest dist',
    '  relax each neighbour: dist[n] = dist[node] + weight',
    '  walk the parent links back for the route',
  ],
  *generate(state, { from, to }) {
    yield* clearMarks(state);
    if (!from || !state.nodes[from]) return;
    yield* shortestPath(state, from, to, () => 0);
  },
};

export const graphAstar: GraphOperation = {
  id: 'astar',
  label: ({ from, to }) => `A* ${from ?? '?'} → ${to ?? '?'}`,
  shortLabel: 'A*',
  readOnly: true,
  pseudocode: [
    'a*(start, goal):',
    '  dist[start] = 0; open = {start}',
    '  take the open node minimising dist + straight-line estimate',
    '  relax each neighbour as in Dijkstra',
    '  walk the parent links back for the route',
  ],
  *generate(state, { from, to }) {
    yield* clearMarks(state);
    if (!from || !state.nodes[from]) return;
    if (!to || !state.nodes[to]) {
      yield { kind: 'note', note: 'A* needs a goal node — pick one', prevNote: null, line: 0 };
      return;
    }
    /*
     * Withdrawn, loudly, when its estimate could overestimate. A* with an
     * inadmissible heuristic still returns *a* route and still looks like it
     * worked — it just may not be the shortest one, which is the one thing a
     * shortest-path algorithm promises. Rather than hand back a possibly
     * wrong answer, this runs Dijkstra and says exactly which edge forced it.
     */
    const violation = heuristicViolation(state);
    if (violation) {
      const edge = state.edges[violation.edgeId];
      const a = state.nodes[edge.from]?.label ?? edge.from;
      const b = state.nodes[edge.to]?.label ?? edge.to;
      yield {
        kind: 'note',
        note: `A* withdrawn — edge ${a}–${b} weighs ${violation.weight}, less than its straight-line length of ${violation.straight.toFixed(1)}, so the estimate could overestimate. Running Dijkstra instead.`,
        prevNote: null,
        line: 0,
      };
      yield* shortestPath(state, from, to, () => 0);
      return;
    }
    const goal = state.nodes[to];
    yield* shortestPath(state, from, to, (id) =>
      state.nodes[id] ? euclidean(state.nodes[id], goal) / DISTANCE_SCALE : 0,
    );
  },
};

export const graphTopologicalSort: GraphOperation = {
  id: 'topological-sort',
  label: () => 'Topological Sort',
  shortLabel: 'Topological sort',
  readOnly: true,
  pseudocode: [
    'topologicalSort():',
    '  compute in-degrees for all nodes',
    '  queue = nodes with in-degree 0',
    '  while queue is not empty',
    '    node = queue.shift()',
    '    for each neighbour: decrement in-degree',
    '    if neighbour in-degree == 0: queue.push(neighbour)',
  ],
  *generate(state) {
    yield* clearMarks(state);
    const inDegree: Record<string, number> = {};
    for (const id of Object.keys(state.nodes)) inDegree[id] = 0;
    
    // Treat edges as directed from `edge.from` to `edge.to`
    for (const edge of Object.values(state.edges)) {
      inDegree[edge.to] = (inDegree[edge.to] || 0) + 1;
    }

    const queue: string[] = [];
    for (const id of Object.keys(state.nodes)) {
      if (inDegree[id] === 0) {
        queue.push(id);
        yield { kind: 'frontier', id, line: 2 };
      }
    }

    let prevPointer: string | null = null;
    let visitedCount = 0;

    while (queue.length > 0) {
      const id = queue.shift()!;
      yield { kind: 'pointer', id, prevId: prevPointer, line: 4 };
      prevPointer = id;
      yield { kind: 'visit', id, line: 4 };
      visitedCount++;

      for (const edge of Object.values(state.edges)) {
        if (edge.from === id) {
          const next = edge.to;
          inDegree[next]--;
          if (inDegree[next] === 0) {
            queue.push(next);
            yield { kind: 'frontier', id: next, line: 6 };
          }
        }
      }
    }
    yield { kind: 'pointer', id: null, prevId: prevPointer, line: 6 };
    if (visitedCount < Object.keys(state.nodes).length) {
      yield { kind: 'note', note: 'Graph has a cycle!', prevNote: null, line: 6 };
    }
  },
};

export const graphCycleDetection: GraphOperation = {
  id: 'cycle-detection',
  label: () => 'Cycle Detection',
  shortLabel: 'Cycle detection',
  readOnly: true,
  pseudocode: [
    'cycleDetection():',
    '  for each node:',
    '    if node is unvisited, dfs(node)',
    '  dfs(node, parent):',
    '    mark node as visiting (grey)',
    '    for each neighbour:',
    '      if neighbour is visiting and not parent: CYCLE FOUND',
    '      if neighbour is unvisited: dfs(neighbour, node)',
    '    mark node as fully visited (black)',
  ],
  *generate(state) {
    yield* clearMarks(state);
    
    const color: Record<string, 'white' | 'grey' | 'black'> = {};
    for (const id of Object.keys(state.nodes)) color[id] = 'white';
    let prevPointer: string | null = null;
    let cycleFound = false;

    function* dfs(id: string, parent: string | null): Generator<GraphStep> {
      color[id] = 'grey';
      yield { kind: 'frontier', id, line: 4 }; // frontier = grey
      
      yield { kind: 'pointer', id, prevId: prevPointer, line: 4 };
      prevPointer = id;

      for (const { edgeId, to: next } of neighboursOf(state, id)) {
        if (color[next] === 'grey') {
          if (next !== parent) {
            yield { kind: 'pathEdge', id: edgeId, line: 6 };
            yield { kind: 'note', note: 'Cycle detected!', prevNote: null, line: 6 };
            cycleFound = true;
            return;
          }
        } else if (color[next] === 'white') {
          yield* dfs(next, id);
          if (cycleFound) return;
        }
      }

      color[id] = 'black';
      yield { kind: 'visit', id, line: 8 }; // visit = black
    }

    for (const id of Object.keys(state.nodes)) {
      if (color[id] === 'white') {
        yield* dfs(id, null);
        if (cycleFound) break;
      }
    }
    
    yield { kind: 'pointer', id: null, prevId: prevPointer, line: 8 };
    if (!cycleFound) {
      yield { kind: 'note', note: 'No cycle found', prevNote: null, line: 8 };
    }
  },
};

export const graphPrim: GraphOperation = {
  id: 'prim',
  label: ({ from }) => `Prim's MST from ${from ?? '?'}`,
  shortLabel: "Prim's MST",
  readOnly: true,
  pseudocode: [
    'prim(start):',
    '  dist[start] = 0; open = {start}',
    '  while open is not empty:',
    '    node = open node with smallest dist',
    '    add node and its best edge to MST',
    '    for each unseen neighbour:',
    '      if weight < dist[neighbour]: relax it',
  ],
  *generate(state, { from }) {
    yield* clearMarks(state);
    if (!from || !state.nodes[from]) return;

    const dist: Record<string, number> = { [from]: 0 };
    const prevEdge: Record<string, string> = {};
    const open = new Set([from]);
    const done = new Set<string>();
    let prevPointer: string | null = null;

    yield { kind: 'frontier', id: from, line: 1 };
    yield { kind: 'relax', id: from, dist: 0, prevDist: undefined, line: 1 };

    let mstCost = 0;

    while (open.size > 0) {
      let best: string | null = null;
      let bestScore = Infinity;
      for (const candidate of open) {
        if (dist[candidate] < bestScore) {
          bestScore = dist[candidate];
          best = candidate;
        }
      }
      if (best === null) break;

      open.delete(best);
      done.add(best);
      
      yield { kind: 'pointer', id: best, prevId: prevPointer, line: 3 };
      prevPointer = best;
      yield { kind: 'visit', id: best, line: 4 };

      if (prevEdge[best]) {
        yield { kind: 'pathEdge', id: prevEdge[best], line: 4 };
        mstCost += state.edges[prevEdge[best]].weight;
      }

      for (const { edgeId, to: next } of neighboursOf(state, best)) {
        if (done.has(next)) continue;
        const weight = state.edges[edgeId].weight;
        if (dist[next] !== undefined && weight >= dist[next]) continue;

        if (!open.has(next)) {
          open.add(next);
          yield { kind: 'frontier', id: next, line: 5 };
        }
        yield { kind: 'relax', id: next, dist: weight, prevDist: dist[next], line: 6 };
        dist[next] = weight;
        prevEdge[next] = edgeId;
      }
    }
    yield { kind: 'pointer', id: null, prevId: prevPointer, line: 6 };
    yield { kind: 'note', note: `MST Cost: ${mstCost}`, prevNote: null, line: 6 };
  }
};

export const graphKruskal: GraphOperation = {
  id: 'kruskal',
  label: () => 'Kruskal\'s MST',
  shortLabel: "Kruskal's MST",
  readOnly: true,
  pseudocode: [
    'kruskal():',
    '  sort edges by weight',
    '  for each edge (u, v):',
    '    if u and v are in different sets:',
    '      union(u, v)',
    '      add edge to MST',
  ],
  *generate(state) {
    yield* clearMarks(state);

    const edges = Object.entries(state.edges).map(([id, edge]) => ({ id, ...edge }));
    edges.sort((a, b) => a.weight - b.weight);

    const parent: Record<string, string> = {};
    for (const id of Object.keys(state.nodes)) parent[id] = id;

    function find(i: string): string {
      if (parent[i] === i) return i;
      return find(parent[i]);
    }

    function union(i: string, j: string) {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        parent[rootI] = rootJ;
      }
    }

    let mstCost = 0;
    let prevPointer: string | null = null;

    for (const edge of edges) {
      const rootU = find(edge.from);
      const rootV = find(edge.to);

      yield { kind: 'pointer', id: edge.from, prevId: prevPointer, line: 2 };
      prevPointer = edge.from;

      if (rootU !== rootV) {
        union(edge.from, edge.to);
        mstCost += edge.weight;
        yield { kind: 'pathEdge', id: edge.id, line: 5 };
        // Visit nodes to show they are in MST
        yield { kind: 'visit', id: edge.from, line: 5 };
        yield { kind: 'visit', id: edge.to, line: 5 };
      }
    }
    
    yield { kind: 'pointer', id: null, prevId: prevPointer, line: 5 };
    yield { kind: 'note', note: `MST Cost: ${mstCost}`, prevNote: null, line: 5 };
  }
};

export const GRAPH_EDIT_OPERATIONS: GraphOperation[] = [
  addNode,
  addEdge,
  removeNode,
  removeEdge,
  setEdgeWeight,
  moveNode,
];
export const GRAPH_RUN_OPERATIONS: GraphOperation[] = [
  graphBfs,
  graphDfs,
  graphDijkstra,
  graphAstar,
  graphTopologicalSort,
  graphCycleDetection,
  graphPrim,
  graphKruskal,
];
export const GRAPH_OPERATIONS: GraphOperation[] = [
  ...GRAPH_EDIT_OPERATIONS,
  ...GRAPH_RUN_OPERATIONS,
];
