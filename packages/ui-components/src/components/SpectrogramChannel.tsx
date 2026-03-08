import React, { FunctionComponent, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useVisibleChunkIndices } from '../contexts/ScrollViewport';
import { useClipViewportOrigin } from '../contexts/ClipViewportOrigin';
import { useChunkedCanvasRefs } from '../hooks/useChunkedCanvasRefs';
import { MAX_CANVAS_WIDTH } from '@waveform-playlist/core';

interface WrapperProps {
  readonly $index: number;
  readonly $cssWidth: number;
  readonly $waveHeight: number;
}

const Wrapper = styled.div.attrs<WrapperProps>((props) => ({
  style: {
    top: `${props.$waveHeight * props.$index}px`,
    width: `${props.$cssWidth}px`,
    height: `${props.$waveHeight}px`,
  },
}))<WrapperProps>`
  position: absolute;
  background: #000;
  transform: translateZ(0);
  backface-visibility: hidden;
`;

interface CanvasProps {
  readonly $cssWidth: number;
  readonly $waveHeight: number;
  readonly $left: number;
}

const SpectrogramCanvas = styled.canvas.attrs<CanvasProps>((props) => ({
  style: {
    width: `${props.$cssWidth}px`,
    height: `${props.$waveHeight}px`,
    left: `${props.$left}px`,
  },
}))<CanvasProps>`
  position: absolute;
  top: 0;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
`;

export interface SpectrogramWorkerCanvasApi {
  registerCanvas(canvasId: string, canvas: OffscreenCanvas): void;
  unregisterCanvas(canvasId: string): void;
}

export interface SpectrogramChannelProps {
  /** Visual position index — used for CSS positioning (top offset). */
  index: number;
  /** Audio channel index for canvas ID construction. Defaults to `index` when omitted. */
  channelIndex?: number;
  /** Width in CSS pixels */
  length: number;
  /** Height in CSS pixels */
  waveHeight: number;
  /** Device pixel ratio for sharp rendering */
  devicePixelRatio?: number;
  /** Samples per pixel at current zoom level */
  samplesPerPixel: number;
  /** Worker API for transferring canvas ownership. Rendering is done in the worker. */
  workerApi: SpectrogramWorkerCanvasApi;
  /** Clip ID used to construct unique canvas IDs for worker registration */
  clipId: string;
  /** Callback when canvases are registered with the worker, providing canvas IDs and widths */
  onCanvasesReady?: (canvasIds: string[], canvasWidths: number[]) => void;
}

export const SpectrogramChannel: FunctionComponent<SpectrogramChannelProps> = ({
  index,
  channelIndex: channelIndexProp,
  length,
  waveHeight,
  devicePixelRatio = 1,
  samplesPerPixel,
  workerApi,
  clipId,
  onCanvasesReady,
}) => {
  const channelIndex = channelIndexProp ?? index;
  const { canvasRef, canvasMapRef } = useChunkedCanvasRefs();
  const registeredIdsRef = useRef<string[]>([]);
  const transferredCanvasesRef = useRef<WeakSet<HTMLCanvasElement>>(new WeakSet());
  const workerApiRef = useRef(workerApi);
  const onCanvasesReadyRef = useRef(onCanvasesReady);

  const clipOriginX = useClipViewportOrigin();
  const visibleChunkIndices = useVisibleChunkIndices(length, MAX_CANVAS_WIDTH, clipOriginX);

  // Keep refs in sync with latest props
  useEffect(() => {
    workerApiRef.current = workerApi;
  }, [workerApi]);

  useEffect(() => {
    onCanvasesReadyRef.current = onCanvasesReady;
  }, [onCanvasesReady]);

  // Clean up stale canvases, then transfer new ones to worker.
  // Cleanup and registration are combined in a single effect so that
  // `onCanvasesReady` always receives a clean list without stale IDs.
  // Uses visibleChunkIndices so it only re-runs when chunks mount/unmount.
  useEffect(() => {
    const currentWorkerApi = workerApiRef.current;
    if (!currentWorkerApi || !clipId) return;

    // Step 1: Remove stale registrations for unmounted canvases.
    const previousCount = registeredIdsRef.current.length;
    const remaining: string[] = [];
    for (const id of registeredIdsRef.current) {
      const match = id.match(/chunk(\d+)$/);
      if (!match) {
        remaining.push(id);
        continue;
      }
      const chunkIdx = parseInt(match[1], 10);
      const canvas = canvasMapRef.current.get(chunkIdx);
      if (canvas && canvas.isConnected) {
        remaining.push(id);
      } else {
        try {
          currentWorkerApi.unregisterCanvas(id);
        } catch (err) {
          console.warn(`[spectrogram] unregisterCanvas failed for ${id}:`, err);
        }
      }
    }
    registeredIdsRef.current = remaining;

    // Step 2: Transfer new canvases to the worker.
    const newIds: string[] = [];

    for (const [canvasIdx, canvas] of canvasMapRef.current.entries()) {
      if (transferredCanvasesRef.current.has(canvas)) continue;

      const canvasId = `${clipId}-ch${channelIndex}-chunk${canvasIdx}`;

      let offscreen: OffscreenCanvas;
      try {
        offscreen = canvas.transferControlToOffscreen();
      } catch (err) {
        console.warn(`[spectrogram] transferControlToOffscreen failed for ${canvasId}:`, err);
        continue;
      }

      // Mark transferred immediately — transferControlToOffscreen is irreversible.
      transferredCanvasesRef.current.add(canvas);

      try {
        currentWorkerApi.registerCanvas(canvasId, offscreen);
        newIds.push(canvasId);
      } catch (err) {
        console.warn(`[spectrogram] registerCanvas failed for ${canvasId}:`, err);
        continue;
      }
    }

    if (newIds.length > 0) {
      registeredIdsRef.current = [...registeredIdsRef.current, ...newIds];
    }

    // Step 3: Notify provider when canvas set changed (added or removed).
    const canvasSetChanged = newIds.length > 0 || remaining.length < previousCount;
    if (canvasSetChanged) {
      const allIds = registeredIdsRef.current;
      const allWidths = allIds.map((id) => {
        const match = id.match(/chunk(\d+)$/);
        if (!match) {
          console.warn(`[spectrogram] Unexpected canvas ID format: ${id}`);
          return MAX_CANVAS_WIDTH;
        }
        const chunkIdx = parseInt(match[1], 10);
        return Math.min(length - chunkIdx * MAX_CANVAS_WIDTH, MAX_CANVAS_WIDTH);
      });
      onCanvasesReadyRef.current?.(allIds, allWidths);
    }
  }, [canvasMapRef, clipId, channelIndex, length, visibleChunkIndices]);

  // Unregister all canvases from worker on component unmount
  useEffect(() => {
    return () => {
      const api = workerApiRef.current;
      if (!api) return;
      for (const id of registeredIdsRef.current) {
        try {
          api.unregisterCanvas(id);
        } catch (err) {
          console.warn(`[spectrogram] unregisterCanvas failed for ${id}:`, err);
        }
      }
      registeredIdsRef.current = [];
    };
  }, []);

  // Build visible canvas chunk elements
  const canvases = visibleChunkIndices.map((i) => {
    const chunkLeft = i * MAX_CANVAS_WIDTH;
    const currentWidth = Math.min(length - chunkLeft, MAX_CANVAS_WIDTH);

    return (
      <SpectrogramCanvas
        key={`${length}-${i}`}
        $cssWidth={currentWidth}
        $left={chunkLeft}
        width={currentWidth * devicePixelRatio}
        height={waveHeight * devicePixelRatio}
        $waveHeight={waveHeight}
        data-index={i}
        ref={canvasRef}
      />
    );
  });

  return (
    <Wrapper $index={index} $cssWidth={length} $waveHeight={waveHeight}>
      {canvases}
    </Wrapper>
  );
};
