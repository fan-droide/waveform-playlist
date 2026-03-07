# TODO & Roadmap

Multi-track audio editor roadmap for waveform-playlist.

**Branch:** `main` | **Last Updated:** 2026-03-03

---

## 🎯 TODO

### Testing & CI

- [ ] **CI/CD pipeline** - Automated builds, tests, publishing

### API Parity

- [ ] Add `renderPlayhead` prop to `MediaElementWaveform` (already exists in `Waveform`)

### Playback UX

- [ ] **Eager AudioContext resume** — Resume AudioContext on first user interaction (click/keydown) within playlist, before play is pressed. Eliminates ~200-500ms delay on first space bar press. Use `resumeGlobalAudioContext()` (raw context resume), NOT `Tone.start()` which adds ~2s latency on Safari if called redundantly.

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

- [x] Horizontal virtual scrolling (2+ hour timelines) — ScrollViewportContext, chunked TimeScale, viewport-aware Channel/SpectrogramChannel
- [ ] Chunked spectrogram computation (worker OOM on 1hr+ files — ArrayBuffer allocation failure)
- [ ] Vertical virtual scrolling (20+ tracks)
- [ ] RAF batching

### Phase 5: Polish & Usability

- Undo/redo (command pattern)
- Snap to grid
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

