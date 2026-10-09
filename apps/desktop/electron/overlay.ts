/**
 * Fenêtre overlay : transparente, toujours au premier plan, traversable par la souris.
 * Elle n'interagit jamais avec le processus du jeu : c'est une fenêtre Electron
 * indépendante affichée par-dessus (le jeu doit être en « Plein écran fenêtré »).
 */
import { BrowserWindow, screen } from "electron";
import path from "node:path";

let overlay: BrowserWindow | null = null;
let interactive = false;

export function createOverlay(loadRoute: (win: BrowserWindow, route: string) => void): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 360;
  overlay = new BrowserWindow({
    width,
    height: 560,
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + 96,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setInteractive(false);
  loadRoute(overlay, "/overlay");
  overlay.on("closed", () => (overlay = null));
  return overlay;
}

export function toggleOverlay(): boolean {
  if (!overlay) return false;
  if (overlay.isVisible()) overlay.hide();
  else overlay.showInactive();
  return overlay.isVisible();
}

/** Mode interactif : l'overlay accepte les clics (saisie carte, niveaux, camps). */
export function setInteractive(value: boolean): void {
  if (!overlay) return;
  interactive = value;
  overlay.setIgnoreMouseEvents(!value, { forward: true });
  overlay.setFocusable(value);
  if (value) overlay.focus();
  overlay.webContents.send("overlay:mode", { interactive: value });
}

export function toggleInteractive(): void {
  setInteractive(!interactive);
}
