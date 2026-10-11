import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import styles from './StatusPage.module.css';

/**
 * Chunk names are content-hashed, so a tab opened before a deploy asks for
 * files the new deploy no longer has. Browsers word the failure differently.
 */
const STALE_CHUNK =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

function describe(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * What a page that throws renders instead of a white screen.
 *
 * Mounted as the error element of the routes *inside* the layout, so the nav
 * stays put and the reader can leave for another domain. A navigation clears
 * it on its own.
 */
export function RouteError() {
  const error = useRouteError();
  const message = describe(error);
  const stale = STALE_CHUNK.test(message);

  return (
    <div className={styles.page} role="alert">
      <div className={styles.kicker}>{stale ? 'Updated' : 'Error'}</div>
      <h1>{stale ? 'A new version is available' : 'This page hit an error'}</h1>
      <p className={styles.lede}>
        {stale
          ? 'The site was updated after this tab opened, and part of the page it asked for has been replaced. Reloading fetches the current version.'
          : 'Something on this page failed while it was drawing. Reloading usually clears it; the other pages are unaffected.'}
      </p>
      <div className={styles.actions}>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
        <Link to="/">Home</Link>
      </div>
      {!stale && (
        <details className={styles.detail}>
          <summary>Technical detail</summary>
          <pre>{message}</pre>
        </details>
      )}
    </div>
  );
}
