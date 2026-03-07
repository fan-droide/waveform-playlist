import React, { FunctionComponent, useContext, type ReactNode } from 'react';
import { PlaylistInfoContext } from '../contexts/PlaylistInfo';
import { useBeatsAndBars } from '../contexts/BeatsAndBars';
import { StyledTimeScale } from './TimeScale';
import { PPQN, ticksToBarBeatLabel } from '@waveform-playlist/core';

export interface SmartScaleProps {
  readonly renderTimestamp?: (timeMs: number, pixelPosition: number) => ReactNode;
}

const timeinfo = new Map([
  [700, { marker: 1000, bigStep: 500, smallStep: 100 }],
  [1500, { marker: 2000, bigStep: 1000, smallStep: 200 }],
  [2500, { marker: 2000, bigStep: 1000, smallStep: 500 }],
  [5000, { marker: 5000, bigStep: 1000, smallStep: 500 }],
  [10000, { marker: 10000, bigStep: 5000, smallStep: 1000 }],
  [12000, { marker: 15000, bigStep: 5000, smallStep: 1000 }],
  [Infinity, { marker: 30000, bigStep: 10000, smallStep: 5000 }],
]);

function getScaleInfo(samplesPerPixel: number) {
  const keys = timeinfo.keys();
  let config;

  for (const resolution of keys) {
    if (samplesPerPixel < resolution) {
      config = timeinfo.get(resolution);
      break;
    }
  }

  if (config === undefined) {
    config = { marker: 30000, bigStep: 10000, smallStep: 5000 };
  }
  return config;
}

/**
 * Convert PPQN ticks to milliseconds at a given BPM.
 */
function ticksToMs(ticks: number, bpm: number): number {
  return (ticks * 60000) / (bpm * PPQN);
}

export const SmartScale: FunctionComponent<SmartScaleProps> = ({ renderTimestamp }) => {
  const { samplesPerPixel, duration } = useContext(PlaylistInfoContext);
  const beatsAndBars = useBeatsAndBars();

  if (beatsAndBars) {
    const { bpm, timeSignature, ticksPerBar: tpBar, ticksPerBeat: tpBeat } = beatsAndBars;

    const barMs = ticksToMs(tpBar, bpm);
    const beatMs = ticksToMs(tpBeat, bpm);

    const beatsRenderTimestamp = renderTimestamp ?? ((timeMs: number, pixelPosition: number) => {
      const ticks = Math.round((timeMs * bpm * PPQN) / 60000);
      const label = ticksToBarBeatLabel(ticks, timeSignature);
      return (
        <div
          key={`bb-${ticks}`}
          style={{
            position: 'absolute',
            left: `${pixelPosition + 4}px`,
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      );
    });

    return (
      <StyledTimeScale
        marker={barMs}
        bigStep={beatMs}
        secondStep={beatMs}
        duration={duration}
        renderTimestamp={beatsRenderTimestamp}
      />
    );
  }

  // Temporal mode (existing behavior)
  const config = getScaleInfo(samplesPerPixel);
  return (
    <StyledTimeScale
      marker={config.marker}
      bigStep={config.bigStep}
      secondStep={config.smallStep}
      duration={duration}
      renderTimestamp={renderTimestamp}
    />
  );
};
