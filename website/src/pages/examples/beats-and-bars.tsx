import React from 'react';
import Layout from '@theme/Layout';
import { createLazyExample } from '../../components/BrowserOnlyWrapper';
import { AudioCredits } from '../../components/AudioCredits';

const LazyExample = createLazyExample(
  () => import('../../components/examples/BeatsAndBarsExample').then(m => ({ default: m.BeatsAndBarsExample }))
);

export default function BeatsAndBarsPage(): React.ReactElement {
  return (
    <Layout
      title="Beats & Bars"
      description="Beats and bars timescale with snap-to-grid clip dragging"
    >
      <main className="container margin-vert--lg">
        <h1>Beats &amp; Bars Example</h1>
        <p style={{ marginBottom: '2rem' }}>
          Timescale displays bar and beat markers based on BPM and time signature.
          Clips snap to the selected grid resolution when dragged.
        </p>
        <LazyExample />
        <AudioCredits track="ubiquitous" />
      </main>
    </Layout>
  );
}
