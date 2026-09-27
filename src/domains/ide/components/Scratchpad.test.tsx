import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Monaco is replaced with a plain textarea. Loading the real editor into jsdom
 * would test Microsoft's code, not this page — and the page's own logic (which
 * executor runs, what reaches the output panel, draft persistence) is the part
 * that had bugs.
 */
interface EditorStubProps {
  value: string;
  path: string;
  onChange?: (value: string) => void;
}

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, path, onChange }: EditorStubProps) => (
    <textarea aria-label={path} value={value} onChange={(event) => onChange?.(event.target.value)} />
  ),
  useMonaco: () => null,
}));

const { IDEPage } = await import('./IDEPage');

const output = () => screen.getByRole('status').textContent ?? '';

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('IDEPage', () => {
  it('runs JavaScript in-tab and shows what it printed', async () => {
    render(<IDEPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    // The default template greets, then reverses whatever stdin holds ("Hello").
    await waitFor(() => expect(output()).toContain('Hello, World!'));
    expect(output()).toContain('Reversed input: olleH');
  });

  it('says where the code executes, and updates when the language changes', async () => {
    render(<IDEPage />);
    expect(screen.getByText(/Nothing is uploaded/)).toBeDefined();

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'cpp' } });
    await waitFor(() => expect(screen.getByText(/your code leaves the browser/)).toBeDefined());
  });

  it('keeps each language on its own buffer', async () => {
    render(<IDEPage />);

    fireEvent.change(screen.getByLabelText('main.js'), { target: { value: 'console.log(1);' } });
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'python' } });

    await waitFor(() => expect(screen.getByLabelText('main.py')).toBeDefined());
    expect((screen.getByLabelText('main.py') as HTMLTextAreaElement).value).toContain('import sys');

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'javascript' } });
    await waitFor(() =>
      expect((screen.getByLabelText('main.js') as HTMLTextAreaElement).value).toBe('console.log(1);'),
    );
  });

  /**
   * The bug worth a page-level test: the executor used to flag any non-zero
   * exit as `error: 'Execution failed'`, and the page preferred `error` over
   * the real output — so the compiler message never reached the screen.
   */
  it('shows the compiler diagnostic when a build fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ status: '1', compiler_error: "prog.cc:3:5: error: 'x' was not declared" }),
      }),
    );

    render(<IDEPage />);
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'cpp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(output()).toContain("'x' was not declared"));
    expect(output()).not.toContain('Execution failed');
    expect(screen.getByText(/exit 1/)).toBeDefined();
  });

  /**
   * A build that only warns exits 0 and has succeeded. Flagging any stderr as
   * failure painted a working program's output in the failure colour.
   */
  it('does not treat a warning on a successful build as a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          status: '0',
          program_output: 'Hello, World!',
          compiler_error: 'prog.cc:1:2: warning: #warning heads up [-Wcpp]',
        }),
      }),
    );

    render(<IDEPage />);
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'cpp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(output()).toContain('Hello, World!'));
    expect(output()).toContain('warning');
    expect(screen.getByText(/exit 0/)).toBeDefined();
    // The failure styling is what must not appear on a clean exit.
    expect(screen.getByRole('status').className).not.toMatch(/error/);
  });

  it('surfaces an unreachable compiler service as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));

    render(<IDEPage />);
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'rust' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(output()).toMatch(/Could not reach wandbox.org/));
  });

  it('restores the template after an edit', async () => {
    render(<IDEPage />);
    const editor = () => screen.getByLabelText('main.js') as HTMLTextAreaElement;

    fireEvent.change(editor(), { target: { value: 'scratch' } });
    expect(editor().value).toBe('scratch');

    fireEvent.click(screen.getByRole('button', { name: /Reset to template/ }));
    await waitFor(() => expect(editor().value).toContain('Hello, World!'));
  });

  it('keeps drafts across a reload', async () => {
    const { unmount } = render(<IDEPage />);
    fireEvent.change(screen.getByLabelText('main.js'), { target: { value: 'remembered' } });

    await waitFor(() => expect(window.localStorage.getItem('dsa-visualizer:ide-code')).toContain('remembered'));
    unmount();

    render(<IDEPage />);
    expect((screen.getByLabelText('main.js') as HTMLTextAreaElement).value).toBe('remembered');
  });

  it('falls back to the templates when stored drafts are unreadable', () => {
    window.localStorage.setItem('dsa-visualizer:ide-code', 'not json');
    render(<IDEPage />);
    expect((screen.getByLabelText('main.js') as HTMLTextAreaElement).value).toContain('Hello, World!');
  });
});
