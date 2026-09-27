import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { LinearPage } from './LinearPage';

/**
 * The bug this file exists for: the page instantiates two controllers (one for
 * the array-backed structures, one for the linked list) and only the visible
 * one may play. Passing the same `playing` flag to both made the idle one
 * report itself finished and stop the clock immediately, so no operation ever
 * animated. No algorithm test could have caught it.
 */

function renderAt(variant: string) {
  return render(
    <MemoryRouter initialEntries={[`/linear/${variant}`]}>
      <Routes>
        <Route path="/linear/:variant" element={<LinearPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const counter = () => screen.getByText(/\d+ \/ \d+/).textContent ?? '';

afterEach(cleanup);

describe('LinearPage', () => {
  it.each(['array', 'stack', 'queue', 'linked-list'])(
    'starts an operation and animates it on the %s tab',
    async (variant) => {
      renderAt(variant);

      // Each tab's first operation button inserts/pushes/enqueues.
      const [firstOperation] = screen.getAllByRole('button', {
        name: /Insert|Push|Enqueue/,
      });
      fireEvent.click(firstOperation);

      // The regression froze the cursor at 0/0 forever, so an operation
      // starting and advancing at all is the whole assertion. Waiting for it
      // to *finish* would tie the test to wall-clock animation speed, which is
      // what made this flaky on a loaded machine.
      await waitFor(() => expect(counter()).not.toMatch(/^0 \/ 0$/));
    },
  );

  it('pushes then pops a stack, leaving the original values', async () => {
    renderAt('stack');
    expect(screen.getByText('12')).toBeDefined();

    /*
     * At the page's default 240ms a step, the pop's removal lands about three
     * ticks in — close enough to waitFor's own 1s default that the test failed
     * whenever the machine was busy. The 4x preset is the same playback path.
     */
    fireEvent.click(screen.getByRole('button', { name: '4×' }));

    fireEvent.click(screen.getByRole('button', { name: /Push/ }));
    await waitFor(() => expect(screen.getByText('9')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /^Pop$/ }));
    await waitFor(() => expect(screen.queryByText('9')).toBeNull());
  });

  it('records committed operations in the history and undoes them', async () => {
    renderAt('stack');
    expect(screen.getByText(/No operations yet/)).toBeDefined();

    // "Push 9" also appears on the button and the pseudocode title, so scope
    // the assertion to the history panel.
    const history = () =>
      screen.getByRole('button', { name: /Undo last/ }).closest('div')!.parentElement!;

    fireEvent.click(screen.getByRole('button', { name: /Push/ }));
    await waitFor(() => expect(within(history()).getByText(/Push 9/)).toBeDefined());

    // First undo cancels the still-active operation rather than a committed one.
    fireEvent.click(screen.getByRole('button', { name: /Undo last/ }));
    await waitFor(() => expect(screen.getByText(/No operations yet/)).toBeDefined());
  });

  it('stops offering Pop rather than letting the stack underflow', () => {
    renderAt('stack');

    // Starting an operation commits whatever was still in flight, so the pops
    // can be fired back to back. Waiting for each of the four to animate would
    // put four sequential playbacks inside one test's time budget — which is
    // exactly what made this flaky.
    const popButton = () => screen.getByRole('button', { name: /^Pop$/ });
    for (let i = 0; i < 4; i++) fireEvent.click(popButton());

    /*
     * The page seeds every structure with four values, so those four pops
     * empty it. This used to be where a fifth pop ran and reported "stack
     * underflow" afterwards; the operation is now refused before it runs, and
     * the control says why.
     */
    expect(popButton().hasAttribute('disabled')).toBe(true);
    expect(popButton().getAttribute('title')).toMatch(/empty/i);
  });
});

describe('LinearPage validation', () => {
  /** Runs an operation and lets it finish by seeking to the end. */
  function runAndFinish(name: RegExp) {
    fireEvent.click(screen.getByRole('button', { name }));
    const slider = screen.getAllByRole('slider')[0];
    fireEvent.change(slider, { target: { value: slider.getAttribute('max') } });
  }

  it('refuses an impossible operation before it runs, not after', () => {
    renderAt('stack');

    /*
     * The old page offered Pop unconditionally, ran it against an empty stack,
     * and reported "stack underflow" afterwards in the same informational blue
     * as a success — so the control said Pop, you pressed it, and nothing
     * happened with no obvious reason why.
     */
    const pop = () => screen.getByRole('button', { name: 'Pop' });
    expect(pop().hasAttribute('disabled')).toBe(false);

    // Four seeded items, so four pops empties it.
    for (let i = 0; i < 4; i++) runAndFinish(/^Pop$/);

    expect(pop().hasAttribute('disabled')).toBe(true);
    expect(pop().getAttribute('title')).toMatch(/empty/i);
  });

  it('states the valid index range beside the field and marks it when out of range', () => {
    renderAt('array');
    const field = screen.getByLabelText(/Index/) as HTMLInputElement;

    // Four seeded items: 0..4 are all insertable positions.
    expect(screen.getByText('0–4')).toBeDefined();
    expect(field.getAttribute('aria-invalid')).toBeNull();

    fireEvent.change(field, { target: { value: '9' } });
    expect(field.getAttribute('aria-invalid')).toBe('true');
    // Insert allows one past the end; remove does not.
    expect(screen.getByRole('button', { name: /^Remove index 9$/ }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('keeps operations enabled while they are still possible', () => {
    renderAt('queue');
    expect(screen.getByRole('button', { name: 'Dequeue' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Peek front' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('SeqView stack orientation', () => {
  it('draws a stack as a column from a fixed base, not as a row', () => {
    /*
     * The CSS commented that a stack "grows upward" and then set
     * `flex-direction: row`, so it rendered identically to an array — hiding
     * the one property that makes it a stack.
     */
    renderAt('stack');
    const cells = document.querySelector('[class*="cells"]') as HTMLElement;
    expect(getComputedStyle(cells).flexDirection).toBe('column-reverse');
    expect(screen.getByText('base')).toBeDefined();
    expect(screen.getByText('top')).toBeDefined();
  });

  it('leaves the array laid out as a row', () => {
    renderAt('array');
    const cells = document.querySelector('[class*="cells"]') as HTMLElement;
    expect(getComputedStyle(cells).flexDirection).toBe('row');
    expect(screen.queryByText('base')).toBeNull();
  });
});
