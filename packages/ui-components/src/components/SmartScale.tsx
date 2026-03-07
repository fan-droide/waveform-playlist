import React, { FunctionComponent, useContext, useMemo, type ReactNode } from 'react';
import styled from 'styled-components';
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

function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const s = seconds % 60;
  const m = (seconds - s) / 60;

  return `${m}:${String(s).padStart(2, '0')}`;
}

interface TimeStampProps {
  readonly $left: number;
}
const TimeStamp = styled.div.attrs<TimeStampProps>((props) => ({
  style: {
    left: `${props.$left + 4}px`, // Offset 4px to the right of the tick
  },
}))<TimeStampProps>`
  position: absolute;
  font-size: 0.75rem; /* Smaller font to prevent overflow */
  white-space: nowrap; /* Prevent text wrapping */
  color: ${(props) => props.theme.timeColor}; /* Use theme color instead of inheriting */
`;

export const SmartScale: FunctionComponent<SmartScaleProps> = ({ renderTimestamp }) => {
  const { samplesPerPixel, sampleRate, duration, timeScaleHeight } =
    useContext(PlaylistInfoContext);
  const beatsAndBars = useBeatsAndBars();

  // Pre-compute tick data for beats & bars mode using integer PPQN math.
  // This avoids millisecond-based modular arithmetic which breaks
  // with non-integer beat durations (e.g., 119 BPM → 504.20ms per beat).
  const tickData = useMemo<PrecomputedTickData>(() => {
    const widthX = secondsToPixels(duration / 1000, samplesPerPixel, sampleRate);

    if (beatsAndBars) {
      const { bpm, timeSignature, ticksPerBar: tpBar, ticksPerBeat: tpBeat } = beatsAndBars;
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
    }

    // Temporal mode — iterate using timeinfo-based millisecond steps,
    // converting to pixel positions for the tick renderer.
    const config = getScaleInfo(samplesPerPixel);
    const { marker, bigStep, smallStep } = config;
    const canvasInfo = new Map<number, number>();
    const timeMarkersWithPositions: Array<{ pix: number; element: React.ReactNode }> = [];
    const pixPerSec = sampleRate / samplesPerPixel;

    let counter = 0;
    for (let i = 0; i < widthX; i += (pixPerSec * smallStep) / 1000) {
      const pix = Math.floor(i);

      if (counter % marker === 0) {
        const timeMs = counter;
        const timestamp = formatTime(timeMs);

        const element = renderTimestamp ? (
          <React.Fragment key={`timestamp-${counter}`}>
            {renderTimestamp(timeMs, pix)}
          </React.Fragment>
        ) : (
          <TimeStamp key={timestamp} $left={pix}>
            {timestamp}
          </TimeStamp>
        );

        timeMarkersWithPositions.push({ pix, element });
        canvasInfo.set(pix, timeScaleHeight);
      } else if (counter % bigStep === 0) {
        canvasInfo.set(pix, Math.floor(timeScaleHeight / 2));
      } else if (counter % smallStep === 0) {
        canvasInfo.set(pix, Math.floor(timeScaleHeight / 5));
      }

      counter += smallStep;
    }

    return { widthX, canvasInfo, timeMarkersWithPositions };
  }, [beatsAndBars, duration, samplesPerPixel, sampleRate, timeScaleHeight, renderTimestamp]);

  return <StyledTimeScale tickData={tickData} />;
};
