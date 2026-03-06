/**
 * MIDI Playback Example
 *
 * Demonstrates loading a .mid file via @waveform-playlist/midi,
 * with a toggle to switch between multi-track and flattened modes.
 */

import React from 'react';
import styled from 'styled-components';
import {
  WaveformPlaylistProvider,
  Waveform,
  PlayButton,
  PauseButton,
  StopButton,
  AudioPosition,
  AutomaticScrollCheckbox,
  usePlaybackShortcuts,
} from '@waveform-playlist/browser';
import type { WaveformPlaylistTheme } from '@waveform-playlist/ui-components';
import { useMidiTracks } from '@waveform-playlist/midi';
import { SoundFontCache } from '@waveform-playlist/playout';
import { useDocusaurusTheme } from '../../hooks/useDocusaurusTheme';

const darkThemeOverrides: Partial<WaveformPlaylistTheme> = {
  waveformDrawMode: 'inverted',
  waveOutlineColor: {
    type: 'linear',
    direction: 'vertical',
    stops: [
      { offset: 0, color: '#d4a574' },
      { offset: 0.5, color: '#c49a6c' },
      { offset: 1, color: '#d4a574' },
    ],
  },
  waveFillColor: '#1a1612',
  waveProgressColor: 'rgba(100, 70, 40, 0.5)',
  selectedWaveOutlineColor: {
    type: 'linear',
    direction: 'vertical',
    stops: [
      { offset: 0, color: '#e8c090' },
      { offset: 0.5, color: '#d4a87c' },
      { offset: 1, color: '#e8c090' },
    ],
  },
  selectedWaveFillColor: '#241c14',
  playlistBackgroundColor: '#0d0d14',
};

const lightThemeOverrides: Partial<WaveformPlaylistTheme> = {
  waveformDrawMode: 'normal',
  waveOutlineColor: '#f5f5f5',
  waveFillColor: {
    type: 'linear',
    direction: 'vertical',
    stops: [
      { offset: 0, color: '#3d8b8b' },
      { offset: 0.5, color: '#2a7070' },
      { offset: 1, color: '#3d8b8b' },
    ],
  },
  waveProgressColor: 'rgba(42, 112, 112, 0.3)',
  selectedWaveOutlineColor: '#e8e8e8',
  selectedWaveFillColor: {
    type: 'linear',
    direction: 'vertical',
    stops: [
      { offset: 0, color: '#4a9e9e' },
      { offset: 0.5, color: '#3d8b8b' },
      { offset: 1, color: '#4a9e9e' },
    ],
  },
  playlistBackgroundColor: '#1a1a2e',
};

const Controls = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 1rem;
  background: var(--ifm-background-surface-color, #f8f9fa);
  border: 1px solid var(--ifm-color-emphasis-300, #dee2e6);
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
`;

const ToggleLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--ifm-color-emphasis-700, #495057);
  user-select: none;
  margin-left: auto;
`;

const ToggleSwitch = styled.div<{ $active: boolean }>`
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: ${(props) =>
    props.$active ? 'var(--ifm-color-primary, #3d8b8b)' : 'var(--ifm-color-emphasis-400, #adb5bd)'};
  transition: background 0.2s;

  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: ${(props) => (props.$active ? '20px' : '2px')};
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    transition: left 0.2s;
  }
`;

const InfoBanner = styled.div`
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  border-radius: 0.5rem;
  background: var(--ifm-color-emphasis-100, #f1f3f5);
  border: 1px solid var(--ifm-color-emphasis-200, #e9ecef);
  font-size: 0.85rem;
  color: var(--ifm-color-emphasis-700, #495057);
`;

function PlaybackShortcuts() {
  usePlaybackShortcuts();
  return null;
}

/**
 * Load a SoundFont file and return a SoundFontCache instance.
 * The cache is created once and persists across re-renders.
 */
function useSoundFontCache(url?: string): SoundFontCache | undefined {
  const cacheRef = React.useRef<SoundFontCache | null>(null);
  const [cache, setCache] = React.useState<SoundFontCache | undefined>(undefined);

  React.useEffect(() => {
    if (!url) {
      setCache(undefined);
      return;
    }

    let cancelled = false;

    const loadSoundFont = async () => {
      // Reuse existing cache if already loaded
      if (cacheRef.current?.isLoaded) {
        setCache(cacheRef.current);
        return;
      }

      // Need an AudioContext for creating AudioBuffers
      const audioContext = new AudioContext();
      const sfCache = new SoundFontCache(audioContext);

      try {
        await sfCache.load(url);
        if (!cancelled) {
          cacheRef.current = sfCache;
          setCache(sfCache);
        }
      } catch (err) {
        console.warn('[waveform-playlist] Failed to load SoundFont:', err);
      }
    };

    loadSoundFont();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return cache;
}

export function MidiExample() {
  const { theme, isDarkMode } = useDocusaurusTheme();
  const gradientTheme = isDarkMode ? darkThemeOverrides : lightThemeOverrides;
  const [flatten, setFlatten] = React.useState(false);
  const [useSoundFont, setUseSoundFont] = React.useState(true);

  const soundFontUrl = useSoundFont
    ? 'https://musical-artifacts.com/artifacts/5906/A320U.sf2'
    : undefined;
  const soundFontCache = useSoundFontCache(soundFontUrl);

  const midiConfigs = React.useMemo(
    () => [
      {
        src: '/waveform-playlist/media/midi/RedHotChiliPeppers-Otherside.mid',
        flatten,
      },
    ],
    [flatten]
  );

  const { tracks, loading, error, loadedCount, totalCount } = useMidiTracks(midiConfigs);

  if (error) {
    return (
      <Container>
        <div style={{ padding: '2rem', color: 'red' }}>Error loading MIDI: {error}</div>
      </Container>
    );
  }

  return (
    <Container>
      <InfoBanner>
        {soundFontCache
          ? 'MIDI tracks use SoundFont sample playback for realistic instrument sounds.'
          : 'MIDI tracks are synthesized in the browser using Tone.js PolySynth.'}
        {' Each MIDI track becomes a separate timeline track with its own volume and pan controls.'}
        {flatten
          ? ' All MIDI channels are merged into a single track.'
          : ` Showing ${tracks.length} individual MIDI track${tracks.length !== 1 ? 's' : ''}.`}
      </InfoBanner>

      <WaveformPlaylistProvider
        tracks={tracks}
        samplesPerPixel={1500}
        mono
        theme={{ ...theme, ...gradientTheme }}
        soundFontCache={soundFontCache}
        progressBarWidth={2}
        controls={{ show: true, width: 200 }}
        waveHeight={100}
        timescale
        automaticScroll
      >
        <PlaybackShortcuts />
        <Controls>
          <PlayButton />
          <PauseButton />
          <StopButton />
          <AudioPosition />
          {loading && (
            <span style={{ fontSize: '0.875rem', color: 'var(--ifm-color-emphasis-600)' }}>
              Loading ({loadedCount}/{totalCount})...
            </span>
          )}
          <AutomaticScrollCheckbox />
          <ToggleLabel>
            SoundFont
            <ToggleSwitch $active={useSoundFont} onClick={() => setUseSoundFont((s) => !s)} />
          </ToggleLabel>
          <ToggleLabel>
            Flatten
            <ToggleSwitch $active={flatten} onClick={() => setFlatten((f) => !f)} />
          </ToggleLabel>
        </Controls>

        <Waveform />
      </WaveformPlaylistProvider>
    </Container>
  );
}
