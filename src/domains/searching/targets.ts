/**
 * A value that is certainly absent, for the "not in the array" chip.
 *
 * Taken from inside the range rather than past either end: a target above the
 * maximum lets several algorithms bail out on the first comparison, which is
 * a miss but not an interesting one. A gap in the middle makes the search
 * narrow all the way down to an empty window — which is the case worth
 * seeing, and previously the one you had to guess an absent value to reach.
 */
export function pickMissing(values: number[]): number {
  const middle = Math.floor(values.length / 2);
  for (let offset = 0; offset < values.length; offset++) {
    for (const i of [middle + offset, middle - offset]) {
      if (i >= 0 && i + 1 < values.length && values[i + 1] - values[i] > 1) return values[i] + 1;
    }
  }
  return (values[values.length - 1] ?? 0) + 1;
}
