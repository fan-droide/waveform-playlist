// Computation
export {
  computeSpectrogram,
  computeSpectrogramMono,
  getColorMap,
  getFrequencyScale,
} from './computation';
export type { FrequencyScaleName } from './computation';

// Components
export { SpectrogramMenuItems } from './components';
export type { SpectrogramMenuItemsProps } from './components';
export { SpectrogramSettingsModal } from './components';
export type { SpectrogramSettingsModalProps } from './components';
export type { TrackMenuItem } from './components';

// Worker
export { createSpectrogramWorker } from './worker';
export type { SpectrogramWorkerApi } from './worker';

// Provider
export { SpectrogramProvider } from './SpectrogramProvider';
export type { SpectrogramProviderProps } from './SpectrogramProvider';
