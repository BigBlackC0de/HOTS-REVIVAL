import { app, BrowserWindow, dialog, ipcMain, screen, shell } from "electron";
import * as Sentry from "@sentry/electron/main";
import path from "node:path";
import { backendLogPath, ensureBackend, stopBackend } from "./backend";
import { onMetaProgress, refreshMeta, scheduleMetaRefresh } from "./meta";
import {
  calibrationCapture, saveConfig, screenReaderStatus, startScreenReader, stopScreenReader, testRegions,
} from "./screenReader";
import type { Regions } from "./ocr";
import { checkForUpdates, downloadUpdate, getUpdateStatus, initUpdater, installUpdate } from "./updater";
import { createOverlay, placeOverlay, say, sendPrefs, setInteractive, toggleOverlay } from "./overlay";
import { loadPrefs, savePrefs, type OverlayPrefs } from "./prefs";
import { registerShortcuts, SHORTCUTS, unregisterShortcuts } from "./shortcuts";

if (process.env.HOTS_SENTRY_DSN) Sentry.init({ dsn: process.env.HOTS_SENTRY_DSN });

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
let mainWindow: BrowserWindow | null = null;

const SPLASH = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;
align-items:center;justify-content:center;background:#0b0d1a;color:#cbd5e1;font-family:Segoe UI,sans-serif">
<div style="font:700 42px Georgia,serif;letter-spacing:2px;color:#f5c451">HOTS <span style="color:#46a8ff">REVIVAL</span></div>
<div style="margin-top:12px;font-size:14px;opacity:.8">Démarrage de votre coach…</div></body></html>`;

function loadRoute(win: BrowserWindow, route: string): void {
  if (DEV_URL) void win.loadURL(`${DEV_URL}#${route}`);
  else void win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: route });
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0b0d1a",
    title: "HOTS REVIVAL",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // le guide vocal doit parler même quand le jeu est au premier plan
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH)}`);
  win.webContents.on("did-finish-load", () => win.webContents.send("overlay:prefs", loadPrefs()));
  return win;
}

// Une seule instance : un double-clic sur le raccourci ramène la fenêtre existante.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (process.env.HOTS_OCR_SELFTEST) {
      // Auto-test de l'OCR empaqueté : lit une image entière comme horloge.
      const { nativeImage } = await import("electron");
      const { readImage } = await import("./screenReader");
      const full = { x: 0, y: 0, w: 1, h: 1 };
      try {
        const r = await readImage(nativeImage.createFromPath(process.env.HOTS_OCR_SELFTEST), { clock: full, ally: full, enemy: full });
        console.log("OCR_SELFTEST", JSON.stringify(r));
      } catch (err) {
        console.log("OCR_SELFTEST_ERROR", err);
      }
      app.exit(0);
      return;
    }
    mainWindow = createMainWindow();
    mainWindow.on("closed", () => app.quit());

    ipcMain.handle("overlay:toggle", () => toggleOverlay());
    ipcMain.handle("overlay:interactive", (_e, value: boolean) => setInteractive(Boolean(value)));
    ipcMain.handle("shortcuts:list", () =>
      Object.fromEntries(Object.entries(SHORTCUTS).map(([k, v]) => [k, v.label])),
    );
    ipcMain.handle("prefs:get", () => loadPrefs());
    // Mode partie : affiche la fenêtre sur l'écran choisi (ex. second écran) SANS lui donner
    // le focus — en plein écran exclusif, prendre le focus réduirait le jeu.
    ipcMain.handle("game:show", () => {
      const id = loadPrefs().gameDisplayId;
      const display = screen.getAllDisplays().find((d) => d.id === id);
      if (!mainWindow || !display) return false;
      if (mainWindow.isMinimized()) mainWindow.showInactive();
      const current = screen.getDisplayMatching(mainWindow.getBounds());
      if (current.id !== display.id) {
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        mainWindow.setBounds(display.workArea);
      }
      return true;
    });
    ipcMain.handle("prefs:set", (_e, next: Partial<OverlayPrefs>) => {
      const p = savePrefs(next);
      placeOverlay();
      sendPrefs();
      return p;
    });
    ipcMain.handle("displays:list", () =>
      screen.getAllDisplays().map((d, i) => ({
        id: d.id, label: `Écran ${i + 1} (${d.size.width}×${d.size.height})${d.id === screen.getPrimaryDisplay().id ? " – principal" : ""}`,
      })),
    );
    ipcMain.handle("overlay:say", (_e, text: string) => say(String(text)));
    ipcMain.handle("screen:status", () => screenReaderStatus());
    ipcMain.handle("screen:save", (_e, cfg: { enabled?: boolean; regions?: Regions }) => saveConfig(cfg));
    ipcMain.handle("screen:capture", (_e, fresh: boolean) => calibrationCapture(fresh !== false));
    ipcMain.handle("screen:test", (_e, regions: Regions) => testRegions(regions));
    ipcMain.handle("app:version", () => app.getVersion());
    ipcMain.handle("updater:status", () => getUpdateStatus());
    ipcMain.handle("updater:check", () => checkForUpdates());
    ipcMain.handle("updater:download", () => downloadUpdate());
    ipcMain.handle("updater:install", () => installUpdate());
    ipcMain.handle("meta:refresh", (_e, force: boolean) => refreshMeta(Boolean(force)));
    ipcMain.handle("app:open-path", (_e, target: "logs" | "data") =>
      shell.openPath(target === "logs" ? backendLogPath() : app.getPath("userData")),
    );

    const ok = await ensureBackend();
    if (!ok) {
      await dialog.showMessageBox({
        type: "error",
        title: "HOTS REVIVAL",
        message: "Le moteur d'analyse n'a pas pu démarrer.",
        detail: `Journal : ${backendLogPath()}\nVérifiez qu'aucun antivirus ne bloque l'application, puis relancez-la.`,
      });
    }
    if (mainWindow) loadRoute(mainWindow, "/");
    loadPrefs();
    createOverlay(loadRoute);
    registerShortcuts();
    onMetaProgress((p) => mainWindow?.webContents.send("meta:progress", p));
    scheduleMetaRefresh();
    if (mainWindow) initUpdater(mainWindow);
    startScreenReader();
  });

  app.on("before-quit", () => {
    stopBackend(); // libère l'exécutable du moteur avant une mise à jour
  });

  app.on("will-quit", () => {
    stopScreenReader();
    unregisterShortcuts();
    stopBackend();
  });

  app.on("window-all-closed", () => app.quit());
}
