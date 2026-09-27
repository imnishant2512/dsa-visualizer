import type { StatCounters, StepEngine } from '../../engine/types';
import type { GraphState, GraphStep } from './types';
import { weightBetween } from './types';

export const graphEngine: StepEngine<GraphState, GraphStep> = {
  applyStep(state, step) {
    switch (step.kind) {
      case 'addNode':
        return { ...state, nodes: { ...state.nodes, [step.id]: { ...step.node } } };
      case 'removeNode': {
        const nodes = { ...state.nodes };
        delete nodes[step.id];
        return { ...state, nodes };
      }
      case 'addEdge':
        return { ...state, edges: { ...state.edges, [step.id]: { ...step.edge } } };
      case 'removeEdge': {
        const edges = { ...state.edges };
        delete edges[step.id];
        return { ...state, edges };
      }
      case 'moveNode':
        return {
          ...state,
          nodes: { ...state.nodes, [step.id]: { ...state.nodes[step.id], x: step.x, y: step.y } },
        };
      case 'visit':
        // Deliberately does not touch `frontier`: removing an id from the
        // middle of an ordered list cannot be undone without recording the
        // position. Both lists stay append-only, and the renderer treats a
        // frontier entry as spent once it also appears in `visited`.
        return { ...state, visited: [...state.visited, step.id] };
      case 'frontier':
        return { ...state, frontier: [...state.frontier, step.id] };
      case 'relax':
        return { ...state, dist: { ...state.dist, [step.id]: step.dist } };
      case 'pathEdge':
        return { ...state, pathEdges: [...state.pathEdges, step.id] };
      case 'pointer':
        return { ...state, pointer: step.id };
      case 'clear':
        return {
          ...state,
          visited: [],
          frontier: [],
          pathEdges: [],
          dist: {},
          pointer: null,
          note: null,
        };
      case 'note':
        return { ...state, note: step.note };
      default:
        return state;
    }
  },

  invertStep(state, step) {
    switch (step.kind) {
      case 'addNode': {
        const nodes = { ...state.nodes };
        delete nodes[step.id];
        return { ...state, nodes };
      }
      case 'removeNode':
        return { ...state, nodes: { ...state.nodes, [step.id]: { ...step.node } } };
      case 'addEdge': {
        const edges = { ...state.edges };
        delete edges[step.id];
        return { ...state, edges };
      }
      case 'removeEdge':
        return { ...state, edges: { ...state.edges, [step.id]: { ...step.edge } } };
      case 'moveNode':
        return {
          ...state,
          nodes: {
            ...state.nodes,
            [step.id]: { ...state.nodes[step.id], x: step.prevX, y: step.prevY },
          },
        };
      case 'visit':
        return { ...state, visited: state.visited.slice(0, -1) };
      case 'frontier':
        return { ...state, frontier: state.frontier.slice(0, -1) };
      case 'relax': {
        const dist = { ...state.dist };
        if (step.prevDist === undefined) delete dist[step.id];
        else dist[step.id] = step.prevDist;
        return { ...state, dist };
      }
      case 'pathEdge':
        return { ...state, pathEdges: state.pathEdges.slice(0, -1) };
      case 'pointer':
        return { ...state, pointer: step.prevId };
      case 'clear':
        return {
          ...state,
          visited: [...step.prevVisited],
          frontier: [...step.prevFrontier],
          pathEdges: [...step.prevPathEdges],
          dist: { ...step.prevDist },
          pointer: step.prevPointer,
          note: step.prevNote,
        };
      case 'note':
        return { ...state, note: step.prevNote };
      default:
        return state;
    }
  },

  statsDelta(step): Partial<StatCounters> {
    switch (step.kind) {
      case 'visit':
        return { visited: 1 };
      case 'frontier':
        return { discovered: 1 };
      case 'relax':
        return { relaxations: 1 };
      case 'addNode':
      case 'removeNode':
      case 'addEdge':
      case 'removeEdge':
      case 'moveNode':
        return { edits: 1 };
      default:
        return {};
    }
  },

  lineFor: (step) => step.line,
};

export function emptyGraph(): GraphState {
  return {
    nodes: {},
    edges: {},
    visited: [],
    frontier: [],
    pathEdges: [],
    dist: {},
    pointer: null,
    note: null,
  };
}

/** A small ring-plus-chords graph, so the page opens with something to run. */
export function sampleGraph(width = 720, height = 340): GraphState {
  const state = emptyGraph();
  const count = 8;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.38;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    state.nodes[`g${i}`] = {
      x: Math.round(cx + radius * Math.cos(angle)),
      y: Math.round(cy + radius * Math.sin(angle)),
      label: String.fromCharCode(65 + i),
    };
  }

  const connect = (a: number, b: number) => {
    const from = `g${a}`;
    const to = `g${b}`;
    state.edges[`${from}-${to}`] = {
      from,
      to,
      weight: weightBetween(state.nodes[from], state.nodes[to]),
    };
  };

  for (let i = 0; i < count; i++) connect(i, (i + 1) % count);
  connect(0, 4);
  connect(1, 5);
  connect(2, 6);

  return state;
}

export function neighboursOf(state: GraphState, id: string): Array<{ edgeId: string; to: string }> {
  const out: Array<{ edgeId: string; to: string }> = [];
  for (const [edgeId, edge] of Object.entries(state.edges)) {
    if (edge.from === id) out.push({ edgeId, to: edge.to });
    else if (edge.to === id) out.push({ edgeId, to: edge.from });
  }
  // Deterministic order keeps generated runs reproducible.
  return out.sort((a, b) => a.to.localeCompare(b.to));
}

export function edgeBetween(state: GraphState, a: string, b: string): string | null {
  for (const [id, edge] of Object.entries(state.edges)) {
    if ((edge.from === a && edge.to === b) || (edge.from === b && edge.to === a)) return id;
  }
  return null;
}
