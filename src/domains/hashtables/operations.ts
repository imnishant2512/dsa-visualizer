import type { StructureOperation } from '../../engine/useInteractiveStructure';
import type { HashArgs, HashState, HashStep } from './types';
import { hashOf } from './types';

export type HashOperation = StructureOperation<HashState, HashStep, HashArgs>;

function* clearMarks(state: HashState): Generator<HashStep> {
  if (
    state.hashKey === null &&
    state.cursor === null &&
    state.collided.length === 0 &&
    state.foundAt === null &&
    state.note === null
  ) {
    return;
  }
  yield {
    kind: 'clear',
    prevKey: state.hashKey,
    prevCursor: state.cursor,
    prevCollided: [...state.collided],
    prevFound: state.foundAt,
    prevNote: state.note,
  };
}

const CHAINING_INSERT = [
  'insert(key):',
  '  bucket = hash(key)',
  '  if the bucket already has entries: collision',
  '  append the key to that bucket’s chain',
];

const PROBING_INSERT = [
  'insert(key):',
  '  bucket = hash(key)',
  '  while the bucket is occupied:',
  '    collision — try the next bucket (linear probe)',
  '  place the key in the first free or tombstoned slot',
];

export const hashInsert: HashOperation = {
  id: 'insert',
  label: ({ key }) => `Insert ${key}`,
  // Both strategies share this operation; the panel shows whichever applies.
  pseudocode: PROBING_INSERT,
  *generate(state, { key }) {
    yield* clearMarks(state);
    const home = hashOf(key, state.size);
    yield { kind: 'hash', key, bucket: home, prevKey: null, prevCursor: null, line: 1 };

    if (state.strategy === 'chaining') {
      const chain = state.buckets[home];
      if (chain.some((slot) => slot.key === key && slot.state === 'occupied')) {
        yield { kind: 'note', note: `${key} is already in the table`, prevNote: null, line: 3 };
        return;
      }
      if (chain.length > 0) yield { kind: 'collision', bucket: home, line: 2 };
      yield { kind: 'place', bucket: home, pos: chain.length, key, line: 3 };
      yield { kind: 'found', at: { bucket: home, pos: chain.length }, prevAt: null, line: 3 };
      return;
    }

    let firstTombstone: number | null = null;
    for (let attempt = 0; attempt < state.size; attempt++) {
      const bucket = (home + attempt) % state.size;
      if (attempt > 0) {
        yield {
          kind: 'probe',
          bucket,
          attempt,
          prevCursor: (home + attempt - 1) % state.size,
          line: 3,
        };
      }
      const slot = state.buckets[bucket][0];

      if (slot === undefined) {
        const target = firstTombstone ?? bucket;
        yield { kind: 'place', bucket: target, pos: 0, key, line: 4 };
        yield { kind: 'found', at: { bucket: target, pos: 0 }, prevAt: null, line: 4 };
        return;
      }
      if (slot.state === 'tombstone') {
        if (firstTombstone === null) firstTombstone = bucket;
        continue;
      }
      if (slot.key === key) {
        yield { kind: 'note', note: `${key} is already in the table`, prevNote: null, line: 4 };
        return;
      }
      yield { kind: 'collision', bucket, line: 2 };
    }

    if (firstTombstone !== null) {
      yield { kind: 'place', bucket: firstTombstone, pos: 0, key, line: 4 };
      yield { kind: 'found', at: { bucket: firstTombstone, pos: 0 }, prevAt: null, line: 4 };
      return;
    }
    yield { kind: 'note', note: 'table is full', prevNote: null, line: 4 };
  },
};

export const hashLookup: HashOperation = {
  id: 'lookup',
  label: ({ key }) => `Look up ${key}`,
  readOnly: true,
  pseudocode: [
    'lookup(key):',
    '  bucket = hash(key)',
    '  scan the chain / probe forward',
    '    a tombstone means keep going, an empty slot means stop',
    '  return the key, or not found',
  ],
  *generate(state, { key }) {
    yield* clearMarks(state);
    const home = hashOf(key, state.size);
    yield { kind: 'hash', key, bucket: home, prevKey: null, prevCursor: null, line: 1 };

    if (state.strategy === 'chaining') {
      const chain = state.buckets[home];
      for (let pos = 0; pos < chain.length; pos++) {
        if (chain[pos].state !== 'occupied') continue;
        if (chain[pos].key === key) {
          yield { kind: 'found', at: { bucket: home, pos }, prevAt: null, line: 4 };
          return;
        }
      }
      yield { kind: 'note', note: `${key} is not in the table`, prevNote: null, line: 4 };
      return;
    }

    for (let attempt = 0; attempt < state.size; attempt++) {
      const bucket = (home + attempt) % state.size;
      if (attempt > 0) {
        yield {
          kind: 'probe',
          bucket,
          attempt,
          prevCursor: (home + attempt - 1) % state.size,
          line: 2,
        };
      }
      const slot = state.buckets[bucket][0];
      if (slot === undefined) break;
      if (slot.state === 'occupied' && slot.key === key) {
        yield { kind: 'found', at: { bucket, pos: 0 }, prevAt: null, line: 4 };
        return;
      }
      // A tombstone is not a match, but it does not end the probe either.
    }
    yield { kind: 'note', note: `${key} is not in the table`, prevNote: null, line: 4 };
  },
};

export const hashRemove: HashOperation = {
  id: 'remove',
  label: ({ key }) => `Remove ${key}`,
  pseudocode: [
    'remove(key):',
    '  find the key as in lookup',
    '  chaining: splice it out of the chain',
    '  open addressing: leave a tombstone,',
    '    or later probes would stop short of shifted keys',
  ],
  *generate(state, { key }) {
    yield* clearMarks(state);
    const home = hashOf(key, state.size);
    yield { kind: 'hash', key, bucket: home, prevKey: null, prevCursor: null, line: 1 };

    if (state.strategy === 'chaining') {
      const chain = state.buckets[home];
      for (let pos = 0; pos < chain.length; pos++) {
        if (chain[pos].state === 'occupied' && chain[pos].key === key) {
          yield { kind: 'remove', bucket: home, pos, key, tombstone: false, line: 2 };
          return;
        }
      }
      yield { kind: 'note', note: `${key} is not in the table`, prevNote: null, line: 2 };
      return;
    }

    for (let attempt = 0; attempt < state.size; attempt++) {
      const bucket = (home + attempt) % state.size;
      if (attempt > 0) {
        yield {
          kind: 'probe',
          bucket,
          attempt,
          prevCursor: (home + attempt - 1) % state.size,
          line: 1,
        };
      }
      const slot = state.buckets[bucket][0];
      if (slot === undefined) break;
      if (slot.state === 'occupied' && slot.key === key) {
        yield { kind: 'remove', bucket, pos: 0, key, tombstone: true, line: 3 };
        return;
      }
    }
    yield { kind: 'note', note: `${key} is not in the table`, prevNote: null, line: 3 };
  },
};

export const HASH_OPERATIONS: HashOperation[] = [hashInsert, hashLookup, hashRemove];

/** The insert pseudocode differs enough between strategies to swap it out. */
export function insertPseudocode(strategy: HashState['strategy']): string[] {
  return strategy === 'chaining' ? CHAINING_INSERT : PROBING_INSERT;
}
