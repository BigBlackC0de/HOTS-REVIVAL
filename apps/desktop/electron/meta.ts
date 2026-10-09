/**
 * Mise à jour automatique de la méta (Icy Veins) via un navigateur intégré invisible :
 * tier lists (quotidien) et guides de héros (hebdomadaire). Les pages sont analysées
 * par le moteur local. Jamais pendant une partie, une page à la fois.
 */
import { BrowserWindow } from "electron";
import { BACKEND_URL } from "./backend";

interface PendingPage { kind: "tierlist" | "guide"; key: string; url: string }

let running = false;
let progressListener: ((p: { done: number; total: number; current?: string; finished?: boolean }) => void) | null = null;

export function onMetaProgress(cb: typeof progressListener): void {
  progressListener = cb;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function gameInProgress(): Promise<boolean> {
  try {
    const s = await json<{ status: string; game_running: boolean }>("/api/live/state");
    return s.status === "loading" || s.status === "in_game";
  } catch {
    return false;
  }
}

async function loadHtml(win: BrowserWindow, url: string): Promise<string | null> {
  try {
    await win.loadURL(url);
  } catch {
    /* les erreurs de sous-ressources ne sont pas bloquantes */
  }
  // Protection anti-robots : la page de vérification se résout seule en quelques secondes.
  for (let i = 0; i < 20; i++) {
    const title = await win.webContents.executeJavaScript("document.title").catch(() => "");
    if (!/just a moment|un instant|attention required/i.test(String(title))) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const html = await win.webContents.executeJavaScript("document.documentElement.outerHTML").catch(() => null);
  return typeof html === "string" ? html : null;
}

export async function refreshMeta(force = false): Promise<{ updated: number; failed: number }> {
  if (running) return { updated: 0, failed: 0 };
  running = true;
  let updated = 0;
  let failed = 0;
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: true } });
  try {
    const pages = await json<PendingPage[]>(`/api/meta/pending${force ? "?force=true" : ""}`);
    for (const [i, page] of pages.entries()) {
      if (await gameInProgress()) break;
      progressListener?.({ done: i, total: pages.length, current: page.key });
      const html = await loadHtml(win, page.url);
      if (html) {
        const r = await json<{ ok: boolean }>("/api/meta/ingest", {
          method: "POST",
          body: JSON.stringify({ ...page, html }),
        }).catch(() => ({ ok: false }));
        if (r.ok) updated++;
        else failed++;
      } else failed++;
      await new Promise((r) => setTimeout(r, 1500));
    }
    progressListener?.({ done: pages.length, total: pages.length, finished: true });
  } catch (err) {
    console.warn("[meta] mise à jour impossible", err);
  } finally {
    win.destroy();
    running = false;
  }
  return { updated, failed };
}

export function scheduleMetaRefresh(): void {
  setTimeout(() => void refreshMeta(), 20_000);
  setInterval(() => void refreshMeta(), 6 * 60 * 60 * 1000);
}
