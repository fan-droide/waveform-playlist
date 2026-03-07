import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { useTheme } from 'styled-components';
import { TimeScale } from '../components/TimeScale';
import type { PrecomputedTickData } from '../components/TimeScale';
import { PlaylistInfoContext } from '../contexts/PlaylistInfo';
import { DevicePixelRatioProvider } from '../contexts/DevicePixelRatio';
import type { WaveformPlaylistTheme } from '../wfpl-theme';
import { secondsToPixels } from '../utils/conversions';

const playlistInfo = {
  sampleRate: 48000,
  samplesPerPixel: 1000,
  zoomLevels: [1000, 1500, 2000, 2500],
  waveHeight: 80,
  timeScaleHeight: 20,
  duration: 60000,
  controls: {
    show: false,
    width: 150,
  },
};

const playlistInfoWithControls = {
  ...playlistInfo,
  controls: {
    show: true,
    width: 150,
  },
};

/**
 * Build tick data for temporal mode stories.
 * Mirrors the logic in SmartScale's temporal path.
 */
function buildTemporalTickData(
  duration: number,
  marker: number,
  bigStep: number,
  smallStep: number,
  sampleRate = playlistInfo.sampleRate,
  samplesPerPixel = playlistInfo.samplesPerPixel,
  timeScaleHeight = playlistInfo.timeScaleHeight
): PrecomputedTickData {
  const widthX = secondsToPixels(duration / 1000, samplesPerPixel, sampleRate);
  const pixPerSec = sampleRate / samplesPerPixel;
  const canvasInfo = new Map<number, number>();
  const timeMarkersWithPositions: Array<{ pix: number; element: React.ReactNode }> = [];

  let counter = 0;
  for (let i = 0; i < widthX; i += (pixPerSec * smallStep) / 1000) {
    const pix = Math.floor(i);

    if (counter % marker === 0) {
      const seconds = Math.floor(counter / 1000);
      const s = seconds % 60;
      const m = (seconds - s) / 60;
      const timestamp = `${m}:${String(s).padStart(2, '0')}`;

      timeMarkersWithPositions.push({
        pix,
        element: (
          <div
            key={`ts-${counter}`}
            style={{
              position: 'absolute',
              left: `${pix + 4}px`,
              fontSize: '0.75rem',
              whiteSpace: 'nowrap',
            }}
          >
            {timestamp}
          </div>
        ),
      });
      canvasInfo.set(pix, timeScaleHeight);
    } else if (counter % bigStep === 0) {
      canvasInfo.set(pix, Math.floor(timeScaleHeight / 2));
    } else if (counter % smallStep === 0) {
      canvasInfo.set(pix, Math.floor(timeScaleHeight / 5));
    }

    counter += smallStep;
  }

  return { widthX, canvasInfo, timeMarkersWithPositions };
}

// Wrapper component that gets theme from context and passes it as prop
const TimeScaleWithTheme = (props: Omit<React.ComponentProps<typeof TimeScale>, 'theme'>) => {
  const theme = useTheme() as WaveformPlaylistTheme;
  return <TimeScale {...props} theme={theme} />;
};

const meta: Meta<typeof TimeScaleWithTheme> = {
  title: 'Components/TimeScale',
  component: TimeScaleWithTheme,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story, context) => {
      const theme =
        context.globals.theme === 'dark'
          ? { backgroundColor: '#1e1e1e' }
          : { backgroundColor: '#f5f5f5' };
      return (
        <DevicePixelRatioProvider>
          <PlaylistInfoContext.Provider value={playlistInfo}>
            <div style={{ background: theme.backgroundColor, padding: '1rem' }}>
              <Story />
            </div>
          </PlaylistInfoContext.Provider>
        </DevicePixelRatioProvider>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof TimeScaleWithTheme>;

export const Default: Story = {
  args: {
    tickData: buildTemporalTickData(60000, 10000, 5000, 1000),
  },
};

export const ShortDuration: Story = {
  args: {
    tickData: buildTemporalTickData(15000, 5000, 1000, 500),
  },
};

export const LongDuration: Story = {
  args: {
    tickData: buildTemporalTickData(180000, 30000, 10000, 5000),
  },
};

export const FineTicks: Story = {
  args: {
    tickData: buildTemporalTickData(30000, 5000, 1000, 200),
  },
};

export const WithControlsOffset: Story = {
  args: {
    tickData: buildTemporalTickData(60000, 10000, 5000, 1000),
  },
  decorators: [
    (Story, context) => {
      const theme =
        context.globals.theme === 'dark'
          ? { backgroundColor: '#1e1e1e' }
          : { backgroundColor: '#f5f5f5' };
      return (
        <DevicePixelRatioProvider>
          <PlaylistInfoContext.Provider value={playlistInfoWithControls}>
            <div style={{ background: theme.backgroundColor, padding: '1rem' }}>
              <Story />
            </div>
          </PlaylistInfoContext.Provider>
        </DevicePixelRatioProvider>
      );
    },
  ],
};

export const CustomTimestampRenderer: Story = {
  args: {
    tickData: (() => {
      const data = buildTemporalTickData(60000, 10000, 5000, 1000);
      // Replace markers with custom-styled timestamps
      data.timeMarkersWithPositions = data.timeMarkersWithPositions.map(({ pix }, idx) => ({
        pix,
        element: (
          <div
            key={`custom-${idx}`}
            style={{
              position: 'absolute',
              left: `${pix + 4}px`,
              fontSize: '0.7rem',
              color: '#0066cc',
              fontWeight: 'bold',
            }}
          >
            {Math.floor((idx * 10000) / 1000)}s
          </div>
        ),
      }));
      return data;
    })(),
  },
};
