import type { GraphState, GraphStep } from './types';

/**
 * One plain-English sentence for the step the cursor is on.
 *
 * A shortest-path run is a string of relaxations, and the number that changed
 * is drawn in 11px above a node that is also changing colour. This names the
 * node, the new distance, and what it replaced.
 */
export function narrateGraphStep(step: GraphStep | null, state: GraphState): string {
  if (!step) return 'Pick a start and a goal, then run a traversal.';
  const label = (id: string) => state.nodes[id]?.label ?? id;
  const edgeName = (from: string, to: string) => `${label(from)}–${label(to)}`;

  switch (step.kind) {
    case 'addNode':
      return `Added node ${step.node.label}.`;
    case 'removeNode':
      return `Removed node ${step.node.label}.`;
    case 'addEdge':
      return step.edge.manual
        ? `Edge ${edgeName(step.edge.from, step.edge.to)} now weighs ${step.edge.weight}, set by hand.`
        : `Connected ${edgeName(step.edge.from, step.edge.to)}, weight ${step.edge.weight} from its length.`;
    case 'removeEdge':
      return `Removed edge ${edgeName(step.edge.from, step.edge.to)}.`;
    case 'moveNode':
      return `Moved ${label(step.id)}; edges not set by hand take their weight from the new distance.`;
    case 'visit':
      return `Settled ${label(step.id)} — its distance is final.`;
    case 'frontier':
      return `Discovered ${label(step.id)} and added it to the frontier.`;
    case 'relax':
      return step.prevDist === undefined
        ? `First route to ${label(step.id)}: cost ${step.dist}.`
        : `Cheaper route to ${label(step.id)}: ${step.dist}, down from ${step.prevDist}.`;
    case 'pathEdge': {
      const edge = state.edges[step.id];
      return edge
        ? `${edgeName(edge.from, edge.to)} is on the route.`
        : 'Traced the route one edge back.';
    }
    case 'pointer':
      return step.id === null ? 'Released the cursor.' : `Working from ${label(step.id)}.`;
    case 'clear':
      return 'Cleared the marks from the last run.';
    case 'note':
      return step.note ?? '';
  }
}
