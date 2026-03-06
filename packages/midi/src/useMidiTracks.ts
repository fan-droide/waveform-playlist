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
  /** URL to a .sf2 SoundFont file for sample-based playback */
  soundFontUrl?: string;
}

export interface UseMidiTracksReturn {
  /** Loaded ClipTrack array with midiNotes on clips */
  tracks: ClipTrack[];
  /** Whether any tracks are still loading */
  loading: boolean;
  /** Error message if loading failed, null otherwise */
  error: string | null;
  /** Number of tracks that have finished loading */
  loadedCount: number;
  /** Total number of tracks (known after parsing) */
  totalCount: number;
}

/**
 * Hook to load MIDI files and convert to ClipTrack format with midiNotes.
 *
 * All tracks are returned at once after loading completes. This ensures
 * all track controls and layout containers appear simultaneously in React,
 * while canvas rendering is deferred to the UI layer for progressive drawing.
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
export function useMidiTracks(configs: MidiTrackConfig[]): UseMidiTracksReturn {
  const [tracks, setTracks] = useState<ClipTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(configs.length);

  useEffect(() => {
    if (configs.length === 0) {
      setTracks([]);
      setLoading(false);
      setLoadedCount(0);
      setTotalCount(0);
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    const createTrackFromNotes = (
      config: MidiTrackConfig,
      notes: MidiNoteData[],
      trackName: string,
      noteDuration: number,
      midiChannel?: number,
      midiProgram?: number
    ): ClipTrack => {
      const sampleRate = config.sampleRate ?? 44100;
      const clipDuration = config.duration ?? noteDuration;

      const clip = createClipFromSeconds({
        startTime: config.startTime ?? 0,
        duration: clipDuration,
        sampleRate,
        sourceDuration: clipDuration,
        midiNotes: notes,
        midiChannel,
        midiProgram,
        name: trackName,
      });

      return createTrack({
        name: trackName,
        clips: [clip],
        muted: config.muted ?? false,
        soloed: config.soloed ?? false,
        volume: config.volume ?? 1.0,
        pan: config.pan ?? 0,
        color: config.color,
      });
    };

    const loadTracks = async () => {
      try {
        const t0 = performance.now();
        setLoading(true);
        setError(null);
        setLoadedCount(0);

        const allTracks: ClipTrack[] = [];

        for (const config of configs) {
          if (cancelled) break;

          if (config.midiNotes) {
            // Pre-parsed notes — no fetch needed
            const notes = config.midiNotes;
            const duration =
              notes.length > 0 ? Math.max(...notes.map((n) => n.time + n.duration)) : 0;
            const trackName = config.name || 'MIDI Track';
            allTracks.push(createTrackFromNotes(config, notes, trackName, duration));
          } else if (config.src) {
            // Fetch and parse .mid file
            const tFetch = performance.now();
            const response = await fetch(config.src, {
              signal: abortController.signal,
            });
            if (!response.ok) {
              throw new Error(`Failed to fetch ${config.src}: ${response.statusText}`);
            }
            const buffer = await response.arrayBuffer();
            console.log(`[midi] fetch ${config.src}: ${(performance.now() - tFetch).toFixed(1)}ms`);

            const tParse = performance.now();
            const parsed = parseMidiFile(buffer, {
              flatten: config.flatten,
            });
            console.log(
              `[midi] parse ${parsed.tracks.length} tracks: ${(performance.now() - tParse).toFixed(1)}ms`
            );

            for (const parsedTrack of parsed.tracks) {
              if (cancelled) break;
              const trackName = config.name
                ? `${config.name} - ${parsedTrack.name}`
                : parsedTrack.name;
              allTracks.push(
                createTrackFromNotes(
                  config,
                  parsedTrack.notes,
                  trackName,
                  parsedTrack.duration,
                  parsedTrack.channel,
                  parsedTrack.programNumber
                )
              );
            }
          } else {
            throw new Error('MIDI track config must provide src or midiNotes');
          }
        }

        if (!cancelled) {
          setTracks(allTracks);
          setLoadedCount(allTracks.length);
          setTotalCount(allTracks.length);
          setLoading(false);
          console.log(
            `[midi] total load: ${(performance.now() - t0).toFixed(1)}ms, ${allTracks.length} tracks`
          );
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
  }, [configs]);

  return { tracks, loading, error, loadedCount, totalCount };
}
