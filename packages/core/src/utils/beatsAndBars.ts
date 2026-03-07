/** Default PPQN matching Tone.js Transport (192 ticks per quarter note) */
export const PPQN = 192;

export function ticksPerBeat(timeSignature: [number, number], ppqn = PPQN): number {
  const [, denominator] = timeSignature;
  return ppqn * (4 / denominator);
}

export function ticksPerBar(timeSignature: [number, number], ppqn = PPQN): number {
  const [numerator] = timeSignature;
  return numerator * ticksPerBeat(timeSignature, ppqn);
}

export function ticksToSamples(
  ticks: number,
  bpm: number,
  sampleRate: number,
  ppqn = PPQN
): number {
  return Math.round((ticks * 60 * sampleRate) / (bpm * ppqn));
}

export function samplesToTicks(
  samples: number,
  bpm: number,
  sampleRate: number,
  ppqn = PPQN
): number {
  return Math.round((samples * ppqn * bpm) / (60 * sampleRate));
}

export function snapToGrid(ticks: number, gridSizeTicks: number): number {
  return Math.round(ticks / gridSizeTicks) * gridSizeTicks;
}

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
