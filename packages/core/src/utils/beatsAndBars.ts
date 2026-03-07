export const PPQN = 192;

export function ticksPerBeat(timeSignature: [number, number]): number {
  const [, denominator] = timeSignature;
  return PPQN * (4 / denominator);
}

export function ticksPerBar(timeSignature: [number, number]): number {
  const [numerator] = timeSignature;
  return numerator * ticksPerBeat(timeSignature);
}

export function ticksToSamples(ticks: number, bpm: number, sampleRate: number): number {
  return Math.round((ticks * 60 * sampleRate) / (bpm * PPQN));
}

export function samplesToTicks(samples: number, bpm: number, sampleRate: number): number {
  return Math.round((samples * PPQN * bpm) / (60 * sampleRate));
}

export function snapToGrid(ticks: number, gridSizeTicks: number): number {
  return Math.round(ticks / gridSizeTicks) * gridSizeTicks;
}

export function ticksToBarBeatLabel(ticks: number, timeSignature: [number, number]): string {
  const barTicks = ticksPerBar(timeSignature);
  const beatTicks = ticksPerBeat(timeSignature);
  const bar = Math.floor(ticks / barTicks) + 1;
  const beatInBar = Math.floor((ticks % barTicks) / beatTicks) + 1;
  if (beatInBar === 1) return `${bar}`;
  return `${bar}.${beatInBar}`;
}
