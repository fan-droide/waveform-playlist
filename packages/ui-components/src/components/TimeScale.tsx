import React, { FunctionComponent, useLayoutEffect, useContext } from 'react';
import styled, { withTheme, DefaultTheme } from 'styled-components';
import { PlaylistInfoContext } from '../contexts/PlaylistInfo';
import { useDevicePixelRatio } from '../contexts/DevicePixelRatio';
import { useVisibleChunkIndices } from '../contexts/ScrollViewport';
import { useChunkedCanvasRefs } from '../hooks/useChunkedCanvasRefs';
import { MAX_CANVAS_WIDTH } from '@waveform-playlist/core';

interface PlaylistTimeScaleScrollProps {
  readonly $cssWidth: number;
  readonly $timeScaleHeight: number;
}
const PlaylistTimeScaleScroll = styled.div.attrs<PlaylistTimeScaleScrollProps>((props) => ({
  style: {
    width: `${props.$cssWidth}px`,
    height: `${props.$timeScaleHeight}px`,
  },
}))<PlaylistTimeScaleScrollProps>`
  position: relative;
  overflow: visible; /* Allow time labels to render above the container */
  border-bottom: 1px solid ${(props) => props.theme.timeColor};
  box-sizing: border-box;
`;

interface TimeTickChunkProps {
  readonly $cssWidth: number;
  readonly $timeScaleHeight: number;
  readonly $left: number;
}
const TimeTickChunk = styled.canvas.attrs<TimeTickChunkProps>((props) => ({
  style: {
    width: `${props.$cssWidth}px`,
    height: `${props.$timeScaleHeight}px`,
    left: `${props.$left}px`,
  },
}))<TimeTickChunkProps>`
  position: absolute;
  bottom: 0;
`;

export interface PrecomputedTickData {
  widthX: number;
  canvasInfo: Map<number, number>;
  timeMarkersWithPositions: Array<{ pix: number; element: React.ReactNode }>;
}

export interface TimeScaleProps {
  readonly theme?: DefaultTheme;
  readonly tickData: PrecomputedTickData;
}

interface TimeScalePropsWithTheme extends TimeScaleProps {
  readonly theme: DefaultTheme;
}

export const TimeScale: FunctionComponent<TimeScalePropsWithTheme> = (props) => {
  const {
    theme: { timeColor },
    tickData,
  } = props;
  const { canvasRef, canvasMapRef } = useChunkedCanvasRefs();
  const { timeScaleHeight } = useContext(PlaylistInfoContext);
  const devicePixelRatio = useDevicePixelRatio();

  const { widthX, canvasInfo, timeMarkersWithPositions } = tickData;

  const visibleChunkIndices = useVisibleChunkIndices(widthX, MAX_CANVAS_WIDTH);

  // Build visible canvas chunk elements
  const visibleChunks = visibleChunkIndices.map((i) => {
    const chunkLeft = i * MAX_CANVAS_WIDTH;
    const chunkWidth = Math.min(widthX - chunkLeft, MAX_CANVAS_WIDTH);

    return (
      <TimeTickChunk
        key={`timescale-${i}`}
        $cssWidth={chunkWidth}
        $left={chunkLeft}
        $timeScaleHeight={timeScaleHeight}
        width={chunkWidth * devicePixelRatio}
        height={timeScaleHeight * devicePixelRatio}
        data-index={i}
        ref={canvasRef}
      />
    );
  });

  // Filter time markers to visible chunk range. Uses chunk boundaries
  // rather than exact viewport pixels — sufficient given the 1.5× overscan buffer.
  const firstChunkLeft =
    visibleChunkIndices.length > 0 ? visibleChunkIndices[0] * MAX_CANVAS_WIDTH : 0;
  const lastChunkRight =
    visibleChunkIndices.length > 0
      ? (visibleChunkIndices[visibleChunkIndices.length - 1] + 1) * MAX_CANVAS_WIDTH
      : Infinity;

  const visibleMarkers =
    visibleChunkIndices.length > 0
      ? timeMarkersWithPositions
          .filter(({ pix }) => pix >= firstChunkLeft && pix < lastChunkRight)
          .map(({ element }) => element)
      : timeMarkersWithPositions.map(({ element }) => element);

  // Draw tick marks on visible canvas chunks.
  // visibleChunkIndices changes only when chunks mount/unmount, not on every scroll pixel.
  useLayoutEffect(() => {
    for (const [chunkIdx, canvas] of canvasMapRef.current.entries()) {
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      const chunkLeft = chunkIdx * MAX_CANVAS_WIDTH;
      const chunkWidth = canvas.width / devicePixelRatio;

      ctx.resetTransform();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = timeColor;
      ctx.scale(devicePixelRatio, devicePixelRatio);

      for (const [pixLeft, scaleHeight] of canvasInfo.entries()) {
        // Only draw ticks within this chunk's range
        if (pixLeft < chunkLeft || pixLeft >= chunkLeft + chunkWidth) continue;

        const localX = pixLeft - chunkLeft;
        const scaleY = timeScaleHeight - scaleHeight;
        ctx.fillRect(localX, scaleY, 1, scaleHeight);
      }
    }
  }, [canvasMapRef, devicePixelRatio, timeColor, timeScaleHeight, canvasInfo, visibleChunkIndices]);

  return (
    <PlaylistTimeScaleScroll $cssWidth={widthX} $timeScaleHeight={timeScaleHeight}>
      {visibleMarkers}
      {visibleChunks}
    </PlaylistTimeScaleScroll>
  );
};

export const StyledTimeScale = withTheme(TimeScale) as FunctionComponent<TimeScaleProps>;
