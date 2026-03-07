import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { DragDropProvider } from '@dnd-kit/react';
import { RestrictToHorizontalAxis } from '@dnd-kit/abstract/modifiers';
import { getGlobalAudioContext } from '@waveform-playlist/playout';
import { createTrack, createClipFromSeconds, type ClipTrack } from '@waveform-playlist/core';
import {
  WaveformPlaylistProvider,
  usePlaylistData,
  usePlaylistControls,
  useClipDragHandlers,
  useDragSensors,
  ClipCollisionModifier,
  SnapToGridModifier,
  noDropAnimationPlugins,
  useClipSplitting,
  usePlaybackShortcuts,
  Waveform,
  PlayButton,
  PauseButton,
  StopButton,
  LoopButton,
  ZoomInButton,
  ZoomOutButton,
  AudioPosition,
  AutomaticScrollCheckbox,
  MasterVolumeControl,
} from '@waveform-playlist/browser';
import {
  BeatsAndBarsProvider,
  getScaleInfo,
  type SnapTo,
} from '@waveform-playlist/ui-components';
import { useDocusaurusTheme } from '../../hooks/useDocusaurusTheme';

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
`;

const ControlGroup = styled.div`
  display: flex;
  gap: 5px;
  align-items: center;
  padding-right: 15px;
  border-right: 1px solid var(--ifm-color-emphasis-300, #ddd);

  &:last-child {
    border-right: none;
  }
`;

const Label = styled.label`
  font-size: 0.8rem;
  color: var(--ifm-color-emphasis-600);
  white-space: nowrap;
`;

// Audio files - each file is loaded and decoded once
// All from Ubiquitous for consistency
const audioFiles = [
  { id: 'kick', src: '/waveform-playlist/media/audio/AlbertKader_Ubiquitous/01_Kick.opus' },
  { id: 'hihat', src: '/waveform-playlist/media/audio/AlbertKader_Ubiquitous/02_HiHat1.opus' },
  { id: 'claps', src: '/waveform-playlist/media/audio/AlbertKader_Ubiquitous/04_Claps.opus' },
  { id: 'shakers', src: '/waveform-playlist/media/audio/AlbertKader_Ubiquitous/07_Shakers.opus' },
  { id: 'bass', src: '/waveform-playlist/media/audio/AlbertKader_Ubiquitous/08_Bass.opus' },
  { id: 'synth1', src: '/waveform-playlist/media/audio/AlbertKader_Ubiquitous/09_Synth1_Unmodulated.opus' },
  { id: 'synth2', src: '/waveform-playlist/media/audio/AlbertKader_Ubiquitous/11_Synth2.opus' },
];

// Track configuration with multiple clips demonstrating gaps and positioning
const trackConfigs = [
  {
    name: 'Kick',
    clips: [
      { fileId: 'kick', startTime: 0, duration: 8, offset: 0 },
      { fileId: 'kick', startTime: 12, duration: 8, offset: 8 },
    ],
  },
  {
    name: 'HiHat',
    clips: [
      { fileId: 'hihat', startTime: 4, duration: 12, offset: 4 },
    ],
  },
  {
    name: 'Claps',
    clips: [
      { fileId: 'claps', startTime: 8, duration: 4, offset: 0 },
      { fileId: 'claps', startTime: 16, duration: 4, offset: 4 },
    ],
  },
  {
    name: 'Shakers',
    clips: [
      { fileId: 'shakers', startTime: 0, duration: 6, offset: 0 },
      { fileId: 'shakers', startTime: 10, duration: 6, offset: 6 },
    ],
  },
  {
    name: 'Bass',
    clips: [
      { fileId: 'bass', startTime: 0, duration: 20, offset: 0 },
    ],
  },
  {
    name: 'Synth 1',
    clips: [
      { fileId: 'synth1', startTime: 4, duration: 8, offset: 2 },
      { fileId: 'synth1', startTime: 14, duration: 6, offset: 10 },
    ],
  },
  {
    name: 'Synth 2',
    clips: [
      { fileId: 'synth2', startTime: 0, duration: 4, offset: 0 },
      { fileId: 'synth2', startTime: 8, duration: 4, offset: 4 },
      { fileId: 'synth2', startTime: 16, duration: 4, offset: 8 },
    ],
  },
];

type ScaleMode = 'beats' | 'temporal';

interface PlaylistWithDragProps {
  tracks: ClipTrack[];
  onTracksChange: (tracks: ClipTrack[]) => void;
  scaleMode: ScaleMode;
  setScaleMode: (mode: ScaleMode) => void;
  bpm: number;
  setBpm: (bpm: number) => void;
  timeSignature: [number, number];
  setTimeSignature: (ts: [number, number]) => void;
  snapTo: SnapTo;
  setSnapTo: (snap: SnapTo) => void;
  loading?: boolean;
  loadedCount?: number;
  totalCount?: number;
}

const PlaylistWithDrag: React.FC<PlaylistWithDragProps> = ({
  tracks,
  onTracksChange,
  scaleMode,
  setScaleMode,
  bpm,
  setBpm,
  timeSignature,
  setTimeSignature,
  snapTo,
  setSnapTo,
  loading,
  loadedCount,
  totalCount,
}) => {
  const { samplesPerPixel, sampleRate, playoutRef, isDraggingRef } = usePlaylistData();
  const { setSelectedTrackId } = usePlaylistControls();

  const sensors = useDragSensors();
  const { onDragStart: handleDragStart, onDragMove, onDragEnd } = useClipDragHandlers({
    tracks,
    onTracksChange,
    samplesPerPixel,
    sampleRate,
    engineRef: playoutRef,
    isDraggingRef,
  });

  const onDragStart = (event: Parameters<typeof handleDragStart>[0]) => {
    const trackIndex = event.operation?.source?.data?.trackIndex as number | undefined;
    if (trackIndex !== undefined && tracks[trackIndex]) {
      setSelectedTrackId(tracks[trackIndex].id);
    }
    handleDragStart(event);
  };

  const { splitClipAtPlayhead } = useClipSplitting({
    tracks,
    sampleRate,
    samplesPerPixel,
    engineRef: playoutRef,
  });

  // Enable default playback shortcuts (0 = rewind to start) plus split shortcut
  usePlaybackShortcuts({
    additionalShortcuts: [
      {
        key: 's',
        action: splitClipAtPlayhead,
        description: 'Split clip at playhead',
        preventDefault: true,
      },
    ],
  });

  return (
    <DragDropProvider
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      modifiers={[
        RestrictToHorizontalAxis,
        scaleMode === 'beats'
          ? SnapToGridModifier.configure({
              mode: 'beats',
              snapTo,
              bpm,
              timeSignature,
              samplesPerPixel,
              sampleRate,
            })
          : SnapToGridModifier.configure({
              mode: 'temporal',
              gridSamples: Math.round(
                (getScaleInfo(samplesPerPixel).smallStep / 1000) * sampleRate,
              ),
              samplesPerPixel,
            }),
        ClipCollisionModifier.configure({ tracks, samplesPerPixel }),
      ]}
      plugins={noDropAnimationPlugins}
    >
      <Controls>
        <ControlGroup>
          <PlayButton />
          <PauseButton />
          <StopButton />
          <LoopButton />
          {loading && <span style={{ fontSize: '0.875rem', color: 'var(--ifm-color-emphasis-600)' }}>Loading: {loadedCount}/{totalCount}</span>}
        </ControlGroup>
        <ControlGroup>
          <ZoomInButton />
          <ZoomOutButton />
        </ControlGroup>
        <ControlGroup>
          <AudioPosition />
        </ControlGroup>
        <ControlGroup>
          <AutomaticScrollCheckbox />
        </ControlGroup>
        <ControlGroup>
          <MasterVolumeControl />
        </ControlGroup>
      </Controls>
      <Controls>
        <ControlGroup>
          <Label>
            Scale{' '}
            <select
              value={scaleMode}
              onChange={(e) => setScaleMode(e.target.value as ScaleMode)}
            >
              <option value="beats">Beats & Bars</option>
              <option value="temporal">Temporal</option>
            </select>
          </Label>
        </ControlGroup>
        {scaleMode === 'beats' && (
          <>
            <ControlGroup>
              <Label>
                BPM{' '}
                <input
                  type="number"
                  min={20}
                  max={300}
                  value={bpm}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= 20 && val <= 300) setBpm(val);
                  }}
                  style={{ width: 60 }}
                />
              </Label>
            </ControlGroup>
            <ControlGroup>
              <Label>
                Time Sig{' '}
                <select
                  value={`${timeSignature[0]}/${timeSignature[1]}`}
                  onChange={(e) => {
                    const [num, den] = e.target.value.split('/').map(Number);
                    setTimeSignature([num, den]);
                  }}
                >
                  <option value="4/4">4/4</option>
                  <option value="3/4">3/4</option>
                  <option value="6/8">6/8</option>
                  <option value="2/2">2/2</option>
                  <option value="5/4">5/4</option>
                  <option value="7/8">7/8</option>
                </select>
              </Label>
            </ControlGroup>
            <ControlGroup>
              <Label>
                Snap{' '}
                <select value={snapTo} onChange={(e) => setSnapTo(e.target.value as SnapTo)}>
                  <option value="bar">Bar</option>
                  <option value="beat">Beat</option>
                  <option value="off">Off</option>
                </select>
              </Label>
            </ControlGroup>
          </>
        )}
      </Controls>

      <Waveform timescale showClipHeaders interactiveClips />
    </DragDropProvider>
  );
};

// Helper to get required file IDs for a track
const getRequiredFileIds = (trackConfig: typeof trackConfigs[0]): string[] => {
  return [...new Set(trackConfig.clips.map(clip => clip.fileId))];
};

// Helper to create a track when all its required files are loaded
const createTrackFromConfig = (
  trackConfig: typeof trackConfigs[0],
  fileBuffers: Map<string, AudioBuffer>
): ClipTrack => {
  const clips = trackConfig.clips.map((clipConfig) => {
    const audioBuffer = fileBuffers.get(clipConfig.fileId);
    if (!audioBuffer) {
      throw new Error(`Audio file not found for ID: ${clipConfig.fileId}`);
    }

    return createClipFromSeconds({
      audioBuffer,
      startTime: clipConfig.startTime,
      duration: clipConfig.duration,
      offset: clipConfig.offset,
      name: `${trackConfig.name} ${clipConfig.offset}-${clipConfig.offset + clipConfig.duration}s`,
    });
  });

  return createTrack({
    name: trackConfig.name,
    clips,
    muted: false,
    soloed: false,
    volume: 1,
    pan: 0,
  });
};

export function BeatsAndBarsExample() {
  const { theme } = useDocusaurusTheme();
  const [tracks, setTracks] = useState<ClipTrack[]>([]);
  const [loadedFiles, setLoadedFiles] = useState<Map<string, AudioBuffer>>(new Map());
  const [error, setError] = useState<Error | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);

  const [scaleMode, setScaleMode] = useState<ScaleMode>('beats');
  const [bpm, setBpm] = useState(120);
  const [timeSignature, setTimeSignature] = useState<[number, number]>([4, 4]);
  const [snapTo, setSnapTo] = useState<SnapTo>('beat');

  // Load audio files PROGRESSIVELY - each file loads independently
  useEffect(() => {
    let cancelled = false;
    const audioContext = getGlobalAudioContext();

    // Load each file independently (not Promise.all)
    audioFiles.forEach(async (file) => {
      try {
        const response = await fetch(file.src);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${file.src}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        if (!cancelled) {
          // Update loaded files map for THIS file immediately
          setLoadedFiles(prev => {
            const newMap = new Map(prev);
            newMap.set(file.id, audioBuffer);
            return newMap;
          });
          setLoadedCount(prev => prev + 1);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(`Failed to load ${file.id}:`, err);
          setError(err as Error);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Build tracks progressively as files load
  useEffect(() => {
    // For each track config, check if all required files are loaded
    const newTracks: ClipTrack[] = [];

    for (const trackConfig of trackConfigs) {
      const requiredFileIds = getRequiredFileIds(trackConfig);
      const allFilesLoaded = requiredFileIds.every(id => loadedFiles.has(id));

      if (allFilesLoaded) {
        newTracks.push(createTrackFromConfig(trackConfig, loadedFiles));
      }
    }

    setTracks(newTracks);
  }, [loadedFiles]);

  const loading = loadedCount < audioFiles.length;

  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'red' }}>
        Error loading audio: {error.message}
      </div>
    );
  }

  return (
    <WaveformPlaylistProvider
      tracks={tracks}
      onTracksChange={setTracks}
      samplesPerPixel={1024}
      mono
      waveHeight={100}
      automaticScroll={true}
      controls={{ show: true, width: 200 }}
      theme={theme}
      timescale
      barWidth={4}
      barGap={0}
    >
      {scaleMode === 'beats' ? (
        <BeatsAndBarsProvider bpm={bpm} timeSignature={timeSignature} snapTo={snapTo}>
          <PlaylistWithDrag
            tracks={tracks}
            onTracksChange={setTracks}
            scaleMode={scaleMode}
            setScaleMode={setScaleMode}
            bpm={bpm}
            setBpm={setBpm}
            timeSignature={timeSignature}
            setTimeSignature={setTimeSignature}
            snapTo={snapTo}
            setSnapTo={setSnapTo}
            loading={loading}
            loadedCount={loadedCount}
            totalCount={audioFiles.length}
          />
        </BeatsAndBarsProvider>
      ) : (
        <PlaylistWithDrag
          tracks={tracks}
          onTracksChange={setTracks}
          scaleMode={scaleMode}
          setScaleMode={setScaleMode}
          bpm={bpm}
          setBpm={setBpm}
          timeSignature={timeSignature}
          setTimeSignature={setTimeSignature}
          snapTo={snapTo}
          setSnapTo={setSnapTo}
          loading={loading}
          loadedCount={loadedCount}
          totalCount={audioFiles.length}
        />
      )}
    </WaveformPlaylistProvider>
  );
}
