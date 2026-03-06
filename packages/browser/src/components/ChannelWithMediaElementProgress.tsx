import React, { useRef, useEffect } from 'react';
import styled from 'styled-components';
import {
  SmartChannel,
  type SmartChannelProps,
  useTheme,
  usePlaylistInfo,
  type WaveformPlaylistTheme,
  waveformColorToCss,
} from '@waveform-playlist/ui-components';
import { useMediaElementAnimation, useMediaElementData } from '../MediaElementPlaylistContext';

const ChannelWrapper = styled.div`
  position: relative;
`;

interface BackgroundProps {
  readonly $color: string;
  readonly $height: number;
  readonly $top: number;
  readonly $width: number;
}

const Background = styled.div<BackgroundProps>`
  position: absolute;
  top: ${(props) => props.$top}px;
  left: 0;
  width: ${(props) => props.$width}px;
  height: ${(props) => props.$height}px;
  background: ${(props) => props.$color};
  z-index: 0;
  transform: translateZ(0);
  backface-visibility: hidden;
`;

interface ProgressOverlayProps {
  readonly $color: string;
  readonly $height: number;
  readonly $top: number;
}

const ProgressOverlay = styled.div<ProgressOverlayProps>`
  position: absolute;
  top: ${(props) => props.$top}px;
  left: 0;
  height: ${(props) => props.$height}px;
  background: ${(props) => props.$color};
  pointer-events: none;
  z-index: 1;
  will-change: width;
`;

const ChannelContainer = styled.div`
  position: relative;
  z-index: 2;
`;

export interface ChannelWithMediaElementProgressProps
  extends Omit<SmartChannelProps, 'isSelected'> {
  /** Start sample of the clip containing this channel (for progress calculation) */
  clipStartSample: number;
  /** Duration in samples of the clip */
  clipDurationSamples: number;
}

/**
 * SmartChannel wrapper for MediaElementPlaylistProvider with animated progress overlay.
 * Uses MediaElement context for time tracking instead of Tone.js audio context.
 */
export const ChannelWithMediaElementProgress: React.FC<ChannelWithMediaElementProgressProps> = ({
  clipStartSample,
  clipDurationSamples,
  ...smartChannelProps
}) => {
  const progressRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const theme = useTheme() as WaveformPlaylistTheme;
  const { waveHeight } = usePlaylistInfo();

  const { isPlaying, currentTimeRef } = useMediaElementAnimation();
  const { samplesPerPixel, sampleRate } = useMediaElementData();

  const progressColor = theme?.waveProgressColor || 'rgba(0, 0, 0, 0.1)';

  useEffect(() => {
    const updateProgress = () => {
      if (progressRef.current) {
        // Get current time from the ref
        const currentTime = currentTimeRef.current ?? 0;

        // Convert current time to samples
        const currentSample = currentTime * sampleRate;

        // Calculate clip bounds in samples
        const clipEndSample = clipStartSample + clipDurationSamples;

        // Calculate how much of this clip has been played
        let progressWidth = 0;

        if (currentSample <= clipStartSample) {
          // Playhead is before this clip - no progress
          progressWidth = 0;
        } else if (currentSample >= clipEndSample) {
          // Playhead is past this clip - full progress
          progressWidth = smartChannelProps.length;
        } else {
          // Playhead is within this clip - partial progress
          const playedSamples = currentSample - clipStartSample;
          progressWidth = Math.floor(playedSamples / samplesPerPixel);
        }

        progressRef.current.style.width = `${progressWidth}px`;
      }

      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    } else {
      // When stopped, update once to show final position
      updateProgress();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [
    isPlaying,
    sampleRate,
    samplesPerPixel,
    clipStartSample,
    clipDurationSamples,
    smartChannelProps.length,
    currentTimeRef,
  ]);

  // Also update when not playing (for seeks, stops, etc.)
  useEffect(() => {
    if (!isPlaying && progressRef.current) {
      const currentTime = currentTimeRef.current ?? 0;
      const currentSample = currentTime * sampleRate;
      const clipEndSample = clipStartSample + clipDurationSamples;

      let progressWidth = 0;
      if (currentSample <= clipStartSample) {
        progressWidth = 0;
      } else if (currentSample >= clipEndSample) {
        progressWidth = smartChannelProps.length;
      } else {
        const playedSamples = currentSample - clipStartSample;
        progressWidth = Math.floor(playedSamples / samplesPerPixel);
      }

      progressRef.current.style.width = `${progressWidth}px`;
    }
  });

  // Get the draw mode from theme (defaults to 'inverted')
  const drawMode = theme?.waveformDrawMode || 'inverted';

  let backgroundColor;
  if (drawMode === 'inverted') {
    // For MediaElement, always treat as selected (single track)
    backgroundColor = theme?.selectedWaveFillColor || theme?.waveFillColor || 'white';
  } else {
    backgroundColor = theme?.selectedWaveOutlineColor || theme?.waveOutlineColor || 'grey';
  }

  const backgroundCss = waveformColorToCss(backgroundColor);

  return (
    <ChannelWrapper>
      <Background
        $color={backgroundCss}
        $height={waveHeight}
        $top={smartChannelProps.index * waveHeight}
        $width={smartChannelProps.length}
      />
      <ProgressOverlay
        ref={progressRef}
        $color={progressColor}
        $height={waveHeight}
        $top={smartChannelProps.index * waveHeight}
      />
      <ChannelContainer>
        <SmartChannel {...smartChannelProps} isSelected={true} transparentBackground />
      </ChannelContainer>
    </ChannelWrapper>
  );
};
