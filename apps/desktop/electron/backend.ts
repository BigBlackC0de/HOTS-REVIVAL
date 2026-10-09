/**
 * Backend FastAPI local (sidecar), lancé automatiquement : l'utilisateur n'exécute aucune commande.
 * - Application installée : exécutable PyInstaller embarqué dans resources/backend.
 * - Développement : `python -m uvicorn` si HOTS_SPAWN_BACKEND=1 (sinon lancé à la main).
 */
import { ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export const BACKEND_PORT = 8765;
export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

let child: ChildProcess | null = null;

export async function isBackendUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export function backendPid(): number | undefined {
  return child?.pid;
}

export function backendLogPath(): string {
  return path.join(app.getPath("userData"), "backend.log");
}

export function startBackend(): void {
  const env = { ...process.env, HOTS_DATA_DIR: app.getPath("userData") };
  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, "backend", process.platform === "win32" ? "hots-backend.exe" : "hots-backend");
    if (!fs.existsSync(exe)) {
      console.error("[backend] exécutable introuvable :", exe);
      return;
    }
    child = spawn(exe, ["--port", String(BACKEND_PORT)], { env, windowsHide: true, stdio: "ignore" });
  } else if (process.env.HOTS_SPAWN_BACKEND === "1") {
    const cwd = path.resolve(__dirname, "..", "..", "..", "backend");
    const python = process.env.HOTS_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
    child = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(BACKEND_PORT)], {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
  }
  child?.on("exit", (code) => {
    console.log(`[backend] arrêté (code ${code})`);
    child = null;
  });
}

/** Démarre le backend s'il ne tourne pas déjà, puis attend qu'il réponde. */
export async function ensureBackend(timeoutMs = 45_000): Promise<boolean> {
  if (await isBackendUp()) return true;
  startBackend();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isBackendUp()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export function stopBackend(): void {
  child?.kill();
  child = null;
}
