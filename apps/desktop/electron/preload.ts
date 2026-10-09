import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { UpdateStatus } from "./updater";

const api = {
  apiBase: "http://127.0.0.1:8765",
  platform: process.platform,
  toggleOverlay: (): Promise<boolean> => ipcRenderer.invoke("overlay:toggle"),
  setOverlayInteractive: (value: boolean): Promise<void> => ipcRenderer.invoke("overlay:interactive", value),
  shortcuts: (): Promise<Record<string, string>> => ipcRenderer.invoke("shortcuts:list"),
  openPath: (target: "logs" | "data"): Promise<string> => ipcRenderer.invoke("app:open-path", target),
  refreshMeta: (force: boolean): Promise<{ updated: number; failed: number }> => ipcRenderer.invoke("meta:refresh", force),
  onMetaProgress: (cb: (p: { done: number; total: number; current?: string; finished?: boolean }) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, p: { done: number; total: number; current?: string; finished?: boolean }) => cb(p);
    ipcRenderer.on("meta:progress", listener);
    return () => ipcRenderer.removeListener("meta:progress", listener);
  },
  prefs: {
    get: (): Promise<unknown> => ipcRenderer.invoke("prefs:get"),
    set: (next: unknown): Promise<unknown> => ipcRenderer.invoke("prefs:set", next),
    displays: (): Promise<unknown> => ipcRenderer.invoke("displays:list"),
    say: (text: string): Promise<void> => ipcRenderer.invoke("overlay:say", text),
  },
  showGameWindow: (): Promise<boolean> => ipcRenderer.invoke("game:show"),
  onSay: (cb: (text: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, text: string) => cb(text);
    ipcRenderer.on("overlay:say", listener);
    return () => ipcRenderer.removeListener("overlay:say", listener);
  },
  onPrefs: (cb: (p: unknown) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, p: unknown) => cb(p);
    ipcRenderer.on("overlay:prefs", listener);
    return () => ipcRenderer.removeListener("overlay:prefs", listener);
  },
  screen: {
    status: (): Promise<unknown> => ipcRenderer.invoke("screen:status"),
    save: (cfg: unknown): Promise<unknown> => ipcRenderer.invoke("screen:save", cfg),
    capture: (fresh: boolean): Promise<unknown> => ipcRenderer.invoke("screen:capture", fresh),
    test: (regions: unknown): Promise<unknown> => ipcRenderer.invoke("screen:test", regions),
  },
  voices: {
    profiles: (): Promise<string[]> => ipcRenderer.invoke("voices:profiles"),
    create: (name: string): Promise<string> => ipcRenderer.invoke("voices:create", name),
    rename: (from: string, to: string): Promise<string> => ipcRenderer.invoke("voices:rename", from, to),
    remove: (name: string): Promise<void> => ipcRenderer.invoke("voices:remove", name),
    clips: (profile: string): Promise<unknown> => ipcRenderer.invoke("voices:clips", profile),
    save: (profile: string, key: string, data: Uint8Array, ext: string): Promise<unknown> =>
      ipcRenderer.invoke("voices:save", profile, key, data, ext),
    deleteClip: (profile: string, key: string): Promise<void> => ipcRenderer.invoke("voices:delete-clip", profile, key),
    read: (profile: string, key: string): Promise<unknown> => ipcRenderer.invoke("voices:read", profile, key),
    import: (profile: string, keys: string[]): Promise<unknown> => ipcRenderer.invoke("voices:import", profile, keys),
    assign: (profile: string, key: string, file: string): Promise<void> => ipcRenderer.invoke("voices:assign", profile, key, file),
    openFolder: (profile: string): Promise<string> => ipcRenderer.invoke("voices:open", profile),
    // un clip a changé (fenêtre de réglages) : le guide vocal vide son cache
    onChanged: (cb: (profile: string) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, profile: string) => cb(profile);
      ipcRenderer.on("voices:changed", listener);
      return () => ipcRenderer.removeListener("voices:changed", listener);
    },
  },
  version: (): Promise<string> => ipcRenderer.invoke("app:version"),
  updater: {
    status: (): Promise<UpdateStatus> => ipcRenderer.invoke("updater:status"),
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke("updater:check"),
    download: (): Promise<void> => ipcRenderer.invoke("updater:download"),
    install: (): Promise<void> => ipcRenderer.invoke("updater:install"),
    onStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, s: UpdateStatus) => cb(s);
      ipcRenderer.on("updater:status", listener);
      return () => ipcRenderer.removeListener("updater:status", listener);
    },
  },
  onOverlayMode: (cb: (mode: { interactive: boolean }) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, mode: { interactive: boolean }) => cb(mode);
    ipcRenderer.on("overlay:mode", listener);
    return () => ipcRenderer.removeListener("overlay:mode", listener);
  },
};

contextBridge.exposeInMainWorld("hots", api);
export type HotsBridge = typeof api;
