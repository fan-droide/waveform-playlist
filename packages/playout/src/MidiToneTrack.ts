import {
  Volume,
  Gain,
  Panner,
  PolySynth,
  Synth,
  MembraneSynth,
  MetalSynth,
  NoiseSynth,
  Part,
  ToneAudioNode,
  getDestination,
  getContext,
} from 'tone';
import type { SynthOptions } from 'tone';
import { Track } from '@waveform-playlist/core';
import type { MidiNoteData } from '@waveform-playlist/core';
import { getUnderlyingAudioParam } from './fades';
import type { TrackEffectsFunction } from './ToneTrack';

/**
 * Shared interface for tracks managed by TonePlayout.
 * Both ToneTrack (audio) and MidiToneTrack (MIDI) implement this,
 * allowing TonePlayout to manage them uniformly.
 */
export interface PlayableTrack {
  id: string;
  startTime: number;
  muted: boolean;
  duration: number;
  stopAllSources(): void;
  startMidClipSources(offset: number, time: number): void;
  setScheduleGuardOffset(offset: number): void;
  prepareFades(when: number, offset: number): void;
  cancelFades(): void;
  setVolume(gain: number): void;
  setPan(pan: number): void;
  setMute(muted: boolean): void;
  setSolo(soloed: boolean): void;
  dispose(): void;
}

export interface MidiClipInfo {
  notes: MidiNoteData[];
  startTime: number; // When this clip starts relative to track start (seconds)
  duration: number; // Clip duration (seconds)
  offset: number; // Trim offset into the MIDI data (seconds)
}

export interface MidiToneTrackOptions {
  clips: MidiClipInfo[];
  track: Track;
  effects?: TrackEffectsFunction;
  destination?: ToneAudioNode;
  synthOptions?: Partial<SynthOptions>;
  /** When true, uses percussion synths (MembraneSynth, NoiseSynth, MetalSynth) */
  isPercussion?: boolean;
}

/**
 * Categorize GM percussion note numbers into synth types.
 * See: https://www.midi.org/specifications-old/item/gm-level-1-sound-set
 */
type DrumCategory = 'kick' | 'snare' | 'cymbal' | 'tom';

function getDrumCategory(midiNote: number): DrumCategory {
  // Bass drums
  if (midiNote === 35 || midiNote === 36) return 'kick';
  // Snare, side stick, clap
  if (midiNote >= 37 && midiNote <= 40) return 'snare';
  // Toms (low floor tom through high tom)
  if (
    midiNote === 41 ||
    midiNote === 43 ||
    midiNote === 45 ||
    midiNote === 47 ||
    midiNote === 48 ||
    midiNote === 50
  )
    return 'tom';
  // Hi-hats, cymbals, bells, tambourine, cowbell, etc.
  return 'cymbal';
}

/** Per-clip scheduling info */
interface ScheduledMidiClip {
  clipInfo: MidiClipInfo;
  part: Part;
}

export class MidiToneTrack implements PlayableTrack {
  private scheduledClips: ScheduledMidiClip[];
  private synth: PolySynth | null = null;
  // Percussion synths (only created for channel 9)
  private kickSynth: MembraneSynth | null = null;
  private snareSynth: NoiseSynth | null = null;
  private cymbalSynth: MetalSynth | null = null;
  private tomSynth: MembraneSynth | null = null;
  private isPercussion: boolean;
  private volumeNode: Volume;
  private panNode: Panner;
  private muteGain: Gain;
  private track: Track;
  private effectsCleanup?: () => void;

  constructor(options: MidiToneTrackOptions) {
    this.track = options.track;
    this.isPercussion = options.isPercussion ?? false;

    // Create shared track-level Tone.js nodes (same chain as ToneTrack)
    this.volumeNode = new Volume(this.gainToDb(options.track.gain));
    this.panNode = new Panner(options.track.stereoPan);
    this.muteGain = new Gain(options.track.muted ? 0 : 1);
    this.volumeNode.chain(this.panNode, this.muteGain);

    if (this.isPercussion) {
      // Percussion: separate synths for different drum categories
      this.kickSynth = new MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
      });
      this.snareSynth = new NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      });
      this.cymbalSynth = new MetalSynth({
        envelope: { attack: 0.001, decay: 0.3, release: 0.1 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
      });
      this.tomSynth = new MembraneSynth({
        pitchDecay: 0.08,
        octaves: 4,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
      });
      this.kickSynth.connect(this.volumeNode);
      this.snareSynth.connect(this.volumeNode);
      this.cymbalSynth.connect(this.volumeNode);
      this.tomSynth.connect(this.volumeNode);
    } else {
      // Melodic: PolySynth with basic Synth voice
      this.synth = new PolySynth(Synth, options.synthOptions);
      this.synth.connect(this.volumeNode);
    }

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
        // Note must start before clip ends and end after clip's trim offset
        return note.time < clipInfo.offset + clipInfo.duration && noteEnd > clipInfo.offset;
      });

      // Create Part events with absolute Transport times
      const absClipStart = this.track.startTime + clipInfo.startTime;

      const partEvents = visibleNotes.map((note) => {
        // Adjust note timing relative to clip's trim offset
        const adjustedTime = note.time - clipInfo.offset;
        // Clamp to clip boundaries
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
        };
      });

      const part = new Part((time, event) => {
        if (event.duration > 0) {
          this.triggerNote(event.midi, event.note, event.duration, time, event.velocity);
        }
      }, partEvents);

      // Part starts automatically with Transport
      part.start(0);

      return { clipInfo, part };
    });
  }

  /**
   * Trigger a note using the appropriate synth.
   * For percussion, routes to kick/snare/cymbal/tom based on GM drum map.
   */
  private triggerNote(
    midiNote: number,
    noteName: string,
    duration: number,
    time: number,
    velocity: number
  ): void {
    if (this.isPercussion) {
      // Percussion synths are monophonic — overlapping notes throw.
      // Wrap in try-catch since missing an occasional overlap is
      // imperceptible for short percussive hits.
      const category = getDrumCategory(midiNote);
      try {
        switch (category) {
          case 'kick':
            this.kickSynth?.triggerAttackRelease('C1', duration, time, velocity);
            break;
          case 'snare':
            this.snareSynth?.triggerAttackRelease(duration, time, velocity);
            break;
          case 'tom': {
            // Map tom notes to different pitches
            const tomPitches: Record<number, string> = {
              41: 'G1',
              43: 'A1',
              45: 'C2',
              47: 'D2',
              48: 'E2',
              50: 'G2',
            };
            this.tomSynth?.triggerAttackRelease(
              tomPitches[midiNote] || 'C2',
              duration,
              time,
              velocity
            );
            break;
          }
          case 'cymbal':
            this.cymbalSynth?.triggerAttackRelease(duration, time, velocity);
            break;
        }
      } catch {
        // Monophonic overlap — previous note still sounding, skip this hit
      }
    } else {
      this.synth?.triggerAttackRelease(noteName, duration, time, velocity);
    }
  }

  private gainToDb(gain: number): number {
    return 20 * Math.log10(gain);
  }

  /**
   * No-op for MIDI — schedule guard is for AudioBufferSourceNode ghost tick prevention.
   * Tone.Part handles its own scheduling relative to Transport.
   */
  setScheduleGuardOffset(_offset: number): void {
    // No-op: Tone.Part handles scheduling internally
  }

  /**
   * For MIDI, mid-clip sources are notes that should already be sounding.
   * We trigger them with their remaining duration.
   */
  startMidClipSources(transportOffset: number, audioContextTime: number): void {
    for (const { clipInfo } of this.scheduledClips) {
      const absClipStart = this.track.startTime + clipInfo.startTime;
      const absClipEnd = absClipStart + clipInfo.duration;

      if (absClipStart < transportOffset && absClipEnd > transportOffset) {
        // Find notes that should be currently sounding
        for (const note of clipInfo.notes) {
          const adjustedTime = note.time - clipInfo.offset;
          const noteAbsStart = absClipStart + Math.max(0, adjustedTime);
          const noteAbsEnd = noteAbsStart + note.duration;

          if (noteAbsStart < transportOffset && noteAbsEnd > transportOffset) {
            const remainingDuration = noteAbsEnd - transportOffset;
            try {
              this.triggerNote(
                note.midi,
                note.name,
                remainingDuration,
                audioContextTime,
                note.velocity
              );
            } catch (err) {
              console.warn(
                `[waveform-playlist] Failed to start mid-clip MIDI note "${note.name}" on track "${this.id}":`,
                err
              );
            }
          }
        }
      }
    }
  }

  /**
   * Stop all sounding notes and cancel scheduled Part events.
   */
  stopAllSources(): void {
    const now = getContext().rawContext.currentTime;
    try {
      if (this.synth) {
        this.synth.releaseAll(now);
      }
      // Percussion synths don't have releaseAll — they decay naturally.
      // No explicit stop needed since they have short envelopes.
    } catch (err) {
      console.warn(`[waveform-playlist] Error releasing synth on track "${this.id}":`, err);
    }
  }

  /**
   * No-op for MIDI — MIDI uses note velocity, not gain fades.
   */
  prepareFades(_when: number, _offset: number): void {
    // No-op: MIDI clips don't use fade envelopes
  }

  /**
   * No-op for MIDI — no fade automation to cancel.
   */
  cancelFades(): void {
    // No-op: MIDI clips don't use fade envelopes
  }

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
          `[waveform-playlist] Error during MIDI track "${this.id}" effects cleanup:`,
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
          `[waveform-playlist] Error disposing Part ${index} on MIDI track "${this.id}":`,
          err
        );
      }
    });

    // Dispose synth(s) and audio nodes
    const synthsToDispose = this.isPercussion
      ? [this.kickSynth, this.snareSynth, this.cymbalSynth, this.tomSynth]
      : [this.synth];
    for (const s of synthsToDispose) {
      try {
        s?.dispose();
      } catch (err) {
        console.warn(`[waveform-playlist] Error disposing synth on MIDI track "${this.id}":`, err);
      }
    }
    try {
      this.volumeNode.dispose();
    } catch (err) {
      console.warn(
        `[waveform-playlist] Error disposing volumeNode on MIDI track "${this.id}":`,
        err
      );
    }
    try {
      this.panNode.dispose();
    } catch (err) {
      console.warn(`[waveform-playlist] Error disposing panNode on MIDI track "${this.id}":`, err);
    }
    try {
      this.muteGain.dispose();
    } catch (err) {
      console.warn(`[waveform-playlist] Error disposing muteGain on MIDI track "${this.id}":`, err);
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
