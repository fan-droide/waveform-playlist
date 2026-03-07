# ClipInteractionProvider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Encapsulate all clip drag/move/trim/snap/collision setup into a declarative `ClipInteractionProvider` component, eliminating ~120 lines of boilerplate per example.

**Architecture:** New provider in `@waveform-playlist/browser` that internally creates `DragDropProvider` with pre-wired sensors, handlers, and modifiers. Reads snap config from `BeatsAndBarsProvider` context when `snapMode="beats"`. Exposes `onTracksChange` from playlist context so drag handlers can access it without prop threading. Auto-enables `interactiveClips` on `Waveform` via a small context.

**Tech Stack:** React context, @dnd-kit/react, existing hooks (`useClipDragHandlers`, `useDragSensors`), existing modifiers (`SnapToGridModifier`, `ClipCollisionModifier`)

---

### Task 1: Expose `onTracksChange` from PlaylistDataContextValue

**Files:**
- Modify: `packages/browser/src/WaveformPlaylistContext.tsx`

**Step 1: Add `onTracksChange` to the `PlaylistDataContextValue` interface**

In `PlaylistDataContextValue` (line ~184), add:

```typescript
  onTracksChange: ((tracks: ClipTrack[]) => void) | undefined;
```

**Step 2: Add `onTracksChange` to the data context `useMemo`**

In the `useMemo` that builds the data context value (line ~1370), add `onTracksChange` to the returned object. Read it from the existing `onTracksChangeRef`:

```typescript
onTracksChange: onTracksChangeRef.current,
```

Also add `onTracksChange` (the prop) to the `useMemo` dependency array.

**Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (all packages)

**Step 4: Commit**

```
feat(browser): expose onTracksChange from usePlaylistData
```

---

### Task 2: Create ClipInteractionContext for auto-enabling interactiveClips

**Files:**
- Create: `packages/browser/src/contexts/ClipInteractionContext.tsx`
- Modify: `packages/browser/src/components/Waveform.tsx`

**Step 1: Create the context**

A minimal context that signals "clip interactions are enabled":

```typescript
import { createContext, useContext } from 'react';

const ClipInteractionContext = createContext(false);

export const ClipInteractionContextProvider = ClipInteractionContext.Provider;

export function useClipInteractionEnabled(): boolean {
  return useContext(ClipInteractionContext);
}
```

**Step 2: Update `Waveform.tsx` to auto-detect**

In `Waveform.tsx`, import `useClipInteractionEnabled` and OR it with the prop:

```typescript
import { useClipInteractionEnabled } from '../contexts/ClipInteractionContext';

// Inside component, after destructuring props:
const clipInteractionEnabled = useClipInteractionEnabled();
const effectiveInteractiveClips = interactiveClips || clipInteractionEnabled;
```

Pass `effectiveInteractiveClips` to `PlaylistVisualization` instead of `interactiveClips`.

**Step 3: Verify typecheck and build**

Run: `pnpm typecheck && pnpm --filter website build`
Expected: PASS

**Step 4: Commit**

```
feat(browser): add ClipInteractionContext for auto-enabling interactive clips
```

---

### Task 3: Create ClipInteractionProvider component

**Files:**
- Create: `packages/browser/src/components/ClipInteractionProvider.tsx`
- Modify: `packages/browser/src/index.tsx`

**Step 1: Write the provider**

```typescript
import React, { useMemo } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import { RestrictToHorizontalAxis } from '@dnd-kit/abstract/modifiers';
import {
  samplesToTicks,
  ticksToSamples,
  snapToGrid,
  ticksPerBeat,
  ticksPerBar,
} from '@waveform-playlist/core';
import { useBeatsAndBars, getScaleInfo } from '@waveform-playlist/ui-components';

import { usePlaylistData, usePlaylistControls } from '../WaveformPlaylistContext';
import { useClipDragHandlers } from '../hooks/useClipDragHandlers';
import { useDragSensors } from '../hooks/useDragSensors';
import { ClipCollisionModifier } from '../modifiers/ClipCollisionModifier';
import { SnapToGridModifier } from '../modifiers/SnapToGridModifier';
import { noDropAnimationPlugins } from '../plugins/noDropAnimationPlugins';
import { ClipInteractionContextProvider } from '../contexts/ClipInteractionContext';

export type ClipInteractionSnapMode = 'beats' | 'temporal' | 'off';

export interface ClipInteractionProviderProps {
  snapMode: ClipInteractionSnapMode;
  touchOptimized?: boolean;
  children: React.ReactNode;
}

export const ClipInteractionProvider: React.FC<ClipInteractionProviderProps> = ({
  snapMode,
  touchOptimized = false,
  children,
}) => {
  const {
    tracks,
    samplesPerPixel,
    sampleRate,
    playoutRef,
    isDraggingRef,
    onTracksChange,
  } = usePlaylistData();
  const { setSelectedTrackId } = usePlaylistControls();
  const beatsAndBars = useBeatsAndBars();

  // Validate: snapMode="beats" requires BeatsAndBarsProvider
  if (snapMode === 'beats' && beatsAndBars == null) {
    throw new Error(
      'ClipInteractionProvider: snapMode="beats" requires a BeatsAndBarsProvider ancestor.'
    );
  }

  // Build snapSamplePosition for boundary trim snapping
  const snapSamplePosition = useMemo(() => {
    if (snapMode === 'beats' && beatsAndBars && beatsAndBars.snapTo !== 'off') {
      const { bpm, timeSignature, snapTo } = beatsAndBars;
      const gridTicks =
        snapTo === 'bar' ? ticksPerBar(timeSignature) : ticksPerBeat(timeSignature);
      return (samplePos: number) => {
        const ticks = samplesToTicks(samplePos, bpm, sampleRate);
        const snapped = snapToGrid(ticks, gridTicks);
        return ticksToSamples(snapped, bpm, sampleRate);
      };
    }
    if (snapMode === 'temporal') {
      const gridSamples = Math.round(
        (getScaleInfo(samplesPerPixel).smallStep / 1000) * sampleRate
      );
      return (samplePos: number) =>
        Math.round(samplePos / gridSamples) * gridSamples;
    }
    return undefined;
  }, [snapMode, beatsAndBars, sampleRate, samplesPerPixel]);

  // Sensors
  const sensors = useDragSensors({ touchOptimized });

  // Drag handlers
  const {
    onDragStart: handleDragStart,
    onDragMove,
    onDragEnd,
  } = useClipDragHandlers({
    tracks,
    onTracksChange: onTracksChange ?? (() => {}),
    samplesPerPixel,
    sampleRate,
    engineRef: playoutRef,
    isDraggingRef,
    snapSamplePosition,
  });

  // Wrap onDragStart to auto-select track
  const onDragStart = React.useCallback(
    (event: Parameters<typeof handleDragStart>[0]) => {
      const trackIndex = event.operation?.source?.data?.trackIndex as
        | number
        | undefined;
      if (trackIndex !== undefined && tracks[trackIndex]) {
        setSelectedTrackId(tracks[trackIndex].id);
      }
      handleDragStart(event);
    },
    [handleDragStart, tracks, setSelectedTrackId]
  );

  // Build modifiers array
  const modifiers = useMemo(() => {
    const mods: any[] = [RestrictToHorizontalAxis];

    if (snapMode === 'beats' && beatsAndBars && beatsAndBars.snapTo !== 'off') {
      mods.push(
        SnapToGridModifier.configure({
          mode: 'beats',
          snapTo: beatsAndBars.snapTo,
          bpm: beatsAndBars.bpm,
          timeSignature: beatsAndBars.timeSignature,
          samplesPerPixel,
          sampleRate,
        })
      );
    } else if (snapMode === 'temporal') {
      mods.push(
        SnapToGridModifier.configure({
          mode: 'temporal',
          gridSamples: Math.round(
            (getScaleInfo(samplesPerPixel).smallStep / 1000) * sampleRate
          ),
          samplesPerPixel,
        })
      );
    }

    mods.push(ClipCollisionModifier.configure({ tracks, samplesPerPixel }));
    return mods;
  }, [snapMode, beatsAndBars, tracks, samplesPerPixel, sampleRate]);

  return (
    <ClipInteractionContextProvider value={true}>
      <DragDropProvider
        sensors={sensors}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        modifiers={modifiers}
        plugins={noDropAnimationPlugins}
      >
        {children}
      </DragDropProvider>
    </ClipInteractionContextProvider>
  );
};
```

**Step 2: Export from package index**

In `packages/browser/src/index.tsx`, add:

```typescript
export { ClipInteractionProvider } from './components/ClipInteractionProvider';
export type { ClipInteractionProviderProps, ClipInteractionSnapMode } from './components/ClipInteractionProvider';
```

**Step 3: Build and typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```
feat(browser): add ClipInteractionProvider component
```

---

### Task 4: Migrate MultiClipExample to validate the API

**Files:**
- Modify: `website/src/components/examples/MultiClipExample.tsx`

**Step 1: Replace PlaylistWithDrag boilerplate**

Remove:
- The entire `PlaylistWithDrag` inner component (~75 lines)
- Imports: `DragDropProvider`, `RestrictToHorizontalAxis`, `useClipDragHandlers`, `useDragSensors`, `ClipCollisionModifier`, `noDropAnimationPlugins`

Replace with `ClipInteractionProvider` wrapping `Waveform`. The controls (PlayButton, etc.) go inside the provider as children.

Keep:
- `useClipSplitting` and `usePlaybackShortcuts` — these stay as separate hooks (need a small inner component for them since they require playlist context)

**Step 2: Verify website builds and example works**

Run: `pnpm --filter website build`
Expected: PASS

**Step 3: Commit**

```
refactor(website): migrate MultiClipExample to ClipInteractionProvider
```

---

### Task 5: Migrate MobileMultiClipExample

**Files:**
- Modify: `website/src/components/examples/MobileMultiClipExample.tsx`

**Step 1: Replace PlaylistWithDrag with ClipInteractionProvider**

Same pattern as Task 4, but with `touchOptimized`:

```tsx
<ClipInteractionProvider snapMode="off" touchOptimized>
```

**Step 2: Verify**

Run: `pnpm --filter website build`

**Step 3: Commit**

```
refactor(website): migrate MobileMultiClipExample to ClipInteractionProvider
```

---

### Task 6: Migrate BeatsAndBarsExample

**Files:**
- Modify: `website/src/components/examples/BeatsAndBarsExample.tsx`

**Step 1: Replace PlaylistWithDrag**

This is the most complex migration. The inner component currently:
- Builds `snapSamplePosition` manually (now handled by provider)
- Builds conditional `SnapToGridModifier` (now handled by provider)
- Has scale mode / BPM / time signature controls (keep as-is, just UI)

The `scaleMode` state maps to `snapMode`:
- `scaleMode === 'beats'` → `snapMode="beats"`
- `scaleMode === 'temporal'` with `temporalSnap` → `snapMode="temporal"`
- `scaleMode === 'temporal'` without `temporalSnap` → `snapMode="off"`

```tsx
const snapMode = scaleMode === 'beats'
  ? 'beats'
  : temporalSnap ? 'temporal' : 'off';

<ClipInteractionProvider snapMode={snapMode}>
```

**Step 2: Verify**

Run: `pnpm --filter website build`

**Step 3: Commit**

```
refactor(website): migrate BeatsAndBarsExample to ClipInteractionProvider
```

---

### Task 7: Migrate remaining examples

**Files:**
- Modify: `website/src/components/examples/FlexibleApiExample.tsx`
- Modify: `website/src/components/examples/RecordingExample.tsx`

**Step 1: Migrate FlexibleApiExample**

This example has custom Radix UI controls and custom playhead/timestamps, but the drag setup is standard. Replace `DragDropProvider` boilerplate with `ClipInteractionProvider snapMode="off"`.

**Step 2: Migrate RecordingExample**

Has `useIntegratedRecording` hook but standard drag setup. Replace with `ClipInteractionProvider snapMode="off"`.

**Step 3: Skip annotation examples**

`AnnotationsExample` and `MobileAnnotationsExample` use `useAnnotationDragHandlers` — a different interaction model. These keep manual `DragDropProvider` setup. They serve as the "Advanced: Custom Drag Setup" reference.

**Step 4: Verify all examples build**

Run: `pnpm --filter website build`

**Step 5: Commit**

```
refactor(website): migrate FlexibleApi and Recording examples to ClipInteractionProvider
```

---

### Task 8: Update documentation

**Files:**
- Modify: `website/docs/guides/beats-and-bars.md` (update snap-to-grid section)
- Modify: `website/docs/api/llm-reference.md` (add ClipInteractionProvider types)
- Modify: `website/static/llms.txt` (mention ClipInteractionProvider)

**Step 1: Update beats-and-bars guide**

Replace the manual `DragDropProvider` + `SnapToGridModifier` code example with the simpler `ClipInteractionProvider` version. Keep a note about manual setup for advanced use.

**Step 2: Update llm-reference.md**

Add `ClipInteractionProviderProps` and `ClipInteractionSnapMode` to the interfaces section.

**Step 3: Update llms.txt**

Add `ClipInteractionProvider` to the component listing.

**Step 4: Verify docs build**

Run: `pnpm --filter website build`

**Step 5: Commit**

```
docs: update guides and LLM docs for ClipInteractionProvider
```

---

### Task 9: Final lint, typecheck, and cleanup

**Step 1: Run full lint and typecheck**

Run: `pnpm lint && pnpm typecheck && pnpm build`

**Step 2: Fix any formatting issues**

Run: `pnpm format` if needed.

**Step 3: Verify website builds cleanly**

Run: `pnpm --filter website build`

**Step 4: Commit any fixes**

```
chore: lint and format cleanup
```
