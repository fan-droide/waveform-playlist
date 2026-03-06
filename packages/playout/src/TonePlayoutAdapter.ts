import type { ClipTrack, Track } from '@waveform-playlist/core';
import {
  clipStartTime,
  clipEndTime,
  clipOffsetTime,
  clipDurationTime,
} from '@waveform-playlist/core';
import type { PlayoutAdapter } from '@waveform-playlist/engine';
import { TonePlayout } from './TonePlayout';
import type { EffectsFunction } from './TonePlayout';
import type { ClipInfo } from './ToneTrack';
import type { MidiClipInfo } from './MidiToneTrack';
import type { SoundFontCache } from './SoundFontCache';
import { now } from 'tone';

export interface ToneAdapterOptions {
  effects?: EffectsFunction;
  /** When provided, MIDI clips use SoundFont sample playback instead of PolySynth */
  soundFontCache?: SoundFontCache;
}

export function createToneAdapter(options?: ToneAdapterOptions): PlayoutAdapter {
  let playout: TonePlayout | null = null;
  let _isPlaying = false;
  let _playoutGeneration = 0;
  let _loopEnabled = false;
  let _loopStart = 0;
  let _loopEnd = 0;
  let _audioInitialized = false;

  function buildPlayout(tracks: ClipTrack[]): void {
    if (playout) {
      try {
        playout.dispose();
      } catch (err) {
        console.warn('[waveform-playlist] Error disposing previous playout during rebuild:', err);
      }
      playout = null;
    }

    _playoutGeneration++;
    const generation = _playoutGeneration;

    playout = new TonePlayout({
      effects: options?.effects,
    });

    // If Tone.start() was already called (AudioContext resumed), carry
    // initialization forward. Tone.start() is safe to call multiple times —
    // it resolves immediately if the AudioContext is already running.
    if (_audioInitialized) {
      playout.init().catch((err) => {
        console.warn(
          '[waveform-playlist] Failed to re-initialize playout after rebuild. ' +
            'Audio playback will require another user gesture.',
          err
        );
        _audioInitialized = false;
      });
    }

    for (const track of tracks) {
      // Separate MIDI clips from audio clips
      const audioClips = track.clips.filter((c) => c.audioBuffer && !c.midiNotes);
      const midiClips = track.clips.filter((c) => c.midiNotes && c.midiNotes.length > 0);

      // Handle audio clips (existing behavior)
      if (audioClips.length > 0) {
        const startTime = Math.min(...audioClips.map(clipStartTime));
        const endTime = Math.max(...audioClips.map(clipEndTime));

        const trackObj: Track = {
          id: track.id,
          name: track.name,
          gain: track.volume,
          muted: track.muted,
          soloed: track.soloed,
          stereoPan: track.pan,
          startTime,
          endTime,
        };

        const clipInfos: ClipInfo[] = audioClips.map((clip) => ({
          buffer: clip.audioBuffer!,
          startTime: clipStartTime(clip) - startTime,
          duration: clipDurationTime(clip),
          offset: clipOffsetTime(clip),
          fadeIn: clip.fadeIn,
          fadeOut: clip.fadeOut,
          gain: clip.gain,
        }));

        playout.addTrack({
          clips: clipInfos,
          track: trackObj,
          effects: track.effects,
        });
      }

      // Handle MIDI clips
      if (midiClips.length > 0) {
        const startTime = Math.min(...midiClips.map(clipStartTime));
        const endTime = Math.max(...midiClips.map(clipEndTime));

        // MIDI tracks get a separate ID suffix to avoid collision when a track
        // has both audio and MIDI clips (rare but possible)
        const trackId = audioClips.length > 0 ? `${track.id}:midi` : track.id;

        const trackObj: Track = {
          id: trackId,
          name: track.name,
          gain: track.volume,
          muted: track.muted,
          soloed: track.soloed,
          stereoPan: track.pan,
          startTime,
          endTime,
        };

        const midiClipInfos: MidiClipInfo[] = midiClips.map((clip) => ({
          notes: clip.midiNotes!,
          startTime: clipStartTime(clip) - startTime,
          duration: clipDurationTime(clip),
          offset: clipOffsetTime(clip),
        }));

        // Route to SoundFontToneTrack when a SoundFont cache is loaded,
        // otherwise fall back to MidiToneTrack (PolySynth)
        if (options?.soundFontCache?.isLoaded) {
          // Determine program number and percussion from the first MIDI clip
          const firstClip = midiClips[0];
          const midiChannel = firstClip.midiChannel;
          const isPercussion = midiChannel === 9;
          const programNumber = firstClip.midiProgram ?? 0;

          playout.addSoundFontTrack({
            clips: midiClipInfos,
            track: trackObj,
            soundFontCache: options.soundFontCache,
            programNumber,
            isPercussion,
            effects: track.effects,
          });
        } else {
          playout.addMidiTrack({
            clips: midiClipInfos,
            track: trackObj,
            effects: track.effects,
          });
        }
      }
    }

    playout.applyInitialSoloState();
    playout.setLoop(_loopEnabled, _loopStart, _loopEnd);

    playout.setOnPlaybackComplete(() => {
      if (generation === _playoutGeneration) {
        _isPlaying = false;
      }
    });
  }

  return {
    async init(): Promise<void> {
      if (playout) {
        await playout.init();
        _audioInitialized = true;
      }
    },

    setTracks(tracks: ClipTrack[]): void {
      buildPlayout(tracks);
    },

    play(startTime: number, endTime?: number): void {
      if (!playout) {
        console.warn(
          '[waveform-playlist] adapter.play() called but no playout is available. ' +
            'Tracks may not have been set, or the adapter was disposed.'
        );
        return;
      }
      const duration = endTime !== undefined ? endTime - startTime : undefined;
      playout.play(now(), startTime, duration);
      // Only set _isPlaying if play() didn't throw
      // (TonePlayout.play() re-throws after cleanup on Transport failure)
      _isPlaying = true;
    },

    pause(): void {
      playout?.pause();
      _isPlaying = false;
    },

    stop(): void {
      playout?.stop();
      _isPlaying = false;
    },

    seek(time: number): void {
      playout?.seekTo(time);
    },

    getCurrentTime(): number {
      return playout?.getCurrentTime() ?? 0;
    },

    isPlaying(): boolean {
      return _isPlaying;
    },

    setMasterVolume(volume: number): void {
      playout?.setMasterGain(volume);
    },

    setTrackVolume(trackId: string, volume: number): void {
      playout?.getTrack(trackId)?.setVolume(volume);
    },

    setTrackMute(trackId: string, muted: boolean): void {
      playout?.setMute(trackId, muted);
    },

    setTrackSolo(trackId: string, soloed: boolean): void {
      playout?.setSolo(trackId, soloed);
    },

    setTrackPan(trackId: string, pan: number): void {
      playout?.getTrack(trackId)?.setPan(pan);
    },

    setLoop(enabled: boolean, start: number, end: number): void {
      _loopEnabled = enabled;
      _loopStart = start;
      _loopEnd = end;
      playout?.setLoop(enabled, start, end);
    },

    dispose(): void {
      try {
        playout?.dispose();
      } catch (err) {
        console.warn('[waveform-playlist] Error disposing playout:', err);
      }
      playout = null;
      _isPlaying = false;
    },
  };
}
