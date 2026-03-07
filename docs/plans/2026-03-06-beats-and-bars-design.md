# Beats & Bars Timescale with Snap-to-Grid

**Date:** 2026-03-06
**Status:** Approved
**Related:** [GitHub Issue #226](https://github.com/naomiaro/waveform-playlist/issues/226)

## Summary

Add a beats & bars timescale mode to waveform-playlist. A `BeatsAndBarsProvider` context provides BPM, time signature, and snap configuration to both the `SmartScale` renderer (for visual tick marks) and a new dnd-kit `SnapToGridModifier` (for quantized clip dragging). Internal math uses PPQN (192 pulses per quarter note, matching Tone.js) for exact integer subdivision arithmetic.

## Scope

**First pass — single BPM, single time signature, no tempo automation.**

### In Scope

- `BeatsAndBarsProvider` context with `bpm`, `timeSignature`, `snapTo` props
- Beats & bars timescale rendering via existing `TimeScale` canvas+DOM pipeline
- Bar/beat labels (e.g., `1`, `1.2`, `1.3`, `1.4`, `2`, ...)
- PPQN-based beat grid math in `@waveform-playlist/core`
- `SnapToGridModifier` for dnd-kit that quantizes clip drag to grid
- Snap granularity: `"bar"`, `"beat"`, `"off"`
- Website example demonstrating the feature

### Out of Scope

- Tempo automation / tempo maps (multiple BPMs)
- Time signature changes mid-timeline
- Sub-beat snap granularities (1/8, 1/16, triplets) — future addition
- Metronome / click track
- MIDI-aware features

## Architecture

### Beat Grid Math (PPQN)

All musical timing uses PPQN ticks as the internal unit. Tone.js uses PPQN = 192.

```
PPQN ticks (integer) --> samples (integer) --> pixels
```

**Conversion chain:**

```typescript
const PPQN = 192;

// ticks -> seconds -> samples
ticksToSamples(ticks, bpm, sampleRate) =
  Math.round(ticks * (60 / bpm / PPQN) * sampleRate)

// samples -> ticks (for snap quantization)
samplesToTicks(samples, bpm, sampleRate) =
  Math.round(samples * PPQN * bpm / (60 * sampleRate))
```

**Grid sizes (always exact integers in tick space):**

```typescript
// Beat duration in ticks — depends on time signature denominator
ticksPerBeat(timeSignature: [number, number]) =
  PPQN * (4 / denominator)
  // [4,4] -> 192 ticks/beat
  // [3,8] -> 96 ticks/beat (eighth-note beat)
  // [6,8] -> 96 ticks/beat

// Bar duration in ticks
ticksPerBar(timeSignature: [number, number]) =
  numerator * ticksPerBeat(timeSignature)
  // [4,4] -> 768 ticks/bar
  // [3,4] -> 576 ticks/bar
  // [6,8] -> 576 ticks/bar
```

**Snap quantization (in tick space, then convert to samples):**

```typescript
snapToGrid(ticks, gridSizeTicks) =
  Math.round(ticks / gridSizeTicks) * gridSizeTicks
```

| `snapTo` | Grid size (ticks) | [4,4] example |
|----------|-------------------|---------------|
| `"bar"`  | `ticksPerBar()`   | 768           |
| `"beat"` | `ticksPerBeat()`  | 192           |
| `"off"`  | n/a               | free drag     |

**Label generation:**

```typescript
ticksToBarBeat(ticks, timeSignature) -> string
  // 0 -> "1"  (bar 1, beat 1 — shown as just bar number)
  // 192 -> "1.2"  (bar 1, beat 2)
  // 768 -> "2"  (bar 2, beat 1)
```

### Component Architecture

```
BeatsAndBarsProvider (context: bpm, timeSignature, snapTo, derived helpers)
  |
  +-- SmartScale
  |     |-- (no provider in tree) -> temporal scale (existing behavior)
  |     |-- (provider in tree) -> beats & bars scale
  |           |-- Computes tick positions for bars, beats, subdivisions
  |           |-- Passes to TimeScale as marker/bigStep/secondStep equivalent
  |
  +-- SnapToGridModifier (reads context via .configure())
        |-- Quantizes drag delta to nearest grid line in tick space
        |-- Converts back to pixel delta
        |-- Composes with ClipCollisionModifier
```

### Context Design

```typescript
// Provider props
interface BeatsAndBarsProps {
  bpm: number;                        // e.g., 120
  timeSignature: [number, number];    // e.g., [4, 4]
  snapTo: 'bar' | 'beat' | 'off';    // snap granularity
  children: React.ReactNode;
}

// Context value (memoized)
interface BeatsAndBarsContextValue {
  bpm: number;
  timeSignature: [number, number];
  snapTo: 'bar' | 'beat' | 'off';
  ticksPerBeat: number;    // derived
  ticksPerBar: number;     // derived
}
```

**Hook:** `useBeatsAndBars()` — returns context value or `null` if no provider (temporal mode).

### SmartScale Changes

`SmartScale` checks for `BeatsAndBarsProvider` via `useBeatsAndBars()`:

- **`null` (no provider):** Current behavior — selects from `timeinfo` map based on `samplesPerPixel`.
- **Non-null:** Computes beat/bar tick positions using PPQN math, generates markers/ticks for `TimeScale`:
  - Full-height ticks at bar boundaries, labeled with bar number
  - Medium ticks at beat boundaries, labeled `bar.beat`
  - Small ticks at subdivisions (zoom-dependent density, similar to current smart zoom logic)

The `TimeScale` component itself is **unchanged** — it receives tick data and renders them.

### SnapToGridModifier

New dnd-kit `Modifier` in `packages/browser`:

```typescript
class SnapToGridModifier extends Modifier<DragDropManager, SnapToGridOptions> {
  apply(operation: DragOperation): { x: number; y: number } {
    const { snapTo, bpm, timeSignature, samplesPerPixel, sampleRate } = this.options;

    if (snapTo === 'off') {
      return operation.transform; // pass through
    }

    const gridTicks = snapTo === 'bar'
      ? ticksPerBar(timeSignature)
      : ticksPerBeat(timeSignature);

    // Convert pixel delta to ticks, quantize, convert back
    const deltaSamples = operation.transform.x * samplesPerPixel;
    const deltaTicks = samplesToTicks(deltaSamples, bpm, sampleRate);
    const snappedTicks = snapToGrid(deltaTicks, gridTicks);
    const snappedSamples = ticksToSamples(snappedTicks, bpm, sampleRate);

    return { x: snappedSamples / samplesPerPixel, y: 0 };
  }
}
```

**Modifier ordering in DragDropProvider:**
```tsx
modifiers={[
  RestrictToHorizontalAxis,
  SnapToGridModifier.configure({ ... }),
  ClipCollisionModifier.configure({ ... }),
]}
```

Snap first, then collision constrains the snapped position.

### File Locations

| File | Package | Purpose |
|------|---------|---------|
| `src/utils/beatsAndBars.ts` | `core` | Pure math: PPQN, ticksPerBeat, snapToGrid, labels |
| `src/utils/beatsAndBars.test.ts` | `core` | Unit tests for beat grid math |
| `src/contexts/BeatsAndBarsContext.tsx` | `ui-components` | Provider, context, `useBeatsAndBars` hook |
| `src/components/SmartScale.tsx` | `ui-components` | Add beats & bars branch (modify existing) |
| `src/modifiers/SnapToGridModifier.ts` | `browser` | dnd-kit snap modifier |
| Example page + component | `website` | Demo with BPM/time sig/snap controls |

### Testing Strategy

- **Unit tests** (`core`): PPQN conversions, tick quantization, label generation, edge cases (odd time signatures like [7,8])
- **Unit tests** (`ui-components`): SmartScale renders correct tick data for beats & bars mode
- **Integration** (`browser`): SnapToGridModifier quantizes correctly, composes with collision modifier
- **E2E** (`website`): Drag clip, verify it snaps to grid position

## Decisions

1. **PPQN = 192** — Matches Tone.js, standard MIDI resolution, exact integer divisions for common subdivisions
2. **Context-based** — Provider shares beat grid data between scale renderer and snap modifier
3. **SmartScale dispatches** — No provider = temporal (existing), provider present = beats & bars
4. **Same TimeScale renderer** — No changes to the canvas+DOM rendering pipeline
5. **Snap in tick space** — Quantize in PPQN ticks for rhythmic accuracy, convert to samples at the boundary
6. **Labels use 1-indexed** bar.beat notation (DAW convention)
