import { useState, useEffect } from 'react';
import { getGlobalAudioContext } from '@waveform-playlist/playout';

/**
 * Configuration for an audio file to load
 */
export interface AudioFileConfig {
  /** Unique identifier for this audio file */
  id: string;
  /** URL to fetch and decode */
  src: string;
}

/**
 * Hook to load and decode audio files, returning a Map of id → AudioBuffer.
 *
 * This is a lower-level hook than `useAudioTracks` — it handles only
 * fetching and decoding. Use this when you need to build custom track
 * structures (e.g., multi-clip tracks sharing audio files).
 *
 * @param configs - Array of audio file configurations
 * @returns Object with buffers map, loading state, and progress
 *
 * @example
 * ```typescript
 * const { buffers, loading, loadedCount, totalCount } = useAudioFiles([
 *   { id: 'kick', src: '/audio/kick.mp3' },
 *   { id: 'snare', src: '/audio/snare.mp3' },
 * ]);
 *
 * // Build multi-clip tracks from loaded buffers
 * const tracks = useMemo(() => buildTracks(buffers), [buffers]);
 * ```
 */
export function useAudioFiles(configs: AudioFileConfig[]) {
  const [buffers, setBuffers] = useState<Map<string, AudioBuffer>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);

  const totalCount = configs.length;

  useEffect(() => {
    if (configs.length === 0) {
      setBuffers(new Map());
      setLoading(false);
      setLoadedCount(0);
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    const loadFiles = async () => {
      setLoading(true);
      setError(null);
      setLoadedCount(0);
      setBuffers(new Map());

      const audioContext = getGlobalAudioContext();

      const loadPromises = configs.map(async (config) => {
        try {
          const response = await fetch(config.src, { signal: abortController.signal });
          if (!response.ok) {
            throw new Error(`Failed to fetch ${config.src}: ${response.statusText}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

          if (!cancelled) {
            setBuffers((prev) => {
              const next = new Map(prev);
              next.set(config.id, audioBuffer);
              return next;
            });
            setLoadedCount((prev) => prev + 1);
          }
        } catch (err) {
          if (!cancelled) {
            const msg = err instanceof Error ? err.message : `Failed to load ${config.id}`;
            console.error(`[waveform-playlist] Failed to load ${config.id}:`, err);
            setError(msg);
          }
        }
      });

      await Promise.all(loadPromises);

      if (!cancelled) {
        setLoading(false);
      }
    };

    loadFiles();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [configs]);

  return { buffers, loading, error, loadedCount, totalCount };
}
