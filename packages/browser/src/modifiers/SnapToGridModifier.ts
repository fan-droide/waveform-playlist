import {
  Modifier,
  configurator,
  type DragDropManager,
  type DragOperation,
} from '@dnd-kit/abstract';
import {
  ticksPerBeat,
  ticksPerBar,
  ticksToSamples,
  samplesToTicks,
  snapToGrid,
} from '@waveform-playlist/core';
import type { SnapTo } from '@waveform-playlist/ui-components';

interface SnapToGridBeatsOptions {
  mode: 'beats';
  snapTo: SnapTo;
  bpm: number;
  timeSignature: [number, number];
  samplesPerPixel: number;
  sampleRate: number;
}

interface SnapToGridTemporalOptions {
  mode: 'temporal';
  gridSamples: number;
  samplesPerPixel: number;
}

type SnapToGridOptions = SnapToGridBeatsOptions | SnapToGridTemporalOptions;

/**
 * dnd-kit modifier that quantizes clip drag movement to a grid.
 *
 * Two modes:
 * - "beats": Snaps to beat/bar grid using PPQN tick space for exact musical timing.
 * - "temporal": Snaps to a sample-based grid derived from timescale markers.
 *
 * Designed to compose with ClipCollisionModifier — snap first,
 * then collision constrains the snapped position.
 */
export class SnapToGridModifier extends Modifier<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DragDropManager<any, any>,
  SnapToGridOptions
> {
  apply(operation: DragOperation): { x: number; y: number } {
    const { transform, source } = operation;

    if (!this.options || !source?.data) return transform;

    // Don't snap boundary trims — only snap clip moves
    const { boundary } = source.data as { boundary?: 'left' | 'right' };
    if (boundary) return transform;

    const { samplesPerPixel } = this.options;

    if (this.options.mode === 'temporal') {
      const { gridSamples } = this.options;
      const deltaSamples = transform.x * samplesPerPixel;
      const snappedSamples = Math.round(deltaSamples / gridSamples) * gridSamples;
      return { x: snappedSamples / samplesPerPixel, y: 0 };
    }

    // Beats mode
    const { snapTo, bpm, timeSignature, sampleRate } = this.options;

    if (snapTo === 'off') return transform;

    const gridTicks = snapTo === 'bar' ? ticksPerBar(timeSignature) : ticksPerBeat(timeSignature);

    // Convert pixel delta to ticks, quantize, convert back to pixels
    const deltaSamples = transform.x * samplesPerPixel;
    const deltaTicks = samplesToTicks(deltaSamples, bpm, sampleRate);
    const snappedTicks = snapToGrid(deltaTicks, gridTicks);
    const snappedSamples = ticksToSamples(snappedTicks, bpm, sampleRate);

    return { x: snappedSamples / samplesPerPixel, y: 0 };
  }

  static configure = configurator(SnapToGridModifier);
}
