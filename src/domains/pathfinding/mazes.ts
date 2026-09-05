import { mulberry32 } from '../../shared/utils/random';
import { HEAVY_WEIGHT, toIndex } from './types';

export interface MazeGrid {
  walls: boolean[];
  weights: number[];
}

export interface MazeSpec {
  rows: number;
  cols: number;
  /** Never walled — the run would be trivially impossible otherwise. */
  start: number;
  end: number;
  seed: number;
}

/**
 * The five terrain presets.
 *
 * Random noise used to be the only one, and it is the least interesting of the
 * five: uniformly scattered walls give every algorithm a short, similar route
 * and never separate them. The structured ones each isolate something —
 * corridors punish depth-first, rooms reward a heuristic, swamp is the only
 * one where an unweighted algorithm visibly takes the wrong route.
 */
export type MazeId = 'division' | 'corridors' | 'rooms' | 'swamp' | 'noise';

export const MAZES: Array<{ id: MazeId; label: string; blurb: string }> = [
  {
    id: 'division',
    label: 'Recursive division',
    blurb: 'A perfect maze — exactly one route between any two open cells.',
  },
  {
    id: 'corridors',
    label: 'Corridors',
    blurb: 'Long horizontal runs with two gaps each; depth-first goes a long way wrong.',
  },
  {
    id: 'rooms',
    label: 'Rooms & doors',
    blurb: 'Open chambers joined by single-cell doors, where a heuristic pays off.',
  },
  {
    id: 'swamp',
    label: 'Swamp',
    blurb: 'Few walls, wide patches of heavy terrain — the case that separates BFS from Dijkstra.',
  },
  { id: 'noise', label: 'Random noise', blurb: 'Scattered walls and weights, no structure.' },
];

function blank(spec: MazeSpec): MazeGrid {
  const size = spec.rows * spec.cols;
  return { walls: new Array(size).fill(false), weights: new Array(size).fill(1) };
}

/** Start and end must stay reachable, so nothing is ever placed on them. */
function protect(grid: MazeGrid, spec: MazeSpec): MazeGrid {
  for (const index of [spec.start, spec.end]) {
    grid.walls[index] = false;
    grid.weights[index] = 1;
  }
  return grid;
}

function border(grid: MazeGrid, spec: MazeSpec): void {
  const { rows, cols } = spec;
  for (let c = 0; c < cols; c++) {
    grid.walls[toIndex(0, c, cols)] = true;
    grid.walls[toIndex(rows - 1, c, cols)] = true;
  }
  for (let r = 0; r < rows; r++) {
    grid.walls[toIndex(r, 0, cols)] = true;
    grid.walls[toIndex(r, cols - 1, cols)] = true;
  }
}

/**
 * Recursive division, on a parity scheme.
 *
 * Walls are only ever drawn on even rows and columns, and the gap through a
 * wall is only ever on an odd one. Without that constraint — placing the gap
 * anywhere in the span — a later perpendicular wall can land exactly on an
 * earlier wall's gap and seal a chamber off, which is why the unconstrained
 * version left the goal unreachable on roughly half of all seeds. With it,
 * every chamber keeps a gap that no subsequent wall can occupy, so the maze is
 * connected by construction.
 */
function division(spec: MazeSpec): MazeGrid {
  const grid = blank(spec);
  const rnd = mulberry32(spec.seed);
  const { rows, cols } = spec;
  border(grid, spec);

  const pick = (values: number[]): number | null =>
    values.length === 0 ? null : values[Math.floor(rnd() * values.length)];

  const range = (from: number, to: number, parity: 0 | 1): number[] => {
    const out: number[] = [];
    for (let v = from; v <= to; v++) if (v % 2 === parity) out.push(v);
    return out;
  };

  const divide = (r1: number, c1: number, r2: number, c2: number, depth: number): void => {
    if (depth > 6 || r2 - r1 < 2 || c2 - c1 < 2) return;
    const height = r2 - r1;
    const width = c2 - c1;
    const horizontal = width < height ? true : width > height ? false : rnd() < 0.5;

    if (horizontal) {
      const wallRow = pick(range(r1 + 1, r2 - 1, 0));
      const gap = pick(range(c1, c2, 1));
      if (wallRow === null || gap === null) return;
      for (let c = c1; c <= c2; c++) if (c !== gap) grid.walls[toIndex(wallRow, c, cols)] = true;
      divide(r1, c1, wallRow - 1, c2, depth + 1);
      divide(wallRow + 1, c1, r2, c2, depth + 1);
    } else {
      const wallCol = pick(range(c1 + 1, c2 - 1, 0));
      const gap = pick(range(r1, r2, 1));
      if (wallCol === null || gap === null) return;
      for (let r = r1; r <= r2; r++) if (r !== gap) grid.walls[toIndex(r, wallCol, cols)] = true;
      divide(r1, c1, r2, wallCol - 1, depth + 1);
      divide(r1, wallCol + 1, r2, c2, depth + 1);
    }
  };

  divide(1, 1, rows - 2, cols - 2, 0);
  return protect(grid, spec);
}

function corridors(spec: MazeSpec): MazeGrid {
  const grid = blank(spec);
  const rnd = mulberry32(spec.seed);
  const { rows, cols } = spec;

  for (let r = 2; r < rows - 1; r += 3) {
    // Two gaps per wall, so there is always more than one way through and the
    // maze does not collapse into a single forced route.
    const gapA = 3 + Math.floor(rnd() * Math.max(1, cols - 8));
    const gapB = 3 + Math.floor(rnd() * Math.max(1, cols - 8));
    for (let c = 1; c < cols - 1; c++) {
      if (Math.abs(c - gapA) > 1 && Math.abs(c - gapB) > 1) grid.walls[toIndex(r, c, cols)] = true;
    }
  }
  return protect(grid, spec);
}

/**
 * Open chambers on a grid, joined by single-cell doors.
 *
 * A door is punched per *boundary segment* — once between each pair of
 * neighbouring rooms — not once per full-length wall. One door per wall looks
 * the same but connects almost nothing: a vertical wall's single door sits in
 * one horizontal band, so the columns either side of it are joined only in
 * that band, and the room graph comes apart. Doing it per segment makes the
 * room adjacency a full grid, which is connected by construction.
 */
function rooms(spec: MazeSpec): MazeGrid {
  const grid = blank(spec);
  const rnd = mulberry32(spec.seed);
  const { rows, cols } = spec;
  border(grid, spec);

  const ROOM_W = 9;
  const ROOM_H = 6;

  const wallCols: number[] = [];
  for (let c = ROOM_W; c < cols - 1; c += ROOM_W) wallCols.push(c);
  const wallRows: number[] = [];
  for (let r = ROOM_H; r < rows - 1; r += ROOM_H) wallRows.push(r);

  for (const c of wallCols) for (let r = 1; r < rows - 1; r++) grid.walls[toIndex(r, c, cols)] = true;
  for (const r of wallRows) for (let c = 1; c < cols - 1; c++) grid.walls[toIndex(r, c, cols)] = true;

  /** The open spans a wall line is divided into by the perpendicular walls. */
  const spans = (limit: number, dividers: number[]): Array<[number, number]> => {
    const edges = [0, ...dividers, limit - 1];
    const out: Array<[number, number]> = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const from = edges[i] + 1;
      const to = edges[i + 1] - 1;
      if (to >= from) out.push([from, to]);
    }
    return out;
  };

  for (const c of wallCols) {
    for (const [from, to] of spans(rows, wallRows)) {
      const door = from + Math.floor(rnd() * (to - from + 1));
      grid.walls[toIndex(door, c, cols)] = false;
    }
  }
  for (const r of wallRows) {
    for (const [from, to] of spans(cols, wallCols)) {
      const door = from + Math.floor(rnd() * (to - from + 1));
      grid.walls[toIndex(r, door, cols)] = false;
    }
  }

  return protect(grid, spec);
}

function swamp(spec: MazeSpec): MazeGrid {
  const grid = blank(spec);
  const rnd = mulberry32(spec.seed);
  const { rows, cols } = spec;

  // Blobs rather than scattered cells: a wide patch is what forces a weighted
  // algorithm to route around, where isolated heavy cells are just stepped on.
  const patches = Math.max(3, Math.floor((rows * cols) / 120));
  for (let p = 0; p < patches; p++) {
    const cr = Math.floor(rnd() * rows);
    const cc = Math.floor(rnd() * cols);
    const radius = 2 + Math.floor(rnd() * 3);
    for (let r = cr - radius; r <= cr + radius; r++) {
      for (let c = cc - radius; c <= cc + radius; c++) {
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
        if (Math.abs(r - cr) + Math.abs(c - cc) > radius) continue;
        grid.weights[toIndex(r, c, cols)] = HEAVY_WEIGHT;
      }
    }
  }
  for (let i = 0; i < grid.walls.length; i++) {
    if (rnd() < 0.05) grid.walls[i] = true;
  }
  return protect(grid, spec);
}

function noise(spec: MazeSpec): MazeGrid {
  const grid = blank(spec);
  const rnd = mulberry32(spec.seed);
  for (let i = 0; i < grid.walls.length; i++) {
    const roll = rnd();
    if (roll < 0.24) grid.walls[i] = true;
    else if (roll < 0.34) grid.weights[i] = HEAVY_WEIGHT;
  }
  return protect(grid, spec);
}

const GENERATORS: Record<MazeId, (spec: MazeSpec) => MazeGrid> = {
  division,
  corridors,
  rooms,
  swamp,
  noise,
};

export function generateMaze(id: MazeId, spec: MazeSpec): MazeGrid {
  return GENERATORS[id](spec);
}
