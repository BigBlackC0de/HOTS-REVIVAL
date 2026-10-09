/**
 * Flux de capture de l'écran du jeu (fenêtre invisible + capturePreload).
 * Démarré seulement pendant une partie, arrêté dès qu'elle se termine.
 */
import { app, BrowserWindow, desktopCapturer, Display, ipcMain, screen } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { Rect } from "./ocr";
import { loadPrefs } from "./prefs";

export interface Crop { width: number; height: number; data: Buffer } // pixels BGRA
export interface Grab { black: boolean; width: number; height: number; crops: Crop[] }

const FPS = 2;
let win: BrowserWindow | null = null;
let displayId: number | null = null;
let seq = 0;
const pending = new Map<number, (g: Grab | null) => void>();
let started: ((ok: boolean) => void) | null = null;
let lastError: string | null = null;

ipcMain.on("capture:frame", (_e, msg: { id: number; ok: boolean; black?: boolean; width?: number; height?: number; crops?: { width: number; height: number; data: Uint8Array }[]; error?: string }) => {
  const resolve = pending.get(msg.id);
  if (!resolve) return;
  pending.delete(msg.id);
  if (!msg.ok || !msg.crops) {
    lastError = msg.error ?? lastError;
    resolve(null);
    return;
  }
  resolve({
    black: Boolean(msg.black), width: msg.width ?? 0, height: msg.height ?? 0,
    crops: msg.crops.map((c) => ({ width: c.width, height: c.height, data: toBgra(Buffer.from(c.data.buffer, c.data.byteOffset, c.data.byteLength)) })),
  });
});

/** Le canvas renvoie du RGBA ; tout le reste (NativeImage, ocr.ts) attend du BGRA comme toBitmap(). */
function toBgra(rgba: Buffer): Buffer {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    rgba[i] = rgba[i + 2];
    rgba[i + 2] = r;
  }
  return rgba;
}

ipcMain.on("capture:started", (_e, msg: { ok: boolean; error?: string }) => {
  if (!msg.ok) lastError = msg.error ?? "capture refusée";
  started?.(msg.ok);
  started = null;
});

/** Écran du jeu : le principal, sauf si l'application est affichée dessus et qu'il y en a un autre. */
export function gameDisplay(): Display {
  const primary = screen.getPrimaryDisplay();
  const appDisplay = loadPrefs().gameDisplayId;
  if (appDisplay === primary.id) return screen.getAllDisplays().find((d) => d.id !== primary.id) ?? primary;
  return primary;
}

function pagePath(): string {
  const file = path.join(app.getPath("userData"), "capture.html");
  if (!fs.existsSync(file)) fs.writeFileSync(file, "<!doctype html><meta charset=utf-8><title>capture</title>");
  return file;
}

export function captureRunning(): boolean {
  return win !== null && !win.isDestroyed() && displayId !== null;
}

export function captureError(): string | null {
  return lastError;
}

export async function startCapture(): Promise<boolean> {
  const display = gameDisplay();
  if (captureRunning() && displayId === display.id) return true;
  stopCapture();
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } });
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!source) {
    lastError = "aucun écran trouvé";
    return false;
  }
  win = new BrowserWindow({
    show: false, width: 200, height: 100, skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "capturePreload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.on("closed", () => {
    win = null;
    displayId = null;
  });
  await win.loadFile(pagePath());
  const ok = await new Promise<boolean>((resolve) => {
    started = resolve;
    win!.webContents.send("capture:start", {
      sourceId: source.id,
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
      fps: FPS,
    });
    setTimeout(() => { if (started === resolve) { started = null; resolve(false); } }, 5000);
  });
  if (!ok) {
    stopCapture();
    return false;
  }
  displayId = display.id;
  lastError = null;
  return true;
}

export function stopCapture(): void {
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
  displayId = null;
  for (const resolve of pending.values()) resolve(null);
  pending.clear();
}

/** Extrait des zones (fractions de l'écran) agrandies `scale` fois. */
export function grab(rects: Rect[], scale = 3): Promise<Grab | null> {
  if (!captureRunning()) return Promise.resolve(null);
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    win!.webContents.send("capture:grab", { id, rects, scale });
    setTimeout(() => {
      if (pending.delete(id)) resolve(null);
    }, 3000);
  });
}
