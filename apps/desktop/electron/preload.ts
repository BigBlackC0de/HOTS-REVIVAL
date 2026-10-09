import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

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
  onOverlayMode: (cb: (mode: { interactive: boolean }) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, mode: { interactive: boolean }) => cb(mode);
    ipcRenderer.on("overlay:mode", listener);
    return () => ipcRenderer.removeListener("overlay:mode", listener);
  },
};

contextBridge.exposeInMainWorld("hots", api);
export type HotsBridge = typeof api;
