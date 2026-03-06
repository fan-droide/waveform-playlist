import React, { useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useMediaElementAnimation, useMediaElementData } from '../MediaElementPlaylistContext';

const PlayheadLine = styled.div<{ $color: string; $width: number }>`
  position: absolute;
  top: 0;
  left: 0;
  width: ${(props) => props.$width}px;
  background: ${(props) => props.$color};
  height: 100%;
  z-index: 100;
  pointer-events: none;
  will-change: transform;
`;

interface AnimatedMediaElementPlayheadProps {
  color?: string;
}

/**
 * Animated playhead for MediaElementPlaylistProvider.
 * Uses the MediaElement context for time tracking instead of Tone.js audio context.
 * Updates position via direct DOM manipulation for smooth 60fps animation.
 */
export const AnimatedMediaElementPlayhead: React.FC<AnimatedMediaElementPlayheadProps> = ({
  color = '#ff0000',
}) => {
  const playheadRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const { isPlaying, currentTimeRef } = useMediaElementAnimation();
  const { samplesPerPixel, sampleRate, progressBarWidth } = useMediaElementData();

  useEffect(() => {
    const updatePosition = () => {
      if (playheadRef.current) {
        // Get current time from the ref (updated by animation loop in context)
        const time = currentTimeRef.current ?? 0;
        const position = (time * sampleRate) / samplesPerPixel;
        playheadRef.current.style.transform = `translate3d(${position}px, 0, 0)`;
      }

      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(updatePosition);
      }
    };

    if (isPlaying) {
      // Start animation loop
      animationFrameRef.current = requestAnimationFrame(updatePosition);
    } else {
      // When stopped, update once to show final position
      updatePosition();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, sampleRate, samplesPerPixel, currentTimeRef]);

  // Also update position when not playing (for seeks, stops, etc.)
  useEffect(() => {
    if (!isPlaying && playheadRef.current) {
      const time = currentTimeRef.current ?? 0;
      const position = (time * sampleRate) / samplesPerPixel;
      playheadRef.current.style.transform = `translate3d(${position}px, 0, 0)`;
    }
  });

  return <PlayheadLine ref={playheadRef} $color={color} $width={progressBarWidth} data-playhead />;
};
