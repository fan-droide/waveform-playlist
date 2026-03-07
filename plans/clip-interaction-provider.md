# ClipInteractionProvider Design Spec

## Problem

Every example with interactive clips repeats ~120 lines of identical boilerplate:
`DragDropProvider`, `useDragSensors`, `useClipDragHandlers`, `RestrictToHorizontalAxis`,
`ClipCollisionModifier`, `noDropAnimationPlugins`, track auto-selection on drag start,
and conditional `SnapToGridModifier` / `snapSamplePosition` wiring.

7 examples duplicate this setup. The only real differences are touch sensor config and
snap mode.

## Solution

A new `ClipInteractionProvider` component in `@waveform-playlist/browser` that
encapsulates all clip drag/move/trim/snap/collision setup behind a declarative API.

## Consumer API

### Simple (no snap)

```tsx
<WaveformPlaylistProvider tracks={tracks} onTracksChange={setTracks} timescale>
  <ClipInteractionProvider snapMode="off">
    <Waveform showClipHeaders />
  </ClipInteractionProvider>
</WaveformPlaylistProvider>
```

### Beats & bars snap

```tsx
<WaveformPlaylistProvider tracks={tracks} onTracksChange={setTracks} timescale>
  <BeatsAndBarsProvider bpm={120} timeSignature={[4, 4]} snapTo="beat" scaleMode="beats">
    <ClipInteractionProvider snapMode="beats">
      <Waveform showClipHeaders />
    </ClipInteractionProvider>
  </BeatsAndBarsProvider>
</WaveformPlaylistProvider>
```

### Temporal snap

```tsx
<WaveformPlaylistProvider tracks={tracks} onTracksChange={setTracks} timescale>
  <ClipInteractionProvider snapMode="temporal">
    <Waveform showClipHeaders />
  </ClipInteractionProvider>
</WaveformPlaylistProvider>
```

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `snapMode` | `'beats' \| 'temporal' \| 'off'` | Yes | — | Snap behavior for clip moves and boundary trims |
| `touchOptimized` | `boolean` | No | `false` | Use 250ms delay for touch sensors (mobile) |
| `children` | `ReactNode` | Yes | — | Must include `<Waveform>` |

## Snap Mode Behavior

| `snapMode` | `BeatsAndBarsProvider` present? | Result |
|---|---|---|
| `'beats'` | Yes | Snap to beats/bars grid from context |
| `'beats'` | No | **Throw:** `ClipInteractionProvider: snapMode="beats" requires a BeatsAndBarsProvider ancestor.` |
| `'temporal'` | Either | Snap to temporal grid derived from `samplesPerPixel` via `getScaleInfo()` |
| `'off'` | Either | No snap |

The throw on missing provider follows the Kent Dodds context pattern — fail fast
with a clear message when the consumer's explicit intent can't be fulfilled.

## Internal Wiring

`ClipInteractionProvider` handles all of the following internally:

1. **Sensors** — `useDragSensors({ touchOptimized })`.

2. **Drag handlers** — `useClipDragHandlers()` with `tracks`, `onTracksChange`,
   `samplesPerPixel`, `sampleRate`, `playoutRef`, `isDraggingRef` read from context hooks.

3. **Snap modifier** (move snapping):
   - `snapMode="beats"` — `SnapToGridModifier.configure({ mode: 'beats', ... })` with
     values from `useBeatsAndBars()` context.
   - `snapMode="temporal"` — `SnapToGridModifier.configure({ mode: 'temporal', gridSamples: ... })`
     derived from `getScaleInfo(samplesPerPixel).smallStep`.
   - `snapMode="off"` — no snap modifier.

4. **Snap sample position** (boundary trim snapping):
   - `snapMode="beats"` — `snapSamplePosition` callback using PPQN tick math from context.
   - `snapMode="temporal"` — `snapSamplePosition` callback using `getScaleInfo()` grid.
   - `snapMode="off"` — `undefined` (no trim snapping).

5. **Collision modifier** — `ClipCollisionModifier.configure({ tracks, samplesPerPixel })`,
   always enabled.

6. **Axis restriction** — `RestrictToHorizontalAxis`, always enabled.

7. **Drop animation** — `noDropAnimationPlugins`, always enabled.

8. **Track selection on drag start** — Auto-selects the dragged clip's track via
   `setSelectedTrackId()`.

### Modifier order

```
[RestrictToHorizontalAxis, SnapToGridModifier?, ClipCollisionModifier]
```

Restrict axis first (efficient), snap second (if enabled), collision last (validates
snapped position).

## Required Changes

### `@waveform-playlist/browser`

1. **Expose `onTracksChange` from context** — Add to `usePlaylistData()` return value
   (or a dedicated hook). The provider already stores it in `onTracksChangeRef`; this
   makes it available to children without prop threading.

2. **New component: `ClipInteractionProvider`** — Location: `src/components/ClipInteractionProvider.tsx`.
   Exported from package index.

3. **Export `ClipInteractionProvider`** from `src/index.tsx`.

### No breaking changes

The manual `DragDropProvider` + hooks approach continues to work unchanged. `ClipInteractionProvider`
is purely additive.

## What Stays Manual

These are separate concerns, not encapsulated by `ClipInteractionProvider`:

- **Keyboard shortcuts** — `usePlaybackShortcuts()`, `useClipSplitting()`. Separate
  concern from drag interactions. Could become a `KeyboardShortcutsProvider` in the future.
- **Annotation drag** — `useAnnotationDragHandlers()`. Different interaction model.
- **Custom sensors/modifiers** — Power users who need custom behavior drop down to manual
  `DragDropProvider` setup.
- **Custom drag start behavior** — Beyond track auto-selection.

## Documentation

- New guide: **"Clip Interactions"** — `ClipInteractionProvider` as the recommended approach.
- Existing manual setup moves to **"Advanced: Custom Drag Setup"** section for power users.
- Update existing example docs to reference the simpler API.

## Migration Path

1. Ship `ClipInteractionProvider` alongside existing manual approach.
2. Migrate examples one-by-one (simplest first: MultiClip, then Mobile, then BeatsAndBars).
3. Keep one example using the manual approach as reference for the advanced docs.

## Example: Before and After

### Before (~120 lines in every example)

```tsx
const PlaylistWithDrag = ({ tracks, onTracksChange }) => {
  const { samplesPerPixel, sampleRate, playoutRef, isDraggingRef } = usePlaylistData();
  const { setSelectedTrackId } = usePlaylistControls();

  const snapSamplePosition = useMemo(() => { /* ... 15 lines ... */ }, [/* deps */]);
  const sensors = useDragSensors();
  const { onDragStart: handleDragStart, onDragMove, onDragEnd } = useClipDragHandlers({
    tracks, onTracksChange, samplesPerPixel, sampleRate,
    engineRef: playoutRef, isDraggingRef, snapSamplePosition,
  });
  const onDragStart = (event) => {
    /* track selection logic */
    handleDragStart(event);
  };

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      modifiers={[
        RestrictToHorizontalAxis,
        /* conditional snap modifier ~15 lines */
        ClipCollisionModifier.configure({ tracks, samplesPerPixel }),
      ]}
      plugins={noDropAnimationPlugins}
    >
      {/* controls */}
      <Waveform showClipHeaders interactiveClips />
    </DragDropProvider>
  );
};
```

### After (~3 lines)

```tsx
<ClipInteractionProvider snapMode="off">
  {/* controls */}
  <Waveform showClipHeaders />
</ClipInteractionProvider>
```

Note: `interactiveClips` prop on `<Waveform>` becomes unnecessary when inside
`ClipInteractionProvider` — the provider implies it. Implementation detail TBD:
either the provider sets it via context, or `Waveform` auto-detects the provider.
