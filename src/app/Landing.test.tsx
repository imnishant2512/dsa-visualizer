import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATH_ALGORITHMS } from '../domains/pathfinding/algorithms';
import { SORT_ALGORITHMS } from '../domains/sorting/registry';
import { randomSortedArray } from '../shared/utils/randomArray';
import { HERO_TICK_MS, HeroDemo } from './HeroDemo';
import { Landing } from './Landing';

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

/** The hero's "N / total" readout, as numbers. */
function heroCounter(): { at: number; total: number } {
  const text = screen.getByText(/^\d+ \/ \d+$/).textContent ?? '';
  const [at, total] = text.split('/').map((part) => Number(part.trim()));
  return { at, total };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HeroDemo', () => {
  it('runs forward to the end, then genuinely backward', () => {
    vi.useFakeTimers();
    render(<HeroDemo />);
    expect(screen.getByText('forward')).toBeDefined();

    const { total } = heroCounter();
    // Enough ticks to reach the end at two steps a tick, plus the pause there.
    act(() => {
      vi.advanceTimersByTime(HERO_TICK_MS * (total / 2 + 40));
    });

    /*
     * The point of the demo: the counter goes *down*. This is the real bubble
     * sort stepped back with the real invertStep — if reversal were
     * approximate anywhere, the page's opening claim would be the first
     * thing to show it.
     */
    expect(screen.getByText('reverse')).toBeDefined();
    const partway = heroCounter().at;
    act(() => {
      vi.advanceTimersByTime(HERO_TICK_MS * 10);
    });
    expect(heroCounter().at).toBeLessThan(partway);
  });

  it('does not autoplay when the reader has asked for reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('reduce'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    vi.useFakeTimers();
    render(<HeroDemo />);

    const before = heroCounter().at;
    act(() => {
      vi.advanceTimersByTime(HERO_TICK_MS * 50);
    });
    expect(heroCounter().at).toBe(before);
    // Offered, not imposed.
    expect(screen.getByRole('button', { name: 'Play the loop' })).toBeDefined();
  });
});

describe('Landing', () => {
  it('links each scenario to a configured, reproducible run', () => {
    renderLanding();
    const href = (title: string) =>
      screen.getByText(title).closest('a')?.getAttribute('href') ?? '';

    expect(href('Watch Quick Sort degrade')).toBe(
      '/sorting?algo=quick&size=70&shape=reversed&seed=2024',
    );
    expect(href('Merge versus Quick, one array')).toMatch(/[?&]vs=quick/);

    // The "absent" scenario has to actually be absent, or it is a hit.
    const absent = new URL(href('Search for something absent'), 'http://x').searchParams;
    const values = randomSortedArray(Number(absent.get('size')), Number(absent.get('seed')));
    expect(values).not.toContain(Number(absent.get('target')));
  });

  it('counts each domain from its registry rather than from prose', () => {
    renderLanding();
    expect(screen.getByText(`${SORT_ALGORITHMS.length} algorithms`)).toBeDefined();
    // The old copy said five; there are six.
    expect(screen.getByText(`${PATH_ALGORITHMS.length} algorithms`)).toBeDefined();
  });

  it('lists all eight domains, in order, as links', () => {
    renderLanding();
    const items = document.querySelectorAll('ol li a');
    expect(items).toHaveLength(8);
    expect(items[0].getAttribute('href')).toBe('/sorting');
  });
});
