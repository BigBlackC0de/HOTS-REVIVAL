/**
 * Lancement du backend FastAPI local (sidecar).
 * - Production : exécutable PyInstaller embarqué dans resources/backend.
 * - Développement : `python -m uvicorn` si HOTS_SPAWN_BACKEND=1 (sinon lancé à la main).
 */
import { ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export const BACKEND_PORT = 8765;
export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

let child: ChildProcess | null = null;

export function startBackend(): void {
  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, "backend", process.platform === "win32" ? "hots-backend.exe" : "hots-backend");
    if (!fs.existsSync(exe)) {
      console.error("[backend] exécutable introuvable :", exe);
      return;
    }
    child = spawn(exe, ["--port", String(BACKEND_PORT)], { stdio: "inherit", windowsHide: true });
  } else if (process.env.HOTS_SPAWN_BACKEND === "1") {
    const cwd = path.resolve(__dirname, "..", "..", "..", "backend");
    const python = process.env.HOTS_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
    child = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(BACKEND_PORT)], {
      cwd,
      stdio: "inherit",
      windowsHide: true,
    });
  }
  child?.on("exit", (code) => {
    console.log(`[backend] arrêté (code ${code})`);
    child = null;
  });
}

export function stopBackend(): void {
  child?.kill();
  child = null;
}
