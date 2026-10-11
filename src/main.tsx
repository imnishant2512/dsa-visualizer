import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/routes';
// Archivo is bundled rather than fetched from Google Fonts: the site makes no
// third-party requests, works offline, and runs under a CSP of 'self'.
// Only the weights the stylesheets use; <strong> (700) resolves to 800.
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/800.css';
import './shared/styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
