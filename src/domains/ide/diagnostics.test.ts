import { describe, expect, it } from 'vitest';
import { parseDiagnostics } from './diagnostics';

/**
 * The parser this replaces matched a single `:line:col:` pattern, which covers
 * gcc and nothing else — Java, Rust and Python errors produced no markers at
 * all. One case per toolchain, so a regression in any one of them is visible.
 */
describe('parseDiagnostics', () => {
  it('reads gcc positions and messages', () => {
    const stderr = "prog.cc:7:14: error: 'foo' was not declared in this scope";
    expect(parseDiagnostics(stderr)).toEqual([
      { line: 7, column: 14, message: "'foo' was not declared in this scope", severity: 'error' },
    ]);
  });

  it('reads javac positions, which carry no column', () => {
    const stderr = 'Main.java:5: error: cannot find symbol';
    expect(parseDiagnostics(stderr)).toEqual([
      { line: 5, column: 1, message: 'cannot find symbol', severity: 'error' },
    ]);
  });

  it('pairs a rustc location with the message printed above it', () => {
    const stderr = [
      'error[E0308]: mismatched types',
      ' --> prog.rs:3:17',
      '  |',
      '3 |     let x: i32 = "s";',
    ].join('\n');
    expect(parseDiagnostics(stderr)).toEqual([
      { line: 3, column: 17, message: 'error[E0308]: mismatched types', severity: 'error' },
    ]);
  });

  it('pairs a python frame with the exception printed below it', () => {
    const stderr = [
      'Traceback (most recent call last):',
      '  File "prog.py", line 4, in <module>',
      '    print(1 / 0)',
      'ZeroDivisionError: division by zero',
    ].join('\n');
    expect(parseDiagnostics(stderr)).toEqual([
      { line: 4, column: 1, message: 'ZeroDivisionError: division by zero', severity: 'error' },
    ]);
  });

  it('keeps one marker per line when a traceback repeats a frame', () => {
    const stderr = [
      '  File "prog.py", line 2, in <module>',
      '  File "prog.py", line 2, in recurse',
      'RecursionError: maximum recursion depth exceeded',
    ].join('\n');
    expect(parseDiagnostics(stderr)).toHaveLength(1);
  });

  it('returns nothing for output that carries no position', () => {
    expect(parseDiagnostics('Segmentation fault')).toEqual([]);
    expect(parseDiagnostics('')).toEqual([]);
  });

  /**
   * A build that only warns still succeeds. Marking a warning as an error puts
   * a red squiggle on working code, so the severity has to survive parsing.
   */
  it('keeps a gcc warning a warning', () => {
    const stderr = 'prog.cc:1:2: warning: #warning heads up [-Wcpp]';
    expect(parseDiagnostics(stderr)).toEqual([
      { line: 1, column: 2, message: '#warning heads up [-Wcpp]', severity: 'warning' },
    ]);
  });

  it('keeps a rustc warning a warning', () => {
    const stderr = ['warning: unused variable: `x`', ' --> prog.rs:2:9'].join('\n');
    expect(parseDiagnostics(stderr)[0].severity).toBe('warning');
  });
});
