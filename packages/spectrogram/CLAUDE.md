# Spectrogram Package (`@waveform-playlist/spectrogram`)

## Integration Context Pattern

**Pattern:** Browser package defines an interface + context, this package provides implementation via a Provider component. Same pattern as `@waveform-playlist/annotations`.

**Flow:** Browser defines `SpectrogramIntegrationContext` → this package creates `SpectrogramProvider` that supplies components/functions → browser components use `useSpectrogramIntegration()` and gracefully return `null` if unavailable.

**Throwing Context Hooks (Kent C. Dodds Pattern):**
`useSpectrogramIntegration()` throws if used without the provider. This follows the [Kent C. Dodds context pattern](https://kentcdodds.com/blog/how-to-use-react-context-effectively) — fail fast with a clear error instead of silently rendering nothing.

```typescript
// Components that need spectrograms — throws if <SpectrogramProvider> missing
const integration = useSpectrogramIntegration();

// Internal components that render with or without spectrograms
// use useContext(SpectrogramIntegrationContext) directly to get null when absent
const spectrogram = useContext(SpectrogramIntegrationContext);
```

**Location:** `packages/browser/src/SpectrogramIntegrationContext.tsx`

## SpectrogramChannel Index vs ChannelIndex

**`SpectrogramChannel`** has two index concerns: `index` (CSS positioning via Wrapper `top` offset) and `channelIndex` (canvas ID construction for worker registration, e.g. `clipId-ch{channelIndex}-chunk0`). In "both" mode, `SmartChannel` passes `index={props.index * 2}` for layout interleaving but `channelIndex={props.index}` for correct canvas identity. When `channelIndex` is omitted it defaults to `index`. Never use the visual `index` for canvas IDs — the worker and SpectrogramProvider registry expect sequential audio channel indices (0, 1).

## Worker Pool Architecture

**Decision:** `createSpectrogramWorkerPool` creates N workers (default 2) for parallel per-channel FFT.

**How it works:** Each worker computes a single channel via `channelFilter` param. Pool routes canvases by channel parsed from canvas ID (`clipId-ch0-chunk5` → worker 0). `renderChunks({channelIndex: N})` remaps to `channelIndex: 0` at the target worker since each worker stores its channel at index 0. Audio data registered in ALL workers (needed for mono mode).

**Mono mode:** Only worker 0 runs (no channelFilter), averages all channels as before.

**Location:** `src/worker/createSpectrogramWorkerPool.ts`

## Generation-Based Abort

**Problem:** During scrolling, stale FFT requests (~1.4s each) block the worker queue, delaying visible-range FFT for the new scroll position.

**Fix:** Cooperative abort via `setTimeout(0)` yielding every 2000 FFT frames. Main thread sends `abort-generation` messages; worker checks `latestGeneration` between yields and returns `null` if stale. Provider catches `Error('aborted')` silently.

**Key fields:** `generation` on `ComputeFFTRequest`/`RenderChunksRequest`, `AbortGenerationMessage`, `latestGeneration` in worker.

## Lazy Per-Batch FFT (OOM Prevention)

**Decision:** Never compute a full-clip FFT. Compute FFT per rendering batch (visible range, then contiguous background groups).

**Why:** Full-clip FFT on 1hr+ files allocates ~2.5GB (310K frames × 2048 bins × 4 bytes). Per-batch FFT bounds memory to the chunk range being rendered.

**Implementation:** `computeFFTForChunks()` computes sample range from chunk positions, padded by windowSize. Worker LRU cache (16 entries) prevents recomputation on scroll-back.

## Overscan Buffer (1.5x Viewport)

**Critical:** `getVisibleChunkRange` in SpectrogramProvider MUST use the same 1.5× viewport-width buffer as `useVisibleChunkIndices` in ScrollViewport.tsx. Without this, canvases mounted in the buffer zone (by the virtualizer) remain black — they're classified as "remaining" and get aborted during scrolling before background batches render them.

## Controls Outside Scroll Container

**Gotcha:** `scrollContainerRef` coordinates do NOT include `controlWidth`. Controls render in a fixed `ControlsColumn` outside the scroll area. Never add `controlWidth` to chunk pixel positions in `getVisibleChunkRange` or viewport calculations.
