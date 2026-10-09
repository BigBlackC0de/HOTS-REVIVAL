/**
 * Raccourcis globaux. Ils ne pilotent QUE l'overlay HOTS REVIVAL :
 * aucune touche n'est envoyée au jeu (pas de macro, pas d'automatisation).
 */
import { globalShortcut } from "electron";
import { BACKEND_URL } from "./backend";
import { toggleInteractive, toggleOverlay } from "./overlay";

async function post(path: string, body: unknown = {}): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/live/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn("[shortcut] backend indisponible", err);
  }
}

export const SHORTCUTS: Record<string, { label: string; run: () => void }> = {
  "CommandOrControl+Shift+O": { label: "Afficher / masquer l'overlay", run: () => toggleOverlay() },
  "CommandOrControl+Shift+I": { label: "Overlay interactif (clics)", run: () => toggleInteractive() },
  "CommandOrControl+Shift+S": { label: "Synchroniser l'horloge sur 0:00", run: () => post("sync", { clock_s: 0 }) },
  "CommandOrControl+Shift+PageUp": { label: "Niveau allié +1", run: () => post("levels", { ally_delta: 1 }) },
  "CommandOrControl+Shift+PageDown": { label: "Niveau adverse +1", run: () => post("levels", { enemy_delta: 1 }) },
  "CommandOrControl+Shift+J": { label: "Objectif terminé", run: () => post("objective-done") },
};

export function registerShortcuts(): void {
  for (const [accelerator, { run }] of Object.entries(SHORTCUTS)) {
    if (!globalShortcut.register(accelerator, run)) console.warn("[shortcut] indisponible :", accelerator);
  }
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll();
}
