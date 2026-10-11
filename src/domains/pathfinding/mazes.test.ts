import { describe, expect, it } from 'vitest';
import { MAZES, generateMaze, type MazeId } from './mazes';
import { HEAVY_WEIGHT, toIndex } from './types';
import { bfs } from './algorithms';
import { pathEngine } from './engine';
import { buildSteps } from '../../engine/player';

const ROWS = 16;
const COLS = 40;
const SPEC = { rows: ROWS, cols: COLS, start: toIndex(8, 5, COLS), end: toIndex(8, 34, COLS) };

/** Runs BFS over the maze and reports whether it reached the goal. */
function reachable(walls: boolean[], weights: number[]): boolean {
  const { steps, initialState } = buildSteps(bfs, { ...SPEC, walls, weights });
  let state = initialState;
  for (const step of steps) state = pathEngine.applyStep(state, step);
  return state.found;
}

describe.each(MAZES.map((maze) => maze.id))('%s maze', (id: MazeId) => {
  const grid = generateMaze(id, { ...SPEC, seed: 2024 });

  it('never walls the start or the goal', () => {
    // Otherwise the run is trivially impossible and says nothing about the
    // algorithm — the grid just refuses to pose a question.
    expect(grid.walls[SPEC.start]).toBe(false);
    expect(grid.walls[SPEC.end]).toBe(false);
  });

  it('produces a grid of exactly the right size', () => {
    expect(grid.walls).toHaveLength(ROWS * COLS);
    expect(grid.weights).toHaveLength(ROWS * COLS);
  });

  it('is deterministic for a seed', () => {
    const again = generateMaze(id, { ...SPEC, seed: 2024 });
    expect(again.walls).toEqual(grid.walls);
    expect(again.weights).toEqual(grid.weights);
  });

  it('uses only the two defined costs', () => {
    for (const weight of grid.weights) expect([1, HEAVY_WEIGHT]).toContain(weight);
  });
});

describe('maze character', () => {
  it('leaves a route through on most seeds', () => {
    /*
     * A maze that walls the goal off is not wrong — recursive division on an
     * unlucky seed can do it — but it should be the exception, or the page
     * mostly demonstrates failure. Ten seeds per preset, majority reachable.
     */
    for (const { id } of MAZES) {
      const solved = Array.from({ length: 10 }, (_, seed) => {
        const grid = generateMaze(id, { ...SPEC, seed: seed + 1 });
        return reachable(grid.walls, grid.weights);
      }).filter(Boolean).length;
      expect(solved, `${id} reachable on ${solved}/10 seeds`).toBeGreaterThanOrEqual(6);
    }
  });

  it('gives swamp real terrain rather than scattered heavy cells', () => {
    // The whole point of swamp is that a weighted algorithm routes around it,
    // which needs contiguous patches — isolated heavy cells get stepped on.
    const grid = generateMaze('swamp', { ...SPEC, seed: 7 });
    const heavy = grid.weights.filter((weight) => weight > 1).length;
    expect(heavy).toBeGreaterThan(30);
  });

  it('gives recursive division a border', () => {
    const grid = generateMaze('division', { ...SPEC, seed: 3 });
    for (let c = 0; c < COLS; c++) expect(grid.walls[toIndex(0, c, COLS)]).toBe(true);
  });
});
