import { act, cleanup, render, waitFor } from '@testing-library/react';
import { StrictMode, useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sortEngine } from '../domains/sorting/engine';
import { SORT_BY_ID } from '../domains/sorting/registry';
import {
  SORT_STAT_KEYS,
  type SortInput,
  type SortState,
  type SortStep,
} from '../domains/sorting/types';
import { useStepPlayer, type StepPlayer } from './useStepPlayer';

/**
 * These cover the hook itself rather than the pure player functions — in
 * particular the "adjust state during render" reset, whose failure mode is an
 * infinite render loop that unit tests over the pure functions cannot catch.
 */

interface HarnessProps {
  algorithmId: string;
  values: number[];
  playing: boolean;
  speedMs?: number;
  onRender?: () => void;
}

let latest: StepPlayer<SortState, SortStep> | null = null;

function Harness({ algorithmId, values, playing, speedMs = 10, onRender }: HarnessProps) {
  onRender?.();
  const [input] = useState<SortInput>(() => ({ values }));
  const player = useStepPlayer({
    def: SORT_BY_ID[algorithmId],
    input,
    engine: sortEngine,
    statKeys: SORT_STAT_KEYS,
    speedMs,
    playing,
  });

  // Captured after commit rather than during render — assigning to a module
  // variable mid-render is exactly the impurity the lint rule guards against.
  useEffect(() => {
    latest = player;
  });

  return <div data-testid="cursor">{player.frame.cursor}</div>;
}

afterEach(() => {
  // RTL only auto-registers cleanup when the test framework exposes globals,
  // which this config does not — without it, mounted trees leak between tests.
  cleanup();
  latest = null;
  vi.useRealTimers();
});

describe('useStepPlayer', () => {
  it('mounts without looping and starts before the first step', () => {
    const onRender = vi.fn();
    render(<Harness algorithmId="bubble" values={[3, 1, 2]} playing={false} onRender={onRender} />);

    expect(latest!.frame.cursor).toBe(-1);
    expect(latest!.totalSteps).toBeGreaterThan(0);
    // A render loop would blow far past a handful of passes.
    expect(onRender.mock.calls.length).toBeLessThan(5);
  });

  it('does not loop under StrictMode double-rendering', () => {
    const onRender = vi.fn();
    render(
      <StrictMode>
        <Harness algorithmId="quick" values={[5, 2, 9, 1]} playing={false} onRender={onRender} />
      </StrictMode>,
    );
    expect(onRender.mock.calls.length).toBeLessThan(10);
    expect(latest!.frame.cursor).toBe(-1);
  });

  it('rewinds to a fresh frame when the algorithm changes, without looping', () => {
    const onRender = vi.fn();
    const { rerender } = render(
      <Harness algorithmId="bubble" values={[4, 3, 2, 1]} playing={false} onRender={onRender} />,
    );

    act(() => {
      latest!.next();
      latest!.next();
    });
    expect(latest!.frame.cursor).toBe(1);
    expect(latest!.frame.stats.comparisons).toBeGreaterThan(0);

    const before = onRender.mock.calls.length;
    rerender(
      <Harness algorithmId="merge" values={[4, 3, 2, 1]} playing={false} onRender={onRender} />,
    );

    // The reset happens during render, so the stale cursor is never committed.
    expect(latest!.frame.cursor).toBe(-1);
    for (const key of SORT_STAT_KEYS) expect(latest!.frame.stats[key]).toBe(0);
    expect(onRender.mock.calls.length - before).toBeLessThan(5);
  });

  // Real timers rather than fake ones: faking setTimeout breaks React 19's
  // scheduler, which corrupts its update queue for every later test in the file.
  it('advances on a timer while playing and stops at the end', async () => {
    render(<Harness algorithmId="bubble" values={[2, 1]} playing speedMs={1} />);

    await waitFor(() => expect(latest!.canStepForward).toBe(false));
    expect(latest!.frame.cursor).toBe(latest!.totalSteps - 1);
    expect(latest!.frame.state.values).toEqual([1, 2]);
  });

  it('batches many steps per frame so long runs are watchable', async () => {
    // Bubble on 40 reversed values is ~3,000 steps. One step per frame would
    // need ~50 seconds at 60fps; batching should clear it almost immediately.
    const reversed = Array.from({ length: 40 }, (_, i) => 40 - i);
    render(<Harness algorithmId="bubble" values={reversed} playing speedMs={1} />);

    const total = latest!.totalSteps;
    expect(total).toBeGreaterThan(1500);

    await waitFor(() => expect(latest!.canStepForward).toBe(false), { timeout: 4000 });
    expect(latest!.frame.state.values).toEqual([...reversed].sort((a, b) => a - b));
  });

  it('does not advance while paused', async () => {
    render(<Harness algorithmId="bubble" values={[2, 1]} playing={false} speedMs={1} />);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(latest!.frame.cursor).toBe(-1);
  });

  it('steps back to the exact starting state through the hook', () => {
    render(<Harness algorithmId="insertion" values={[3, 1, 2]} playing={false} />);

    act(() => {
      for (let i = 0; i < 5; i++) latest!.next();
    });
    expect(latest!.frame.cursor).toBe(4);

    // A bounded loop: `latest` is captured from the last committed render, so
    // `canStepBack` would never flip inside a single act() and would spin.
    act(() => {
      for (let i = 0; i < 5; i++) latest!.prev();
    });
    expect(latest!.frame.cursor).toBe(-1);
    expect(latest!.frame.state.values).toEqual([3, 1, 2]);
    for (const key of SORT_STAT_KEYS) expect(latest!.frame.stats[key]).toBe(0);
  });

  it('seeks to an arbitrary cursor and back to the start', () => {
    render(<Harness algorithmId="selection" values={[4, 2, 7, 1]} playing={false} />);

    act(() => latest!.seekTo(6));
    expect(latest!.frame.cursor).toBe(6);

    act(() => latest!.seekTo(-1));
    expect(latest!.frame.cursor).toBe(-1);
    expect(latest!.frame.state.values).toEqual([4, 2, 7, 1]);
  });
});
