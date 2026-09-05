import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { SortingPage } from './SortingPage';

/**
 * Component-level coverage for the sorting page.
 *
 * The algorithm suites cover the parts least likely to break. Every bug that
 * actually reached the browser during this build lived here instead: the size
 * cap, playback stopping at the end, and race mode wiring.
 */

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/sorting${search}`]}>
      <SortingPage />
    </MemoryRouter>,
  );
}

const playButton = () => screen.getByRole('button', { name: /Play|Pause|Replay/ });
const stepForward = () => screen.getByRole('button', { name: 'Step forward' });
const stepBack = () => screen.getByRole('button', { name: 'Step back' });

/**
 * Setup is collapsed behind a one-line summary in the run bar, so anything
 * reaching for size or shape has to open it first.
 */
function openSetup() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}

/**
 * Choosing an algorithm is a chip in the family picker, not a <select>. The
 * page carries one identity strip; the per-panel dropdowns only exist in race
 * mode, where two algorithms are loaded at once.
 */
function pickAlgorithm(label: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Change — / }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
}

/**
 * The name in the identity strip — what is loaded right now. Scoped to the
 * strip, since the pseudocode panel also has a `.title`.
 */
const loadedAlgorithm = () =>
  document.querySelector('[class*="identity"] [class*="title"]')?.textContent;

/** Sliders in DOM order: the run bar's scrub, then size once setup is open. */
const scrubSlider = () => screen.getAllByRole('slider')[0];
const sizeSlider = () => screen.getAllByRole('slider')[1];

/**
 * The run bar's step counter, e.g. "412 / 1,109". Matched by shape rather than
 * by a literal, since the total varies with the algorithm and seed under test,
 * and the numbers are digit-grouped once a run passes a thousand steps.
 */
const counterEl = () =>
  screen.getByText(
    (_, element) =>
      element?.tagName === 'SPAN' && /^\d[\d,]* \/ [\d,]+$/.test(element.textContent ?? ''),
  );

function counter(cursor: number): HTMLElement {
  const element = counterEl();
  expect(element.textContent).toMatch(new RegExp(`^${cursor} / `));
  return element;
}

afterEach(cleanup);

describe('SortingPage', () => {
  it('restores algorithm, size and shape from the URL', () => {
    renderPage('?algo=merge&size=20&shape=reversed&seed=42');

    expect(loadedAlgorithm()).toBe('Merge Sort');
    // The summary states the whole configuration without opening anything.
    expect(screen.getByText('Merge Sort · 20 · Reversed · seed 42')).toBeDefined();

    openSetup();
    expect(sizeSlider().getAttribute('value')).toBe('20');
    expect(screen.getByRole('button', { name: 'Reversed', pressed: true })).toBeDefined();
  });

  it('reproduces the identical array for the same seed', () => {
    const first = renderPage('?algo=bubble&size=12&shape=random&seed=7');
    const firstCount = first.container.querySelectorAll('[class*="slot"]').length;
    const firstSteps = counter(0).textContent;
    cleanup();

    renderPage('?algo=bubble&size=12&shape=random&seed=7');
    expect(document.querySelectorAll('[class*="slot"]').length).toBe(firstCount);
    // Same input and algorithm means an identical step count.
    expect(counter(0).textContent).toBe(firstSteps);
  });

  it('produces a different run for a different seed', () => {
    renderPage('?algo=bubble&size=30&shape=random&seed=1');
    const a = counter(0).textContent;
    cleanup();

    renderPage('?algo=bubble&size=30&shape=random&seed=999');
    expect(counter(0).textContent).not.toBe(a);
  });

  it('clamps the array when an algorithm with a size ceiling is picked', () => {
    renderPage('?algo=quick&size=45&shape=random&seed=3');
    openSetup();
    expect(sizeSlider().getAttribute('value')).toBe('45');

    // Bogo sort caps the array at 6 rather than freezing the tab.
    pickAlgorithm('Bogo Sort');

    expect(sizeSlider().getAttribute('value')).toBe('6');
    expect(sizeSlider().getAttribute('max')).toBe('6');
    // And says so, rather than silently moving the slider under the reader.
    expect(screen.getByText(/capped at 6 elements/)).toBeDefined();
  });

  it('releases the ceiling when a normal algorithm is picked again', () => {
    renderPage('?algo=bogo&size=6&shape=random&seed=3');
    openSetup();
    expect(sizeSlider().getAttribute('max')).toBe('6');

    pickAlgorithm('Insertion Sort');
    expect(sizeSlider().getAttribute('max')).toBe('150');
    expect(screen.queryByText(/capped at/)).toBeNull();
  });

  it('steps forward and back, and back arrives at an untouched frame', () => {
    renderPage('?algo=bubble&size=10&shape=random&seed=5');

    expect(stepBack().hasAttribute('disabled')).toBe(true);
    fireEvent.click(stepForward());
    fireEvent.click(stepForward());
    expect(counter(2)).toBeDefined();

    fireEvent.click(stepBack());
    fireEvent.click(stepBack());
    expect(counter(0)).toBeDefined();
    expect(stepBack().hasAttribute('disabled')).toBe(true);
  });

  it('plays to the end and stops on its own', async () => {
    renderPage('?algo=bubble&size=8&shape=random&seed=11');

    fireEvent.click(playButton());
    await waitFor(() => expect(stepForward().hasAttribute('disabled')).toBe(true), {
      timeout: 5000,
    });

    // The regression here was the button staying on "Pause" forever.
    expect(playButton().textContent).toBe('Replay');
    // And it stays clickable at the end — that is what Replay means. The old
    // bar disabled Play once the run finished, which left the only way back to
    // the start on a differently-named button somewhere else in the bar.
    expect(playButton().hasAttribute('disabled')).toBe(false);
  });

  it('shows one panel normally and two in race mode, each with its own stats', () => {
    renderPage('?algo=quick&size=15&shape=random&seed=2');
    expect(screen.getAllByText('Comparisons')).toHaveLength(1);

    // The race toggle names the loaded algorithm, so it says what it will race.
    fireEvent.click(screen.getByLabelText(/Race Quick Sort against another/));
    expect(screen.getAllByText('Comparisons')).toHaveLength(2);
    expect(screen.getByDisplayValue('Quick Sort')).toBeDefined();
    expect(screen.getByDisplayValue('Merge Sort')).toBeDefined();
  });

  /** Jumps the cursor to the last step without waiting out the playback clock. */
  function seekToEnd() {
    const slider = scrubSlider();
    fireEvent.change(slider, { target: { value: slider.getAttribute('max') } });
  }

  it('holds the measured count against the predicted bound once the run ends', () => {
    renderPage('?algo=selection&size=12&shape=random&seed=5');
    expect(screen.getByText(/Run to the end to compare/)).toBeDefined();

    seekToEnd();

    /*
     * Selection sort is the one algorithm whose comparison count is exactly
     * its bound and completely input-independent — it always scans the whole
     * unsorted remainder. n(n-1)/2 at n=12 is 66, on any seed and any shape,
     * so this pins the arithmetic rather than approximating it.
     */
    expect(screen.getByText(/Matches the predicted bound — 66 comparisons against 66\./)).toBeDefined();
  });

  it('compares a non-comparison sort against array accesses, not comparisons', () => {
    /*
     * The regression this guards: counting sort performs no comparisons at
     * all, so measuring it against a predicted *comparison* count reported
     * "100% fewer than predicted" on every run — true, and worthless.
     */
    renderPage('?algo=counting&size=12&shape=random&seed=5');
    seekToEnd();

    expect(screen.getByText(/array accesses against/)).toBeDefined();
    expect(screen.queryByText(/fewer comparisons than predicted/)).toBeNull();
  });

  it('names only the step kinds the chosen algorithm actually emits', () => {
    // Counting sort never swaps and never reads into a buffer, so advertising
    // those states in the legend describes an algorithm that is not running.
    renderPage('?algo=counting&size=12&shape=random&seed=5');
    expect(screen.queryByText('Swapping')).toBeNull();
    expect(screen.queryByText('Reading into buffer')).toBeNull();
    expect(screen.getByText('Bucketing')).toBeDefined();

    cleanup();
    renderPage('?algo=bubble&size=12&shape=random&seed=5');
    expect(screen.getByText('Swapping')).toBeDefined();
    expect(screen.queryByText('Bucketing')).toBeNull();
  });

  it('disables scrubbing in race mode and explains why', () => {
    renderPage('?algo=quick&size=15&shape=random&seed=2&vs=merge');
    expect(scrubSlider().hasAttribute('disabled')).toBe(true);
  });

  it('advances both race panels together when stepping', () => {
    renderPage('?algo=bubble&size=12&shape=random&seed=4&vs=selection');

    fireEvent.click(stepForward());
    fireEvent.click(stepForward());

    const panels = document.querySelectorAll('[class*="readouts"]');
    expect(panels.length).toBeGreaterThanOrEqual(2);
    // Both panels have counted something rather than one sitting at zero.
    for (const panel of Array.from(panels).slice(0, 2)) {
      const comparisons = within(panel as HTMLElement).queryByText('Comparisons');
      if (!comparisons) continue;
      const value = comparisons.previousElementSibling?.textContent ?? '0';
      expect(Number(value)).toBeGreaterThan(0);
    }
  });
});
