/**
 * MIDI Playback Example
 *
 * Demonstrates loading a .mid file via @waveform-playlist/midi,
 * with a toggle to switch between multi-track and flattened modes.
 * Users can drop additional .mid files or click to browse.
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
  usePlaybackShortcuts,
  usePlaylistState,
  usePlaylistControls,
} from '@waveform-playlist/browser';
import type { WaveformPlaylistTheme } from '@waveform-playlist/ui-components';
import { useMidiTracks } from '@waveform-playlist/midi';
import type { MidiTrackConfig } from '@waveform-playlist/midi';
import { SoundFontCache } from '@waveform-playlist/playout';
import { useDocusaurusTheme } from '../../hooks/useDocusaurusTheme';
import { FolderOpenIcon, MusicNotesIcon } from '@phosphor-icons/react';

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

const ToggleGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-left: auto;
`;

const ToggleLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--ifm-color-emphasis-700, #495057);
  user-select: none;
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

const LoadingOverlay = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
  color: var(--ifm-color-emphasis-600, #868e96);
  font-size: 0.9rem;
  gap: 0.5rem;
`;

const ClearButton = styled.button`
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--ifm-color-emphasis-400, #ced4da);
  border-radius: 4px;
  background: transparent;
  color: var(--ifm-font-color-base, #495057);
  cursor: pointer;
  font-size: 0.8rem;

  &:hover {
    background: #dc3545;
    color: white;
    border-color: #dc3545;
  }
`;

const DropZone = styled.div<{ $isDragging: boolean }>`
  padding: 1.5rem 1rem;
  border: 2px dashed
    ${(props) => (props.$isDragging ? '#3498db' : 'var(--ifm-color-emphasis-400, #ced4da)')};
  border-radius: 0.5rem;
  text-align: center;
  background: ${(props) =>
    props.$isDragging
      ? 'rgba(52, 152, 219, 0.1)'
      : 'var(--ifm-background-surface-color, #f8f9fa)'};
  margin-top: 1rem;
  transition: all 0.2s ease-in-out;
  cursor: pointer;

  &:hover {
    border-color: #3498db;
  }
`;

const DropZoneText = styled.p`
  margin: 0;
  color: var(--ifm-font-color-base, #495057);
  font-size: 0.9rem;
`;

const HiddenFileInput = styled.input`
  display: none;
`;

function PlaybackShortcuts() {
  usePlaybackShortcuts();
  return null;
}

function AutoScrollToggle() {
  const { isAutomaticScroll } = usePlaylistState();
  const { setAutomaticScroll } = usePlaylistControls();

  return (
    <ToggleLabel>
      Auto-scroll
      <ToggleSwitch
        $active={isAutomaticScroll}
        onClick={() => setAutomaticScroll(!isAutomaticScroll)}
      />
    </ToggleLabel>
  );
}

/**
 * Load a SoundFont file and return a SoundFontCache instance.
 * The cache is created once and persists across re-renders.
 */
function useSoundFontCache(url?: string): { cache?: SoundFontCache; loading: boolean } {
  const cacheRef = React.useRef<SoundFontCache | null>(null);
  const [cache, setCache] = React.useState<SoundFontCache | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!url) {
      setCache(undefined);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const loadSoundFont = async () => {
      // Reuse existing cache if already loaded
      if (cacheRef.current?.isLoaded) {
        setCache(cacheRef.current);
        if (!cancelled) setLoading(false);
        return;
      }

      // No AudioContext argument — SoundFontCache uses OfflineAudioContext
      // internally, which doesn't require user gesture and avoids Firefox's
      // "AudioContext was prevented from starting automatically" warning.
      const sfCache = new SoundFontCache();

      try {
        await sfCache.load(url);
        if (!cancelled) {
          cacheRef.current = sfCache;
          setCache(sfCache);
          setLoading(false);
        }
      } catch (err) {
        console.warn('[waveform-playlist] Failed to load SoundFont:', err);
        if (!cancelled) setLoading(false);
      }
    };

    loadSoundFont();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { cache, loading };
}

const BASE_MIDI_SRC = '/waveform-playlist/media/midi/RedHotChiliPeppers-Otherside.mid';

function isMidiFile(file: File): boolean {
  // Check MIME type first, fall back to extension
  if (file.type === 'audio/midi' || file.type === 'audio/x-midi') return true;
  return /\.(mid|midi)$/i.test(file.name);
}

export function MidiExample() {
  const { theme, isDarkMode } = useDocusaurusTheme();
  const gradientTheme = isDarkMode ? darkThemeOverrides : lightThemeOverrides;
  const [flatten, setFlatten] = React.useState(false);
  const [useSoundFont, setUseSoundFont] = React.useState(true);
  const [userMidiConfigs, setUserMidiConfigs] = React.useState<MidiTrackConfig[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const objectUrlsRef = React.useRef<string[]>([]);

  const soundFontUrl = useSoundFont
    ? '/waveform-playlist/media/soundfont/A320U.sf2'
    : undefined;
  const { cache: soundFontCache, loading: soundFontLoading } = useSoundFontCache(soundFontUrl);

  const midiConfigs = React.useMemo(
    () => [
      { src: BASE_MIDI_SRC, flatten },
      ...userMidiConfigs.map((c) => ({ ...c, flatten })),
    ],
    [flatten, userMidiConfigs]
  );

  const { tracks, loading, error, loadedCount, totalCount } = useMidiTracks(midiConfigs);

  // Revoke object URLs on unmount
  React.useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach(URL.revokeObjectURL);
    };
  }, []);

  const addMidiFiles = React.useCallback((files: File[]) => {
    const midiFiles = files.filter(isMidiFile);
    if (midiFiles.length === 0) return;

    const newConfigs: MidiTrackConfig[] = midiFiles.map((f) => {
      const url = URL.createObjectURL(f);
      objectUrlsRef.current.push(url);
      return {
        src: url,
        name: f.name.replace(/\.[^/.]+$/, ''),
      };
    });
    setUserMidiConfigs((prev) => [...prev, ...newConfigs]);
  }, []);

  const handleClear = React.useCallback(() => {
    // Revoke all user object URLs
    objectUrlsRef.current.forEach(URL.revokeObjectURL);
    objectUrlsRef.current = [];
    setUserMidiConfigs([]);
  }, []);

  const handleDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      addMidiFiles(Array.from(e.dataTransfer.files));
    },
    [addMidiFiles]
  );

  const handleFileInput = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addMidiFiles(Array.from(e.target.files));
      }
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [addMidiFiles]
  );

  if (error) {
    return (
      <Container>
        <div style={{ padding: '2rem', color: 'red' }}>Error loading MIDI: {error}</div>
      </Container>
    );
  }

  const midiLoading = loading || tracks.length === 0;
  const isReady = !soundFontLoading && !midiLoading;

  if (!isReady) {
    return (
      <Container>
        <LoadingOverlay>
          {soundFontLoading && <div>Loading SoundFont...</div>}
          {midiLoading && (
            <div>
              Loading MIDI tracks ({loadedCount}/{totalCount})...
            </div>
          )}
        </LoadingOverlay>
      </Container>
    );
  }

  return (
    <Container>
      <InfoBanner>
        {soundFontCache
          ? 'MIDI tracks use SoundFont sample playback for realistic instrument sounds.'
          : 'MIDI tracks are synthesized in the browser using Tone.js PolySynth. Notes may be dropped when exceeding the polyphony limit.'}
        {' Each MIDI track becomes a separate timeline track with its own volume and pan controls.'}
        {flatten
          ? ' All MIDI channels are merged into a single track.'
          : ` Showing ${tracks.length} individual MIDI track${tracks.length !== 1 ? 's' : ''}.`}
      </InfoBanner>

      <WaveformPlaylistProvider
        tracks={tracks}
        samplesPerPixel={2048}
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
          <ToggleGroup>
            <AutoScrollToggle />
            <ToggleLabel>
              SoundFont
              <ToggleSwitch $active={useSoundFont} onClick={() => setUseSoundFont((s) => !s)} />
            </ToggleLabel>
            <ToggleLabel>
              Flatten
              <ToggleSwitch $active={flatten} onClick={() => setFlatten((f) => !f)} />
            </ToggleLabel>
            {userMidiConfigs.length > 0 && (
              <ClearButton onClick={handleClear} title="Remove user-added MIDI files">
                Clear Added
              </ClearButton>
            )}
          </ToggleGroup>
        </Controls>

        <Waveform />
      </WaveformPlaylistProvider>

      <DropZone
        $isDragging={isDragging}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <DropZoneText>
          {isDragging ? (
            <>
              <FolderOpenIcon
                size={18}
                weight="light"
                style={{ marginRight: 6, verticalAlign: 'text-bottom' }}
              />
              Drop MIDI files here
            </>
          ) : (
            <>
              <MusicNotesIcon
                size={18}
                weight="light"
                style={{ marginRight: 6, verticalAlign: 'text-bottom' }}
              />
              Drop .mid files here to add tracks, or click to browse
            </>
          )}
        </DropZoneText>
      </DropZone>

      <HiddenFileInput
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi"
        multiple
        onChange={handleFileInput}
      />
    </Container>
  );
}
