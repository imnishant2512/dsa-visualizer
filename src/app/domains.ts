/** Single source of truth for the nav and the landing page cards. */
export interface DomainMeta {
  path: string;
  label: string;
  /** Nav cells are uppercase and cannot wrap, so a long label needs a short form. */
  navLabel?: string;
  blurb: string;
  icon: string;
}

export const DOMAINS: DomainMeta[] = [
  {
    path: '/sorting',
    label: 'Sorting',
    blurb: '17 algorithms, step-by-step, with a side-by-side race mode.',
    icon: '📊',
  },
  {
    path: '/searching',
    label: 'Searching',
    blurb: 'Linear, binary, jump, interpolation and exponential search.',
    icon: '🔍',
  },
  {
    path: '/pathfinding',
    label: 'Pathfinding',
    blurb: 'BFS, DFS, Dijkstra, A* and Bellman-Ford over a grid you draw on.',
    icon: '🗺️',
  },
  {
    path: '/linear/array',
    label: 'Linear structures',
    navLabel: 'Linear',
    blurb: 'Array, stack, queue and linked list operations.',
    icon: '📦',
  },
  {
    path: '/trees',
    label: 'Trees',
    blurb: 'BST, AVL rotations, heaps and the four traversals.',
    icon: '🌳',
  },
  {
    path: '/hashtables',
    label: 'Hash tables',
    blurb: 'Chaining vs linear probing, collisions and tombstones.',
    icon: '🗄️',
  },
  {
    path: '/graphs',
    label: 'Graphs',
    blurb: 'Build a graph, then traverse it or find shortest paths.',
    icon: '🕸️',
  },
  {
    path: '/ide',
    label: 'Code IDE',
    blurb: 'Multi-language scratchpad to write and test your own code.',
    icon: '💻',
  },
];
