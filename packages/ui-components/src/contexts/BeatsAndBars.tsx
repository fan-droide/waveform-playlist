import React, { createContext, useContext, useMemo } from 'react';
import { ticksPerBeat, ticksPerBar } from '@waveform-playlist/core';

export type SnapTo = 'bar' | 'beat' | 'off';

export interface BeatsAndBarsContextValue {
  bpm: number;
  timeSignature: [number, number];
  snapTo: SnapTo;
  ticksPerBeat: number;
  ticksPerBar: number;
}

export interface BeatsAndBarsProviderProps {
  bpm: number;
  timeSignature: [number, number];
  snapTo: SnapTo;
  children: React.ReactNode;
}

const BeatsAndBarsContext = createContext<BeatsAndBarsContextValue | null>(null);

export function BeatsAndBarsProvider({
  bpm,
  timeSignature,
  snapTo,
  children,
}: BeatsAndBarsProviderProps) {
  const value = useMemo<BeatsAndBarsContextValue>(() => {
    const tpBeat = ticksPerBeat(timeSignature);
    const tpBar = ticksPerBar(timeSignature);
    return {
      bpm,
      timeSignature,
      snapTo,
      ticksPerBeat: tpBeat,
      ticksPerBar: tpBar,
    };
  }, [bpm, timeSignature[0], timeSignature[1], snapTo]);

  return (
    <BeatsAndBarsContext.Provider value={value}>
      {children}
    </BeatsAndBarsContext.Provider>
  );
}

export function useBeatsAndBars(): BeatsAndBarsContextValue | null {
  return useContext(BeatsAndBarsContext);
}
