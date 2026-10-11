export interface ExecutionResult {
  stdout: string;
  stderr: string;
  /** Set only when the program could not be run at all (transport, timeout, no executor). */
  error?: string;
  /** The program's own exit status. Non-zero is a *result*, not an `error`. */
  exitCode?: number;
  executionTimeMs?: number;
}

/** A run that produces no output within this budget is assumed to be looping. */
export const JS_TIMEOUT_MS = 5000;

/**
 * Runs user code and collects what it printed.
 *
 * This function is deliberately **self-contained**: it closes over nothing in
 * module scope, because `executeJavaScript` stringifies it with `toString()` to
 * build the sandbox worker. Adding an outside reference here would compile
 * fine and then fail at runtime inside the worker, so keep every helper local.
 *
 * `console` is passed to the code as a parameter rather than monkey-patched on
 * the global, so a run can never corrupt the host page's console — the previous
 * implementation restored the real console in a `finally`, which races with any
 * code that logs from a timer.
 *
 * Only synchronous output is captured. Anything logged from a `setTimeout` or a
 * promise resolves after the run has already been reported.
 */
export function runUserCode(code: string, stdin: string): { stdout: string; stderr: string } {
  const logs: string[] = [];
  const errors: string[] = [];

  const format = (args: unknown[]) =>
    args
      .map((value) => {
        if (typeof value === 'string') return value;
        if (value instanceof Error) return `${value.name}: ${value.message}`;
        try {
          return JSON.stringify(value) ?? String(value);
        } catch {
          return String(value);
        }
      })
      .join(' ');

  const sandboxConsole = {
    log: (...args: unknown[]) => logs.push(format(args)),
    info: (...args: unknown[]) => logs.push(format(args)),
    debug: (...args: unknown[]) => logs.push(format(args)),
    warn: (...args: unknown[]) => logs.push(format(args)),
    error: (...args: unknown[]) => errors.push(format(args)),
  };

  // The JavaScript template reads stdin the Node way, so shim just enough of it.
  const requireShim = (moduleName: string) => {
    if (moduleName === 'fs') {
      return {
        readFileSync: (path: unknown) =>
          path === '/dev/stdin' || path === 0 || path === '0' ? stdin : '',
      };
    }
    throw new Error(`Cannot find module '${moduleName}'`);
  };

  const processShim = {
    argv: ['node', 'main.js'],
    env: {},
    exit: () => {},
    stdout: { write: (chunk: unknown) => logs.push(String(chunk)) },
  };

  try {
    const fn = new Function('require', 'console', 'process', code);
    fn(requireShim, sandboxConsole, processShim);
  } catch (err) {
    errors.push(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  }

  return { stdout: logs.join('\n'), stderr: errors.join('\n') };
}

/**
 * Runs JavaScript in a terminable Web Worker.
 *
 * The previous version called `new Function(code)` straight on the main thread,
 * so `while (true) {}` froze the tab with no recovery short of closing it. A
 * worker can be killed, which is the only reliable way to bound arbitrary code.
 */
export function executeJavaScript(code: string, stdin: string): Promise<ExecutionResult> {
  const start = performance.now();
  const elapsed = () => Math.round(performance.now() - start);

  // jsdom has no Worker. Tests exercise `runUserCode` directly; this keeps the
  // page renderable under test without pretending the sandbox exists.
  if (typeof Worker === 'undefined') {
    const result = runUserCode(code, stdin);
    return Promise.resolve({
      ...result,
      exitCode: result.stderr ? 1 : 0,
      executionTimeMs: elapsed(),
    });
  }

  const source = `
    self.onmessage = function (event) {
      var run = ${runUserCode.toString()};
      try {
        self.postMessage(run(event.data.code, event.data.stdin));
      } catch (err) {
        self.postMessage({ stdout: '', stderr: String(err) });
      }
    };
  `;

  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const worker = new Worker(url);

  return new Promise<ExecutionResult>((resolve) => {
    let settled = false;
    const finish = (result: ExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ ...result, executionTimeMs: elapsed() });
    };

    const timer = setTimeout(
      () =>
        finish({
          stdout: '',
          stderr: '',
          error: `Timed out after ${JS_TIMEOUT_MS / 1000}s — the program was stopped. An infinite loop?`,
        }),
      JS_TIMEOUT_MS,
    );

    worker.onmessage = (event: MessageEvent<{ stdout: string; stderr: string }>) =>
      finish({ ...event.data, exitCode: event.data.stderr ? 1 : 0 });

    worker.onerror = (event) =>
      finish({
        stdout: '',
        stderr: '',
        error: event.message || 'The sandbox worker failed to start.',
      });

    worker.postMessage({ code, stdin });
  });
}
