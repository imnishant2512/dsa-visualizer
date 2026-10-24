import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { TreesPage } from './TreesPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/trees']}>
      <TreesPage />
    </MemoryRouter>,
  );
}

function setValue(value: number) {
  fireEvent.change(screen.getByLabelText(/Value/), { target: { value: String(value) } });
}

afterEach(cleanup);

describe('TreesPage', () => {
  it('refuses a duplicate insert and a missing delete before running them', () => {
    renderPage();

    /*
     * The seeded tree holds 50. Inserting it again used to run, animate a
     * search that found nothing to do, and report "already in the tree"
     * afterwards — styled like any other message.
     */
    setValue(50);
    const insert = screen.getByRole('button', { name: 'Insert 50' });
    expect(insert.hasAttribute('disabled')).toBe(true);
    expect(insert.getAttribute('title')).toMatch(/already in the tree/);

    setValue(999);
    const remove = screen.getByRole('button', { name: 'Delete 999' });
    expect(remove.hasAttribute('disabled')).toBe(true);
    expect(remove.getAttribute('title')).toMatch(/not in the tree/);

    // A search for a missing key is a legitimate question, not a refusal.
    expect(screen.getByRole('button', { name: 'Search 999' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('shows balance factors only in AVL mode, where they drive every rotation', () => {
    renderPage();
    const balanceLabels = () =>
      Array.from(document.querySelectorAll('svg text')).filter((t) =>
        /^[+-]?\d$/.test(t.textContent ?? '') && /balance/.test(t.getAttribute('class') ?? ''),
      );

    expect(balanceLabels()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'AVL tree' }));
    expect(balanceLabels().length).toBeGreaterThan(0);
  });

  it('states the heap index arithmetic for whatever is hovered', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Heap' }));

    /*
     * The tree drawing and the array beneath it are the same data, and the
     * arithmetic joining them was never shown. Index 1 has parent 0 and
     * children 3 and 4 in any heap with at least five items.
     */
    const cell = screen.getAllByText('1', { selector: 'em' })[0].parentElement as HTMLElement;
    fireEvent.pointerEnter(cell);

    const arithmetic = document.querySelector('[class*="arithmetic"]')?.textContent ?? '';
    expect(arithmetic).toMatch(/i = 1/);
    expect(arithmetic).toMatch(/2i\+1 = 3/);
    expect(arithmetic).toMatch(/2i\+2 = 4/);
  });

  it('offers a zoom control for the tree and not for the fixed-width heap', () => {
    renderPage();
    expect(screen.getByText('Zoom')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Heap' }));
    expect(screen.queryByText('Zoom')).toBeNull();
  });
});
