import React, { FunctionComponent, useContext, useMemo, type ReactNode } from 'react';
import { PlaylistInfoContext } from '../contexts/PlaylistInfo';
import { useBeatsAndBars } from '../contexts/BeatsAndBars';
import { StyledTimeScale } from './TimeScale';
import type { PrecomputedTickData } from './TimeScale';
import {
  ticksToSamples,
  ticksToBarBeatLabel,
  samplesToPixels,
  secondsToPixels,
} from '@waveform-playlist/core';

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

export function getScaleInfo(samplesPerPixel: number) {
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

export const SmartScale: FunctionComponent<SmartScaleProps> = ({ renderTimestamp }) => {
  const { samplesPerPixel, sampleRate, duration, timeScaleHeight } =
    useContext(PlaylistInfoContext);
  const beatsAndBars = useBeatsAndBars();

  // Pre-compute tick data for beats & bars mode using integer PPQN math.
  // This avoids TimeScale's millisecond-based modular arithmetic which breaks
  // with non-integer beat durations (e.g., 119 BPM → 504.20ms per beat).
  const beatsTickData = useMemo<PrecomputedTickData | null>(() => {
    if (!beatsAndBars) return null;

    const { bpm, timeSignature, ticksPerBar: tpBar, ticksPerBeat: tpBeat } = beatsAndBars;
    const widthX = secondsToPixels(duration / 1000, samplesPerPixel, sampleRate);
    const canvasInfo = new Map<number, number>();
    const timeMarkersWithPositions: Array<{ pix: number; element: React.ReactNode }> = [];

    // Total duration in PPQN ticks
    const durationSeconds = duration / 1000;
    const totalTicks = Math.ceil((durationSeconds * bpm * 192) / 60);

    for (let tick = 0; tick <= totalTicks; tick += tpBeat) {
      const samples = ticksToSamples(tick, bpm, sampleRate);
      const pix = samplesToPixels(samples, samplesPerPixel);
      if (pix >= widthX) break;

      if (tick % tpBar === 0) {
        // Bar line — full height tick + label
        canvasInfo.set(pix, timeScaleHeight);
        const label = ticksToBarBeatLabel(tick, timeSignature);

        const element = renderTimestamp ? (
          <React.Fragment key={`bb-${tick}`}>
            {renderTimestamp((tick * 60000) / (bpm * 192), pix)}
          </React.Fragment>
        ) : (
          <div
            key={`bb-${tick}`}
            style={{
              position: 'absolute',
              left: `${pix + 4}px`,
              fontSize: '0.75rem',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        );
        timeMarkersWithPositions.push({ pix, element });
      } else {
        // Beat line — medium height tick
        canvasInfo.set(pix, Math.floor(timeScaleHeight / 2));
      }
    }

    return { widthX, canvasInfo, timeMarkersWithPositions };
  }, [beatsAndBars, duration, samplesPerPixel, sampleRate, timeScaleHeight, renderTimestamp]);

  if (beatsTickData) {
    // Pass pre-computed tick data; marker/bigStep/secondStep are unused but required by the interface
    return (
      <StyledTimeScale
        marker={1}
        bigStep={1}
        secondStep={1}
        duration={duration}
        tickData={beatsTickData}
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
