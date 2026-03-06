# Website Package (Docusaurus)

## CSS Pitfalls

### `backdrop-filter` breaks `position: fixed` children

`backdrop-filter` on an ancestor creates a new containing block for `position: fixed` descendants. The mobile navbar sidebar (`position: fixed; top: 0; bottom: 0`) becomes constrained to the ancestor's height instead of the viewport.

**Fix:** Scope `backdrop-filter` with `:not(.navbar-sidebar--show)` so it only applies when the mobile sidebar is closed.

### Absolute-positioned elements inside flex-centered content

When a hero section uses `min-height: 100vh` + `align-items: center` and an element inside the centered content uses `position: absolute; bottom: N`, it positions relative to the content div — not the full-height section. On mobile where text wraps, the content grows and the absolute element overlaps.

**Fix:** Place absolute-positioned indicators (scroll arrows, etc.) as direct children of the viewport-height container, not inside the centered content div.

## Dev Server

- Clear `.docusaurus/` cache after branch switches — stale `@generated` modules cause compilation errors
- CSS calc warnings during build are pre-existing and harmless
- Dev server: `pnpm --filter website start`
- Build: `pnpm --filter website build`

## Custom Pages

- Examples index: `website/src/pages/examples/index.tsx` + `examples.module.css`
- Custom styles: `website/src/css/custom.css`
- Example components: `website/src/components/examples/`
- Lazy loading wrapper: `website/src/components/BrowserOnlyWrapper.tsx`

## Static Media Assets

- `website/static/media/soundfont/A320U.sf2` — GPL SoundFont used by MIDI example (not distributed with npm packages). Served at `/waveform-playlist/media/soundfont/A320U.sf2`.
