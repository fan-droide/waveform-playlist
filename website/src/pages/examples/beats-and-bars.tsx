import React from 'react';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import { createLazyExample } from '../../components/BrowserOnlyWrapper';
import { AudioCredits } from '../../components/AudioCredits';

const LazyExample = createLazyExample(
  () => import('../../components/examples/BeatsAndBarsExample').then(m => ({ default: m.BeatsAndBarsExample }))
);

export default function BeatsAndBarsPage(): React.ReactElement {
  return (
    <Layout
      title="Beats & Bars"
      description="Musical timescale with bar and beat markers, BPM, time signatures, and PPQN-based snap-to-grid for multitrack audio editing in the browser."
    >
      <Head>
        <meta property="og:title" content="Beats & Bars Example - Waveform Playlist" />
        <meta property="og:description" content="Musical timescale with bar and beat markers, BPM, time signatures, and PPQN-based snap-to-grid for multitrack audio editing in the browser." />
        <meta property="og:image" content="https://naomiaro.github.io/waveform-playlist/img/social/example-beats-and-bars.png" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Beats & Bars Example - Waveform Playlist" />
        <meta name="twitter:description" content="Musical timescale with bar and beat markers, BPM, time signatures, and PPQN-based snap-to-grid for multitrack audio editing in the browser." />
        <meta name="twitter:image" content="https://naomiaro.github.io/waveform-playlist/img/social/example-beats-and-bars.png" />
      </Head>
      <main className="container margin-vert--lg">
        <h1>Beats &amp; Bars Example</h1>
        <p>
          Timescale displays bar and beat markers based on BPM and time signature.
          Clips snap to the selected grid resolution when dragged. Switch between
          bar-level and beat-level snap, or disable snapping entirely.
        </p>

        <LazyExample />

        <div style={{ marginTop: '2rem' }}>
          <h2>What is PPQN?</h2>
          <p>
            <strong>PPQN</strong> (Pulses Per Quarter Note) is the timing resolution
            used by MIDI sequencers and DAWs to subdivide each beat. A higher PPQN
            means finer rhythmic precision. This library uses <strong>192 PPQN</strong> to
            match <a href="https://tonejs.github.io/" target="_blank" rel="noopener noreferrer">Tone.js</a>'s
            internal transport resolution, enabling accurate placement of notes and
            clips on a musical grid.
          </p>
          <p>
            For example, at 192 PPQN in 4/4 time, each bar contains{' '}
            <code>192 &times; 4 = 768</code> ticks. Snap-to-grid quantizes clip
            positions to the nearest tick boundary at the selected resolution (bar or
            beat), ensuring clips align perfectly with the musical grid regardless of
            tempo or time signature.
          </p>

          <h3 style={{ marginTop: '1.5rem' }}>How PPQN relates to BPM</h3>
          <p>
            PPQN defines <em>spatial</em> resolution (how many ticks per beat), while
            BPM defines <em>temporal</em> resolution (how fast beats play). Together
            they determine the real-time duration of a single tick:
          </p>
          <p style={{ textAlign: 'center', margin: '1.25rem 0' }}>
            <code style={{ fontSize: '1.05em', padding: '0.4em 0.8em' }}>
              tick duration = 60 / (BPM &times; PPQN)
            </code>
          </p>
          <p>
            At <strong>120 BPM</strong> with 192 PPQN, each tick
            is <code>60 / (120 &times; 192) &asymp; 0.0026s</code> (about 2.6 ms).
            Double the tempo to <strong>240 BPM</strong> and each tick
            halves to ~1.3 ms — but there are still exactly 192 ticks per
            beat. This is why PPQN is tempo-independent: it measures
            musical position, not clock time.
          </p>
          <p style={{ marginTop: '1rem' }}>
            Try it: change the BPM above and watch the timescale markers shift
            as each bar occupies a different number of audio samples. Drag a
            clip with snap enabled — it locks to the nearest beat or bar line.
          </p>
        </div>

        <AudioCredits track="ubiquitous" />
      </main>
    </Layout>
  );
}
