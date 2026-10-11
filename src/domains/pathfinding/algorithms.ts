import { initGridState, manhattan, neighbours } from './engine';
import type { PathAlgorithm, PathInput, PathStep } from './types';

function definePath(config: {
  id: string;
  label: string;
  summary: string;
  complexity: { time: string; space: string };
  weighted: boolean;
  pseudocode: string[];
  generate(state: never, input: PathInput): Generator<PathStep>;
}): PathAlgorithm {
  return {
    id: config.id,
    label: config.label,
    summary: config.summary,
    complexity: config.complexity,
    weighted: config.weighted,
    pseudocode: config.pseudocode,
    initState: initGridState,
    generate: config.generate as PathAlgorithm['generate'],
  };
}

/** Walks parent links back from the end and emits the route, cheapest cell first. */
function* reconstruct(
  parent: Map<number, number>,
  start: number,
  end: number,
  weights: number[],
  line: number,
): Generator<PathStep> {
  const chain: number[] = [];
  let cursor: number | undefined = end;
  while (cursor !== undefined) {
    chain.push(cursor);
    cursor = parent.get(cursor);
  }
  chain.reverse();

  let cost = 0;
  for (const index of chain) {
    yield { kind: 'path', index, line };
    if (index !== start) cost += weights[index];
  }
  yield { kind: 'found', cost, line };
}

export const bfs = definePath({
  id: 'bfs',
  label: 'Breadth-First Search',
  summary: 'Expands outward in rings. Guarantees the fewest cells on unweighted grids.',
  complexity: { time: 'O(V + E)', space: 'O(V)' },
  weighted: false,
  pseudocode: [
    'queue = [start]',
    'while queue is not empty',
    '  cell = queue.shift()   // oldest first',
    '  if cell == end: reconstruct path',
    '  for each unseen neighbour: queue.push(neighbour)',
    'no route exists',
  ],
  *generate(_state, input) {
    const { rows, cols, walls, weights, start, end } = input;
    const size = rows * cols;
    // `seen` guards the queue, so each cell is enqueued — and visited — once.
    const seen = new Array<boolean>(size).fill(false);
    const parent = new Map<number, number>();

    const queue: number[] = [start];
    seen[start] = true;
    yield { kind: 'frontier', index: start, line: 0 };

    while (queue.length > 0) {
      const cell = queue.shift()!;
      yield { kind: 'visit', index: cell, line: 2 };

      if (cell === end) {
        yield* reconstruct(parent, start, end, weights, 3);
        return;
      }

      for (const next of neighbours(cell, rows, cols)) {
        if (walls[next] || seen[next]) continue;
        seen[next] = true;
        parent.set(next, cell);
        queue.push(next);
        yield { kind: 'frontier', index: next, line: 4 };
      }
    }
    yield { kind: 'exhausted', line: 5 };
  },
});

export const dfs = definePath({
  id: 'dfs',
  label: 'Depth-First Search',
  summary:
    'Follows one direction as far as it can before backtracking. Finds *a* route, rarely the shortest.',
  complexity: { time: 'O(V + E)', space: 'O(V)' },
  weighted: false,
  pseudocode: [
    'stack = [start]',
    'while stack is not empty',
    '  cell = stack.pop()   // newest first',
    '  if cell == end: reconstruct path',
    '  for each unseen neighbour: stack.push(neighbour)',
    'no route exists',
  ],
  *generate(_state, input) {
    const { rows, cols, walls, weights, start, end } = input;
    const size = rows * cols;
    const seen = new Array<boolean>(size).fill(false);
    const parent = new Map<number, number>();

    const stack: number[] = [start];
    seen[start] = true;
    yield { kind: 'frontier', index: start, line: 0 };

    while (stack.length > 0) {
      const cell = stack.pop()!;
      yield { kind: 'visit', index: cell, line: 2 };

      if (cell === end) {
        yield* reconstruct(parent, start, end, weights, 3);
        return;
      }

      for (const next of neighbours(cell, rows, cols)) {
        if (walls[next] || seen[next]) continue;
        seen[next] = true;
        parent.set(next, cell);
        stack.push(next);
        yield { kind: 'frontier', index: next, line: 4 };
      }
    }
    yield { kind: 'exhausted', line: 5 };
  },
});

/**
 * Dijkstra and A* differ only in how the next cell is chosen, so they share one
 * generator: A* adds a Manhattan heuristic to the priority, Dijkstra passes zero.
 */
function* weightedSearch(
  input: PathInput,
  heuristic: (index: number) => number,
): Generator<PathStep> {
  const { rows, cols, walls, weights, start, end } = input;
  const size = rows * cols;
  const dist = new Array<number>(size).fill(Infinity);
  const visited = new Array<boolean>(size).fill(false);
  const open = new Set<number>();
  const parent = new Map<number, number>();

  open.add(start);
  yield { kind: 'frontier', index: start, line: 0 };
  yield { kind: 'relax', index: start, dist: 0, prevDist: Infinity, line: 0 };
  dist[start] = 0;

  while (open.size > 0) {
    // Small grids: a linear scan is cheaper than maintaining a real heap.
    let cell = -1;
    let best = Infinity;
    for (const candidate of open) {
      const priority = dist[candidate] + heuristic(candidate);
      if (priority < best) {
        best = priority;
        cell = candidate;
      }
    }
    open.delete(cell);
    visited[cell] = true;
    yield { kind: 'visit', index: cell, line: 2 };

    if (cell === end) {
      yield* reconstruct(parent, start, end, weights, 3);
      return;
    }

    for (const next of neighbours(cell, rows, cols)) {
      if (walls[next] || visited[next]) continue;
      const candidate = dist[cell] + weights[next];
      if (candidate >= dist[next]) continue;

      if (!open.has(next)) {
        open.add(next);
        yield { kind: 'frontier', index: next, line: 4 };
      }
      yield { kind: 'relax', index: next, dist: candidate, prevDist: dist[next], line: 5 };
      dist[next] = candidate;
      parent.set(next, cell);
    }
  }
  yield { kind: 'exhausted', line: 6 };
}

export const dijkstra = definePath({
  id: 'dijkstra',
  label: "Dijkstra's Algorithm",
  summary:
    'Always expands the cheapest known cell. Handles weighted terrain and guarantees the cheapest route.',
  complexity: { time: 'O(V²) with a scan, O(E log V) with a heap', space: 'O(V)' },
  weighted: true,
  pseudocode: [
    'dist[start] = 0; open = {start}',
    'while open is not empty',
    '  cell = the open cell with the smallest dist',
    '  if cell == end: reconstruct path',
    '  for each neighbour not yet visited:',
    '    if dist[cell] + weight < dist[neighbour]: relax it',
    'no route exists',
  ],
  *generate(_state, input) {
    yield* weightedSearch(input, () => 0);
  },
});

export const astar = definePath({
  id: 'astar',
  label: 'A* Search',
  summary:
    'Dijkstra plus a distance-to-goal estimate, so it pushes toward the target instead of expanding evenly.',
  complexity: { time: 'O(E log V)', space: 'O(V)' },
  weighted: true,
  pseudocode: [
    'dist[start] = 0; open = {start}',
    'while open is not empty',
    '  cell = open cell minimising dist + heuristic',
    '  if cell == end: reconstruct path',
    '  for each neighbour not yet visited:',
    '    if dist[cell] + weight < dist[neighbour]: relax it',
    'no route exists',
  ],
  *generate(_state, input) {
    yield* weightedSearch(input, (index) => manhattan(index, input.end, input.cols));
  },
});

export const bellmanFord = definePath({
  id: 'bellman-ford',
  label: 'Bellman-Ford',
  summary:
    'Relaxes every edge in the grid, V-1 times over. Slower than Dijkstra, but it copes with negative weights.',
  complexity: { time: 'O(V · E)', space: 'O(V)' },
  weighted: true,
  pseudocode: [
    'dist[start] = 0',
    'repeat V-1 times (or until nothing changes):',
    '  for every edge (u, v):',
    '    if dist[u] + weight(v) < dist[v]: relax it',
    'walk the parent links back for the route',
  ],
  *generate(_state, input) {
    const { rows, cols, walls, weights, start, end } = input;
    const size = rows * cols;
    const dist = new Array<number>(size).fill(Infinity);
    const parent = new Map<number, number>();

    dist[start] = 0;
    yield { kind: 'frontier', index: start, line: 0 };
    yield { kind: 'relax', index: start, dist: 0, prevDist: Infinity, line: 0 };

    // Unlike Dijkstra there is no priority queue: every edge is swept, over and
    // over, until a full pass changes nothing.
    let scanCursor: number | null = null;
    for (let round = 0; round < size - 1; round++) {
      let changed = false;

      for (let cell = 0; cell < size; cell++) {
        if (walls[cell] || !Number.isFinite(dist[cell])) continue;
        yield { kind: 'scan', index: cell, prevIndex: scanCursor, line: 2 };
        scanCursor = cell;

        for (const next of neighbours(cell, rows, cols)) {
          if (walls[next]) continue;
          const candidate = dist[cell] + weights[next];
          if (candidate >= dist[next]) continue;

          if (!Number.isFinite(dist[next])) {
            yield { kind: 'frontier', index: next, line: 3 };
          }
          yield { kind: 'relax', index: next, dist: candidate, prevDist: dist[next], line: 3 };
          dist[next] = candidate;
          parent.set(next, cell);
          changed = true;
        }
      }
      if (!changed) break;
    }
    yield { kind: 'scan', index: null, prevIndex: scanCursor, line: 4 };

    if (!Number.isFinite(dist[end])) {
      yield { kind: 'exhausted', line: 4 };
      return;
    }
    yield* reconstruct(parent, start, end, weights, 4);
  },
});

export const greedyBestFirst = definePath({
  id: 'greedy-best-first',
  label: 'Greedy Best-First Search',
  summary:
    'Uses only the heuristic (distance to goal) to guide the search. Fast, but not guaranteed to find the shortest path.',
  complexity: { time: 'O(E log V)', space: 'O(V)' },
  weighted: true,
  pseudocode: [
    'open = {start}',
    'while open is not empty',
    '  cell = open cell minimising heuristic',
    '  if cell == end: reconstruct path',
    '  for each neighbour not yet visited:',
    '    if we have a new best path to neighbour: relax it',
    'no route exists',
  ],
  *generate(_state, input) {
    const { rows, cols, walls, weights, start, end } = input;
    const size = rows * cols;
    const dist = new Array<number>(size).fill(Infinity);
    const visited = new Array<boolean>(size).fill(false);
    const open = new Set<number>();
    const parent = new Map<number, number>();

    const heuristic = (index: number) => manhattan(index, end, cols);

    open.add(start);
    yield { kind: 'frontier', index: start, line: 0 };
    yield { kind: 'relax', index: start, dist: 0, prevDist: Infinity, line: 0 };
    dist[start] = 0;

    while (open.size > 0) {
      let cell = -1;
      let best = Infinity;
      for (const candidate of open) {
        const priority = heuristic(candidate); // ONLY heuristic
        if (priority < best) {
          best = priority;
          cell = candidate;
        }
      }
      open.delete(cell);
      visited[cell] = true;
      yield { kind: 'visit', index: cell, line: 2 };

      if (cell === end) {
        yield* reconstruct(parent, start, end, weights, 3);
        return;
      }

      for (const next of neighbours(cell, rows, cols)) {
        if (walls[next] || visited[next]) continue;
        const candidate = dist[cell] + weights[next];
        if (candidate >= dist[next]) continue;

        if (!open.has(next)) {
          open.add(next);
          yield { kind: 'frontier', index: next, line: 4 };
        }
        yield { kind: 'relax', index: next, dist: candidate, prevDist: dist[next], line: 5 };
        dist[next] = candidate;
        parent.set(next, cell);
      }
    }
    yield { kind: 'exhausted', line: 6 };
  },
});

export const PATH_ALGORITHMS: PathAlgorithm[] = [
  bfs,
  dfs,
  dijkstra,
  astar,
  greedyBestFirst,
  bellmanFord,
];

export const PATH_BY_ID: Record<string, PathAlgorithm> = Object.fromEntries(
  PATH_ALGORITHMS.map((a) => [a.id, a]),
);
