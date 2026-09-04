import { NavLink, Outlet } from 'react-router-dom';
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
  return (
    <div className={styles.shell}>
      <header className={styles.nav}>
        <NavLink to="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden />
          DSA Visualizer
        </NavLink>
        <nav className={styles.links}>
          {DOMAINS.map((domain) => (
            <NavLink
              key={domain.path}
              to={domain.path}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
              {domain.navLabel ?? domain.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
