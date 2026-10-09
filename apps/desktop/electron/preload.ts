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
