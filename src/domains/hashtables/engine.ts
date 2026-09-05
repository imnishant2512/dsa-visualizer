import type { StatCounters, StepEngine } from '../../engine/types';
import { hashOf } from './types';
import type { HashState, HashStep, HashStrategy, Slot } from './types';

function withBucket(state: HashState, bucket: number, next: Slot[]): HashState {
  const buckets = [...state.buckets];
  buckets[bucket] = next;
  return { ...state, buckets };
}

export const hashEngine: StepEngine<HashState, HashStep> = {
  applyStep(state, step) {
    switch (step.kind) {
      case 'hash':
        return { ...state, hashKey: step.key, cursor: step.bucket };
      case 'probe':
        return { ...state, cursor: step.bucket };
      case 'collision':
        return { ...state, collided: [...state.collided, step.bucket] };
      case 'place': {
        const slots = [...state.buckets[step.bucket]];
        slots.splice(step.pos, 0, { key: step.key, state: 'occupied' });
        return withBucket(state, step.bucket, slots);
      }
      case 'remove': {
        const slots = [...state.buckets[step.bucket]];
        if (step.tombstone) slots[step.pos] = { key: step.key, state: 'tombstone' };
        else slots.splice(step.pos, 1);
        return withBucket(state, step.bucket, slots);
      }
      case 'found':
        return { ...state, foundAt: step.at };
      case 'clear':
        return { ...state, hashKey: null, cursor: null, collided: [], foundAt: null, note: null };
      case 'note':
        return { ...state, note: step.note };
      default:
        return state;
    }
  },

  invertStep(state, step) {
    switch (step.kind) {
      case 'hash':
        return { ...state, hashKey: step.prevKey, cursor: step.prevCursor };
      case 'probe':
        return { ...state, cursor: step.prevCursor };
      case 'collision':
        // Only `collision` appends, so dropping the last entry is exact.
        return { ...state, collided: state.collided.slice(0, -1) };
      case 'place': {
        const slots = [...state.buckets[step.bucket]];
        slots.splice(step.pos, 1);
        return withBucket(state, step.bucket, slots);
      }
      case 'remove': {
        const slots = [...state.buckets[step.bucket]];
        if (step.tombstone) slots[step.pos] = { key: step.key, state: 'occupied' };
        else slots.splice(step.pos, 0, { key: step.key, state: 'occupied' });
        return withBucket(state, step.bucket, slots);
      }
      case 'found':
        return { ...state, foundAt: step.prevAt };
      case 'clear':
        return {
          ...state,
          hashKey: step.prevKey,
          cursor: step.prevCursor,
          collided: [...step.prevCollided],
          foundAt: step.prevFound,
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
      case 'hash':
        return { hashes: 1 };
      case 'probe':
        return { probes: 1 };
      case 'collision':
        return { collisions: 1 };
      case 'place':
      case 'remove':
        return { writes: 1 };
      default:
        return {};
    }
  },

  lineFor: (step) => step.line,
};

export function initHashState(strategy: HashStrategy, size = 11, keys: number[] = []): HashState {
  const state: HashState = {
    strategy,
    size,
    buckets: Array.from({ length: size }, () => []),
    hashKey: null,
    cursor: null,
    collided: [],
    foundAt: null,
    note: null,
  };

  // Seed without steps — this is the starting table, not an operation.
  for (const key of keys) {
    const home = ((key % size) + size) % size;
    if (strategy === 'chaining') {
      state.buckets[home].push({ key, state: 'occupied' });
    } else {
      for (let i = 0; i < size; i++) {
        const bucket = (home + i) % size;
        if (state.buckets[bucket].length === 0) {
          state.buckets[bucket] = [{ key, state: 'occupied' }];
          break;
        }
      }
    }
  }
  return state;
}

export function liveKeys(state: HashState): number[] {
  return state.buckets.flatMap((slots) =>
    slots.filter((slot) => slot.state === 'occupied').map((slot) => slot.key),
  );
}

export function loadFactor(state: HashState): number {
  return liveKeys(state).length / state.size;
}

/**
 * One committed mutation, in the form it takes in the log.
 *
 * Lookups are absent on purpose: they animate and they land in the history
 * panel, but they change nothing, so replaying them would only be theatre.
 */
export type HashLogEntry =
  | { kind: 'insert'; key: number }
  | { kind: 'remove'; key: number }
  | { kind: 'rehash'; size: number };

/** Insert without emitting steps — used to rebuild a table, not to animate one. */
function insertKey(state: HashState, key: number): void {
  const home = hashOf(key, state.size);
  if (state.strategy === 'chaining') {
    const chain = state.buckets[home];
    if (!chain.some((slot) => slot.key === key && slot.state === 'occupied')) {
      chain.push({ key, state: 'occupied' });
    }
    return;
  }
  let firstTombstone: number | null = null;
  for (let attempt = 0; attempt < state.size; attempt++) {
    const bucket = (home + attempt) % state.size;
    const slot = state.buckets[bucket][0];
    if (slot === undefined) {
      state.buckets[firstTombstone ?? bucket] = [{ key, state: 'occupied' }];
      return;
    }
    if (slot.state === 'tombstone') {
      if (firstTombstone === null) firstTombstone = bucket;
      continue;
    }
    if (slot.key === key) return;
  }
  if (firstTombstone !== null) state.buckets[firstTombstone] = [{ key, state: 'occupied' }];
}

function removeKey(state: HashState, key: number): void {
  const home = hashOf(key, state.size);
  if (state.strategy === 'chaining') {
    const chain = state.buckets[home];
    const pos = chain.findIndex((slot) => slot.state === 'occupied' && slot.key === key);
    if (pos >= 0) chain.splice(pos, 1);
    return;
  }
  for (let attempt = 0; attempt < state.size; attempt++) {
    const bucket = (home + attempt) % state.size;
    const slot = state.buckets[bucket][0];
    if (slot === undefined) return;
    if (slot.state === 'occupied' && slot.key === key) {
      state.buckets[bucket] = [{ key, state: 'tombstone' }];
      return;
    }
  }
}

/**
 * Rebuilds a table from the log.
 *
 * This is what makes the page's premise work. Switching strategy used to call
 * reset(), which threw away every key the moment you tried to compare the two
 * layouts — and comparing the two layouts is the only reason the strategy
 * toggle exists. Replaying the same log against the other strategy answers
 * "where would these keys have gone instead", which is the question.
 *
 * Rehash is in the log rather than applied to a copy of the current table
 * because it has to compose with everything after it: a remove that follows a
 * rehash has to find the key where the rehash put it.
 */
export function replayLog(
  log: readonly HashLogEntry[],
  strategy: HashStrategy,
  size: number,
): HashState {
  let state = initHashState(strategy, size);
  for (const entry of log) {
    if (entry.kind === 'rehash') {
      // Tombstones do not survive a rehash — that is most of the point of one.
      const keys = liveKeys(state);
      state = initHashState(strategy, entry.size);
      for (const key of keys) insertKey(state, key);
    } else if (entry.kind === 'insert') {
      insertKey(state, entry.key);
    } else {
      removeKey(state, entry.key);
    }
  }
  return state;
}

/**
 * Table sizes stay prime, so `key % size` does not collapse onto a common
 * factor of the keys. Doubling and taking the next prime is the usual growth
 * schedule.
 */
export function nextCapacity(size: number): number {
  let candidate = size * 2 + 1;
  while (!isPrime(candidate)) candidate += 2;
  return candidate;
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

/** Past this, probe sequences start to grow fast enough to be worth saying so. */
export const LOAD_THRESHOLD = 0.7;
