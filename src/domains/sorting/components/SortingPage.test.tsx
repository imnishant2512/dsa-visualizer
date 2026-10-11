import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  /** Jumps the cursor to the last step without waiting out the playback clock. */
  function seekToEnd() {
    const slider = scrubSlider();
    fireEvent.change(slider, { target: { value: slider.getAttribute('max') } });
  }

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

    /*
     * At the default 60ms a step, this run is about 90 steps and therefore
     * about 5.4 seconds of real time — over the 5s default timeout, so the
     * test failed whenever the machine was busy. The 4x preset is the same
     * playback path at 12ms a step.
     */
    fireEvent.click(screen.getByRole('button', { name: '4×' }));

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

  it('replaces the single panel with a delta strip in race mode', () => {
    renderPage('?algo=quick&size=15&shape=random&seed=2');
    expect(screen.getAllByText('Comparisons')).toHaveLength(1);
    expect(screen.queryByText(/^Delta — /)).toBeNull();

    // The race toggle names the loaded algorithm, so it says what it will race.
    fireEvent.click(screen.getByLabelText(/Race Quick Sort against another/));

    /*
     * Two stats boxes side by side left the reader subtracting one column from
     * the other. There is now one strip that does the subtracting.
     */
    expect(screen.getByText(/^Delta — /)).toBeDefined();
    expect(screen.getByLabelText('Algorithm in slot A')).toBeDefined();
    expect(screen.getByLabelText('Algorithm in slot B')).toBeDefined();
  });

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

  /** Each side's own "n / total steps" readout, as [done, total] pairs. */
  function sideProgress(): Array<[number, number]> {
    return screen.getAllByText(/^[\d,]+ \/ [\d,]+ steps$/).map((element) => {
      const [done, total] = (element.textContent ?? '').replace(/,|steps/g, '').split('/');
      return [Number(done), Number(total)];
    });
  }

  it('scrubs in race mode, which the old bar refused to do', () => {
    /*
     * Scrubbing was disabled on the grounds that one cursor cannot mean the
     * same thing for two runs of different lengths. The shared clock answers
     * that: the cursor is a fraction, and both runs are seeked to it.
     */
    renderPage('?algo=quick&size=15&shape=random&seed=2&vs=merge');
    expect(scrubSlider().hasAttribute('disabled')).toBe(false);
  });

  it('keeps both runs level at the same percentage of their own length', () => {
    // Bubble and merge differ by roughly an order of magnitude at this size,
    // which is what makes a shared step index useless and a shared fraction
    // the only thing the two can agree on.
    renderPage('?algo=bubble&size=20&shape=random&seed=4&vs=merge');

    const [initialA, initialB] = sideProgress();
    expect(initialA[1]).not.toBe(initialB[1]);

    const slider = scrubSlider();
    const half = Math.floor(Number(slider.getAttribute('max')) / 2);
    fireEvent.change(slider, { target: { value: String(half) } });

    for (const [done, total] of sideProgress()) {
      expect(done / total).toBeGreaterThan(0.45);
      expect(done / total).toBeLessThan(0.55);
    }

    // And they finish together, rather than the shorter one stopping early.
    seekToEnd();
    for (const [done, total] of sideProgress()) expect(done).toBe(total);
  });
});
