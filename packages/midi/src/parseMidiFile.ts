import { Midi } from '@tonejs/midi';
import type { MidiNoteData } from '@waveform-playlist/core';

export interface ParsedMidiTrack {
  /** Track name from the MIDI file */
  name: string;
  /** Parsed notes in MidiNoteData format */
  notes: MidiNoteData[];
  /** Duration in seconds (end of last note) */
  duration: number;
  /** MIDI channel (9/10 = percussion) */
  channel: number;
  /** Instrument name from MIDI program change */
  instrument: string;
}

export interface ParsedMidi {
  /** Individual MIDI tracks with their notes */
  tracks: ParsedMidiTrack[];
  /** Total duration in seconds (max of all track durations) */
  duration: number;
  /** Song name from MIDI header */
  name: string;
  /** First tempo in BPM (default 120 if none specified) */
  bpm: number;
  /** Time signature as [numerator, denominator] (default [4, 4]) */
  timeSignature: [number, number];
}

export interface ParseMidiOptions {
  /** When true, merges all MIDI tracks into a single ParsedMidiTrack */
  flatten?: boolean;
}

function mapNotes(track: Midi['tracks'][number]): MidiNoteData[] {
  return track.notes.map((note) => ({
    midi: note.midi,
    name: note.name,
    time: note.time,
    duration: note.duration,
    velocity: note.velocity,
    channel: track.channel,
  }));
}

function getTrackDuration(notes: MidiNoteData[]): number {
  if (notes.length === 0) return 0;
  return Math.max(...notes.map((n) => n.time + n.duration));
}

/**
 * Parse a MIDI file from an ArrayBuffer.
 *
 * Returns structured data with tracks, notes, tempo, and time signature.
 * Notes are already in seconds (tempo-adjusted by @tonejs/midi).
 */
export function parseMidiFile(data: ArrayBuffer, options: ParseMidiOptions = {}): ParsedMidi {
  const midi = new Midi(data);

  const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120;

  const timeSig =
    midi.header.timeSignatures.length > 0 ? midi.header.timeSignatures[0].timeSignature : [4, 4];

  // Parse all tracks that have notes
  const parsedTracks: ParsedMidiTrack[] = midi.tracks
    .filter((track) => track.notes.length > 0)
    .map((track) => {
      const notes = mapNotes(track);
      const instrument = track.instrument.name;
      // Prefer instrument name (e.g. "acoustic guitar (steel)") over track name,
      // which in many MIDI files contains metadata (artist, title fragments).
      // Fall back to track name, then channel number.
      const name =
        instrument !== 'acoustic grand piano'
          ? instrument
          : track.name.trim() || `Channel ${track.channel + 1}`;
      return {
        name,
        notes,
        duration: getTrackDuration(notes),
        channel: track.channel,
        instrument,
      };
    });

  if (options.flatten && parsedTracks.length > 0) {
    const allNotes = parsedTracks.flatMap((t) => t.notes);
    allNotes.sort((a, b) => a.time - b.time);
    const duration = getTrackDuration(allNotes);

    return {
      tracks: [
        {
          name: midi.name || 'MIDI',
          notes: allNotes,
          duration,
          channel: parsedTracks[0].channel,
          instrument: parsedTracks[0].instrument,
        },
      ],
      duration,
      name: midi.name || '',
      bpm,
      timeSignature: timeSig as [number, number],
    };
  }

  const duration = parsedTracks.length > 0 ? Math.max(...parsedTracks.map((t) => t.duration)) : 0;

  return {
    tracks: parsedTracks,
    duration,
    name: midi.name || '',
    bpm,
    timeSignature: timeSig as [number, number],
  };
}

/**
 * Fetch and parse a MIDI file from a URL.
 *
 * Supports AbortSignal for cancellation (e.g., component unmount cleanup).
 */
export async function parseMidiUrl(
  url: string,
  options: ParseMidiOptions = {},
  signal?: AbortSignal
): Promise<ParsedMidi> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch MIDI file ${url}: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return parseMidiFile(buffer, options);
}
