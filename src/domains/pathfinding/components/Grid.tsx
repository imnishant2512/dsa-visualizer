import { memo, useCallback, useRef, useState } from 'react';
import type { GridState } from '../types';
import styles from './Grid.module.css';

export type CellRole =
  'start' | 'end' | 'wall' | 'weight' | 'path' | 'scanning' | 'visited' | 'frontier' | 'empty';

interface CellProps {
  index: number;
  role: CellRole;
  weight: number;
  focused: boolean;
}

/**
 * Memoized per cell: a run repaints a handful of cells per step, and without
 * this every step would re-render all ~800 of them.
 *
 * Cells carry no handlers of their own. Pointer input is read at the container
 * and hit-tested, which is what makes a drag work on touch — a touch pointer
 * is captured by whatever element it started on, so per-cell enter events
 * never fire for the cells it passes over.
 */
const Cell = memo(function Cell({ index, role, weight, focused }: CellProps) {
  return (
    <div
      className={`${styles.cell} ${styles[role]} ${focused ? styles.focused : ''}`}
      data-index={index}
      role="presentation"
    >
      {role === 'weight' && <span className={styles.weightMark}>{weight}</span>}
      {role === 'start' && <span className={styles.marker}>▶</span>}
      {role === 'end' && <span className={styles.marker}>◎</span>}
    </div>
  );
});

export interface GridProps {
  state: GridState;
  onCellDown(index: number): void;
  onCellEnter(index: number): void;
  onRelease(): void;
  /** Keyboard equivalents of the pointer tools. */
  onKeyCommand(command: KeyCommand, index: number): void;
}

export type KeyCommand = 'apply' | 'wall' | 'weight' | 'erase' | 'start' | 'end';

const KEY_COMMANDS: Record<string, KeyCommand> = {
  w: 'wall',
  e: 'weight',
  x: 'erase',
  s: 'start',
  g: 'end',
};

const ARROWS: Record<string, [dr: number, dc: number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/** The cell under a client point, or null if the point is between cells. */
function cellAt(x: number, y: number): number | null {
  const element = document.elementFromPoint(x, y);
  const cell = element?.closest<HTMLElement>('[data-index]');
  return cell ? Number(cell.dataset.index) : null;
}

export function Grid({ state, onCellDown, onCellEnter, onRelease, onKeyCommand }: GridProps) {
  /*
   * A roving cursor, so the grid is operable without a pointer at all. The
   * container takes a single tab stop and the arrow keys move a focused cell
   * inside it — the alternative, 640 tab stops, is not navigation.
   */
  const [focus, setFocus] = useState<number | null>(null);
  /*
   * The cursor position is mirrored in a ref because keydown can fire faster
   * than React re-renders — key auto-repeat is roughly 30 a second and a busy
   * frame is longer than that. Reading `focus` from the closure meant a burst
   * of arrow presses all resolved against the same stale position and only the
   * last one counted, so holding an arrow key crawled instead of moving.
   */
  const focusRef = useRef<number | null>(null);
  const dragging = useRef(false);

  const moveFocus = useCallback((index: number | null) => {
    focusRef.current = index;
    setFocus(index);
  }, []);

  const roleFor = useCallback(
    (index: number): CellRole => {
      if (index === state.start) return 'start';
      if (index === state.end) return 'end';
      if (state.walls[index]) return 'wall';
      if (state.path[index]) return 'path';
      if (state.scanning === index) return 'scanning';
      if (state.visited[index]) return 'visited';
      if (state.frontier[index]) return 'frontier';
      if (state.weights[index] > 1) return 'weight';
      return 'empty';
    },
    [state],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const index = cellAt(event.clientX, event.clientY);
    if (index === null) return;
    event.preventDefault();
    dragging.current = true;
    // Keeps the gesture on this element even if the pointer leaves it, so a
    // drag that runs off the edge still ends in a pointerup we hear about.
    event.currentTarget.setPointerCapture(event.pointerId);
    moveFocus(index);
    onCellDown(index);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const index = cellAt(event.clientX, event.clientY);
    if (index !== null) onCellEnter(index);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onRelease();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = focusRef.current ?? state.start;

    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      const row = Math.floor(current / state.cols) + arrow[0];
      const col = (current % state.cols) + arrow[1];
      if (row < 0 || col < 0 || row >= state.rows || col >= state.cols) return;
      moveFocus(row * state.cols + col);
      return;
    }

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      moveFocus(current);
      onKeyCommand('apply', current);
      return;
    }

    const command = KEY_COMMANDS[event.key.toLowerCase()];
    if (command) {
      event.preventDefault();
      moveFocus(current);
      onKeyCommand(command, current);
    }
  };

  return (
    <div
      className={styles.viewport}
      tabIndex={0}
      role="application"
      aria-label="Editable grid — arrow keys move the cursor, space applies the current tool, W E X switch between wall, weight and erase, S and G place start and goal"
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onBlur={() => moveFocus(null)}
    >
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${state.cols}, var(--cell-size))` }}
      >
        {state.walls.map((_, index) => (
          <Cell
            key={index}
            index={index}
            role={roleFor(index)}
            weight={state.weights[index]}
            focused={focus === index}
          />
        ))}
      </div>
    </div>
  );
}
