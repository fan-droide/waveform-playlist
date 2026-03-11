# TODO & Roadmap

Multi-track audio editor roadmap for waveform-playlist.

**Branch:** `main` | **Last Updated:** 2026-03-07

---

## 🎯 TODO

### Testing & CI

- [ ] **CI/CD pipeline** - Automated builds, tests, publishing

### Playback UX

- [ ] **Eager AudioContext resume** — Resume AudioContext on first user interaction (click/keydown) within playlist, before play is pressed. Eliminates ~200-500ms delay on first space bar press. Use `resumeGlobalAudioContext()` (raw context resume), NOT `Tone.start()` which adds ~2s latency on Safari if called redundantly.

### VU Meter Improvements

- [ ] **IEC-60268 piecewise linear scale** — Current `SegmentedVUMeter` maps dB to segments linearly, so -50 dB to -25 dB gets the same pixel space as -6 dB to 0 dB. IEC-60268 uses a piecewise linear scale that allocates disproportionately more space to quiet signals:
  - 50% of the meter width for the quietest 1/3 of the dB range
  - 20% for the next 1/6
  - 15% for the next 1/6
  - 15% for the remainder
  - This makes low-level signals ~3x more readable without changing the dB range.
  - Add as a `scale` prop: `'linear'` (current default) | `'iec-60268'`. The scale function converts a dB value to a 0–1 position on the meter.

- [ ] **Recent peak indicator** — A second peak marker that shows the highest level in a configurable rolling window (default ~600ms), distinct from the existing max-ever held peak. Useful for seeing "how loud was it just now" vs "how loud was it ever."
  - Add `recentPeakWindow` prop (milliseconds, default 600). Set to `0` to disable.
  - Store timestamped level readings in a circular buffer. On each render, discard entries older than the window and take the max of what remains.
  - Render as a thin marker line in a distinct color from the held peak marker.

- [ ] **Clickable clipping indicator** — A dedicated element (e.g. small square or dot) at the top/right end of the meter that turns red when any channel hits 0 dB. Clicking it resets the clipping state. Currently clipping is only visible through segment color — there's no persistent, reset-able indicator.
  - Add `showClipIndicator` prop (boolean, default `false`).
  - Add `onClipReset` callback prop.
  - Clipping triggers when level >= `dBRange[1]` (the max end of the scale).

- [ ] **Formal decay ballistics** — Replace ad-hoc smoothing with configurable attack/release behavior:
  - `decayRate` prop (dB per second, default 36). Controls how fast the bar falls after the signal drops.
  - `holdTime` prop (milliseconds, default 0). The bar holds at peak level for this duration before starting to decay ("hangover"). Prevents the meter from falling during brief pauses between transients.
  - Attack is instantaneous (bar jumps to new peak immediately).
  - Decay is computed per frame: `level = max(newLevel, previousLevel - decayRate * deltaTime)`.

- [ ] **Preset dB range options** — Offer named presets alongside the existing `dBRange` prop for common use cases:
  - `'broadcast'` → [-60, 0], `'recording'` → [-50, 5], `'mastering'` → [-96, 0], `'speech'` → [-36, 0]
  - Accept either `dBRange={[-60, 0]}` (tuple) or `dBRange="broadcast"` (preset name).

- [ ] **RMS+Peak dual display mode** — Show both RMS and peak simultaneously on the same meter bar. RMS renders as the main solid bar, peak renders as a semi-transparent overlay extending beyond the RMS level.
  - Add `displayMode` prop: `'peak'` (current default) | `'rms'` | `'peak+rms'`.
  - In `'peak+rms'` mode, the component expects both `levels` (peak) and `rmsLevels` props. RMS bar uses the primary color, peak overlay uses the same color at ~30% opacity.

### Nice to Have

- [ ] Contributing guidelines
- [ ] Bundle size monitoring
- [ ] Performance benchmarks
- [ ] Memory leak testing

---

## 🔮 Future Phases

### Phase 3.4-3.5: Copy/Paste & Multi-Select

- Clipboard operations (Cmd+C/X/V)
- Multi-select with Cmd+Click, Shift+Click
- Bulk drag/delete
- Selection toolbar

### Phase 4: Performance & Virtual Scrolling

- [ ] Vertical virtual scrolling (20+ tracks)
- [ ] RAF batching

### Phase 5: Polish & Usability

- Undo/redo (command pattern)
- Keyboard shortcuts help overlay
- Re-render spectrograms on tab visibility change (OffscreenCanvas buffers can be cleared by browser when tab is backgrounded)
- Accessibility (ARIA, focus management)
- Context menus

### Beats & Bars — Future Extensions

- Tempo automation / tempo maps (multiple BPMs)
- Time signature changes mid-timeline
- Sub-beat snap granularities (1/8, 1/16, triplets)
- Metronome / click track

### Future Considerations

- Clip grouping
- Automation lanes
- Markers and regions
- MIDI/video sync
- Sticky clip header text (Intersection Observer to keep track name visible when scrolling)
- Revamp GitHub Sponsors tiers (via GitHub UI)

