import type { ExecutionResult } from './browserExecutor';

/** Compiling Rust or Java on a cold worker is slow; this is generous on purpose. */
export const WANDBOX_TIMEOUT_MS = 30000;

export const WANDBOX_ENDPOINT = 'https://wandbox.org/api/compile.json';

interface WandboxResponse {
  status?: string;
  compiler_output?: string;
  compiler_error?: string;
  program_output?: string;
  program_error?: string;
}

const join = (parts: (string | undefined)[]) =>
  parts.filter(Boolean).join('\n').replace(/\n+$/, '');

/**
 * Compiles and runs a snippet on wandbox.org.
 *
 * The distinction that matters here: `error` means *we could not run it* —
 * the network failed, the request timed out, the service returned 5xx. A
 * program that compiles badly or exits non-zero is a perfectly good *result*,
 * and its diagnostics are the single most useful thing on the page.
 *
 * The previous version set `error: 'Execution failed'` whenever `status !== '0'`,
 * and the page rendered `error` in preference to the output — so every failed
 * compile showed the words "Execution failed" and threw away the compiler
 * message explaining why. That is the bug this shape exists to prevent.
 */
export async function executeWandbox(
  code: string,
  compiler: string,
  stdin: string,
): Promise<ExecutionResult> {
  const start = performance.now();
  const elapsed = () => Math.round(performance.now() - start);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WANDBOX_TIMEOUT_MS);

  try {
    const response = await fetch(WANDBOX_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, compiler, stdin, save: false }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        stdout: '',
        stderr: '',
        error: `Wandbox returned ${response.status} ${response.statusText}.`,
        executionTimeMs: elapsed(),
      };
    }

    const data = (await response.json()) as WandboxResponse;
    const exitCode = Number(data.status);

    return {
      stdout: join([data.compiler_output, data.program_output]),
      stderr: join([data.compiler_error, data.program_error]),
      exitCode: Number.isFinite(exitCode) ? exitCode : undefined,
      executionTimeMs: elapsed(),
    };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      stdout: '',
      stderr: '',
      error: aborted
        ? `Timed out after ${WANDBOX_TIMEOUT_MS / 1000}s waiting for wandbox.org.`
        : `Could not reach wandbox.org: ${err instanceof Error ? err.message : String(err)}`,
      executionTimeMs: elapsed(),
    };
  } finally {
    clearTimeout(timer);
  }
}
