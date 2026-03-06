import { SoundFont2, GeneratorType } from 'soundfont2';
import type { Key, Generator, ZoneMap } from 'soundfont2';

/**
 * Result of looking up a MIDI note in the SoundFont.
 * Contains the AudioBuffer and the playbackRate needed to
 * pitch-shift the sample to the target note.
 */
export interface SoundFontSample {
  /** Cached AudioBuffer for this sample */
  buffer: AudioBuffer;
  /** Playback rate to pitch-shift from originalPitch to target note */
  playbackRate: number;
}

/**
 * Get a numeric generator value from a zone map.
 */
function getGeneratorValue(
  generators: ZoneMap<Generator>,
  type: GeneratorType
): number | undefined {
  return generators[type]?.value;
}

/**
 * Caches parsed SoundFont2 data and AudioBuffers for efficient playback.
 *
 * AudioBuffers are created lazily on first access and cached by sample index.
 * Pitch calculation uses the SF2 generator chain:
 *   OverridingRootKey → sample.header.originalPitch → fallback 60
 *
 * Audio graph per note:
 *   AudioBufferSourceNode (playbackRate for pitch) → GainNode (velocity) → track chain
 */
export class SoundFontCache {
  private sf2: SoundFont2 | null = null;
  private audioBufferCache: Map<number, AudioBuffer> = new Map();
  private context: BaseAudioContext;

  constructor(context: BaseAudioContext) {
    this.context = context;
  }

  /**
   * Load and parse an SF2 file from a URL.
   */
  async load(url: string, signal?: AbortSignal): Promise<void> {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch SoundFont ${url}: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    this.sf2 = new SoundFont2(new Uint8Array(arrayBuffer));
  }

  /**
   * Load from an already-fetched ArrayBuffer.
   */
  loadFromBuffer(data: ArrayBuffer): void {
    this.sf2 = new SoundFont2(new Uint8Array(data));
  }

  get isLoaded(): boolean {
    return this.sf2 !== null;
  }

  /**
   * Look up a MIDI note and return the AudioBuffer + playbackRate.
   *
   * @param midiNote - MIDI note number (0-127)
   * @param bankNumber - Bank number (0 for melodic, 128 for percussion/drums)
   * @param presetNumber - GM program number (0-127)
   * @returns SoundFontSample or null if no sample found for this note
   */
  getAudioBuffer(
    midiNote: number,
    bankNumber: number = 0,
    presetNumber: number = 0
  ): SoundFontSample | null {
    if (!this.sf2) return null;

    const keyData = this.sf2.getKeyData(midiNote, bankNumber, presetNumber);
    if (!keyData) return null;

    const sample = keyData.sample;
    const sampleIndex = this.sf2.samples.indexOf(sample);

    // Get or create the AudioBuffer for this sample
    let buffer = this.audioBufferCache.get(sampleIndex);
    if (!buffer) {
      buffer = this.int16ToAudioBuffer(sample.data, sample.header.sampleRate);
      this.audioBufferCache.set(sampleIndex, buffer);
    }

    // Calculate playback rate using SF2 generator chain for root key.
    // Priority: OverridingRootKey generator → sample.header.originalPitch → 60
    const playbackRate = this.calculatePlaybackRate(midiNote, keyData);

    return { buffer, playbackRate };
  }

  /**
   * Calculate playback rate for a MIDI note using the SF2 generator chain.
   *
   * SF2 root key resolution priority:
   *   1. OverridingRootKey generator (per-zone, most specific)
   *   2. sample.header.originalPitch (sample header)
   *   3. MIDI note 60 (middle C fallback)
   *
   * Tuning adjustments:
   *   - CoarseTune generator (semitones, additive)
   *   - FineTune generator (cents, additive)
   *   - sample.header.pitchCorrection (cents, additive)
   */
  private calculatePlaybackRate(midiNote: number, keyData: Key): number {
    const sample = keyData.sample;
    const generators = keyData.generators;

    // Resolve root key: OverridingRootKey → originalPitch → 60
    const overrideRootKey = getGeneratorValue(generators, GeneratorType.OverridingRootKey);
    const originalPitch = sample.header.originalPitch;
    const rootKey =
      overrideRootKey !== undefined ? overrideRootKey : originalPitch !== 255 ? originalPitch : 60;

    // Tuning adjustments in semitones
    const coarseTune = getGeneratorValue(generators, GeneratorType.CoarseTune) ?? 0;
    const fineTune = getGeneratorValue(generators, GeneratorType.FineTune) ?? 0;
    const pitchCorrection = sample.header.pitchCorrection ?? 0;

    // Total offset in semitones: target note - root key + tuning
    const totalSemitones = midiNote - rootKey + coarseTune + (fineTune + pitchCorrection) / 100;

    return Math.pow(2, totalSemitones / 12);
  }

  /**
   * Convert Int16Array sample data to an AudioBuffer.
   * SF2 samples are 16-bit signed integers; Web Audio needs Float32 [-1, 1].
   */
  private int16ToAudioBuffer(data: Int16Array, sampleRate: number): AudioBuffer {
    const buffer = this.context.createBuffer(1, data.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      channel[i] = data[i] / 32768;
    }
    return buffer;
  }

  /**
   * Clear all cached AudioBuffers and release the parsed SF2.
   */
  dispose(): void {
    this.audioBufferCache.clear();
    this.sf2 = null;
  }
}
