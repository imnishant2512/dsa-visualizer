import type { SortStep } from '../../sorting/types';
import { JS_TIMEOUT_MS } from '../executors/browserExecutor';

/**
 * The most steps one recording may produce. A correct O(n²) sort of the
 * largest array this page offers needs a few thousand; anything near this is
 * a loop that yields forever, and it is stopped here rather than allowed to
 * fill memory.
 */
export const STEP_CAP = 400_000;

export type RecordResult =
  | { ok: true; steps: SortStep[]; result: number[] }
  | { ok: false; error: string };

/**
 * Runs a user's `customSort` generator against a recording context and returns
 * the steps it produced, in the sorting engine's own step format.
 *
 * Because the steps are ordinary `SortStep`s, the user's algorithm gets
 * everything a built-in one does — the same player, scrubbing, tick strip,
 * narration and measured counters — with nothing special-cased for it.
 *
 * Deliberately **self-contained**: `recordInWorker` stringifies this function
 * into a Web Worker, so it may not reference anything in module scope.
 *
 * Every write records the value it overwrote and every `markSorted` carries
 * only indices not already marked, because the engine's `invertStep` relies on
 * exactly those two facts to step backwards without searching. A recording
 * that broke them would replay forwards fine and then corrupt the array the
 * first time someone stepped back.
 */
export function recordSort(code: string, values: number[], cap: number): RecordResult {
  const arr = values.slice();
  const marked = new Set<number>();
  const steps: SortStep[] = [];

  const push = (step: SortStep) => {
    if (steps.length >= cap) {
      throw new Error(
        `Stopped after ${cap.toLocaleString()} steps — does the sort ever finish? A loop that keeps yielding without making progress would do this.`,
      );
    }
    steps.push(step);
  };

  const check = (name: string, ...indices: number[]) => {
    for (const i of indices) {
      if (!Number.isInteger(i) || i < 0 || i >= arr.length) {
        throw new Error(
          `${name}(${indices.join(', ')}): ${String(i)} is not an index — valid indices are 0 to ${arr.length - 1}.`,
        );
      }
    }
  };

  const ctx = {
    get length() {
      return arr.length;
    },
    at(i: number) {
      check('at', i);
      return arr[i];
    },
    *compare(i: number, j: number) {
      check('compare', i, j);
      push({ kind: 'compare', indices: [i, j] });
      yield;
    },
    *swap(i: number, j: number) {
      check('swap', i, j);
      push({ kind: 'swap', a: i, b: j });
      const held = arr[i];
      arr[i] = arr[j];
      arr[j] = held;
      yield;
    },
    *write(i: number, value: number) {
      check('write', i);
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`write(${i}, ${String(value)}): the value must be a finite number.`);
      }
      push({ kind: 'set', index: i, value, prevValue: arr[i] });
      arr[i] = value;
      yield;
    },
    *read(i: number) {
      check('read', i);
      push({ kind: 'read', index: i });
      yield;
    },
    *markSorted(list: number | number[]) {
      const indices = Array.isArray(list) ? list : [list];
      check('markSorted', ...indices);
      const fresh = indices.filter((i) => !marked.has(i));
      if (fresh.length > 0) {
        for (const i of fresh) marked.add(i);
        push({ kind: 'markSorted', indices: fresh });
      }
      yield;
    },
    *markAllSorted() {
      const fresh: number[] = [];
      for (let i = 0; i < arr.length; i++) if (!marked.has(i)) fresh.push(i);
      if (fresh.length > 0) {
        for (const i of fresh) marked.add(i);
        push({ kind: 'markSorted', indices: fresh });
      }
      yield;
    },
  };

  try {
    const factory = new Function(
      `"use strict";\n${code}\nreturn typeof customSort === "function" ? customSort : null;`,
    );
    const customSort = factory();
    if (!customSort) {
      return {
        ok: false,
        error: 'No customSort found. Declare it as:  function* customSort(ctx) { … }',
      };
    }
    const iterator = customSort(ctx);
    if (!iterator || typeof iterator.next !== 'function') {
      return {
        ok: false,
        error: 'customSort must be a generator — declare it with function* and use yield* ctx.compare(…).',
      };
    }
    let yields = 0;
    while (!iterator.next().done) {
      if (++yields > cap) {
        throw new Error(
          `Stopped after ${cap.toLocaleString()} yields — does the sort ever finish?`,
        );
      }
    }
    return { ok: true, steps, result: arr };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  }
}

/**
 * Records in a terminable Web Worker.
 *
 * The design reference for this ran the user's generator on the main thread,
 * with a step cap checked on each `yield`. That cap cannot see a loop that
 * never yields — `while (true) {}` inside `customSort` — and on the main
 * thread such a loop freezes the tab with no way out. A worker can be killed,
 * so the step cap bounds runaway *output* and the timeout bounds runaway
 * *time*.
 */
export function recordInWorker(code: string, values: number[]): Promise<RecordResult> {
  // jsdom has no Worker. Tests call `recordSort` directly for everything but
  // the plumbing; this keeps the page renderable under test.
  if (typeof Worker === 'undefined') {
    return Promise.resolve(recordSort(code, values, STEP_CAP));
  }

  const source = `
    self.onmessage = function (event) {
      var record = ${recordSort.toString()};
      self.postMessage(record(event.data.code, event.data.values, event.data.cap));
    };
  `;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const worker = new Worker(url);

  return new Promise<RecordResult>((resolve) => {
    let settled = false;
    const finish = (result: RecordResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          error: `Stopped after ${JS_TIMEOUT_MS / 1000}s without finishing — is there a loop that never yields?`,
        }),
      JS_TIMEOUT_MS,
    );

    worker.onmessage = (event: MessageEvent<RecordResult>) => finish(event.data);
    worker.onerror = (event) =>
      finish({ ok: false, error: event.message || 'The sandbox worker failed to start.' });
    worker.postMessage({ code, values, cap: STEP_CAP });
  });
}

/** The starting point in the editor: a correct bubble sort, written the long way. */
export const SORT_TEMPLATE = `// Write a generator that sorts ctx. Every yield* becomes a step
// you can play, pause, scrub and step backwards through.
//
//   ctx.length          number of elements
//   ctx.at(i)           read a value (free — not a step)
//   yield* ctx.compare(i, j)
//   yield* ctx.swap(i, j)
//   yield* ctx.write(i, value)
//   yield* ctx.read(i)
//   yield* ctx.markSorted(i)   or   ctx.markSorted([i, j])
//   yield* ctx.markAllSorted()

function* customSort(ctx) {
  for (let i = 0; i < ctx.length; i++) {
    let swapped = false;

    for (let j = 0; j < ctx.length - i - 1; j++) {
      yield* ctx.compare(j, j + 1);

      if (ctx.at(j) > ctx.at(j + 1)) {
        yield* ctx.swap(j, j + 1);
        swapped = true;
      }
    }

    yield* ctx.markSorted(ctx.length - i - 1);
    if (!swapped) break;
  }

  yield* ctx.markAllSorted();
}
`;
