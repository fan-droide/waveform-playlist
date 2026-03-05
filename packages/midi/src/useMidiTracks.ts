import { useState, useEffect } from 'react';
import {
  type ClipTrack,
  type MidiNoteData,
  createClipFromSeconds,
  createTrack,
} from '@waveform-playlist/core';
import { parseMidiFile } from './parseMidiFile';

/**
 * Configuration for a single MIDI track to load.
 *
 * MIDI data can be provided in two ways:
 * 1. `src` — URL to a .mid file (fetched, parsed with @tonejs/midi)
 * 2. `midiNotes` — Pre-parsed notes (skip fetch+parse)
 */
export interface MidiTrackConfig {
  /** URL to .mid file */
  src?: string;
  /** Pre-parsed MIDI notes (skip fetch+parse) */
  midiNotes?: MidiNoteData[];
  /** Track display name */
  name?: string;
  /** Whether this track is muted */
  muted?: boolean;
  /** Whether this track is soloed */
  soloed?: boolean;
  /** Track volume (default 1.0) */
  volume?: number;
  /** Stereo pan (default 0) */
  pan?: number;
  /** Track color */
  color?: string;
  /** Clip position on timeline in seconds (default 0) */
  startTime?: number;
  /** Override clip duration in seconds (default: derived from last note) */
  duration?: number;
  /** Sample rate for sample-based positioning (default 44100) */
  sampleRate?: number;
  /** Merge all MIDI tracks from the file into one ClipTrack (default false) */
  flatten?: boolean;
}

export interface UseMidiTracksReturn {
  /** Loaded ClipTrack array with midiNotes on clips */
  tracks: ClipTrack[];
  /** Whether any tracks are still loading */
  loading: boolean;
  /** Error message if loading failed, null otherwise */
  error: string | null;
  /** Number of configs that have finished loading */
  loadedCount: number;
  /** Total number of configs */
  totalCount: number;
}

export interface UseMidiTracksOptions {
  /**
   * When true, tracks are added progressively as they load.
   * Default: false (wait for all tracks)
   */
  progressive?: boolean;
}

/**
 * Hook to load MIDI files and convert to ClipTrack format with midiNotes.
 *
 * Mirrors the useAudioTracks API shape from @waveform-playlist/browser.
 * Each .mid file can produce multiple ClipTracks (one per MIDI track),
 * or a single merged track when `flatten: true`.
 *
 * @example
 * ```typescript
 * const { tracks, loading, error } = useMidiTracks([
 *   { src: '/music/song.mid', name: 'Piano' },
 * ]);
 *
 * // Pre-parsed notes (no fetch)
 * const { tracks } = useMidiTracks([
 *   { midiNotes: myNotes, name: 'Synth Lead', duration: 30 },
 * ]);
 * ```
 */
export function useMidiTracks(
  configs: MidiTrackConfig[],
  options: UseMidiTracksOptions = {}
): UseMidiTracksReturn {
  const { progressive = false } = options;
  const [tracks, setTracks] = useState<ClipTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);

  const totalCount = configs.length;

  useEffect(() => {
    if (configs.length === 0) {
      setTracks([]);
      setLoading(false);
      setLoadedCount(0);
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    // Each config may expand to multiple tracks; store by config index
    const loadedTracksMap = new Map<number, ClipTrack[]>();

    const buildTracksArray = (): ClipTrack[] => {
      const result: ClipTrack[] = [];
      for (let i = 0; i < configs.length; i++) {
        const configTracks = loadedTracksMap.get(i);
        if (configTracks) {
          result.push(...configTracks);
        }
      }
      return result;
    };

    const createTracksFromNotes = (
      config: MidiTrackConfig,
      notes: MidiNoteData[],
      trackName: string,
      noteDuration: number,
      midiChannel?: number
    ): ClipTrack[] => {
      const sampleRate = config.sampleRate ?? 44100;
      const clipDuration = config.duration ?? noteDuration;

      // MIDI has no native sample rate — we use sampleRate purely for
      // sample-based timeline positioning. sourceDuration = clipDuration
      // because there's no underlying audio buffer to trim into.
      const clip = createClipFromSeconds({
        startTime: config.startTime ?? 0,
        duration: clipDuration,
        sampleRate,
        sourceDuration: clipDuration,
        midiNotes: notes,
        midiChannel,
        name: trackName,
      });

      const track = createTrack({
        name: trackName,
        clips: [clip],
        muted: config.muted ?? false,
        soloed: config.soloed ?? false,
        volume: config.volume ?? 1.0,
        pan: config.pan ?? 0,
        color: config.color,
      });

      return [track];
    };

    const loadTracks = async () => {
      try {
        setLoading(true);
        setError(null);
        setLoadedCount(0);

        const loadPromises = configs.map(async (config, index) => {
          let configTracks: ClipTrack[];

          if (config.midiNotes) {
            // Pre-parsed notes — no fetch needed
            const notes = config.midiNotes;
            const duration =
              notes.length > 0 ? Math.max(...notes.map((n) => n.time + n.duration)) : 0;
            const trackName = config.name || `MIDI Track ${index + 1}`;
            configTracks = createTracksFromNotes(config, notes, trackName, duration);
          } else if (config.src) {
            // Fetch and parse .mid file
            const response = await fetch(config.src, {
              signal: abortController.signal,
            });
            if (!response.ok) {
              throw new Error(`Failed to fetch ${config.src}: ${response.statusText}`);
            }
            const buffer = await response.arrayBuffer();
            const parsed = parseMidiFile(buffer, {
              flatten: config.flatten,
            });

            // Each parsed MIDI track becomes a ClipTrack
            configTracks = parsed.tracks.flatMap((parsedTrack) => {
              const trackName = config.name
                ? `${config.name} - ${parsedTrack.name}`
                : parsedTrack.name;
              return createTracksFromNotes(
                config,
                parsedTrack.notes,
                trackName,
                parsedTrack.duration,
                parsedTrack.channel
              );
            });
          } else {
            throw new Error(`MIDI track ${index + 1}: Must provide src or midiNotes`);
          }

          if (progressive && !cancelled) {
            loadedTracksMap.set(index, configTracks);
            setLoadedCount((prev) => prev + 1);
            setTracks(buildTracksArray());
          }

          return configTracks;
        });

        const allConfigTracks = await Promise.all(loadPromises);

        if (!cancelled) {
          if (!progressive) {
            const flatTracks = allConfigTracks.flat();
            setTracks(flatTracks);
            setLoadedCount(allConfigTracks.length);
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error loading MIDI';
          setError(errorMessage);
          setLoading(false);
          console.error('Error loading MIDI tracks:', err);
        }
      }
    };

    loadTracks();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [configs, progressive]);

  return { tracks, loading, error, loadedCount, totalCount };
}
