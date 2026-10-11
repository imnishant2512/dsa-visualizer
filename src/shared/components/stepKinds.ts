/**
 * The shared vocabulary for "what kind of thing is this step".
 *
 * Every domain's Step union is its own, but the *presentation* of a step —
 * which colour it gets in the tick strip, what the tag above the scrubber
 * says — has to be one vocabulary or the run bar would need to know about
 * eight different step types. So each domain supplies a `visualKind(step)`
 * mapping onto this union, and the run bar stays domain-blind.
 *
 * The names line up one-to-one with the `--v-*` tokens, which is what lets
 * `colorForKind` be a formula rather than a table.
 */
export type VisualKind =
  'compare' | 'swap' | 'write' | 'read' | 'bucket' | 'sorted' | 'found' | 'idle';

/** Lowercase because it renders inside a tag, not as a sentence. */
export const KIND_LABEL: Record<VisualKind, string> = {
  compare: 'compare',
  swap: 'swap',
  write: 'write',
  read: 'read',
  bucket: 'bucket',
  sorted: 'final',
  found: 'found',
  idle: 'context',
};

export function colorForKind(kind: VisualKind): string {
  return `var(--v-${kind})`;
}

/**
 * The tag sits on a filled swatch of the kind's own colour, so the text on it
 * has to flip. Every colour in the ramp except `idle` is a light one.
 */
export function textOnKind(kind: VisualKind): string {
  return kind === 'idle' ? 'var(--text)' : 'var(--bg)';
}

/**
 * Step-kind names, across every domain, grouped by what they do to the
 * structure rather than by which domain they came from.
 *
 * Sorting supplies its own mapping (see `domains/sorting/narrate.ts`) because
 * it also needs a sentence per step. The rest are named consistently enough —
 * `visit`, `relax`, `probe`, `place` — that one table covers them, and a
 * domain that later wants a different reading only has to stop calling this.
 */
const NAME_TO_KIND: Record<string, VisualKind> = {
  // Looking at something without changing it.
  read: 'read',
  probe: 'read',
  visit: 'read',
  scan: 'read',

  compare: 'compare',
  swap: 'swap',

  // Anything that mutates the structure.
  set: 'write',
  setValue: 'write',
  setNext: 'write',
  setHead: 'write',
  setRoot: 'write',
  insertAt: 'write',
  removeAt: 'write',
  place: 'write',
  relax: 'write',
  push: 'write',
  pop: 'write',
  createNode: 'write',
  deleteNode: 'write',
  addNode: 'write',
  removeNode: 'write',
  addEdge: 'write',
  removeEdge: 'write',

  // Queued, bucketed, or contended for.
  frontier: 'bucket',
  bucketPlace: 'bucket',
  collision: 'bucket',

  // Settled — this will not move again.
  markSorted: 'sorted',
  path: 'sorted',
  pathEdge: 'sorted',

  found: 'found',
};

/** Anything unlisted is context — a note, a pointer move, a range change. */
export function visualKindByName(name: string): VisualKind {
  return NAME_TO_KIND[name] ?? 'idle';
}

/** Nothing to paint. A module-level constant so it is a stable memo dependency. */
export const NO_STEPS: readonly { kind: string }[] = [];

export function stepKindsByName(steps: readonly { kind: string }[]): VisualKind[] {
  return steps.map((step) => visualKindByName(step.kind));
}
