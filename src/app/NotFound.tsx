import { Link, useLocation } from 'react-router-dom';
import { DOMAINS } from './domains';
import styles from './NotFound.module.css';

/**
 * What a wrong link lands on.
 *
 * The catch-all route used to render the landing page, so a mistyped or stale
 * URL showed the homepage with the bad address still in the bar and nothing to
 * say the link had failed — the reader could reasonably conclude the page they
 * were sent to *was* the homepage. This names the path and offers the real
 * destinations.
 */
export function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className={styles.page}>
      <div className={styles.kicker}>404</div>
      <h1>Page not found</h1>
      <p className={styles.lede}>
        Nothing lives at <code>{pathname}</code>. The link may be mistyped, or from an older version
        of the site.
      </p>
      <ul className={styles.links}>
        {DOMAINS.map((domain) => (
          <li key={domain.path}>
            <Link to={domain.path}>{domain.label}</Link>
          </li>
        ))}
        <li>
          <Link to="/">Home</Link>
        </li>
      </ul>
    </div>
  );
}
