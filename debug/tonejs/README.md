# Tone.js Debug Tests

Standalone HTML pages that reproduce upstream Tone.js bugs discovered during waveform-playlist development. Each file loads Tone.js from CDN and includes a one-click "Reproduce Bug" button.

## Files

| File | Issue | Bug |
|------|-------|-----|
| `transport-loop-wrap-1419.html` | [#1419](https://github.com/Tonejs/Tone.js/issues/1419) | Ghost ticks from stale `Clock._lastUpdate` cause `_processTick` to wrap at loop boundary after rapid stop/start cycles |
| `player-phantom-replay-1417.html` | [#1417](https://github.com/Tonejs/Tone.js/issues/1417) | `Player.sync().start(0)` phantom-replays after stop/start cycles — `_start()` called with nonsensical offset/duration |

## Usage

1. Open the HTML file in a browser (just double-click or `open filename.html`)
2. Click the red **Reproduce Bug (one click)** button
3. Check the log output for highlighted errors

## Testing New Tone.js Releases

To test against a new version, edit the `<script src="...">` tag at the top of each file:

```html
<script src="https://unpkg.com/tone@NEW_VERSION/build/Tone.js"></script>
```

## Gists

These files are also published as GitHub Gists for the upstream bug reports:

- [#1419 gist](https://gist.github.com/naomiaro/407530c4635242694a1e3070aba3e365)
- [#1417 gist](https://gist.github.com/naomiaro/00e9e452a4a24e50dda46738697aea0e)
