import { createBrowserRouter } from 'react-router-dom';
import { GraphsPage } from '../domains/graphs/components/GraphsPage';
import { HashTablesPage } from '../domains/hashtables/components/HashTablesPage';
import { LinearPage } from '../domains/linear/components/LinearPage';
import { PathfindingPage } from '../domains/pathfinding/components/PathfindingPage';
import { SearchingPage } from '../domains/searching/components/SearchingPage';
import { SortingPage } from '../domains/sorting/components/SortingPage';
import { TreesPage } from '../domains/trees/components/TreesPage';
import { Landing } from './Landing';
import { LazyIDE } from './LazyIDE';
import { NotFound } from './NotFound';
import { Layout } from './Layout';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Landing /> },
      { path: 'sorting', element: <SortingPage /> },
      { path: 'searching', element: <SearchingPage /> },
      { path: 'pathfinding', element: <PathfindingPage /> },
      { path: 'linear', element: <LinearPage /> },
      { path: 'linear/:variant', element: <LinearPage /> },
      { path: 'trees', element: <TreesPage /> },
      { path: 'hashtables', element: <HashTablesPage /> },
      { path: 'graphs', element: <GraphsPage /> },
      { path: 'ide', element: <LazyIDE /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
