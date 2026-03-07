# Beats & Bars Timescale Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a beats & bars timescale mode with snap-to-grid clip dragging, using PPQN-based math and a shared React context.

**Architecture:** A `BeatsAndBarsProvider` context shares BPM, time signature, and snap config between SmartScale (rendering) and a new SnapToGridModifier (dnd-kit). All musical math uses PPQN=192 ticks in `@waveform-playlist/core`, converting to samples at the boundary.

**Tech Stack:** React context, PPQN math, @dnd-kit/abstract Modifier, canvas+DOM TimeScale renderer, vitest

---

### Task 1: Create branch

**Step 1: Create and switch to feature branch**

Run: `git checkout -b feat/beats-and-bars`

**Step 2: Commit design doc**

Run:
```bash
git add docs/plans/2026-03-06-beats-and-bars-design.md docs/plans/2026-03-06-beats-and-bars-plan.md
git commit -m "docs: add beats & bars design and implementation plan"
```

---

### Task 2: PPQN beat grid math — tests

**Files:**
- Create: `packages/core/src/__tests__/beatsAndBars.test.ts`

This is the foundation — all musical timing math as pure functions. Write all tests first.

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  PPQN,
  ticksPerBeat,
  ticksPerBar,
  ticksToSamples,
  samplesToTicks,
  snapToGrid,
  ticksToBarBeatLabel,
} from '../utils/beatsAndBars';

describe('PPQN constant', () => {
  it('is 192 (matching Tone.js)', () => {
    expect(PPQN).toBe(192);
  });
});

describe('ticksPerBeat', () => {
  it('returns 192 for quarter note beat [4,4]', () => {
    expect(ticksPerBeat([4, 4])).toBe(192);
  });

  it('returns 192 for quarter note beat [3,4]', () => {
    expect(ticksPerBeat([3, 4])).toBe(192);
  });

  it('returns 96 for eighth note beat [6,8]', () => {
    expect(ticksPerBeat([6, 8])).toBe(96);
  });

  it('returns 384 for half note beat [2,2]', () => {
    expect(ticksPerBeat([2, 2])).toBe(384);
  });
});

describe('ticksPerBar', () => {
  it('returns 768 for [4,4]', () => {
    expect(ticksPerBar([4, 4])).toBe(768);
  });

  it('returns 576 for [3,4]', () => {
    expect(ticksPerBar([3, 4])).toBe(576);
  });

  it('returns 576 for [6,8]', () => {
    expect(ticksPerBar([6, 8])).toBe(576);
  });

  it('returns 768 for [2,2]', () => {
    expect(ticksPerBar([2, 2])).toBe(768);
  });

  it('returns 1344 for [7,8]', () => {
    // 7 * 96 = 672... wait, 7 * (192 * 4/8) = 7 * 96 = 672
    expect(ticksPerBar([7, 8])).toBe(672);
  });
});

describe('ticksToSamples', () => {
  it('converts one beat at 120 BPM / 48000 Hz', () => {
    // 1 beat = 192 ticks, 120 BPM => 0.5 seconds/beat => 24000 samples
    expect(ticksToSamples(192, 120, 48000)).toBe(24000);
  });

  it('converts one bar of [4,4] at 120 BPM / 48000 Hz', () => {
    // 768 ticks = 4 beats = 2 seconds => 96000 samples
    expect(ticksToSamples(768, 120, 48000)).toBe(96000);
  });

  it('returns 0 for 0 ticks', () => {
    expect(ticksToSamples(0, 120, 48000)).toBe(0);
  });

  it('converts at 44100 Hz', () => {
    // 192 ticks at 120 BPM = 0.5s => 22050 samples
    expect(ticksToSamples(192, 120, 44100)).toBe(22050);
  });

  it('converts at 60 BPM', () => {
    // 192 ticks at 60 BPM = 1s => 48000 samples
    expect(ticksToSamples(192, 60, 48000)).toBe(48000);
  });
});

describe('samplesToTicks', () => {
  it('converts 24000 samples at 120 BPM / 48000 Hz to one beat', () => {
    expect(samplesToTicks(24000, 120, 48000)).toBe(192);
  });

  it('returns 0 for 0 samples', () => {
    expect(samplesToTicks(0, 120, 48000)).toBe(0);
  });

  it('rounds to nearest tick', () => {
    // 24001 samples is just barely past one beat — should still round to 192
    expect(samplesToTicks(24001, 120, 48000)).toBe(192);
  });
});

describe('round-trip: ticks -> samples -> ticks', () => {
  it('is stable for exact beat boundaries', () => {
    const ticks = 192;
    const samples = ticksToSamples(ticks, 120, 48000);
    expect(samplesToTicks(samples, 120, 48000)).toBe(ticks);
  });

  it('is stable for bar boundaries', () => {
    const ticks = 768;
    const samples = ticksToSamples(ticks, 120, 48000);
    expect(samplesToTicks(samples, 120, 48000)).toBe(ticks);
  });

  it('is stable at 44100 Hz', () => {
    const ticks = 192;
    const samples = ticksToSamples(ticks, 120, 44100);
    expect(samplesToTicks(samples, 120, 44100)).toBe(ticks);
  });
});

describe('snapToGrid', () => {
  it('snaps to nearest grid line (round down)', () => {
    // 100 ticks, grid of 192 => round(100/192)*192 = round(0.52)*192 = 192
    expect(snapToGrid(100, 192)).toBe(192);
  });

  it('snaps to nearest grid line (round down to 0)', () => {
    // 90 ticks, grid of 192 => round(90/192)*192 = round(0.47)*192 = 0
    expect(snapToGrid(90, 192)).toBe(0);
  });

  it('snaps exact grid position to itself', () => {
    expect(snapToGrid(384, 192)).toBe(384);
  });

  it('snaps 0 to 0', () => {
    expect(snapToGrid(0, 192)).toBe(0);
  });

  it('works with bar-sized grid', () => {
    // 500 ticks, grid of 768 => round(500/768)*768 = round(0.65)*768 = 768
    expect(snapToGrid(500, 768)).toBe(768);
  });

  it('handles negative values (drag left)', () => {
    expect(snapToGrid(-100, 192)).toBe(0);
    expect(snapToGrid(-150, 192)).toBe(-192);
  });
});

describe('ticksToBarBeatLabel', () => {
  it('labels tick 0 as "1" (bar 1, beat 1 = just bar number)', () => {
    expect(ticksToBarBeatLabel(0, [4, 4])).toBe('1');
  });

  it('labels beat 2 of bar 1 as "1.2"', () => {
    expect(ticksToBarBeatLabel(192, [4, 4])).toBe('1.2');
  });

  it('labels beat 3 of bar 1 as "1.3"', () => {
    expect(ticksToBarBeatLabel(384, [4, 4])).toBe('1.3');
  });

  it('labels beat 4 of bar 1 as "1.4"', () => {
    expect(ticksToBarBeatLabel(576, [4, 4])).toBe('1.4');
  });

  it('labels bar 2 as "2"', () => {
    expect(ticksToBarBeatLabel(768, [4, 4])).toBe('2');
  });

  it('labels bar 2 beat 3 as "2.3"', () => {
    expect(ticksToBarBeatLabel(768 + 384, [4, 4])).toBe('2.3');
  });

  it('works with [3,4] time signature', () => {
    // Bar = 576 ticks, beat = 192 ticks
    expect(ticksToBarBeatLabel(0, [3, 4])).toBe('1');
    expect(ticksToBarBeatLabel(192, [3, 4])).toBe('1.2');
    expect(ticksToBarBeatLabel(384, [3, 4])).toBe('1.3');
    expect(ticksToBarBeatLabel(576, [3, 4])).toBe('2');
  });

  it('works with [6,8] time signature', () => {
    // Bar = 576 ticks, beat = 96 ticks
    expect(ticksToBarBeatLabel(0, [6, 8])).toBe('1');
    expect(ticksToBarBeatLabel(96, [6, 8])).toBe('1.2');
    expect(ticksToBarBeatLabel(480, [6, 8])).toBe('1.6');
    expect(ticksToBarBeatLabel(576, [6, 8])).toBe('2');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/__tests__/beatsAndBars.test.ts`
Expected: FAIL — module `../utils/beatsAndBars` not found

---

### Task 3: PPQN beat grid math — implementation

**Files:**
- Create: `packages/core/src/utils/beatsAndBars.ts`
- Modify: `packages/core/src/utils/index.ts` (add export)

**Step 1: Write the implementation**

Create `packages/core/src/utils/beatsAndBars.ts`:

```typescript
/**
 * PPQN (Pulses Per Quarter Note) — matches Tone.js internal resolution.
 * All beat grid math uses ticks as the internal unit for exact integer arithmetic.
 */
export const PPQN = 192;

/**
 * Number of ticks per beat, based on the time signature denominator.
 * A quarter note = PPQN ticks. An eighth note = PPQN/2, etc.
 */
export function ticksPerBeat(timeSignature: [number, number]): number {
  const [, denominator] = timeSignature;
  return PPQN * (4 / denominator);
}

/**
 * Number of ticks per bar (measure).
 * numerator beats * ticks per beat.
 */
export function ticksPerBar(timeSignature: [number, number]): number {
  const [numerator] = timeSignature;
  return numerator * ticksPerBeat(timeSignature);
}

/**
 * Convert PPQN ticks to audio samples.
 * ticks -> seconds -> samples
 */
export function ticksToSamples(ticks: number, bpm: number, sampleRate: number): number {
  return Math.round((ticks * 60 * sampleRate) / (bpm * PPQN));
}

/**
 * Convert audio samples to PPQN ticks.
 * samples -> seconds -> ticks
 */
export function samplesToTicks(samples: number, bpm: number, sampleRate: number): number {
  return Math.round((samples * PPQN * bpm) / (60 * sampleRate));
}

/**
 * Quantize a tick position to the nearest grid line.
 */
export function snapToGrid(ticks: number, gridSizeTicks: number): number {
  return Math.round(ticks / gridSizeTicks) * gridSizeTicks;
}

/**
 * Generate a bar.beat label for a tick position.
 * Beat 1 of a bar shows just the bar number. Other beats show "bar.beat".
 * 1-indexed (DAW convention).
 */
export function ticksToBarBeatLabel(ticks: number, timeSignature: [number, number]): string {
  const barTicks = ticksPerBar(timeSignature);
  const beatTicks = ticksPerBeat(timeSignature);

  const bar = Math.floor(ticks / barTicks) + 1;
  const beatInBar = Math.floor((ticks % barTicks) / beatTicks) + 1;

  if (beatInBar === 1) {
    return `${bar}`;
  }
  return `${bar}.${beatInBar}`;
}
```

**Step 2: Add export to `packages/core/src/utils/index.ts`**

Add this line:
```typescript
export * from './beatsAndBars';
```

The file currently has only `export * from './conversions';` — add the new line after it.

**Step 3: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/__tests__/beatsAndBars.test.ts`
Expected: All tests PASS

**Step 4: Run full core test suite to ensure no regressions**

Run: `cd packages/core && npx vitest run`
Expected: All existing tests still pass

**Step 5: Commit**

```bash
git add packages/core/src/utils/beatsAndBars.ts packages/core/src/utils/index.ts packages/core/src/__tests__/beatsAndBars.test.ts
git commit -m "feat(core): add PPQN-based beats and bars math utilities"
```

---

### Task 4: BeatsAndBarsContext — provider and hook

**Files:**
- Create: `packages/ui-components/src/contexts/BeatsAndBars.tsx`
- Modify: `packages/ui-components/src/contexts/index.tsx` (add exports)
- Modify: `packages/ui-components/src/index.tsx` (re-export from contexts)

**Step 1: Create the context**

Create `packages/ui-components/src/contexts/BeatsAndBars.tsx`:

```typescript
import React, { createContext, useContext, useMemo } from 'react';
import { ticksPerBeat, ticksPerBar } from '@waveform-playlist/core';

export type SnapTo = 'bar' | 'beat' | 'off';

export interface BeatsAndBarsContextValue {
  bpm: number;
  timeSignature: [number, number];
  snapTo: SnapTo;
  ticksPerBeat: number;
  ticksPerBar: number;
}

export interface BeatsAndBarsProviderProps {
  bpm: number;
  timeSignature: [number, number];
  snapTo: SnapTo;
  children: React.ReactNode;
}

const BeatsAndBarsContext = createContext<BeatsAndBarsContextValue | null>(null);

export function BeatsAndBarsProvider({
  bpm,
  timeSignature,
  snapTo,
  children,
}: BeatsAndBarsProviderProps) {
  const value = useMemo<BeatsAndBarsContextValue>(() => {
    const tpBeat = ticksPerBeat(timeSignature);
    const tpBar = ticksPerBar(timeSignature);
    return {
      bpm,
      timeSignature,
      snapTo,
      ticksPerBeat: tpBeat,
      ticksPerBar: tpBar,
    };
  }, [bpm, timeSignature[0], timeSignature[1], snapTo]);

  return (
    <BeatsAndBarsContext.Provider value={value}>
      {children}
    </BeatsAndBarsContext.Provider>
  );
}

/**
 * Returns beats & bars context or null if no provider is in the tree.
 * SmartScale uses this to decide between temporal and beats & bars mode.
 */
export function useBeatsAndBars(): BeatsAndBarsContextValue | null {
  return useContext(BeatsAndBarsContext);
}
```

**Step 2: Add exports to `packages/ui-components/src/contexts/index.tsx`**

Add these imports/exports. Add the import at the top alongside existing imports:

```typescript
import { BeatsAndBarsProvider, useBeatsAndBars } from './BeatsAndBars';
```

Add to the `export type` section:
```typescript
export type { BeatsAndBarsContextValue, BeatsAndBarsProviderProps, SnapTo } from './BeatsAndBars';
```

Add to the named exports:
```typescript
BeatsAndBarsProvider,
useBeatsAndBars,
```

**Step 3: Add re-exports to `packages/ui-components/src/index.tsx`**

The contexts barrel already re-exports everything from `./contexts`. Verify the types are accessible. No changes needed to `src/index.tsx` if the contexts barrel export covers it.

Check by reading the file — it has `export * from './contexts';` which will pick up the new exports.

**Step 4: Build to verify types**

Run: `pnpm --filter @waveform-playlist/core build && pnpm --filter @waveform-playlist/ui-components build`
Expected: Builds succeed (typecheck passes)

**Step 5: Commit**

```bash
git add packages/ui-components/src/contexts/BeatsAndBars.tsx packages/ui-components/src/contexts/index.tsx
git commit -m "feat(ui-components): add BeatsAndBarsProvider context"
```

---

### Task 5: SmartScale beats & bars rendering

**Files:**
- Modify: `packages/ui-components/src/components/SmartScale.tsx`

This is the key rendering change. When `useBeatsAndBars()` returns a value, SmartScale computes beat/bar tick positions and passes them to `TimeScale` using the same `marker`/`bigStep`/`secondStep` interface — but with values derived from PPQN math instead of the millisecond lookup table.

**Step 1: Update SmartScale to support beats & bars mode**

The current SmartScale (`packages/ui-components/src/components/SmartScale.tsx`) needs these changes:

1. Import `useBeatsAndBars` and PPQN math functions
2. Add a beats & bars code path that computes `marker`/`bigStep`/`secondStep` in milliseconds from BPM/time signature
3. Pass a custom `renderTimestamp` to TimeScale that shows bar.beat labels instead of mm:ss

The key insight: `TimeScale` already works in milliseconds for its iteration. We need to convert bar/beat durations to milliseconds so the existing tick-drawing loop works unchanged.

```typescript
import React, { FunctionComponent, useCallback, useContext, type ReactNode } from 'react';
import { PlaylistInfoContext } from '../contexts/PlaylistInfo';
import { useBeatsAndBars } from '../contexts/BeatsAndBars';
import { StyledTimeScale } from './TimeScale';
import { PPQN, ticksToBarBeatLabel } from '@waveform-playlist/core';

export interface SmartScaleProps {
  readonly renderTimestamp?: (timeMs: number, pixelPosition: number) => ReactNode;
}

const timeinfo = new Map([
  [700, { marker: 1000, bigStep: 500, smallStep: 100 }],
  [1500, { marker: 2000, bigStep: 1000, smallStep: 200 }],
  [2500, { marker: 2000, bigStep: 1000, smallStep: 500 }],
  [5000, { marker: 5000, bigStep: 1000, smallStep: 500 }],
  [10000, { marker: 10000, bigStep: 5000, smallStep: 1000 }],
  [12000, { marker: 15000, bigStep: 5000, smallStep: 1000 }],
  [Infinity, { marker: 30000, bigStep: 10000, smallStep: 5000 }],
]);

function getScaleInfo(samplesPerPixel: number) {
  const keys = timeinfo.keys();
  let config;

  for (const resolution of keys) {
    if (samplesPerPixel < resolution) {
      config = timeinfo.get(resolution);
      break;
    }
  }

  if (config === undefined) {
    config = { marker: 30000, bigStep: 10000, smallStep: 5000 };
  }
  return config;
}

/**
 * Convert PPQN ticks to milliseconds at a given BPM.
 */
function ticksToMs(ticks: number, bpm: number): number {
  return (ticks * 60000) / (bpm * PPQN);
}

export const SmartScale: FunctionComponent<SmartScaleProps> = ({ renderTimestamp }) => {
  const { samplesPerPixel, duration } = useContext(PlaylistInfoContext);
  const beatsAndBars = useBeatsAndBars();

  if (beatsAndBars) {
    const { bpm, timeSignature, ticksPerBar: tpBar, ticksPerBeat: tpBeat } = beatsAndBars;

    // Convert beat/bar durations to milliseconds for TimeScale's iteration loop.
    // marker = bar (full-height tick + label)
    // bigStep = beat (medium tick)
    // secondStep = beat (iteration step size — must equal bigStep for correct counting)
    const barMs = ticksToMs(tpBar, bpm);
    const beatMs = ticksToMs(tpBeat, bpm);

    // Custom label renderer: convert timeMs back to ticks, generate bar.beat label
    const beatsRenderTimestamp = renderTimestamp ?? ((timeMs: number, pixelPosition: number) => {
      const ticks = Math.round((timeMs * bpm * PPQN) / 60000);
      const label = ticksToBarBeatLabel(ticks, timeSignature);
      return (
        <div
          key={`bb-${ticks}`}
          style={{
            position: 'absolute',
            left: `${pixelPosition + 4}px`,
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      );
    });

    return (
      <StyledTimeScale
        marker={barMs}
        bigStep={beatMs}
        secondStep={beatMs}
        duration={duration}
        renderTimestamp={beatsRenderTimestamp}
      />
    );
  }

  // Temporal mode (existing behavior)
  const config = getScaleInfo(samplesPerPixel);
  return (
    <StyledTimeScale
      marker={config.marker}
      bigStep={config.bigStep}
      secondStep={config.smallStep}
      duration={duration}
      renderTimestamp={renderTimestamp}
    />
  );
};
```

**Step 2: Build to verify types**

Run: `pnpm --filter @waveform-playlist/core build && pnpm --filter @waveform-playlist/ui-components build`
Expected: Build succeeds

**Step 3: Manual verification with dev server**

Run: `pnpm --filter website start`

At this point you can temporarily wrap an existing example with `<BeatsAndBarsProvider>` to see the timescale render bars and beats. Don't commit this test harness — the proper example comes in Task 7.

**Step 4: Commit**

```bash
git add packages/ui-components/src/components/SmartScale.tsx
git commit -m "feat(ui-components): SmartScale beats and bars rendering mode"
```

---

### Task 6: SnapToGridModifier

**Files:**
- Create: `packages/browser/src/modifiers/SnapToGridModifier.ts`
- Modify: `packages/browser/src/index.tsx` (add export)

**Step 1: Create the modifier**

Create `packages/browser/src/modifiers/SnapToGridModifier.ts`:

```typescript
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

interface SnapToGridOptions {
  snapTo: SnapTo;
  bpm: number;
  timeSignature: [number, number];
  samplesPerPixel: number;
  sampleRate: number;
}

/**
 * dnd-kit modifier that quantizes clip drag movement to the nearest beat or bar.
 *
 * Operates in PPQN tick space for exact musical timing, then converts back
 * to pixel deltas. Designed to compose with ClipCollisionModifier — snap first,
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

    const { snapTo, bpm, timeSignature, samplesPerPixel, sampleRate } = this.options;

    if (snapTo === 'off') return transform;

    const gridTicks =
      snapTo === 'bar' ? ticksPerBar(timeSignature) : ticksPerBeat(timeSignature);

    // Convert pixel delta to ticks, quantize, convert back to pixels
    const deltaSamples = transform.x * samplesPerPixel;
    const deltaTicks = samplesToTicks(deltaSamples, bpm, sampleRate);
    const snappedTicks = snapToGrid(deltaTicks, gridTicks);
    const snappedSamples = ticksToSamples(snappedTicks, bpm, sampleRate);

    return { x: snappedSamples / samplesPerPixel, y: 0 };
  }

  static configure = configurator(SnapToGridModifier);
}
```

**Step 2: Add export to `packages/browser/src/index.tsx`**

Find the section near line 143 that exports `ClipCollisionModifier`. Add alongside it:

```typescript
export { SnapToGridModifier } from './modifiers/SnapToGridModifier';
```

**Step 3: Build to verify types**

Run: `pnpm build`
Expected: All packages build successfully

**Step 4: Commit**

```bash
git add packages/browser/src/modifiers/SnapToGridModifier.ts packages/browser/src/index.tsx
git commit -m "feat(browser): add SnapToGridModifier for beat/bar snap"
```

---

### Task 7: Website example

**Files:**
- Create: `website/src/components/examples/BeatsAndBarsExample.tsx`
- Create: `website/src/pages/examples/beats-and-bars.tsx`

This example demonstrates the full feature: beats & bars timescale + snap-to-grid dragging with controls for BPM, time signature, and snap granularity.

**Step 1: Create the example component**

Create `website/src/components/examples/BeatsAndBarsExample.tsx`.

Model it after `MultiClipExample.tsx` — same structure but wrapped in `BeatsAndBarsProvider`, with additional controls for BPM, time signature, and snap. Key differences:

- Import `BeatsAndBarsProvider` from `@waveform-playlist/ui-components`
- Import `SnapToGridModifier` from `@waveform-playlist/browser`
- Add state for `bpm`, `timeSignature`, `snapTo`
- Wrap content in `<BeatsAndBarsProvider>`
- Add `SnapToGridModifier.configure(...)` to modifiers array (before `ClipCollisionModifier`)
- Add UI controls: BPM number input, time signature select, snap granularity select

```typescript
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { DragDropProvider } from '@dnd-kit/react';
import { RestrictToHorizontalAxis } from '@dnd-kit/abstract/modifiers';
import { getGlobalAudioContext } from '@waveform-playlist/playout';
import { createTrack, createClipFromSeconds, type ClipTrack } from '@waveform-playlist/core';
import {
  WaveformPlaylistProvider,
  usePlaylistData,
  usePlaylistControls,
  useClipDragHandlers,
  useDragSensors,
  ClipCollisionModifier,
  SnapToGridModifier,
  noDropAnimationPlugins,
  usePlaybackShortcuts,
  Waveform,
  PlayButton,
  PauseButton,
  StopButton,
  ZoomInButton,
  ZoomOutButton,
  AudioPosition,
} from '@waveform-playlist/browser';
import { BeatsAndBarsProvider, type SnapTo } from '@waveform-playlist/ui-components';
import { useDocusaurusTheme } from '../../hooks/useDocusaurusTheme';

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
`;

const ControlGroup = styled.div`
  display: flex;
  gap: 5px;
  align-items: center;
`;

const Label = styled.label`
  font-size: 0.85rem;
  font-weight: 600;
`;

function createInitialTracks(): ClipTrack[] {
  const sampleRate = 48000;
  return [
    createTrack({
      name: 'Track 1',
      clips: [
        createClipFromSeconds({
          src: '/media/audio/Vocals30.mp3',
          startTime: 0,
          sampleRate,
        }),
      ],
    }),
    createTrack({
      name: 'Track 2',
      clips: [
        createClipFromSeconds({
          src: '/media/audio/BassDrums30.mp3',
          startTime: 0,
          sampleRate,
        }),
      ],
    }),
  ];
}

function BeatsAndBarsPlaylist({
  bpm,
  timeSignature,
  snapTo,
}: {
  bpm: number;
  timeSignature: [number, number];
  snapTo: SnapTo;
}) {
  const { tracks, sampleRate, samplesPerPixel } = usePlaylistData();
  const { setTracks } = usePlaylistControls();
  const sensors = useDragSensors();
  const { onDragStart, onDragMove, onDragEnd } = useClipDragHandlers({
    tracks,
    onTracksChange: setTracks,
  });
  usePlaybackShortcuts();

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      modifiers={[
        RestrictToHorizontalAxis,
        SnapToGridModifier.configure({
          snapTo,
          bpm,
          timeSignature,
          samplesPerPixel,
          sampleRate,
        }),
        ClipCollisionModifier.configure({ tracks, samplesPerPixel }),
      ]}
      plugins={noDropAnimationPlugins}
    >
      <Waveform timescale interactiveClips />
    </DragDropProvider>
  );
}

export function BeatsAndBarsExample() {
  const [tracks] = useState(createInitialTracks);
  const theme = useDocusaurusTheme();
  const [bpm, setBpm] = useState(120);
  const [timeSignature, setTimeSignature] = useState<[number, number]>([4, 4]);
  const [snapTo, setSnapTo] = useState<SnapTo>('beat');

  const ac = getGlobalAudioContext();

  return (
    <div>
      <Controls>
        <ControlGroup>
          <PlayButton />
          <PauseButton />
          <StopButton />
        </ControlGroup>
        <ControlGroup>
          <ZoomInButton />
          <ZoomOutButton />
        </ControlGroup>
        <ControlGroup>
          <AudioPosition />
        </ControlGroup>
        <ControlGroup>
          <Label>BPM:</Label>
          <input
            type="number"
            min={20}
            max={300}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            style={{ width: '60px' }}
          />
        </ControlGroup>
        <ControlGroup>
          <Label>Time Sig:</Label>
          <select
            value={`${timeSignature[0]}/${timeSignature[1]}`}
            onChange={(e) => {
              const [num, den] = e.target.value.split('/').map(Number);
              setTimeSignature([num, den]);
            }}
          >
            <option value="4/4">4/4</option>
            <option value="3/4">3/4</option>
            <option value="6/8">6/8</option>
            <option value="2/2">2/2</option>
            <option value="5/4">5/4</option>
            <option value="7/8">7/8</option>
          </select>
        </ControlGroup>
        <ControlGroup>
          <Label>Snap:</Label>
          <select
            value={snapTo}
            onChange={(e) => setSnapTo(e.target.value as SnapTo)}
          >
            <option value="bar">Bar</option>
            <option value="beat">Beat</option>
            <option value="off">Off</option>
          </select>
        </ControlGroup>
      </Controls>

      <WaveformPlaylistProvider
        tracks={tracks}
        audioContext={ac}
        sampleRate={ac.sampleRate}
        theme={theme}
      >
        <BeatsAndBarsProvider bpm={bpm} timeSignature={timeSignature} snapTo={snapTo}>
          <BeatsAndBarsPlaylist bpm={bpm} timeSignature={timeSignature} snapTo={snapTo} />
        </BeatsAndBarsProvider>
      </WaveformPlaylistProvider>
    </div>
  );
}
```

**Step 2: Create the example page**

Create `website/src/pages/examples/beats-and-bars.tsx`:

```typescript
import React from 'react';
import Layout from '@theme/Layout';
import { createLazyExample } from '../../components/BrowserOnlyWrapper';

const LazyExample = createLazyExample(() =>
  import('../../components/examples/BeatsAndBarsExample').then((m) => ({
    default: m.BeatsAndBarsExample,
  }))
);

export default function BeatsAndBarsPage() {
  return (
    <Layout title="Beats & Bars Example" description="Beats and bars timescale with snap-to-grid">
      <div style={{ padding: '2rem' }}>
        <h1>Beats & Bars</h1>
        <p>
          Timescale displays bar and beat markers based on BPM and time signature.
          Clips snap to the selected grid resolution when dragged.
        </p>
        <LazyExample />
      </div>
    </Layout>
  );
}
```

**Step 3: Verify with dev server**

Run: `pnpm --filter website start`

Navigate to `http://localhost:3000/examples/beats-and-bars`. Verify:
- Timescale shows bar numbers (1, 2, 3...) with beat ticks between them
- Changing BPM updates the timescale spacing
- Changing time signature updates the number of beats per bar
- Dragging a clip with "Beat" snap snaps to beat boundaries
- Dragging with "Off" snap moves freely (existing behavior)

**Step 4: Verify website builds**

Run: `pnpm --filter website build`
Expected: Build succeeds (CSS calc warnings are pre-existing, harmless)

**Step 5: Commit**

```bash
git add website/src/components/examples/BeatsAndBarsExample.tsx website/src/pages/examples/beats-and-bars.tsx
git commit -m "feat(website): add beats and bars example page"
```

---

### Task 8: Lint and final verification

**Step 1: Run lint**

Run: `pnpm lint`
Expected: No new errors. Fix any formatting issues with `pnpm format`.

**Step 2: Run all core tests**

Run: `cd packages/core && npx vitest run`
Expected: All tests pass

**Step 3: Full build**

Run: `pnpm build`
Expected: All packages build successfully

**Step 4: Fix any issues, commit if needed**

```bash
git add -A
git commit -m "chore: lint fixes"
```

---

## Task Dependency Graph

```
Task 1 (branch)
  └── Task 2 (tests) → Task 3 (implementation)
        └── Task 4 (context)
              └── Task 5 (SmartScale)
              └── Task 6 (SnapToGridModifier)
                    └── Task 7 (website example)
                          └── Task 8 (lint + verify)
```

Tasks 5 and 6 are independent of each other (both depend on Task 4) and can be done in parallel.
