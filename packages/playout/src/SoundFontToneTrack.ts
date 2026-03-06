import { Volume, Gain, Panner, Part, ToneAudioNode, getDestination, getContext } from 'tone';
import { Track } from '@waveform-playlist/core';
import { getUnderlyingAudioParam } from './fades';
import type { TrackEffectsFunction } from './ToneTrack';
import type { PlayableTrack, MidiClipInfo } from './MidiToneTrack';
import type { SoundFontCache } from './SoundFontCache';

export interface SoundFontToneTrackOptions {
  clips: MidiClipInfo[];
  track: Track;
  soundFontCache: SoundFontCache;
  /** GM program number (0-127) for melodic instruments */
  programNumber?: number;
  /** Whether this track uses percussion bank (channel 9) */
  isPercussion?: boolean;
  effects?: TrackEffectsFunction;
  destination?: ToneAudioNode;
}

/** Per-clip scheduling info */
interface ScheduledMidiClip {
  clipInfo: MidiClipInfo;
  part: Part;
}

/**
 * MIDI track that uses SoundFont samples for playback.
 *
 * Instead of PolySynth synthesis, each note triggers the correct instrument
 * sample from an SF2 file, pitch-shifted via AudioBufferSourceNode.playbackRate.
 *
 * Audio graph per note:
 *   AudioBufferSourceNode (native, one-shot, pitch-shifted)
 *     → GainNode (native, per-note velocity)
 *     → Volume.input (Tone.js, shared per-track)
 *     → Panner → muteGain → effects/destination
 */
export class SoundFontToneTrack implements PlayableTrack {
  private scheduledClips: ScheduledMidiClip[];
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private soundFontCache: SoundFontCache;
  private programNumber: number;
  private bankNumber: number;
  private volumeNode: Volume;
  private panNode: Panner;
  private muteGain: Gain;
  private track: Track;
  private effectsCleanup?: () => void;

  constructor(options: SoundFontToneTrackOptions) {
    this.track = options.track;
    this.soundFontCache = options.soundFontCache;
    this.programNumber = options.programNumber ?? 0;
    // Bank 128 for percussion (channel 9), bank 0 for melodic
    this.bankNumber = options.isPercussion ? 128 : 0;

    // Create shared track-level Tone.js nodes (same chain as ToneTrack)
    this.volumeNode = new Volume(this.gainToDb(options.track.gain));
    this.panNode = new Panner(options.track.stereoPan);
    this.muteGain = new Gain(options.track.muted ? 0 : 1);
    this.volumeNode.chain(this.panNode, this.muteGain);

    // Connect to destination or apply effects chain
    const destination = options.destination || getDestination();
    if (options.effects) {
      const cleanup = options.effects(this.muteGain, destination, false);
      if (cleanup) {
        this.effectsCleanup = cleanup;
      }
    } else {
      this.muteGain.connect(destination);
    }

    // Create a Tone.Part for each clip, scheduling notes relative to Transport
    this.scheduledClips = options.clips.map((clipInfo) => {
      // Filter notes within the clip's visible window (after trim offset)
      const visibleNotes = clipInfo.notes.filter((note) => {
        const noteEnd = note.time + note.duration;
        return note.time < clipInfo.offset + clipInfo.duration && noteEnd > clipInfo.offset;
      });

      const absClipStart = this.track.startTime + clipInfo.startTime;

      const partEvents = visibleNotes.map((note) => {
        const adjustedTime = note.time - clipInfo.offset;
        const clampedStart = Math.max(0, adjustedTime);
        const clampedDuration = Math.min(
          note.duration - Math.max(0, clipInfo.offset - note.time),
          clipInfo.duration - clampedStart
        );

        return {
          time: absClipStart + clampedStart,
          note: note.name,
          midi: note.midi,
          duration: Math.max(0, clampedDuration),
          velocity: note.velocity,
          channel: note.channel,
        };
      });

      const part = new Part((time, event) => {
        if (event.duration > 0) {
          this.triggerNote(event.midi, event.duration, time, event.velocity, event.channel);
        }
      }, partEvents);

      part.start(0);

      return { clipInfo, part };
    });
  }

  /**
   * Trigger a note by creating a native AudioBufferSourceNode from the SoundFont cache.
   *
   * Per-note routing: channel 9 → bank 128 (drums), others → bank 0 with programNumber.
   */
  private triggerNote(
    midiNote: number,
    duration: number,
    time: number,
    velocity: number,
    channel?: number
  ): void {
    const bank = channel === 9 ? 128 : this.bankNumber;
    const preset = channel === 9 ? 0 : this.programNumber;

    const sfSample = this.soundFontCache.getAudioBuffer(midiNote, bank, preset);
    if (!sfSample) return;

    const rawContext = getContext().rawContext as AudioContext;

    // Create one-shot AudioBufferSourceNode
    const source = rawContext.createBufferSource();
    source.buffer = sfSample.buffer;
    source.playbackRate.value = sfSample.playbackRate;

    // Per-note gain for velocity envelope
    // Quadratic velocity curve feels more natural than linear
    const gainNode = rawContext.createGain();
    gainNode.gain.value = velocity * velocity;

    // Connect: source → gainNode → Volume.input (Tone.js)
    source.connect(gainNode);
    gainNode.connect((this.volumeNode.input as unknown as Gain).input);

    // Track active sources for stopAllSources()
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      try {
        gainNode.disconnect();
      } catch {
        // Already disconnected
      }
    };

    // Start the source at the scheduled time with the note duration
    source.start(time);
    // Apply a short release to avoid clicks
    const releaseTime = 0.05;
    gainNode.gain.setValueAtTime(velocity * velocity, time + duration);
    gainNode.gain.linearRampToValueAtTime(0, time + duration + releaseTime);
    source.stop(time + duration + releaseTime);
  }

  private gainToDb(gain: number): number {
    return 20 * Math.log10(gain);
  }

  /**
   * No-op — Tone.Part handles scheduling internally, no ghost tick guard needed.
   */
  setScheduleGuardOffset(_offset: number): void {
    // No-op
  }

  /**
   * Start notes that should already be sounding at the current transport offset.
   */
  startMidClipSources(transportOffset: number, audioContextTime: number): void {
    for (const { clipInfo } of this.scheduledClips) {
      const absClipStart = this.track.startTime + clipInfo.startTime;
      const absClipEnd = absClipStart + clipInfo.duration;

      if (absClipStart < transportOffset && absClipEnd > transportOffset) {
        for (const note of clipInfo.notes) {
          const adjustedTime = note.time - clipInfo.offset;
          const noteAbsStart = absClipStart + Math.max(0, adjustedTime);
          const noteAbsEnd = noteAbsStart + note.duration;

          if (noteAbsStart < transportOffset && noteAbsEnd > transportOffset) {
            const remainingDuration = noteAbsEnd - transportOffset;
            try {
              this.triggerNote(
                note.midi,
                remainingDuration,
                audioContextTime,
                note.velocity,
                note.channel
              );
            } catch (err) {
              console.warn(
                `[waveform-playlist] Failed to start mid-clip SoundFont note on track "${this.id}":`,
                err
              );
            }
          }
        }
      }
    }
  }

  /**
   * Stop all active AudioBufferSourceNodes.
   */
  stopAllSources(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Already stopped
      }
    }
    this.activeSources.clear();
  }

  /** No-op for MIDI — MIDI uses note velocity, not gain fades. */
  prepareFades(_when: number, _offset: number): void {}

  /** No-op for MIDI — no fade automation to cancel. */
  cancelFades(): void {}

  setVolume(gain: number): void {
    this.track.gain = gain;
    this.volumeNode.volume.value = this.gainToDb(gain);
  }

  setPan(pan: number): void {
    this.track.stereoPan = pan;
    this.panNode.pan.value = pan;
  }

  setMute(muted: boolean): void {
    this.track.muted = muted;
    const value = muted ? 0 : 1;
    const audioParam = getUnderlyingAudioParam(this.muteGain.gain);
    audioParam?.setValueAtTime(value, 0);
    this.muteGain.gain.value = value;
  }

  setSolo(soloed: boolean): void {
    this.track.soloed = soloed;
  }

  dispose(): void {
    if (this.effectsCleanup) {
      try {
        this.effectsCleanup();
      } catch (err) {
        console.warn(
          `[waveform-playlist] Error during SoundFont track "${this.id}" effects cleanup:`,
          err
        );
      }
    }

    this.stopAllSources();

    // Dispose Parts
    this.scheduledClips.forEach(({ part }, index) => {
      try {
        part.dispose();
      } catch (err) {
        console.warn(
          `[waveform-playlist] Error disposing Part ${index} on SoundFont track "${this.id}":`,
          err
        );
      }
    });

    try {
      this.volumeNode.dispose();
    } catch (err) {
      console.warn(
        `[waveform-playlist] Error disposing volumeNode on SoundFont track "${this.id}":`,
        err
      );
    }
    try {
      this.panNode.dispose();
    } catch (err) {
      console.warn(
        `[waveform-playlist] Error disposing panNode on SoundFont track "${this.id}":`,
        err
      );
    }
    try {
      this.muteGain.dispose();
    } catch (err) {
      console.warn(
        `[waveform-playlist] Error disposing muteGain on SoundFont track "${this.id}":`,
        err
      );
    }
  }

  get id(): string {
    return this.track.id;
  }

  get duration(): number {
    if (this.scheduledClips.length === 0) return 0;
    const lastClip = this.scheduledClips[this.scheduledClips.length - 1];
    return lastClip.clipInfo.startTime + lastClip.clipInfo.duration;
  }

  get muted(): boolean {
    return this.track.muted;
  }

  get startTime(): number {
    return this.track.startTime;
  }
}
