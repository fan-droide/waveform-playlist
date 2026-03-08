import React, { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import {
  MAX_CANVAS_WIDTH,
  type SpectrogramConfig,
  type SpectrogramComputeConfig,
  type ColorMapValue,
  type RenderMode,
  type TrackSpectrogramOverrides,
} from '@waveform-playlist/core';
import { getColorMap, getFrequencyScale } from './computation';
import { createSpectrogramWorker, type SpectrogramWorkerApi } from './worker';
import { SpectrogramMenuItems } from './components';
import { SpectrogramSettingsModal } from './components';
import {
  SpectrogramIntegrationProvider,
  type SpectrogramIntegration,
} from '@waveform-playlist/browser';
import { usePlaylistData, usePlaylistControls } from '@waveform-playlist/browser';

/** Extract the chunk number from a canvas ID like "clipId-ch0-chunk5" → 5 */
function extractChunkNumber(canvasId: string): number {
  const match = canvasId.match(/chunk(\d+)$/);
  if (!match) {
    console.warn(`[spectrogram] Unexpected canvas ID format: ${canvasId}`);
    return 0;
  }
  return parseInt(match[1], 10);
}

export interface SpectrogramProviderProps {
  config?: SpectrogramConfig;
  colorMap?: ColorMapValue;
  children: ReactNode;
}

export const SpectrogramProvider: React.FC<SpectrogramProviderProps> = ({
  config: spectrogramConfig,
  colorMap: spectrogramColorMap,
  children,
}) => {
  const { tracks, waveHeight, samplesPerPixel, isReady, mono } = usePlaylistData();
  const { scrollContainerRef } = usePlaylistControls();

  // State
  const [trackSpectrogramOverrides, setTrackSpectrogramOverrides] = useState<
    Map<string, TrackSpectrogramOverrides>
  >(new Map());

  // OffscreenCanvas registry for worker-rendered spectrograms
  const spectrogramCanvasRegistryRef = useRef<
    Map<string, Map<number, { canvasIds: string[]; canvasWidths: number[] }>>
  >(new Map());
  const [spectrogramCanvasVersion, setSpectrogramCanvasVersion] = useState(0);

  // Spectrogram refs
  const prevSpectrogramConfigRef = useRef<Map<string, string>>(new Map());
  const prevSpectrogramFFTKeyRef = useRef<Map<string, string>>(new Map());
  const spectrogramWorkerRef = useRef<SpectrogramWorkerApi | null>(null);
  const spectrogramGenerationRef = useRef(0);
  const prevCanvasVersionRef = useRef(0);
  const [spectrogramWorkerReady, setSpectrogramWorkerReady] = useState(false);
  const clipCacheKeysRef = useRef<Map<string, string>>(new Map());
  const backgroundRenderAbortRef = useRef<{ aborted: boolean } | null>(null);
  const registeredAudioClipIdsRef = useRef<Set<string>>(new Set());

  // Terminate worker on unmount
  useEffect(() => {
    return () => {
      spectrogramWorkerRef.current?.terminate();
      spectrogramWorkerRef.current = null;
    };
  }, []);

  // Eagerly transfer audio data to worker when tracks load
  useEffect(() => {
    if (!isReady || tracks.length === 0) return;

    let workerApi = spectrogramWorkerRef.current;
    if (!workerApi) {
      try {
        const rawWorker = new Worker(
          new URL('@waveform-playlist/spectrogram/worker/spectrogram.worker', import.meta.url),
          { type: 'module' }
        );
        workerApi = createSpectrogramWorker(rawWorker);
        spectrogramWorkerRef.current = workerApi;
        setSpectrogramWorkerReady(true);
      } catch {
        console.warn('Spectrogram Web Worker unavailable for pre-transfer');
        return;
      }
    }

    const currentClipIds = new Set<string>();

    for (const track of tracks) {
      for (const clip of track.clips) {
        if (!clip.audioBuffer) continue;
        currentClipIds.add(clip.id);

        if (!registeredAudioClipIdsRef.current.has(clip.id)) {
          const channelDataArrays: Float32Array[] = [];
          for (let ch = 0; ch < clip.audioBuffer.numberOfChannels; ch++) {
            channelDataArrays.push(clip.audioBuffer.getChannelData(ch));
          }
          workerApi.registerAudioData(clip.id, channelDataArrays, clip.audioBuffer.sampleRate);
          registeredAudioClipIdsRef.current.add(clip.id);
        }
      }
    }

    for (const clipId of registeredAudioClipIdsRef.current) {
      if (!currentClipIds.has(clipId)) {
        workerApi.unregisterAudioData(clipId);
        registeredAudioClipIdsRef.current.delete(clipId);
      }
    }
  }, [isReady, tracks]);

  // Main spectrogram computation effect
  useEffect(() => {
    if (tracks.length === 0) return;

    const currentKeys = new Map<string, string>();
    const currentFFTKeys = new Map<string, string>();
    tracks.forEach((track) => {
      const mode =
        trackSpectrogramOverrides.get(track.id)?.renderMode ?? track.renderMode ?? 'waveform';
      if (mode === 'waveform') return;
      const cfg =
        trackSpectrogramOverrides.get(track.id)?.config ??
        track.spectrogramConfig ??
        spectrogramConfig;
      const cm =
        trackSpectrogramOverrides.get(track.id)?.colorMap ??
        track.spectrogramColorMap ??
        spectrogramColorMap;
      currentKeys.set(track.id, JSON.stringify({ mode, cfg, cm, mono }));
      const computeConfig: SpectrogramComputeConfig = {
        fftSize: cfg?.fftSize,
        hopSize: cfg?.hopSize,
        windowFunction: cfg?.windowFunction,
        alpha: cfg?.alpha,
        zeroPaddingFactor: cfg?.zeroPaddingFactor,
      };
      currentFFTKeys.set(track.id, JSON.stringify({ mode, mono, ...computeConfig }));
    });

    const prevKeys = prevSpectrogramConfigRef.current;
    const prevFFTKeys = prevSpectrogramFFTKeyRef.current;

    let configChanged = currentKeys.size !== prevKeys.size;
    if (!configChanged) {
      for (const [idx, key] of currentKeys) {
        if (prevKeys.get(idx) !== key) {
          configChanged = true;
          break;
        }
      }
    }

    let fftKeyChanged = currentFFTKeys.size !== prevFFTKeys.size;
    if (!fftKeyChanged) {
      for (const [idx, key] of currentFFTKeys) {
        if (prevFFTKeys.get(idx) !== key) {
          fftKeyChanged = true;
          break;
        }
      }
    }

    const canvasVersionChanged = spectrogramCanvasVersion !== prevCanvasVersionRef.current;
    prevCanvasVersionRef.current = spectrogramCanvasVersion;

    if (!configChanged && !canvasVersionChanged) return;

    if (configChanged) {
      prevSpectrogramConfigRef.current = currentKeys;
      prevSpectrogramFFTKeyRef.current = currentFFTKeys;
    }

    if (backgroundRenderAbortRef.current) {
      backgroundRenderAbortRef.current.aborted = true;
    }

    const generation = ++spectrogramGenerationRef.current;

    let workerApi = spectrogramWorkerRef.current;
    if (!workerApi) {
      try {
        const rawWorker = new Worker(
          new URL('@waveform-playlist/spectrogram/worker/spectrogram.worker', import.meta.url),
          { type: 'module' }
        );
        workerApi = createSpectrogramWorker(rawWorker);
        spectrogramWorkerRef.current = workerApi;
        setSpectrogramWorkerReady(true);
      } catch (err) {
        console.error('[waveform-playlist] Spectrogram Web Worker required but unavailable:', err);
        return;
      }
    }

    const clipsNeedingFFT: Array<{
      clipId: string;
      trackIndex: number;
      channelDataArrays: Float32Array[];
      config: SpectrogramConfig;
      sampleRate: number;
      offsetSamples: number;
      durationSamples: number;
      clipStartSample: number;
      monoFlag: boolean;
      colorMap: ColorMapValue;
    }> = [];
    const clipsNeedingDisplayOnly: Array<{
      clipId: string;
      trackIndex: number;
      config: SpectrogramConfig;
      clipStartSample: number;
      monoFlag: boolean;
      colorMap: ColorMapValue;
      numChannels: number;
    }> = [];

    tracks.forEach((track, i) => {
      const mode =
        trackSpectrogramOverrides.get(track.id)?.renderMode ?? track.renderMode ?? 'waveform';
      if (mode === 'waveform') return;

      const trackConfigChanged =
        configChanged && currentKeys.get(track.id) !== prevKeys.get(track.id);
      const trackFFTChanged =
        fftKeyChanged && currentFFTKeys.get(track.id) !== prevFFTKeys.get(track.id);
      const hasRegisteredCanvases =
        canvasVersionChanged &&
        track.clips.some((clip) => spectrogramCanvasRegistryRef.current.has(clip.id));
      if (!trackConfigChanged && !hasRegisteredCanvases) return;

      const cfg =
        trackSpectrogramOverrides.get(track.id)?.config ??
        track.spectrogramConfig ??
        spectrogramConfig ??
        {};
      const cm =
        trackSpectrogramOverrides.get(track.id)?.colorMap ??
        track.spectrogramColorMap ??
        spectrogramColorMap ??
        'viridis';

      for (const clip of track.clips) {
        if (!clip.audioBuffer) continue;

        const monoFlag = mono || clip.audioBuffer.numberOfChannels === 1;

        if (!trackFFTChanged && !hasRegisteredCanvases && clipCacheKeysRef.current.has(clip.id)) {
          clipsNeedingDisplayOnly.push({
            clipId: clip.id,
            trackIndex: i,
            config: cfg,
            clipStartSample: clip.startSample,
            monoFlag,
            colorMap: cm,
            numChannels: monoFlag ? 1 : clip.audioBuffer.numberOfChannels,
          });
          continue;
        }

        const channelDataArrays: Float32Array[] = [];
        for (let ch = 0; ch < clip.audioBuffer.numberOfChannels; ch++) {
          channelDataArrays.push(clip.audioBuffer.getChannelData(ch));
        }

        clipsNeedingFFT.push({
          clipId: clip.id,
          trackIndex: i,
          channelDataArrays,
          config: cfg,
          sampleRate: clip.audioBuffer.sampleRate,
          offsetSamples: clip.offsetSamples,
          durationSamples: clip.durationSamples,
          clipStartSample: clip.startSample,
          monoFlag,
          colorMap: cm,
        });
      }
    });

    if (clipsNeedingFFT.length === 0 && clipsNeedingDisplayOnly.length === 0) return;

    const getVisibleChunkRange = (
      channelInfo: { canvasIds: string[]; canvasWidths: number[] },
      clipPixelOffset = 0
    ): { visibleIndices: number[]; remainingIndices: number[] } => {
      const container = scrollContainerRef.current;
      if (!container) {
        return { visibleIndices: channelInfo.canvasWidths.map((_, i) => i), remainingIndices: [] };
      }

      const scrollLeft = container.scrollLeft;
      const viewportWidth = container.clientWidth;

      const visibleIndices: number[] = [];
      const remainingIndices: number[] = [];

      for (let i = 0; i < channelInfo.canvasWidths.length; i++) {
        // Extract the actual chunk number from the canvas ID to compute the
        // correct global pixel offset. With virtual scrolling, the registry
        // may contain non-consecutive chunks (e.g., chunks 50-55).
        // Controls are outside the scroll container, so no controlWidth offset needed.
        const chunkNumber = extractChunkNumber(channelInfo.canvasIds[i]);
        const chunkLeft = chunkNumber * MAX_CANVAS_WIDTH + clipPixelOffset;
        const chunkRight = chunkLeft + channelInfo.canvasWidths[i];
        if (chunkRight > scrollLeft && chunkLeft < scrollLeft + viewportWidth) {
          visibleIndices.push(i);
        } else {
          remainingIndices.push(i);
        }
      }

      return { visibleIndices, remainingIndices };
    };

    const renderChunkSubset = async (
      api: SpectrogramWorkerApi,
      cacheKey: string,
      channelInfo: { canvasIds: string[]; canvasWidths: number[] },
      indices: number[],
      item: { config: SpectrogramConfig; colorMap: ColorMapValue },
      channelIndex: number
    ) => {
      if (indices.length === 0) return;

      const canvasIds = indices.map((i) => channelInfo.canvasIds[i]);
      const canvasWidths = indices.map((i) => channelInfo.canvasWidths[i]);

      // Compute correct global pixel offsets by extracting chunk numbers from
      // canvas IDs. With virtual scrolling, the registry may contain non-consecutive
      // chunks (e.g., chunks 50-55), so summing widths from index 0 gives wrong offsets.
      const globalPixelOffsets: number[] = [];
      for (const idx of indices) {
        const chunkNumber = extractChunkNumber(channelInfo.canvasIds[idx]);
        globalPixelOffsets.push(chunkNumber * MAX_CANVAS_WIDTH);
      }

      const colorLUT = getColorMap(item.colorMap);

      await api.renderChunks({
        cacheKey,
        canvasIds,
        canvasWidths,
        globalPixelOffsets,
        canvasHeight: waveHeight,
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
        samplesPerPixel,
        colorLUT,
        frequencyScale: item.config.frequencyScale ?? 'mel',
        minFrequency: item.config.minFrequency ?? 0,
        maxFrequency: item.config.maxFrequency ?? 0,
        gainDb: item.config.gainDb ?? 20,
        rangeDb: item.config.rangeDb ?? 80,
        channelIndex,
      });
    };

    const computeAsync = async () => {
      const abortToken = { aborted: false };
      backgroundRenderAbortRef.current = abortToken;

      // Render off-screen chunks in idle-callback batches.
      // Returns true if aborted (caller should return early).
      const renderBackgroundBatches = async (
        channelRanges: Array<{
          ch: number;
          channelInfo: { canvasIds: string[]; canvasWidths: number[] };
          remainingIndices: number[];
        }>,
        cacheKey: string,
        item: { config: SpectrogramConfig; colorMap: ColorMapValue }
      ): Promise<boolean> => {
        const BATCH_SIZE = 4;
        for (const { ch, channelInfo, remainingIndices } of channelRanges) {
          for (let batchStart = 0; batchStart < remainingIndices.length; batchStart += BATCH_SIZE) {
            if (spectrogramGenerationRef.current !== generation || abortToken.aborted) return true;

            const batch = remainingIndices.slice(batchStart, batchStart + BATCH_SIZE);

            await new Promise<void>((resolve) => {
              if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(() => resolve());
              } else {
                setTimeout(resolve, 0);
              }
            });

            if (spectrogramGenerationRef.current !== generation || abortToken.aborted) return true;

            await renderChunkSubset(workerApi!, cacheKey, channelInfo, batch, item, ch);
          }
        }
        return false;
      };

      for (const item of clipsNeedingFFT) {
        if (spectrogramGenerationRef.current !== generation || abortToken.aborted) return;

        try {
          const clipCanvasInfo = spectrogramCanvasRegistryRef.current.get(item.clipId);
          if (clipCanvasInfo && clipCanvasInfo.size > 0) {
            const numChannels = item.monoFlag ? 1 : item.channelDataArrays.length;
            const clipPixelOffset = Math.floor(item.clipStartSample / samplesPerPixel);

            // Debug: log registered canvas info per channel
            for (const [ch, info] of clipCanvasInfo.entries()) {
              const chunkNumbers = info.canvasIds.map((id: string) => {
                const m = id.match(/chunk(\d+)$/);
                return m ? parseInt(m[1], 10) : -1;
              });
              console.log(
                `[spectrogram] clip=${item.clipId} ch=${ch} registered chunks=[${chunkNumbers.join(',')}] widths=[${info.canvasWidths.join(',')}]`
              );
            }

            const container = scrollContainerRef.current;
            const windowSize = item.config.fftSize ?? 2048;
            let visibleRange: { start: number; end: number } | undefined;

            if (container) {
              const scrollLeft = container.scrollLeft;
              const viewportWidth = container.clientWidth;

              // Controls are outside the scroll container, so scrollLeft is
              // already in clip-local coordinate space — no controlWidth offset.
              const vpStartPx = scrollLeft;
              const vpEndPx = vpStartPx + viewportWidth;

              const clipStartPx = clipPixelOffset;
              const clipEndPx = clipStartPx + Math.ceil(item.durationSamples / samplesPerPixel);

              const overlapStartPx = Math.max(vpStartPx, clipStartPx);
              const overlapEndPx = Math.min(vpEndPx, clipEndPx);

              if (overlapEndPx > overlapStartPx) {
                const localStartPx = overlapStartPx - clipStartPx;
                const localEndPx = overlapEndPx - clipStartPx;
                const visStartSample =
                  item.offsetSamples + Math.floor(localStartPx * samplesPerPixel);
                const visEndSample = Math.min(
                  item.offsetSamples + item.durationSamples,
                  item.offsetSamples + Math.ceil(localEndPx * samplesPerPixel)
                );
                const paddedStart = Math.max(item.offsetSamples, visStartSample - windowSize);
                const paddedEnd = Math.min(
                  item.offsetSamples + item.durationSamples,
                  visEndSample + windowSize
                );

                if (paddedEnd - paddedStart < item.durationSamples * 0.8) {
                  visibleRange = { start: paddedStart, end: paddedEnd };
                }
              }

              console.log(
                `[spectrogram] viewport: scrollLeft=${scrollLeft} width=${viewportWidth} ` +
                  `vpPx=[${vpStartPx},${vpEndPx}] ` +
                  `clipPx=[${clipStartPx},${clipEndPx}] ` +
                  `visibleRange=${visibleRange ? `[${visibleRange.start},${visibleRange.end}]` : 'full'}`
              );
            }

            const fullClipAlreadyCached = clipCacheKeysRef.current.has(item.clipId);
            let visibleAlreadyRendered = false;

            if (visibleRange && !fullClipAlreadyCached) {
              // Phase 0: Fast visible-range FFT — compute and render only the
              // portion of the clip that's currently on screen.
              const { cacheKey: visibleCacheKey } = await workerApi!.computeFFT({
                clipId: item.clipId,
                channelDataArrays: item.channelDataArrays,
                config: item.config,
                sampleRate: item.sampleRate,
                offsetSamples: item.offsetSamples,
                durationSamples: item.durationSamples,
                mono: item.monoFlag,
                sampleRange: visibleRange,
              });
              if (spectrogramGenerationRef.current !== generation || abortToken.aborted) return;

              for (let ch = 0; ch < numChannels; ch++) {
                const channelInfo = clipCanvasInfo.get(ch);
                if (!channelInfo) continue;

                const { visibleIndices } = getVisibleChunkRange(channelInfo, clipPixelOffset);
                await renderChunkSubset(
                  workerApi!,
                  visibleCacheKey,
                  channelInfo,
                  visibleIndices,
                  item,
                  ch
                );
              }

              if (spectrogramGenerationRef.current !== generation || abortToken.aborted) return;
              visibleAlreadyRendered = true;
            }

            // Full-clip FFT (needed for off-screen chunks and scrolling).
            const { cacheKey } = await workerApi!.computeFFT({
              clipId: item.clipId,
              channelDataArrays: item.channelDataArrays,
              config: item.config,
              sampleRate: item.sampleRate,
              offsetSamples: item.offsetSamples,
              durationSamples: item.durationSamples,
              mono: item.monoFlag,
            });

            if (spectrogramGenerationRef.current !== generation || abortToken.aborted) return;

            clipCacheKeysRef.current.set(item.clipId, cacheKey);

            // Phase 1: Render visible chunks for ALL channels first (unless
            // already rendered from the visible-range FFT — the padded sample
            // range produces identical pixels for visible chunks).
            const phase1Start = performance.now();
            const channelRanges: Array<{
              ch: number;
              channelInfo: { canvasIds: string[]; canvasWidths: number[] };
              visibleIndices: number[];
              remainingIndices: number[];
            }> = [];
            for (let ch = 0; ch < numChannels; ch++) {
              const channelInfo = clipCanvasInfo.get(ch);
              if (!channelInfo) continue;
              const range = getVisibleChunkRange(channelInfo, clipPixelOffset);
              channelRanges.push({ ch, channelInfo, ...range });

              if (!visibleAlreadyRendered) {
                console.log(
                  `[spectrogram] phase1 ch=${ch}: visible=[${range.visibleIndices.join(',')}] remaining=[${range.remainingIndices.join(',')}]`
                );
                await renderChunkSubset(
                  workerApi!,
                  cacheKey,
                  channelInfo,
                  range.visibleIndices,
                  item,
                  ch
                );
              } else {
                console.log(
                  `[spectrogram] phase1 ch=${ch}: skipped (already rendered), remaining=[${range.remainingIndices.join(',')}]`
                );
              }
            }

            console.log(
              `[spectrogram] phase1 complete: ${(performance.now() - phase1Start).toFixed(1)}ms`
            );

            if (spectrogramGenerationRef.current !== generation || abortToken.aborted) return;

            // Phase 2: Render off-screen chunks in background batches.
            if (await renderBackgroundBatches(channelRanges, cacheKey, item)) return;
          }
        } catch (err) {
          console.warn('Spectrogram worker error for clip', item.clipId, err);
        }
      }

      for (const item of clipsNeedingDisplayOnly) {
        if (spectrogramGenerationRef.current !== generation || abortToken.aborted) return;

        const cacheKey = clipCacheKeysRef.current.get(item.clipId);
        if (!cacheKey) continue;

        const clipCanvasInfo = spectrogramCanvasRegistryRef.current.get(item.clipId);
        if (!clipCanvasInfo || clipCanvasInfo.size === 0) continue;

        try {
          const clipPixelOffset = Math.floor(item.clipStartSample / samplesPerPixel);

          // Two-phase rendering: visible chunks first, then background (same as FFT path above).
          const channelRanges: Array<{
            ch: number;
            channelInfo: { canvasIds: string[]; canvasWidths: number[] };
            remainingIndices: number[];
          }> = [];
          for (let ch = 0; ch < item.numChannels; ch++) {
            const channelInfo = clipCanvasInfo.get(ch);
            if (!channelInfo) continue;
            const { visibleIndices, remainingIndices } = getVisibleChunkRange(
              channelInfo,
              clipPixelOffset
            );
            channelRanges.push({ ch, channelInfo, remainingIndices });
            await renderChunkSubset(workerApi!, cacheKey, channelInfo, visibleIndices, item, ch);
          }

          if (spectrogramGenerationRef.current !== generation || abortToken.aborted) return;

          // Phase 2: Render off-screen chunks in background batches.
          if (await renderBackgroundBatches(channelRanges, cacheKey, item)) return;
        } catch (err) {
          console.warn('Spectrogram display re-render error for clip', item.clipId, err);
        }
      }
    };

    computeAsync().catch((err) => {
      console.error('[waveform-playlist] Spectrogram computation failed:', err);
    });
  }, [
    tracks,
    mono,
    spectrogramConfig,
    spectrogramColorMap,
    trackSpectrogramOverrides,
    waveHeight,
    samplesPerPixel,
    spectrogramCanvasVersion,
    scrollContainerRef,
  ]);

  // Setters
  const setTrackRenderMode = useCallback((trackId: string, mode: RenderMode) => {
    setTrackSpectrogramOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(trackId);
      next.set(trackId, { ...existing, renderMode: mode });
      return next;
    });
  }, []);

  const setTrackSpectrogramConfig = useCallback(
    (trackId: string, config: SpectrogramConfig, colorMap?: ColorMapValue) => {
      setTrackSpectrogramOverrides((prev) => {
        const next = new Map(prev);
        const existing = next.get(trackId);
        next.set(trackId, {
          renderMode: existing?.renderMode ?? 'waveform',
          config,
          ...(colorMap !== undefined ? { colorMap } : { colorMap: existing?.colorMap }),
        });
        return next;
      });
    },
    []
  );

  const registerSpectrogramCanvases = useCallback(
    (clipId: string, channelIndex: number, canvasIds: string[], canvasWidths: number[]) => {
      const registry = spectrogramCanvasRegistryRef.current;
      if (!registry.has(clipId)) {
        registry.set(clipId, new Map());
      }
      // Replace: SpectrogramChannel passes ALL currently-registered canvas IDs
      // (not just new ones), so replacing gives the correct full set.
      registry.get(clipId)!.set(channelIndex, { canvasIds, canvasWidths });
      setSpectrogramCanvasVersion((v) => v + 1);
    },
    []
  );

  const unregisterSpectrogramCanvases = useCallback((clipId: string, channelIndex: number) => {
    const registry = spectrogramCanvasRegistryRef.current;
    const clipChannels = registry.get(clipId);
    if (clipChannels) {
      clipChannels.delete(channelIndex);
      if (clipChannels.size === 0) {
        registry.delete(clipId);
      }
    }
  }, []);

  const renderMenuItems = useCallback(
    (props: {
      renderMode: string;
      onRenderModeChange: (mode: RenderMode) => void;
      onOpenSettings: () => void;
      onClose?: () => void;
    }) => {
      return SpectrogramMenuItems({
        renderMode: props.renderMode as RenderMode,
        onRenderModeChange: props.onRenderModeChange,
        onOpenSettings: props.onOpenSettings,
        onClose: props.onClose,
      });
    },
    []
  );

  const value: SpectrogramIntegration = useMemo(
    () => ({
      spectrogramDataMap: new Map(),
      trackSpectrogramOverrides,
      spectrogramWorkerApi: spectrogramWorkerReady ? spectrogramWorkerRef.current : null,
      spectrogramConfig,
      spectrogramColorMap,
      setTrackRenderMode,
      setTrackSpectrogramConfig,
      registerSpectrogramCanvases,
      unregisterSpectrogramCanvases,
      renderMenuItems,
      SettingsModal: SpectrogramSettingsModal,
      getColorMap,
      getFrequencyScale: getFrequencyScale as (
        name: string
      ) => (f: number, minF: number, maxF: number) => number,
    }),
    [
      trackSpectrogramOverrides,
      spectrogramWorkerReady,
      spectrogramConfig,
      spectrogramColorMap,
      setTrackRenderMode,
      setTrackSpectrogramConfig,
      registerSpectrogramCanvases,
      unregisterSpectrogramCanvases,
      renderMenuItems,
    ]
  );

  return <SpectrogramIntegrationProvider value={value}>{children}</SpectrogramIntegrationProvider>;
};
