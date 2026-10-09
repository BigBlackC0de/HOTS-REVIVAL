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
export interface ScreenConfig { enabled: boolean; regions: Regions; regionsSource?: "défaut" | "auto" | "manuel" }
export type ReaderState = "off" | "idle" | "starting" | "searching" | "partial" | "ok" | "black" | "error";
export interface ScreenStatus { config: ScreenConfig; last: ScreenReading | null; state: ReaderState; lastOkAt: number | null; error: string | null }

export interface OverlayPrefs {
  voice: boolean;
  tips: boolean;
  voiceName: string | null;
  rate: number;
  volume: number;
  overlay: boolean;
  displayId: number | null;
  gameDisplayId: number | null;
  voiceProfile: string | null;
  micDeviceId: string | null;
}

export interface VoiceClip { key: string; ext: string; size: number; mtime: number }
export interface VoiceImportResult { imported: string[]; unmatched: { path: string; name: string }[] }

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
  prefs: {
    get: () => Promise<OverlayPrefs>;
    set: (next: Partial<OverlayPrefs>) => Promise<OverlayPrefs>;
    displays: () => Promise<{ id: number; label: string }[]>;
    say: (text: string) => Promise<void>;
  };
  showGameWindow: () => Promise<boolean>;
  onSay: (cb: (text: string) => void) => () => void;
  onPrefs: (cb: (p: OverlayPrefs) => void) => () => void;
  screen: {
    status: () => Promise<ScreenStatus>;
    save: (cfg: Partial<ScreenConfig>) => Promise<ScreenConfig>;
    capture: (fresh: boolean) => Promise<{ image: string; reading: ScreenReading } | null>;
    test: (regions: Regions) => Promise<ScreenReading | null>;
  };
  voices: {
    profiles: () => Promise<string[]>;
    create: (name: string) => Promise<string>;
    rename: (from: string, to: string) => Promise<string>;
    remove: (name: string) => Promise<void>;
    clips: (profile: string) => Promise<VoiceClip[]>;
    save: (profile: string, key: string, data: Uint8Array, ext: string) => Promise<VoiceClip>;
    deleteClip: (profile: string, key: string) => Promise<void>;
    read: (profile: string, key: string) => Promise<{ data: Uint8Array; mime: string } | null>;
    import: (profile: string, keys: string[]) => Promise<VoiceImportResult>;
    assign: (profile: string, key: string, file: string) => Promise<void>;
    openFolder: (profile: string) => Promise<string>;
    onChanged: (cb: (profile: string) => void) => () => void;
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
