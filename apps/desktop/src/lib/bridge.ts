export interface UpdateStatus {
  state: "idle" | "checking" | "available" | "none" | "downloading" | "ready" | "error";
  current: string;
  version?: string;
  percent?: number;
  message?: string;
}

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
