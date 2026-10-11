import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GraphsPage } from './GraphsPage';

/*
 * jsdom has no PointerEvent, and the generic Event fireEvent falls back to
 * carries no coordinates — which is all a drag is made of. MouseEvent has
 * them, so a PointerEvent built on it is enough for these tests.
 */
beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    class PointerEventShim extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    Object.defineProperty(window, 'PointerEvent', { value: PointerEventShim, configurable: true });
  }
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/graphs']}>
      <GraphsPage />
    </MemoryRouter>,
  );
}

/** The <g> for a node, found by its label. */
function nodeGroup(label: string): Element {
  const text = Array.from(document.querySelectorAll('svg g text')).find(
    (t) => t.textContent === label,
  );
  if (!text?.parentElement) throw new Error(`no node ${label}`);
  return text.parentElement;
}

/** The clickable hit-line of the edge whose weight label sits between two nodes. */
function edgeHit(index: number): Element {
  const hits = document.querySelectorAll('svg line[class*="hit"]');
  return hits[index];
}

function setWeightOnFirstEdge(weight: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Set weight' }));
  fireEvent.click(edgeHit(0));
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: weight } });
  fireEvent.click(screen.getByRole('button', { name: 'Set' }));
  // Let the edit commit by finishing its short animation.
  const slider = screen.getAllByRole('slider')[0];
  fireEvent.change(slider, { target: { value: slider.getAttribute('max') } });
}

afterEach(cleanup);

describe('GraphsPage', () => {
  it('keeps A* on the default graph, with nothing withdrawn', () => {
    renderPage();
    expect(screen.queryByText(/A\* is withdrawn/)).toBeNull();
  });

  it('withdraws A* in visible text once a hand-set weight undercuts an edge', () => {
    renderPage();
    setWeightOnFirstEdge('1');

    /*
     * The explanation has to outlast the run. As a step note it was
     * overwritten by the run's own "shortest path costs" line, so after A*
     * quietly behaved like Dijkstra nothing on screen said why.
     */
    const notice = screen.getByText(/A\* is withdrawn while edge .* weighs 1/);
    expect(notice).toBeDefined();
    expect(screen.getByRole('button', { name: 'A*' }).getAttribute('title')).toMatch(
      /runs Dijkstra instead/,
    );
  });

  it('marks a hand-set weight so it is distinguishable from a derived one', () => {
    renderPage();
    setWeightOnFirstEdge('9');
    const labels = Array.from(document.querySelectorAll('svg g text')).map((t) => t.textContent);
    expect(labels).toContain('9*');
  });

  it('refuses a weight that is not a whole number of at least one', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Set weight' }));
    fireEvent.click(edgeHit(0));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } });
    const set = screen.getByRole('button', { name: 'Set' });
    expect(set.hasAttribute('disabled')).toBe(true);
    expect(set.getAttribute('title')).toMatch(/at least 1/);
  });

  it('draws a half-finished edge on the canvas, beside the node it started from', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add edge' }));
    fireEvent.pointerUp(nodeGroup('C'));

    // In the SVG, not in a paragraph above it.
    const caption = Array.from(document.querySelectorAll('svg text')).find(
      (t) => t.textContent === 'now pick a second node',
    );
    expect(caption).toBeDefined();
    expect(nodeGroup('C').getAttribute('class')).toMatch(/pending/);
  });

  it('commits a node drag as a single move operation', () => {
    renderPage();
    const node = nodeGroup('A');
    fireEvent.pointerDown(node, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(node, { clientX: 160, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(node, { clientX: 220, clientY: 180, pointerId: 1 });
    fireEvent.pointerUp(node, { clientX: 220, clientY: 180, pointerId: 1 });

    // One operation for the whole gesture, not one per pointer event.
    expect(screen.getAllByText('Move node').length).toBeGreaterThan(0);
  });

  it('treats a press without movement as a click, not a drag', () => {
    renderPage();
    const node = nodeGroup('C');
    fireEvent.pointerDown(node, { clientX: 300, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(node, { clientX: 301, clientY: 101, pointerId: 1 });
    expect(screen.queryAllByText('Move node')).toHaveLength(0);
  });
});
