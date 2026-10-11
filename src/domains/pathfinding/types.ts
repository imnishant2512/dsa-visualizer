import type { AlgorithmDefinition } from '../../engine/types';

/**
 * Grid state is stored as flat arrays indexed by `row * cols + col`.
 *
 * Flat beats nested here because every step produces a new state object: copying
 * one 1250-element array is trivial, copying 25 nested arrays is not.
 */
export interface GridState {
  rows: number;
  cols: number;
  /** Static for the duration of a run — walls are edited outside the engine. */
  walls: boolean[];
  weights: number[];
  start: number;
  end: number;
  /** Written by the replay. */
  visited: boolean[];
  frontier: boolean[];
  dist: number[];
  path: boolean[];
  /** Bellman-Ford's sweep cursor — a single cell, not a cumulative set. */
  scanning: number | null;
  found: boolean;
  pathCost: number | null;
}

export type PathStep =
  /** Dequeued and expanded. Never emitted twice for the same cell. */
  | { kind: 'visit'; index: number; line?: number }
  /**
   * Bellman-Ford sweeps the same cells many times, so it moves a cursor rather
   * than accumulating a visited set — that keeps the step exactly invertible.
   */
  | { kind: 'scan'; index: number | null; prevIndex: number | null; line?: number }
  /** Discovered and pushed onto the queue/stack/heap. */
  | { kind: 'frontier'; index: number; line?: number }
  /** A cheaper route to `index` was found. */
  | { kind: 'relax'; index: number; dist: number; prevDist: number; line?: number }
  /** Part of the final reconstructed route. */
  | { kind: 'path'; index: number; line?: number }
  | { kind: 'found'; cost: number; line?: number }
  | { kind: 'exhausted'; line?: number };

export interface PathInput {
  rows: number;
  cols: number;
  walls: boolean[];
  weights: number[];
  start: number;
  end: number;
}

export type PathAlgorithm = AlgorithmDefinition<PathInput, GridState, PathStep> & {
  /** Weighted algorithms respect cell weights; BFS/DFS ignore them. */
  weighted: boolean;
};

export const PATH_STAT_KEYS = ['visited', 'discovered', 'relaxations', 'pathCells'] as const;

export const HEAVY_WEIGHT = 8;

export function toIndex(row: number, col: number, cols: number): number {
  return row * cols + col;
}
