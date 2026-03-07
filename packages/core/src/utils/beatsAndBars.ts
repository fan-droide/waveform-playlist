/** Default PPQN matching Tone.js Transport (192 ticks per quarter note) */
export const PPQN = 192;

/** Number of PPQN ticks per beat for the given time signature. */
export function ticksPerBeat(timeSignature: [number, number], ppqn = PPQN): number {
  const [, denominator] = timeSignature;
  return ppqn * (4 / denominator);
}

/** Number of PPQN ticks per bar for the given time signature. */
export function ticksPerBar(timeSignature: [number, number], ppqn = PPQN): number {
  const [numerator] = timeSignature;
  return numerator * ticksPerBeat(timeSignature, ppqn);
}

/** Convert PPQN ticks to sample count. Uses Math.round for integer sample alignment. */
export function ticksToSamples(
  ticks: number,
  bpm: number,
  sampleRate: number,
  ppqn = PPQN
): number {
  return Math.round((ticks * 60 * sampleRate) / (bpm * ppqn));
}

/** Convert sample count to PPQN ticks. Inverse of ticksToSamples. */
export function samplesToTicks(
  samples: number,
  bpm: number,
  sampleRate: number,
  ppqn = PPQN
): number {
  return Math.round((samples * ppqn * bpm) / (60 * sampleRate));
}

/** Snap a tick position to the nearest grid line (rounds to nearest). */
export function snapToGrid(ticks: number, gridSizeTicks: number): number {
  return Math.round(ticks / gridSizeTicks) * gridSizeTicks;
}

/** Format ticks as a 1-indexed bar.beat label. Beat 1 shows bar number only (e.g., "3" not "3.1"). */
export function ticksToBarBeatLabel(
  ticks: number,
  timeSignature: [number, number],
  ppqn = PPQN
): string {
  const barTicks = ticksPerBar(timeSignature, ppqn);
  const beatTicks = ticksPerBeat(timeSignature, ppqn);
  const bar = Math.floor(ticks / barTicks) + 1;
  const beatInBar = Math.floor((ticks % barTicks) / beatTicks) + 1;
  if (beatInBar === 1) return `${bar}`;
  return `${bar}.${beatInBar}`;
}
