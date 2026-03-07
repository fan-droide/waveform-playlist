import React, { createContext, useContext, useMemo } from 'react';
import { ticksPerBeat, ticksPerBar } from '@waveform-playlist/core';

export type SnapTo = 'bar' | 'beat' | 'off';
export type ScaleMode = 'beats' | 'temporal';

export interface BeatsAndBarsContextValue {
  bpm: number;
  timeSignature: [number, number];
  snapTo: SnapTo;
  scaleMode: ScaleMode;
  ticksPerBeat: number;
  ticksPerBar: number;
}

export interface BeatsAndBarsProviderProps {
  bpm: number;
  timeSignature: [number, number];
  snapTo: SnapTo;
  /** Which timescale to render. Defaults to `'beats'`. Set to `'temporal'` to
   *  show minutes:seconds while keeping snap-to-grid active. */
  scaleMode?: ScaleMode;
  children: React.ReactNode;
}

const BeatsAndBarsContext = createContext<BeatsAndBarsContextValue | null>(null);

export function BeatsAndBarsProvider({
  bpm,
  timeSignature,
  snapTo,
  scaleMode = 'beats',
  children,
}: BeatsAndBarsProviderProps) {
  const [numerator, denominator] = timeSignature;
  const value = useMemo<BeatsAndBarsContextValue>(() => {
    const ts: [number, number] = [numerator, denominator];
    const tpBeat = ticksPerBeat(ts);
    const tpBar = ticksPerBar(ts);
    return {
      bpm,
      timeSignature: ts,
      snapTo,
      scaleMode,
      ticksPerBeat: tpBeat,
      ticksPerBar: tpBar,
    };
  }, [bpm, numerator, denominator, snapTo, scaleMode]);

  return <BeatsAndBarsContext.Provider value={value}>{children}</BeatsAndBarsContext.Provider>;
}

export function useBeatsAndBars(): BeatsAndBarsContextValue | null {
  return useContext(BeatsAndBarsContext);
}
