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
        </div>

        <AudioCredits track="ubiquitous" />
      </main>
    </Layout>
  );
}
