import type { GridState, PathStep } from './types';

function coords(index: number, cols: number): string {
  return `(${Math.floor(index / cols)}, ${index % cols})`;
}

/**
 * One plain-English sentence for the step the cursor is on.
 *
 * A pathfinding run is thousands of near-identical colour changes, and the
 * distinction that matters — discovered versus visited versus relaxed — is
 * carried entirely by two similar pastels. This says which one just happened
 * and, for a relaxation, what the number actually changed to.
 */
export function narratePathStep(step: PathStep | null, state: GridState): string {
  if (!step) return 'Draw on the grid, then press play.';
  const at = (index: number) => coords(index, state.cols);

  switch (step.kind) {
    case 'visit':
      return `Visited ${at(step.index)} — it is now settled, and will not be revisited.`;
    case 'frontier':
      return `Discovered ${at(step.index)} and added it to the frontier.`;
    case 'scan':
      return step.index === null
        ? 'Finished scanning that cell’s neighbours.'
        : `Scanning the neighbours of ${at(step.index)}.`;
    case 'relax':
      return `Found a cheaper route to ${at(step.index)} — cost ${step.dist}, down from ${
        step.prevDist === Infinity ? 'unreached' : step.prevDist
      }.`;
    case 'path':
      return `${at(step.index)} is on the final route.`;
    case 'found':
      return `Reached the goal — total cost ${step.cost}.`;
    case 'exhausted':
      return 'Every reachable cell has been visited and the goal was not among them.';
  }
}
