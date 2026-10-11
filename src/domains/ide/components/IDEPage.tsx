import { useState } from 'react';
import { Scratchpad } from './Scratchpad';
import { SortVisualizer } from './SortVisualizer';
import css from './IDEPage.module.css';

type Mode = 'visualize' | 'scratchpad';

const MODES: Array<{ id: Mode; label: string; blurb: string }> = [
  {
    id: 'visualize',
    label: 'Visualize a sort',
    blurb: 'Write a sorting generator and replay its steps on the same engine as every built-in.',
  },
  {
    id: 'scratchpad',
    label: 'Scratchpad',
    blurb:
      'Run code in six languages. JavaScript stays in this tab; the rest compile on wandbox.org.',
  },
];

/**
 * Two tools under one tab.
 *
 * The visualizer opens first because it is the one that belongs here: it is
 * the only place a reader's own algorithm meets the replay engine the rest of
 * the app is built on. The scratchpad remains for everything else.
 */
export function IDEPage() {
  const [mode, setMode] = useState<Mode>('visualize');
  const active = MODES.find((entry) => entry.id === mode)!;

  return (
    <div className={css.page}>
      <header className={css.intro}>
        <h1>Code IDE</h1>
        <p>{active.blurb}</p>
      </header>

      <div className={css.modes} role="tablist" aria-label="IDE mode">
        {MODES.map((entry) => (
          <button
            type="button"
            key={entry.id}
            role="tab"
            aria-selected={mode === entry.id}
            className={`${css.mode} ${mode === entry.id ? css.modeOn : ''}`}
            onClick={() => setMode(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {mode === 'visualize' ? <SortVisualizer /> : <Scratchpad />}
    </div>
  );
}
