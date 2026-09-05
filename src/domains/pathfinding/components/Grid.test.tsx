import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Grid, type KeyCommand } from './Grid';
import type { GridState } from '../types';

/**
 * The grid was mouse-only: `onMouseDown` and `onMouseEnter` per cell, with no
 * keyboard path at all. These cover the two things that replaced it — pointer
 * events, which work for touch and pen as well, and a roving cursor.
 */

const COLS = 6;
const ROWS = 4;
const SIZE = COLS * ROWS;

function makeState(): GridState {
  return {
    rows: ROWS,
    cols: COLS,
    walls: new Array(SIZE).fill(false),
    weights: new Array(SIZE).fill(1),
    visited: new Array(SIZE).fill(false),
    frontier: new Array(SIZE).fill(false),
    path: new Array(SIZE).fill(false),
    dist: new Array(SIZE).fill(Infinity),
    scanning: null,
    start: 0,
    end: SIZE - 1,
    found: false,
    pathCost: 0,
  };
}

function renderGrid(overrides: Partial<Parameters<typeof Grid>[0]> = {}) {
  const onKeyCommand = vi.fn<(command: KeyCommand, index: number) => void>();
  const onCellDown = vi.fn();
  const onCellEnter = vi.fn();
  const onRelease = vi.fn();
  render(
    <Grid
      state={makeState()}
      onCellDown={onCellDown}
      onCellEnter={onCellEnter}
      onRelease={onRelease}
      onKeyCommand={onKeyCommand}
      {...overrides}
    />,
  );
  return {
    surface: screen.getByRole('application'),
    onKeyCommand,
    onCellDown,
    onCellEnter,
    onRelease,
  };
}

/** Which cell currently carries the roving cursor, if any. */
function focusedIndex(): number | null {
  const cell = document.querySelector('[class*="focused"]');
  return cell ? Number((cell as HTMLElement).dataset.index) : null;
}

afterEach(cleanup);

describe('Grid keyboard control', () => {
  it('is a single tab stop, not one per cell', () => {
    const { surface } = renderGrid();
    // 24 cells here and 640 in the real grid; tabbing through them is not
    // navigation, it is a way to make the page unusable by keyboard.
    expect(surface.getAttribute('tabindex')).toBe('0');
    expect(document.querySelectorAll('[tabindex]')).toHaveLength(1);
  });

  it('moves a roving cursor with the arrow keys, starting from the start cell', () => {
    const { surface } = renderGrid();
    expect(focusedIndex()).toBeNull();

    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(focusedIndex()).toBe(1);

    fireEvent.keyDown(surface, { key: 'ArrowDown' });
    expect(focusedIndex()).toBe(1 + COLS);

    fireEvent.keyDown(surface, { key: 'ArrowLeft' });
    expect(focusedIndex()).toBe(COLS);
  });

  it('does not walk the cursor off the edge', () => {
    const { surface } = renderGrid();
    fireEvent.keyDown(surface, { key: 'ArrowUp' });
    // Start is index 0, so up is out of bounds and nothing should move.
    expect(focusedIndex()).toBeNull();

    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    fireEvent.keyDown(surface, { key: 'ArrowUp' });
    expect(focusedIndex()).toBe(1);
  });

  it('applies the tool with space and switches tools with the letter keys', () => {
    const { surface, onKeyCommand } = renderGrid();
    fireEvent.keyDown(surface, { key: 'ArrowRight' });

    fireEvent.keyDown(surface, { key: ' ' });
    expect(onKeyCommand).toHaveBeenCalledWith('apply', 1);

    for (const [key, command] of [
      ['w', 'wall'],
      ['e', 'weight'],
      ['x', 'erase'],
      ['s', 'start'],
      ['g', 'end'],
    ] as const) {
      onKeyCommand.mockClear();
      fireEvent.keyDown(surface, { key });
      expect(onKeyCommand).toHaveBeenCalledWith(command, 1);
    }
  });

  it('composes a burst of arrow presses instead of resolving them all against one position', () => {
    /*
     * Key auto-repeat outruns React's re-render, so a held arrow key delivers
     * several keydowns before the component re-renders. Reading the cursor
     * from state meant they all moved from the same stale position and only
     * the last one counted — the cursor crawled while the key was held.
     */
    const { surface } = renderGrid();
    // One act() around all four, so React renders once at the end — which is
    // exactly the situation auto-repeat produces.
    act(() => {
      for (let i = 0; i < 4; i++) {
        surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
    });
    expect(focusedIndex()).toBe(4);
  });

  it('drops the cursor when the grid loses focus', () => {
    const { surface } = renderGrid();
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(focusedIndex()).toBe(1);

    fireEvent.blur(surface);
    expect(focusedIndex()).toBeNull();
  });

  it('describes its own controls, since none of them are visible', () => {
    const { surface } = renderGrid();
    const label = surface.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/arrow keys/i);
    expect(label).toMatch(/space/i);
  });
});
