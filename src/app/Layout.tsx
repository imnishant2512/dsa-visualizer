import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { DOMAINS } from './domains';
import styles from './Layout.module.css';

/**
 * Brand block, then the eight domains as full-height cells.
 *
 * `nowrap` with horizontal overflow rather than `flex-wrap`: a wrapping nav
 * changes the header's height as the viewport moves, which shifts the whole
 * page under the reader. Scrolling keeps the header one fixed band.
 */
export function Layout() {
  const { pathname } = useLocation();

  return (
    <div className={styles.shell}>
      <header className={styles.nav}>
        <NavLink to="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden />
          DSA Visualizer
        </NavLink>
        <nav className={styles.links}>
          {DOMAINS.map((domain) => {
            const label = domain.navLabel ?? domain.label;
            if (domain.section === undefined) {
              return (
                <NavLink
                  key={domain.path}
                  to={domain.path}
                  className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
                >
                  {label}
                </NavLink>
              );
            }
            /*
             * A domain spanning several routes lights up for all of them. This
             * is a plain Link because NavLink owns `aria-current` and would only
             * set it on its exact target — the highlight and what a screen
             * reader announces as "current page" have to agree.
             */
            const inSection =
              pathname === domain.section || pathname.startsWith(`${domain.section}/`);
            return (
              <Link
                key={domain.path}
                to={domain.path}
                aria-current={inSection ? 'page' : undefined}
                className={`${styles.link} ${inSection ? styles.active : ''}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
