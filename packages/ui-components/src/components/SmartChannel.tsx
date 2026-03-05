import React, { FunctionComponent } from 'react';
import { useDevicePixelRatio, usePlaylistInfo, useTheme } from '../contexts';
import { Channel } from './Channel';
import { PianoRollChannel } from './PianoRollChannel';
import { SpectrogramChannel, type SpectrogramWorkerCanvasApi } from './SpectrogramChannel';
import type { SpectrogramData, RenderMode, MidiNoteData } from '@waveform-playlist/core';

export interface SmartChannelProps {
  className?: string;
  index: number;
  data: Int8Array | Int16Array;
  bits: 8 | 16;
  length: number;
  isSelected?: boolean; // Whether this channel's track is selected
  /** If true, background is transparent (for use with external progress overlay) */
  transparentBackground?: boolean;
  /** Render mode: waveform, spectrogram, or both */
  renderMode?: RenderMode;
  /** Spectrogram data for this channel */
  spectrogramData?: SpectrogramData;
  /** 256-entry RGB LUT from getColorMap() */
  spectrogramColorLUT?: Uint8Array;
  /** Samples per pixel at current zoom level */
  samplesPerPixel?: number;
  /** Frequency scale function */
  spectrogramFrequencyScaleFn?: (f: number, minF: number, maxF: number) => number;
  /** Min frequency in Hz */
  spectrogramMinFrequency?: number;
  /** Max frequency in Hz */
  spectrogramMaxFrequency?: number;
  /** Worker API for OffscreenCanvas transfer */
  spectrogramWorkerApi?: SpectrogramWorkerCanvasApi;
  /** Clip ID for worker canvas registration */
  spectrogramClipId?: string;
  /** Callback when canvases are registered with the worker */
  spectrogramOnCanvasesReady?: (canvasIds: string[], canvasWidths: number[]) => void;
  /** MIDI note data for piano-roll rendering */
  midiNotes?: MidiNoteData[];
  /** Sample rate for MIDI note time → pixel conversion */
  sampleRate?: number;
  /** Clip offset in seconds for MIDI note positioning */
  clipOffsetSeconds?: number;
}

export const SmartChannel: FunctionComponent<SmartChannelProps> = ({
  isSelected,
  transparentBackground,
  renderMode = 'waveform',
  spectrogramData,
  spectrogramColorLUT,
  samplesPerPixel: sppProp,
  spectrogramFrequencyScaleFn,
  spectrogramMinFrequency,
  spectrogramMaxFrequency,
  spectrogramWorkerApi,
  spectrogramClipId,
  spectrogramOnCanvasesReady,
  midiNotes,
  sampleRate: sampleRateProp,
  clipOffsetSeconds,
  ...props
}) => {
  const theme = useTheme();
  const {
    waveHeight,
    barWidth,
    barGap,
    samplesPerPixel: contextSpp,
    sampleRate: contextSampleRate,
  } = usePlaylistInfo();
  const devicePixelRatio = useDevicePixelRatio();
  const samplesPerPixel = sppProp ?? contextSpp;

  // Use selected colors if track is selected
  const waveOutlineColor =
    isSelected && theme ? theme.selectedWaveOutlineColor : theme?.waveOutlineColor;

  const waveFillColor = isSelected && theme ? theme.selectedWaveFillColor : theme?.waveFillColor;

  // Get draw mode from theme (defaults to 'inverted' for backwards compatibility)
  const drawMode = theme?.waveformDrawMode || 'inverted';

  // Worker mode: spectrogram data is optional (worker renders directly)
  const hasSpectrogram = spectrogramData || spectrogramWorkerApi;

  if (renderMode === 'spectrogram' && hasSpectrogram) {
    return (
      <SpectrogramChannel
        index={props.index}
        data={spectrogramData}
        length={props.length}
        waveHeight={waveHeight}
        devicePixelRatio={devicePixelRatio}
        samplesPerPixel={samplesPerPixel}
        colorLUT={spectrogramColorLUT}
        frequencyScaleFn={spectrogramFrequencyScaleFn}
        minFrequency={spectrogramMinFrequency}
        maxFrequency={spectrogramMaxFrequency}
        workerApi={spectrogramWorkerApi}
        clipId={spectrogramClipId}
        onCanvasesReady={spectrogramOnCanvasesReady}
      />
    );
  }

  if (renderMode === 'both' && hasSpectrogram) {
    // Spectrogram above, waveform below — each at half waveHeight so the
    // overall track container stays the same height as a single-mode track.
    const halfHeight = Math.floor(waveHeight / 2);
    return (
      <>
        <SpectrogramChannel
          index={props.index * 2}
          channelIndex={props.index}
          data={spectrogramData}
          length={props.length}
          waveHeight={halfHeight}
          devicePixelRatio={devicePixelRatio}
          samplesPerPixel={samplesPerPixel}
          colorLUT={spectrogramColorLUT}
          frequencyScaleFn={spectrogramFrequencyScaleFn}
          minFrequency={spectrogramMinFrequency}
          maxFrequency={spectrogramMaxFrequency}
          workerApi={spectrogramWorkerApi}
          clipId={spectrogramClipId}
          onCanvasesReady={spectrogramOnCanvasesReady}
        />
        <div
          style={{
            position: 'absolute',
            top: (props.index * 2 + 1) * halfHeight,
            width: props.length,
            height: halfHeight,
          }}
        >
          <Channel
            {...props}
            index={0}
            waveOutlineColor={waveOutlineColor}
            waveFillColor={waveFillColor}
            waveHeight={halfHeight}
            devicePixelRatio={devicePixelRatio}
            barWidth={barWidth}
            barGap={barGap}
            transparentBackground={transparentBackground}
            drawMode={drawMode}
          />
        </div>
      </>
    );
  }

  if (renderMode === 'piano-roll') {
    return (
      <PianoRollChannel
        index={props.index}
        midiNotes={midiNotes ?? []}
        length={props.length}
        waveHeight={waveHeight}
        devicePixelRatio={devicePixelRatio}
        samplesPerPixel={samplesPerPixel}
        sampleRate={sampleRateProp ?? contextSampleRate}
        clipOffsetSeconds={clipOffsetSeconds ?? 0}
        noteColor={theme?.pianoRollNoteColor}
        selectedNoteColor={theme?.pianoRollSelectedNoteColor}
        isSelected={isSelected}
        transparentBackground={transparentBackground}
        backgroundColor={theme?.pianoRollBackgroundColor}
      />
    );
  }

  // Default: waveform mode
  return (
    <Channel
      {...props}
      waveOutlineColor={waveOutlineColor}
      waveFillColor={waveFillColor}
      waveHeight={waveHeight}
      devicePixelRatio={devicePixelRatio}
      barWidth={barWidth}
      barGap={barGap}
      transparentBackground={transparentBackground}
      drawMode={drawMode}
    />
  );
};
