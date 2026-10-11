import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Monaco is replaced with a plain textarea, as in the scratchpad tests: the
 * page's own logic — what gets recorded, replayed and judged — is under test,
 * not the editor.
 */
interface EditorStubProps {
  value: string;
  path: string;
  onChange?: (value: string) => void;
}

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, path, onChange }: EditorStubProps) => (
    <textarea
      aria-label={path}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
  useMonaco: () => null,
}));

const { IDEPage } = await import('./IDEPage');

const editor = () => screen.getByLabelText('customSort.js') as HTMLTextAreaElement;

function typeCode(code: string) {
  fireEvent.change(editor(), { target: { value: code } });
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('IDEPage', () => {
  it('opens on the sort visualizer and records the template on arrival', async () => {
    render(<IDEPage />);
    expect(
      screen.getByRole('tab', { name: 'Visualize a sort' }).getAttribute('aria-selected'),
    ).toBe('true');
    // The template is a correct bubble sort, so the verdict must say so.
    await waitFor(() => expect(screen.getByText(/^Sorted correctly — /)).toBeDefined());
  });

  it('replays the recording on the shared player, forwards and back', async () => {
    render(<IDEPage />);
    await waitFor(() => expect(screen.getByText(/^Sorted correctly/)).toBeDefined());

    // The template's first step is always a comparison of a[0] with a[1].
    fireEvent.click(screen.getByRole('button', { name: 'Step forward' }));
    expect(screen.getByText(/^Compared a\[0\] \(\d+\) with a\[1\]/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Step forward' }));
    expect(screen.getByText(/^2 \/ [\d,]+$/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Step back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step back' }));
    expect(screen.getByRole('button', { name: 'Step back' }).hasAttribute('disabled')).toBe(true);
  });

  it('tells a sort that stops early that it did not sort', async () => {
    render(<IDEPage />);
    await waitFor(() => expect(screen.getByText(/^Sorted correctly/)).toBeDefined());

    // One pass of bubble sort: plausible-looking, and wrong.
    typeCode(`function* customSort(ctx) {
      for (let j = 0; j < ctx.length - 1; j++) {
        yield* ctx.compare(j, j + 1);
        if (ctx.at(j) > ctx.at(j + 1)) yield* ctx.swap(j, j + 1);
      }
    }`);
    fireEvent.click(screen.getByRole('button', { name: 'Record again' }));

    await waitFor(() => expect(screen.getByText(/^Not sorted: a\[\d+\]/)).toBeDefined());
  });

  it('reports a broken sort as an error instead of a blank chart', async () => {
    render(<IDEPage />);
    await waitFor(() => expect(screen.getByText(/^Sorted correctly/)).toBeDefined());

    typeCode('function* customSort(ctx) { yield* ctx.compare(0, ctx.length); }');
    fireEvent.click(screen.getByRole('button', { name: 'Record again' }));

    await waitFor(() => expect(screen.getByText(/is not an index/)).toBeDefined());
    expect(screen.getByText('Error')).toBeDefined();
  });

  it('flags a recording that no longer matches the code in the editor', async () => {
    render(<IDEPage />);
    await waitFor(() => expect(screen.getByText(/^Sorted correctly/)).toBeDefined());

    typeCode(`${editor().value}\n// an edit`);
    expect(screen.getByText(/changed since this recording/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Record again' })).toBeDefined();
  });

  it('does not run a saved draft until asked', () => {
    // A draft is the reader's own code; only the template records on arrival.
    window.localStorage.setItem('dsa-visualizer:ide-sort', 'function* customSort(ctx) {}');
    render(<IDEPage />);
    expect(screen.getByText(/^Press Record to run your sort/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Record' })).toBeDefined();
  });

  it('keeps the multi-language scratchpad one tab away', () => {
    render(<IDEPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Scratchpad' }));
    expect(screen.getByRole('button', { name: 'Run' })).toBeDefined();
    expect(screen.queryByLabelText('customSort.js')).toBeNull();
  });
});
