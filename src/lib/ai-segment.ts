/** A drafted duration must fit the job's enforced segment (+0.05 s rounding) and never exceed 30 s. */
export function durationFitsSegment(d: number, start: number, end: number): boolean {
  if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  return d <= Math.min(30, end - start) + 0.05;
}
