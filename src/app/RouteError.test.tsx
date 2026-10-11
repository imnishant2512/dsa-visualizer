import { cleanup, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteError } from './RouteError';

function renderThrowing(error: Error) {
  function Broken(): never {
    throw error;
  }
  const router = createMemoryRouter([
    { path: '/', element: <Broken />, errorElement: <RouteError /> },
  ]);
  render(<RouterProvider router={router} />);
}

describe('RouteError', () => {
  // React and the router both log a caught render error; that is expected here.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('replaces a crashed page with a way to recover, and keeps the detail', () => {
    renderThrowing(new Error('cannot read properties of undefined'));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'This page hit an error' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy();
    expect(screen.getByText('cannot read properties of undefined')).toBeTruthy();
  });

  it('reads a chunk missing after a deploy as an update, not a fault', () => {
    renderThrowing(
      new TypeError('Failed to fetch dynamically imported module: /assets/SortingPage-abc.js'),
    );

    expect(screen.getByRole('heading', { name: 'A new version is available' })).toBeTruthy();
    expect(screen.queryByText('Technical detail')).toBeNull();
  });
});
