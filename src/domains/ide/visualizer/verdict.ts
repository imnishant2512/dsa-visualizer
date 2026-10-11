/**
 * Whether a user's sort actually sorted — checked, not assumed.
 *
 * Two separate ways to be wrong, reported separately because they have
 * different fixes: the output is out of order (the algorithm stopped too early
 * or compared the wrong pair), or the output is not a rearrangement of the
 * input at all (a `write` put in a value that was never there, or lost one).
 * An ascending array of the wrong values would pass an order-only check.
 */
export type SortVerdict = { ok: true } | { ok: false; reason: string };

export function checkSorted(input: readonly number[], output: readonly number[]): SortVerdict {
  const expected = [...input].sort((a, b) => a - b);
  const actual = [...output].sort((a, b) => a - b);
  const sameValues =
    expected.length === actual.length && expected.every((value, i) => value === actual[i]);
  if (!sameValues) {
    return {
      ok: false,
      reason: 'The output is not a rearrangement of the input — a write added or lost a value.',
    };
  }

  for (let i = 0; i < output.length - 1; i++) {
    if (output[i] > output[i + 1]) {
      return {
        ok: false,
        reason: `Not sorted: a[${i}] (${output[i]}) is greater than a[${i + 1}] (${output[i + 1]}).`,
      };
    }
  }
  return { ok: true };
}
