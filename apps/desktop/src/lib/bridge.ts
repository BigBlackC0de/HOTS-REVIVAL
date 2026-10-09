export interface UpdateStatus {
  state: "idle" | "checking" | "available" | "none" | "downloading" | "ready" | "error";
  current: string;
  version?: string;
  percent?: number;
  message?: string;
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface Regions { clock: Rect; ally: Rect; enemy: Rect }
export interface ScreenReading { clock: number | null; ally: number | null; enemy: number | null; at: number }
export interface ScreenConfig { enabled: boolean; regions: Regions }

/** Pont Electron (preload). Absent quand l'UI tourne dans un navigateur (npm run dev:web). */
export interface HotsBridge {
  apiBase: string;
  platform: string;
  toggleOverlay: () => Promise<boolean>;
  setOverlayInteractive: (value: boolean) => Promise<void>;
  shortcuts: () => Promise<Record<string, string>>;
  openPath: (target: "logs" | "data") => Promise<string>;
  refreshMeta: (force: boolean) => Promise<{ updated: number; failed: number }>;
  onMetaProgress: (cb: (p: { done: number; total: number; current?: string; finished?: boolean }) => void) => () => void;
  screen: {
    status: () => Promise<{ config: ScreenConfig; last: ScreenReading | null }>;
    save: (cfg: Partial<ScreenConfig>) => Promise<ScreenConfig>;
    capture: (fresh: boolean) => Promise<{ image: string; reading: ScreenReading } | null>;
    test: (regions: Regions) => Promise<ScreenReading | null>;
  };
  version: () => Promise<string>;
  updater: {
    status: () => Promise<UpdateStatus>;
    check: () => Promise<UpdateStatus>;
    download: () => Promise<void>;
    install: () => Promise<void>;
    onStatus: (cb: (s: UpdateStatus) => void) => () => void;
  };
  onOverlayMode: (cb: (mode: { interactive: boolean }) => void) => () => void;
}

declare global {
  interface Window {
    hots?: HotsBridge;
  }
}

export const bridge = (): HotsBridge | undefined => window.hots;
