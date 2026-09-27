import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { useMonaco, type OnMount } from '@monaco-editor/react';
import { SUPPORTED_LANGUAGES, type LanguageId } from '../languageConfig';
import { executeJavaScript, type ExecutionResult } from '../executors/browserExecutor';
import { executeWandbox } from '../executors/wandboxExecutor';
import { parseDiagnostics } from '../diagnostics';
import css from './IDEPage.module.css';

const STORAGE_KEY = 'dsa-visualizer:ide-code';
const MARKER_OWNER = 'dsa-visualizer';

const templates = () =>
  Object.fromEntries(
    SUPPORTED_LANGUAGES.map((lang) => [lang.id, lang.helloWorldTemplate]),
  ) as Record<LanguageId, string>;

/** Drafts survive a reload. A private window or blocked storage is not an error. */
function loadDrafts(): Record<LanguageId, string> {
  const base = templates();
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return base;
    const parsed = JSON.parse(saved) as Partial<Record<LanguageId, string>>;
    for (const lang of SUPPORTED_LANGUAGES) {
      const draft = parsed[lang.id];
      if (typeof draft === 'string') base[lang.id] = draft;
    }
  } catch {
    // Ignore — an unreadable or malformed draft just means the templates win.
  }
  return base;
}

export function IDEPage() {
  const monaco = useMonaco();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const runningRef = useRef(false);
  const runTokenRef = useRef(0);
  const [language, setLanguage] = useState<LanguageId>('javascript');
  const [codes, setCodes] = useState<Record<LanguageId, string>>(loadDrafts);
  const [stdin, setStdin] = useState('Hello');
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const currentCode = codes[language];
  const langConfig = SUPPORTED_LANGUAGES.find((lang) => lang.id === language)!;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
    } catch {
      // Storage can be full or blocked; losing a draft is not worth an error.
    }
  }, [codes]);

  const clearMarkers = useCallback(() => {
    if (!monaco) return;
    for (const model of monaco.editor.getModels()) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
    }
  }, [monaco]);

  const runCode = useCallback(async () => {
    /*
     * The Run button is disabled while a run is in flight, but Ctrl+Enter is
     * not a button — without this guard the shortcut could start a second
     * concurrent run (and a second Wandbox request) on top of the first.
     */
    if (runningRef.current) return;
    runningRef.current = true;

    // Invalidates any result that arrives after the user has moved on.
    const token = ++runTokenRef.current;

    setIsRunning(true);
    setResult(null);
    clearMarkers();

    try {
      const outcome = langConfig.wandboxCompiler
        ? await executeWandbox(currentCode, langConfig.wandboxCompiler, stdin)
        : await executeJavaScript(currentCode, stdin);

      // The user switched language (or reset) while this was in flight; its
      // output belongs to a file that is no longer on screen.
      if (token !== runTokenRef.current) return;
      setResult(outcome);

      if (outcome.stderr && monaco) {
        const diagnostics = parseDiagnostics(outcome.stderr);
        /*
         * The *active* model, not `getModels()[0]`. Each language gets its own
         * model (keyed by filename), and the first one created is whichever
         * language was open first — so marking `getModels()[0]` pinned every
         * diagnostic to main.js no matter which language had just failed.
         */
        const model = editorRef.current?.getModel();
        if (model && diagnostics.length > 0) {
          monaco.editor.setModelMarkers(
            model,
            MARKER_OWNER,
            diagnostics.map((diagnostic) => {
              const line = Math.min(diagnostic.line, model.getLineCount());
              return {
                startLineNumber: line,
                startColumn: diagnostic.column,
                endLineNumber: line,
                endColumn: model.getLineMaxColumn(line),
                message: diagnostic.message,
                severity:
                  diagnostic.severity === 'warning'
                    ? monaco.MarkerSeverity.Warning
                    : monaco.MarkerSeverity.Error,
              };
            }),
          );
        }
      }
    } catch (err) {
      if (token === runTokenRef.current) {
        setResult({
          stdout: '',
          stderr: '',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }, [clearMarkers, currentCode, langConfig, monaco, stdin]);

  /*
   * Monaco's `addCommand` runs once on mount and keeps whatever closure it was
   * handed forever. Passing `runCode` directly froze the first render's code,
   * stdin and language, so Ctrl+Enter always re-ran the untouched JavaScript
   * template. The ref is what keeps the shortcut pointed at the current run.
   */
  const runRef = useRef(runCode);
  useEffect(() => {
    runRef.current = runCode;
  }, [runCode]);

  const handleEditorMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
      runRef.current();
    });
  };

  const resetToTemplate = () => {
    runTokenRef.current += 1;
    setCodes((prev) => ({ ...prev, [language]: langConfig.helloWorldTemplate }));
    setResult(null);
    clearMarkers();
  };

  /*
   * Deliberately not `result.stderr` — a build that only warns writes to the
   * same stream and still succeeds, so treating any stderr as failure paints a
   * clean `exit 0` run red. Failure is not being able to run it, or a non-zero
   * exit.
   */
  const failed = Boolean(result && (result.error || (result.exitCode ?? 0) !== 0));
  const body = result ? [result.stdout, result.stderr, result.error].filter(Boolean).join('\n') : '';

  return (
    <div className={css.container}>
      <div className={css.toolbar}>
        <label className={css.field} htmlFor="ide-language">
          Language
        </label>
        <select
          id="ide-language"
          className={css.select}
          value={language}
          onChange={(event) => {
            runTokenRef.current += 1;
            setLanguage(event.target.value as LanguageId);
            setResult(null);
            clearMarkers();
          }}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.label}
            </option>
          ))}
        </select>

        <button className={css.runBtn} onClick={runCode} disabled={isRunning}>
          {isRunning ? 'Running…' : 'Run'}
        </button>
        <button className={css.secondaryBtn} onClick={resetToTemplate} disabled={isRunning}>
          Reset to template
        </button>
        <kbd className={css.hint}>Ctrl + Enter</kbd>

        <p className={css.where}>
          {langConfig.wandboxCompiler ? (
            <>
              Compiled on <strong>wandbox.org</strong> — your code leaves the browser.
            </>
          ) : (
            <>Runs in a sandboxed worker in this tab. Nothing is uploaded.</>
          )}
        </p>
      </div>

      <div className={css.workspace}>
        <div className={css.editorSection}>
          <div className={css.header}>{langConfig.filename}</div>
          <Editor
            height="100%"
            language={langConfig.monacoLanguage}
            theme="vs-dark"
            path={langConfig.filename}
            value={currentCode}
            onChange={(value) => setCodes((prev) => ({ ...prev, [language]: value ?? '' }))}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              padding: { top: 16 },
              scrollBeyondLastLine: false,
            }}
          />
        </div>

        <div className={css.rightPanel}>
          <div className={css.inputSection}>
            <label className={css.header} htmlFor="ide-stdin">
              Standard input
            </label>
            <textarea
              id="ide-stdin"
              className={css.inputArea}
              value={stdin}
              onChange={(event) => setStdin(event.target.value)}
              placeholder="Piped to the program as stdin…"
            />
          </div>

          <div className={css.outputSection}>
            <div className={css.header}>
              Output
              {result?.executionTimeMs !== undefined && (
                <span className={css.meta}>
                  {result.exitCode !== undefined && `exit ${result.exitCode} · `}
                  {result.executionTimeMs} ms
                </span>
              )}
            </div>
            <pre
              className={`${css.output} ${failed ? css.error : ''}`}
              role="status"
              aria-live="polite"
              aria-busy={isRunning}
            >
              {isRunning
                ? 'Running…'
                : body || (result ? 'No output.' : 'Run the code to see output.')}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
