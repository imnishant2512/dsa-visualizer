import { describe, expect, it } from 'vitest';
import { balanceOf, heightOf, layoutTree } from './layout';
import type { TreeState } from './types';

/**
 * A rotation briefly leaves a subtree unreferenced. It used to vanish from the
 * layout and get parked in a row at the bottom-left, so these pin the two
 * things that replaced that: every node is placed, and a detached one keeps
 * roughly the position it had.
 */

function tree(nodes: TreeState['nodes'], rootId: string | null): TreeState {
  return { nodes, rootId, pointer: null, foundId: null, visited: [], note: null };
}

const n = (value: number, leftId: string | null = null, rightId: string | null = null) => ({
  value,
  leftId,
  rightId,
});

describe('layoutTree', () => {
  it('places every node, including one nothing points at', () => {
    const attached = tree(
      { a: n(20, 'b', 'c'), b: n(10), c: n(30) },
      'a',
    );
    // The middle of a right-rotation: a's left pointer has been cleared, so b
    // is unreferenced for a step.
    const midRotation = tree({ a: n(20, null, 'c'), b: n(10), c: n(30) }, 'a');

    expect(Object.keys(layoutTree(attached).positions)).toHaveLength(3);
    expect(Object.keys(layoutTree(midRotation).positions)).toHaveLength(3);
    expect(layoutTree(midRotation).detached).toEqual(['b']);
  });

  it('keeps a detached node near the position it had', () => {
    /*
     * A rotation does not change in-order sequence — only the edges between
     * the values move — so laying fragments out in value order puts them back
     * where they were. Without this the node was dropped from the layout and
     * redrawn in an unrelated corner.
     */
    const before = layoutTree(tree({ a: n(20, 'b', 'c'), b: n(10), c: n(30) }, 'a'));
    const during = layoutTree(tree({ a: n(20, null, 'c'), b: n(10), c: n(30) }, 'a'));

    expect(during.positions.b.x).toBe(before.positions.b.x);
    expect(during.positions.a.x).toBe(before.positions.a.x);
  });

  it('reports a subtree height and the balance factor that drives a rotation', () => {
    // Left-heavy by two: exactly the condition AVL rotates on.
    const state = tree({ a: n(30, 'b'), b: n(20, 'c'), c: n(10) }, 'a');
    expect(heightOf(state, 'a')).toBe(3);
    expect(balanceOf(state, 'a')).toBe(2);
    expect(balanceOf(state, 'c')).toBe(0);
  });

  it('does not hang on a malformed cycle', () => {
    const cyclic = tree({ a: n(1, 'b'), b: n(2, 'a') }, 'a');
    expect(Object.keys(layoutTree(cyclic).positions).length).toBeGreaterThan(0);
  });
});
