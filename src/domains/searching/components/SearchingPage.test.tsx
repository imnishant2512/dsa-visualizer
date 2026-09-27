import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { randomSortedArray } from '../../../shared/utils/randomArray';
import { pickMissing } from '../targets';
import { SearchingPage } from './SearchingPage';

function renderPage(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/searching${search}`]}>
      <SearchingPage />
    </MemoryRouter>,
  );
}

/** How many bars are currently painted in each state. */
function barStates(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const bar of Array.from(document.querySelectorAll('[class*="_bar_"]'))) {
    for (const name of ['found', 'read', 'excluded', 'compare', 'idle']) {
      if (new RegExp(`_${name}_`).test(bar.className)) counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  return counts;
}

function seekToEnd() {
  const slider = screen.getAllByRole('slider').find((s) => s.getAttribute('aria-label'));
  if (!slider) throw new Error('no scrub slider');
  fireEvent.change(slider, { target: { value: slider.getAttribute('max') } });
}

afterEach(cleanup);

describe('SearchingPage', () => {
  it('ends a late hit looking like a hit, with its trail of reads still visible', () => {
    // Binary search for the last element: several probes, and a final window
    // that leaves most of the array outside it.
    const values = randomSortedArray(30, 7);
    renderPage(`?algo=binary&size=30&seed=7&target=${values[29]}`);
    seekToEnd();

    const states = barStates();
    expect(states.found).toBe(1);
    /*
     * The regression: probed bars were repainted "excluded" once the window
     * moved past them, and excluded was a shade off the chart well — so the
     * end of a successful search was one green bar in an apparently empty
     * chart, just like a miss. The reads that *are* the search now persist.
     */
    expect(states.read ?? 0).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/^Found .* probes into 30 values\.$/)).toBeDefined();
  });

  it('offers a miss in one tap, and the miss closes the window all the way', () => {
    renderPage('?algo=binary&size=30&seed=7');
    fireEvent.click(screen.getByRole('button', { name: 'Not in the array' }));
    expect(
      screen.getByRole('button', { name: 'Not in the array' }).getAttribute('aria-pressed'),
    ).toBe('true');

    seekToEnd();
    expect(barStates().found ?? 0).toBe(0);
    expect(screen.getByText(/is not in the array\. Ruled out all 30 values/)).toBeDefined();
  });

  it('keeps the chip in sync with a hand-typed target', () => {
    const values = randomSortedArray(30, 7);
    renderPage(`?algo=binary&size=30&seed=7&target=${values[3]}`);
    expect(screen.getByRole('button', { name: 'In the array' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    fireEvent.change(screen.getByRole('spinbutton', { name: /Target/ }), {
      target: { value: String(pickMissing(values)) },
    });
    expect(
      screen.getByRole('button', { name: 'Not in the array' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

describe('pickMissing', () => {
  it('picks an absent value from inside the range, not past either end', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const values = randomSortedArray(30, seed);
      const missing = pickMissing(values);
      expect(values).not.toContain(missing);
      // Inside the range is what forces a search to narrow all the way down,
      // rather than bailing out on its first comparison.
      expect(missing).toBeGreaterThan(values[0]);
      expect(missing).toBeLessThan(values[values.length - 1]);
    }
  });

  it('falls back past the end when the array has no gaps', () => {
    expect(pickMissing([1, 2, 3, 4])).toBe(5);
  });
});
