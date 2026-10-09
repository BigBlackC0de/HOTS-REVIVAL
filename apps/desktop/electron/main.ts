import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import * as Sentry from "@sentry/electron/main";
import path from "node:path";
import { backendLogPath, ensureBackend, stopBackend } from "./backend";
import { onMetaProgress, refreshMeta, scheduleMetaRefresh } from "./meta";
import { checkForUpdates, downloadUpdate, getUpdateStatus, initUpdater, installUpdate } from "./updater";
import { createOverlay, setInteractive, toggleOverlay } from "./overlay";
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
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH)}`);
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
    mainWindow = createMainWindow();
    mainWindow.on("closed", () => app.quit());

    ipcMain.handle("overlay:toggle", () => toggleOverlay());
    ipcMain.handle("overlay:interactive", (_e, value: boolean) => setInteractive(Boolean(value)));
    ipcMain.handle("shortcuts:list", () =>
      Object.fromEntries(Object.entries(SHORTCUTS).map(([k, v]) => [k, v.label])),
    );
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
    createOverlay(loadRoute);
    registerShortcuts();
    onMetaProgress((p) => mainWindow?.webContents.send("meta:progress", p));
    scheduleMetaRefresh();
    if (mainWindow) initUpdater(mainWindow);
  });

  app.on("before-quit", () => {
    stopBackend(); // libère l'exécutable du moteur avant une mise à jour
  });

  app.on("will-quit", () => {
    unregisterShortcuts();
    stopBackend();
  });

  app.on("window-all-closed", () => app.quit());
}
