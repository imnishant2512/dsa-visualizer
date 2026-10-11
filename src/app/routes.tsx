import { createBrowserRouter } from 'react-router-dom';
import { Landing } from './Landing';
import { LazyIDE } from './LazyIDE';
import { NotFound } from './NotFound';
import { Layout } from './Layout';
import { RouteError } from './RouteError';

/*
 * Each domain page is its own chunk, fetched when its route is first matched,
 * so the landing page does not download seven visualizers to show one. The
 * router holds the previous page on screen while the next chunk arrives,
 * rather than flashing a spinner between pages.
 */
const linearPage = async () => ({
  Component: (await import('../domains/linear/components/LinearPage')).LinearPage,
});

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    // Shown only if the layout itself fails; page errors are caught below it.
    errorElement: <RouteError />,
    // A deep link waits for its page's chunk before the first paint. Painting
    // nothing for that moment is better than a spinner that flashes past.
    hydrateFallbackElement: null,
    children: [
      {
        // Pathless, so a page that throws renders the error inside the layout
        // and the nav is still there to leave by.
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Landing /> },
          {
            path: 'sorting',
            lazy: async () => ({
              Component: (await import('../domains/sorting/components/SortingPage')).SortingPage,
            }),
          },
          {
            path: 'searching',
            lazy: async () => ({
              Component: (await import('../domains/searching/components/SearchingPage'))
                .SearchingPage,
            }),
          },
          {
            path: 'pathfinding',
            lazy: async () => ({
              Component: (await import('../domains/pathfinding/components/PathfindingPage'))
                .PathfindingPage,
            }),
          },
          // Bare /linear opens the page on its first tab.
          { path: 'linear', lazy: linearPage },
          { path: 'linear/:variant', lazy: linearPage },
          {
            path: 'trees',
            lazy: async () => ({
              Component: (await import('../domains/trees/components/TreesPage')).TreesPage,
            }),
          },
          {
            path: 'hashtables',
            lazy: async () => ({
              Component: (await import('../domains/hashtables/components/HashTablesPage'))
                .HashTablesPage,
            }),
          },
          {
            path: 'graphs',
            lazy: async () => ({
              Component: (await import('../domains/graphs/components/GraphsPage')).GraphsPage,
            }),
          },
          { path: 'ide', element: <LazyIDE /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
