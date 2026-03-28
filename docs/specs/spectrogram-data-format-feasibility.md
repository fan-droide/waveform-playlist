# Spectrogram Data Format: Feasibility Study

Pre-computed spectrogram data for instant rendering — analogous to waveform-data's `.dat` format for peaks.

## Problem

Spectrogram rendering is the most expensive computation in the DAW UI. Each FFT frame requires windowing (2048 multiplications), a real FFT transform, and magnitude-to-dB conversion. A 1-minute clip at default settings produces ~5,600 frames, each taking ~0.25ms — totaling ~1.4 seconds on a modern CPU. This blocks the first meaningful paint of spectrogram content.

Waveform peaks solve this with pre-computed `.dat` files (~88 KB for 1 minute) served alongside audio. Can we do the same for spectrograms?

## Current Architecture

### What Gets Computed

The FFT pipeline produces a `SpectrogramData` object:

```
SpectrogramData:
    fftSize:          4096        (2048 window × 2 zero-padding factor)
    frequencyBinCount: 2048       (fftSize / 2)
    hopSize:          512         (window / 4 — 75% overlap)
    frameCount:       5625        (for 1 minute at 48kHz)
    data:             Float32Array(5625 × 2048) = 46 MB
```

Each element in `data` is a dB value in the range [-160, 0], stored as Float32 (4 bytes).

### Computation Bottleneck Breakdown

| Step | % of Time | Description |
|------|-----------|-------------|
| Windowing | ~40% | Multiply each sample by Hann/Blackman window function |
| FFT | ~20% | Radix-4 real FFT via fft.js |
| Magnitude + dB | ~30% | `20 × log10(sqrt(re² + im²))` per bin |
| Overhead | ~10% | Memory allocation, yield points, cache management |

### Current Caching

- 16-entry LRU cache per worker thread (in-memory only)
- Cache key: clipId + channel + sample range + FFT config
- No persistence across page loads
- No server-side pre-computation

## Size Analysis

### Raw SpectrogramData (Float32)

| Duration | Frames | Bins | Float32 Size | Notes |
|----------|--------|------|-------------|-------|
| 10 sec | 937 | 2048 | 7.3 MB | Short clip |
| 1 min | 5,625 | 2048 | 43.9 MB | Typical stem |
| 5 min | 28,125 | 2048 | 219.7 MB | Long recording |
| 1 hour | 337,500 | 2048 | 2.6 GB | Full session |

### Compared to Waveform Peaks

| Duration | Peaks (.dat) | Spectrogram (raw) | Ratio |
|----------|-------------|-------------------|-------|
| 1 min | 88 KB | 43.9 MB | 500× |
| 5 min | 440 KB | 219.7 MB | 500× |

**Conclusion:** Raw Float32 spectrogram data cannot be served as `.dat` files. Compression is mandatory.

## Compression Strategies

### Strategy 1: Quantize dB Values (4× reduction)

The dB range is [-160, 0]. At display resolution, 0.63 dB per step (Uint8) is visually indistinguishable from Float32.

```
Encoding:  uint8 = clamp((dB + 160) / 160 × 255, 0, 255)
Decoding:  dB = value / 255 × 160 - 160
```

| Duration | Uint8 Size | vs Raw |
|----------|-----------|--------|
| 1 min | 11.0 MB | 4× smaller |
| 5 min | 54.9 MB | 4× smaller |

Still too large for HTTP serving. But a good foundation for further compression.

### Strategy 2: Reduce Frequency Resolution (2-4× reduction)

At typical zoom levels, the full 2048 frequency bins aren't needed. The display maps bins through a frequency scale (mel, log, etc.) that compresses high frequencies — most pixels represent averaged bins.

A "display-ready" format could store pre-mapped bins at display resolution:

| Frequency Bins | 1 min (Uint8) | Use Case |
|---------------|--------------|----------|
| 2048 (full) | 11.0 MB | Zoomed-in detail |
| 512 | 2.7 MB | Standard view |
| 256 | 1.4 MB | Overview/thumbnail |

**Multi-resolution approach:** Store 256-bin overview + 2048-bin detail. Load overview first for instant rendering, detail on demand.

### Strategy 3: Delta + DEFLATE Compression (5-20× reduction)

Adjacent spectrogram frames are highly correlated. Delta encoding (store difference from previous frame) produces small values centered around zero, which compress extremely well with standard algorithms.

```
Frame 0: [dB₀, dB₁, dB₂, ...]           (absolute values)
Frame 1: [Δ₀, Δ₁, Δ₂, ...]              (difference from frame 0)
Frame 2: [Δ₀, Δ₁, Δ₂, ...]              (difference from frame 1)
```

Estimated compression ratios (Uint8 + delta + gzip):

| Duration | Uncompressed (Uint8) | Delta + gzip | Ratio |
|----------|---------------------|-------------|-------|
| 1 min | 11.0 MB | ~0.5-1.5 MB | 7-22× |
| 5 min | 54.9 MB | ~2.5-8 MB | 7-22× |

The ratio depends on audio content — sustained tones compress better than transient-heavy material.

### Strategy 4: Tiled Serving (Map Tile Approach)

Instead of one monolithic file, serve spectrogram data as tiles indexed by time range and resolution:

```
/spectrograms/{clipId}/{resolution}/{timeStart}-{timeEnd}.sgdat
```

For example:
```
/spectrograms/kick/256/0-60.sgdat       (overview: 256 bins, 0-60s)
/spectrograms/kick/2048/10-20.sgdat     (detail: 2048 bins, 10-20s)
```

Advantages:
- Load only what's visible
- Cache individual tiles in browser/CDN
- Progressive loading (overview → detail)
- Parallel downloads

Disadvantages:
- Many small files (can mitigate with HTTP/2)
- Server-side tile generation pipeline needed
- Cache invalidation complexity

## Proposed Binary Format: `.sgdat`

A spectrogram equivalent of waveform-data's `.dat`:

### Header (32 bytes)

```
Offset  Type    Field
0       uint8   version (1)
1       uint8   encoding (0=float32, 1=uint8, 2=uint8-delta)
2       uint16  frequencyBinCount
4       uint16  fftSize
6       uint16  windowSize
8       uint16  hopSize
10      uint8   windowFunction (enum: 0=hann, 1=hamming, 2=blackman, ...)
11      uint8   zeroPaddingFactor
12      uint32  sampleRate
16      uint32  frameCount
20      float32 gainDb
24      float32 rangeDb
```

### Data Section

**Encoding 0 (Float32):** Raw dB values, row-major (frame × bin).
Size: `frameCount × frequencyBinCount × 4` bytes.

**Encoding 1 (Uint8):** Quantized dB values.
Size: `frameCount × frequencyBinCount` bytes.
Decode: `dB = value / 255 × rangeDb - rangeDb + gainDb`

**Encoding 2 (Uint8-Delta):** First frame absolute (Uint8), subsequent frames as signed int8 deltas from previous frame. Clamped to [-127, 127].
Size: `frameCount × frequencyBinCount` bytes.
Better compression ratio when gzipped.

### Multi-Resolution Extension

A single `.sgdat` can contain multiple resolution stages (like waveform-data's peak stages):

```
Header (32 bytes)
Stage 0 header: { frequencyBinCount: 256, frameCount: N/4, hopSize: 2048 }
Stage 0 data: overview (small)
Stage 1 header: { frequencyBinCount: 2048, frameCount: N, hopSize: 512 }
Stage 1 data: full detail (large)
```

The overview stage uses larger hop size (fewer frames) AND fewer frequency bins — doubly reduced.

## Size Projections for Practical Use

### Recommended Default: Uint8, 512 bins, gzipped

| Duration | Raw | Gzipped | Comparable to |
|----------|-----|---------|---------------|
| 10 sec | 234 KB | ~30-70 KB | A small JPEG |
| 1 min | 1.4 MB | ~150-400 KB | A medium PNG |
| 5 min | 6.9 MB | ~700 KB - 2 MB | A short video thumbnail |

This is small enough for HTTP serving alongside audio files.

### With Multi-Resolution (256-bin overview + 2048-bin detail on demand)

| Duration | Overview (gzipped) | Detail (gzipped) |
|----------|-------------------|-------------------|
| 1 min | ~80-200 KB | ~1-3 MB |
| 5 min | ~400 KB - 1 MB | ~5-15 MB |

Overview renders instantly. Detail loads progressively for zoomed-in views.

## Generation Pipeline

### Server-Side (Pre-Computation)

```
audiowaveform-style CLI tool:

$ sgdat generate input.wav -o output.sgdat \
    --fft-size 2048 \
    --hop-size 512 \
    --window hann \
    --encoding uint8-delta \
    --bins 512

or with multi-resolution:

$ sgdat generate input.wav -o output.sgdat \
    --stages 256:2048,2048:512 \
    --encoding uint8-delta
```

Could be a standalone npm package (`spectrogram-data`) or a CLI tool, analogous to [audiowaveform](https://github.com/bbc/audiowaveform) for peaks.

### Client-Side (Fallback)

When no `.sgdat` is available, fall back to the current web worker FFT pipeline — exactly how waveform-playlist falls back to worker-generated peaks when no `.dat` file is provided.

## Comparison with Waveform-Data

| Aspect | waveform-data (.dat) | spectrogram-data (.sgdat) |
|--------|---------------------|--------------------------|
| Data type | min/max peaks (1D) | dB magnitude grid (2D) |
| Raw size per minute | ~88 KB | ~44 MB |
| Compressed size per minute | ~88 KB (already small) | ~150-400 KB (Uint8 + gzip) |
| Multi-resolution | Peak stages (128, 256, 512...) | Bin count + hop size stages |
| Resample client-side | Yes (coarser only) | Yes (bin reduction, frame skip) |
| Generation time | ~100ms (peak scan) | ~1.4s (FFT per channel) |
| Server-side tool | audiowaveform (BBC) | New tool needed |
| Display params in format | No (just peaks) | No (gainDb/rangeDb applied at render) |

## Rendering from `.sgdat`

The existing rendering pipeline barely changes:

1. **Without `.sgdat`** (current): Audio → Worker FFT → SpectrogramData → render chunks
2. **With `.sgdat`**: Fetch `.sgdat` → decode header → SpectrogramData → render chunks

The `SpectrogramData` interface stays the same — the `.sgdat` is just a serialized version. The renderer doesn't know where the data came from.

For Uint8 encoding, the render path adds a lightweight decode step:
```
for each pixel column:
    bin = uint8Data[frame * binCount + freqBin]
    dB = bin / 255 * rangeDb - rangeDb + gainDb
    color = colorMap(dB)
```

This is negligible compared to the FFT cost it replaces.

## Tempo-Aware Spectrogram Rendering

When tempo varies across the timeline, the spectrogram renderer needs to map audio frames to tick-space pixels — the same challenge as waveform rendering.

### The Core Problem

The spectrogram grid is indexed by audio time: `frame_time = frame_index × hopSize / sampleRate`. The timeline grid is tick-linear (beats are evenly spaced). At a constant tempo, the mapping is proportional. At tempo changes, the same number of spectrogram frames maps to different pixel widths depending on the local tempo.

### The Rendering Approach

Iterate the clip's PPQN range in small steps (aligned to a tempo grid resolution, e.g., 80 ticks ≈ 10ms). For each step:

1. Get the local BPM: `bpm = tempoMap.getTempoAt(currentTick)`
2. Compute how many seconds this step spans: `stepSeconds = stepTicks × 60 / (PPQN × bpm)`
3. Convert to spectrogram frame range: `frameStart = audioTime × sampleRate / hopSize`, `frameEnd = (audioTime + stepSeconds) × sampleRate / hopSize`
4. Map tick range to pixel range (linear, same as grid): `x0 = tickToPixel(currentTick)`, `x1 = tickToPixel(nextTick)`
5. Render spectrogram frames `[frameStart, frameEnd]` into pixels `[x0, x1]`

At a tempo decrease, each tick-step spans more real time, so more spectrogram frames are packed into the same pixel width — the spectrogram appears "compressed." At a tempo increase, fewer frames per pixel — the spectrogram appears "stretched."

### For Pre-Computed `.sgdat` Data

The frame-to-pixel mapping works identically. The `.sgdat` file contains pre-computed dB values indexed by frame number. The renderer just looks up the frame range instead of computing FFT on the fly. The tempo integration happens at the rendering level, not the data level — so the same `.sgdat` file works regardless of tempo changes.

## Recommendation

### Phase 1: Binary Format + Client-Side Decode
- Define the `.sgdat` binary format (header + Uint8 data)
- Add a `loadSpectrogramData(url)` function alongside `loadWaveformData(url)`
- SpectrogramProvider checks for pre-computed data before falling back to worker FFT
- No server-side tooling yet — generate `.sgdat` files manually or via a Node script

### Phase 2: CLI Tool
- Standalone `spectrogram-data` npm package with a CLI
- `sgdat generate input.wav -o output.sgdat`
- Integrates with existing audiowaveform workflows

### Phase 3: Multi-Resolution + Tiling
- Overview stage for instant rendering
- Detail stage loaded on zoom
- Optional tile-based serving for very long files

### Phase 4: Display Config Separation
- Store computation-dependent data only (FFT params, dB values)
- Apply display params (gain, range, frequency scale, color map) at render time
- This means the same `.sgdat` works for any color scheme or frequency scale setting
