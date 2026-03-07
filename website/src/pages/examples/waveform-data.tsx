import React from 'react';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import { createLazyExample } from '../../components/BrowserOnlyWrapper';
import { AudioCredits } from '../../components/AudioCredits';

const LazyWaveformDataExample = createLazyExample(
  () => import('../../components/examples/WaveformDataExample').then(m => ({ default: m.WaveformDataExample }))
);

export default function WaveformDataExamplePage(): React.ReactElement {
  return (
    <Layout
      title="BBC Waveform Data Example"
      description="Instant waveform display with BBC audiowaveform pre-computed peaks - reduce load times from seconds to milliseconds"
    >
      <Head>
        <meta property="og:title" content="BBC Waveform Data Example - Waveform Playlist" />
        <meta property="og:description" content="Instant waveform display with BBC audiowaveform pre-computed peaks - reduce load times from seconds to milliseconds" />
        <meta property="og:image" content="https://naomiaro.github.io/waveform-playlist/img/social/example-waveform-data.png" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="BBC Waveform Data Example - Waveform Playlist" />
        <meta name="twitter:description" content="Instant waveform display with BBC audiowaveform pre-computed peaks - reduce load times from seconds to milliseconds" />
        <meta name="twitter:image" content="https://naomiaro.github.io/waveform-playlist/img/social/example-waveform-data.png" />
      </Head>
      <main className="container margin-vert--lg">
        <h1>BBC Waveform Data Example</h1>
        <p>
          This example demonstrates fast waveform loading using BBC's pre-computed peaks format.
          Waveforms appear almost instantly while audio loads in the background.
        </p>

        <div
          style={{
            marginTop: '2rem',
            padding: '2rem',
            background: 'var(--ifm-background-surface-color)',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            border: '1px solid var(--ifm-color-emphasis-300)'
          }}
        >
          <LazyWaveformDataExample />
        </div>

        <div style={{ marginTop: '2rem' }}>
          <h2>About BBC Waveform Data</h2>
          <p>
            BBC's <a href="https://github.com/bbc/audiowaveform" target="_blank" rel="noopener noreferrer">audiowaveform</a> tool
            generates pre-computed peak data from audio files. This enables:
          </p>
          <ul>
            <li><strong>Instant waveform display</strong> - peaks files are ~50KB vs ~3MB for audio</li>
            <li><strong>Reduced server load</strong> - no need to decode audio for visualization</li>
            <li><strong>Consistent rendering</strong> - same peaks regardless of browser/platform</li>
            <li><strong>Progressive loading</strong> - show waveforms while audio loads in background</li>
          </ul>

          <h3>Generating BBC Peaks Files</h3>
          <pre style={{
            background: 'var(--ifm-code-background)',
            padding: '1rem',
            borderRadius: '4px',
            overflow: 'auto'
          }}>
{`# Install audiowaveform (macOS)
brew install audiowaveform

# Generate binary .dat file at 256 samples per pixel
audiowaveform -i audio.mp3 -o peaks.dat -z 256 -b 8

# Generate with different zoom levels
audiowaveform -i audio.mp3 -o peaks-30.dat -z 30 -b 8  # ~30 SPP

# Generate 16-bit for higher precision
audiowaveform -i audio.mp3 -o peaks-16bit.dat -z 256 -b 16`}
          </pre>

          <h3>Fully Progressive Loading</h3>
          <pre style={{
            background: 'var(--ifm-code-background)',
            padding: '1rem',
            borderRadius: '4px',
            overflow: 'auto',
            fontSize: '0.8rem',
          }}>
{`import React, { useState, useEffect, useMemo } from 'react';
import type WaveformData from 'waveform-data';
import {
  WaveformPlaylistProvider,
  Waveform,
  PlayButton,
  PauseButton,
  StopButton,
  useAudioTracks,
  loadWaveformData,
} from '@waveform-playlist/browser';

const trackConfigs = [
  { name: 'Kick', audioSrc: '/audio/kick.opus', peaksSrc: '/peaks/kick.dat' },
  { name: 'Bass', audioSrc: '/audio/bass.opus', peaksSrc: '/peaks/bass.dat' },
];

function WaveformDataExample() {
  const [peaksMap, setPeaksMap] = useState<Map<string, WaveformData>>(new Map());

  // 1. Load peaks PROGRESSIVELY - each track appears as its peaks load!
  useEffect(() => {
    trackConfigs.forEach(async (config) => {
      const waveformData = await loadWaveformData(config.peaksSrc);
      // Update state for THIS track immediately - triggers re-render
      setPeaksMap(prev => new Map(prev).set(config.name, waveformData));
    });
  }, []);

  // 2. Build configs - only include tracks that have peaks ready
  const audioConfigs = useMemo(() =>
    trackConfigs
      .filter(config => peaksMap.has(config.name))
      .map(config => ({
        src: config.audioSrc,
        name: config.name,
        waveformData: peaksMap.get(config.name), // Pre-computed peaks!
      })),
  [peaksMap]);

  // 3. Load audio with immediate placeholders - peaks render instantly!
  const { tracks, loading, loadedCount, totalCount } = useAudioTracks(
    audioConfigs,  // Configs added as peaks arrive, each with waveformData
    { immediate: true }
  );

  // Tracks render immediately with pre-computed peaks, audio fills in
  return (
    <WaveformPlaylistProvider tracks={tracks} samplesPerPixel={1024} deferEngineRebuild={loading}>
      {loading && <div>Loading: {loadedCount} / {totalCount}</div>}
      <PlayButton /> <PauseButton /> <StopButton />
      <Waveform />
    </WaveformPlaylistProvider>
  );
}`}
          </pre>
        </div>

        <AudioCredits track="ubiquitous" />
      </main>
    </Layout>
  );
}
