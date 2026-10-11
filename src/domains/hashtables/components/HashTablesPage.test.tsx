import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { HashTablesPage } from './HashTablesPage';

/**
 * The page's premise is that you can compare the two collision strategies on
 * the same keys. Switching used to call reset(), which destroyed those keys at
 * exactly the moment you tried to compare them, so that is what these cover.
 */

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/hashtables']}>
      <HashTablesPage />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

/** Every key currently drawn in the live table, in bucket order. */
function liveTableKeys(): number[] {
  const table = document.querySelector('[class*="table"]');
  if (!table) return [];
  return Array.from(table.querySelectorAll('[class*="slot"], [class*="hitSlot"]'))
    .map((element) => element.textContent ?? '')
    .filter((text) => !text.startsWith('✕') && /^\d+$/.test(text))
    .map(Number);
}

/** The slot contents of one bucket row, excluding the bucket's index label. */
function chainAt(bucket: number): string[] {
  const table = document.querySelector('[class*="table"]') as HTMLElement;
  const chain = (table.children[bucket] as HTMLElement).querySelector(
    '[class*="chain"]',
  ) as HTMLElement;
  return within(chain)
    .getAllByText(/^\d+$/)
    .map((element) => element.textContent ?? '');
}

function setKeyTo(value: number) {
  fireEvent.change(screen.getByLabelText(/Key/), { target: { value: String(value) } });
}

/** Runs an operation and lets it commit by finishing it immediately. */
function runOperation(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
  const slider = screen.getAllByRole('slider')[0];
  fireEvent.change(slider, { target: { value: slider.getAttribute('max') } });
}

describe('HashTablesPage', () => {
  it('keeps the keys when the collision strategy changes', () => {
    renderPage();

    setKeyTo(27);
    runOperation(/^Insert 27$/);
    expect(liveTableKeys()).toContain(27);
    const before = [...liveTableKeys()].sort((a, b) => a - b);

    fireEvent.click(screen.getByRole('button', { name: 'Chaining' }));

    /*
     * The regression: this used to come back as the seeded table, with 27 —
     * and anything else you had inserted — gone.
     */
    expect([...liveTableKeys()].sort((a, b) => a - b)).toEqual(before);
  });

  it('lays the same keys out differently under each strategy', () => {
    renderPage();
    setKeyTo(16);
    runOperation(/^Insert 16$/);

    // 5, 16 and 27 all hash to bucket 5. Under chaining they stack there.
    fireEvent.click(screen.getByRole('button', { name: 'Chaining' }));
    expect(chainAt(5)).toEqual(['5', '16']);

    // Under probing they cannot, because a bucket holds one slot.
    fireEvent.click(screen.getByRole('button', { name: 'Linear probing' }));
    expect(chainAt(5)).toHaveLength(1);
  });

  it('shows the other strategy alongside, holding the same keys', () => {
    renderPage();
    // The reference panel is what makes the toggle a choice about which one to
    // step through, rather than the only way to see the alternative at all.
    expect(screen.getByText(/Chaining — same keys/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Chaining' }));
    expect(screen.getByText(/Linear probing — same keys/)).toBeDefined();
  });

  it('grows to the next prime on rehash and keeps every key', () => {
    renderPage();
    const before = [...liveTableKeys()].sort((a, b) => a - b);
    expect(before.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Rehash to 23/ }));

    expect([...liveTableKeys()].sort((a, b) => a - b)).toEqual(before);
    expect(screen.getByRole('button', { name: /Rehash to 47/ })).toBeDefined();
    // The hash itself changes with the capacity, so the page has to say so.
    expect(screen.getByText(/key % 23/)).toBeDefined();
  });

  it('warns once the load factor passes the threshold', () => {
    renderPage();
    expect(screen.queryByText(/is past 0.70/)).toBeNull();

    // Eleven buckets, four seeded keys: four more crosses 0.70.
    for (const key of [1, 2, 3, 4]) {
      setKeyTo(key);
      runOperation(new RegExp(`^Insert ${key}$`));
    }

    expect(screen.getByText(/is past 0.70/)).toBeDefined();
  });
});
