/** Single source of truth for the nav and the landing page's domain list. */
export interface DomainMeta {
  path: string;
  label: string;
  /** Nav cells are uppercase and cannot wrap, so a long label needs a short form. */
  navLabel?: string;
  /**
   * The URL prefix the nav cell lights up for, when the domain spans several
   * routes. Linear structures links to /linear/array but also lives at
   * /linear/stack, /linear/queue and /linear/linked-list; matching only the
   * link's own path left the nav blank on three of its four tabs.
   */
  section?: string;
  /**
   * What the domain lets you do, without counts. How many algorithms each one
   * holds is derived from its registry where it is shown, because a number
   * written into a sentence here went stale the first time a list grew.
   */
  blurb: string;
}

export const DOMAINS: DomainMeta[] = [
  {
    path: '/sorting',
    label: 'Sorting',
    blurb:
      'Seven families, a measured-against-predicted verdict, and a race mode that puts two on one clock.',
  },
  {
    path: '/searching',
    label: 'Searching',
    blurb:
      'Watch the candidate window close — and see which values were ruled out without being read.',
  },
  {
    path: '/pathfinding',
    label: 'Pathfinding',
    blurb:
      'Draw walls and heavy terrain, or pick a maze, then send BFS, Dijkstra or A* through it.',
  },
  {
    path: '/linear/array',
    label: 'Linear structures',
    navLabel: 'Linear',
    section: '/linear',
    blurb: 'Array, stack, queue and linked list. The stack actually grows upward.',
  },
  {
    path: '/trees',
    label: 'Trees',
    blurb: 'BST, AVL with rotations drawn in place, heaps, and the four traversals.',
  },
  {
    path: '/hashtables',
    label: 'Hash tables',
    blurb: 'Chaining against linear probing, on the same keys, side by side.',
  },
  {
    path: '/graphs',
    label: 'Graphs',
    blurb: 'Build a graph, weight the edges by hand, then traverse or find shortest paths.',
  },
  {
    path: '/ide',
    label: 'Code IDE',
    blurb: 'A multi-language scratchpad for writing and running your own code.',
  },
];
