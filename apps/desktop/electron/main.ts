import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as Sentry from "@sentry/electron/main";
import path from "node:path";
import { startBackend, stopBackend } from "./backend";
import { createOverlay, setInteractive, toggleOverlay } from "./overlay";
import { registerShortcuts, SHORTCUTS, unregisterShortcuts } from "./shortcuts";

if (process.env.HOTS_SENTRY_DSN) Sentry.init({ dsn: process.env.HOTS_SENTRY_DSN });

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

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
  loadRoute(win, "/");
  return win;
}

app.whenReady().then(() => {
  startBackend();
  const main = createMainWindow();
  createOverlay(loadRoute);
  registerShortcuts();

  ipcMain.handle("overlay:toggle", () => toggleOverlay());
  ipcMain.handle("overlay:interactive", (_e, value: boolean) => setInteractive(Boolean(value)));
  ipcMain.handle("shortcuts:list", () =>
    Object.fromEntries(Object.entries(SHORTCUTS).map(([k, v]) => [k, v.label])),
  );

  main.on("closed", () => app.quit());
});

app.on("will-quit", () => {
  unregisterShortcuts();
  stopBackend();
});

app.on("window-all-closed", () => app.quit());
