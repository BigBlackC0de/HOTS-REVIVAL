/** Préférences de l'overlay (voix, écran d'affichage), stockées dans le dossier utilisateur. */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface OverlayPrefs {
  voice: boolean; // alertes lues à voix haute (fonctionne même en plein écran exclusif)
  displayId: number | null; // écran de l'overlay (null = écran principal)
}

let prefs: OverlayPrefs = { voice: true, displayId: null };
const file = () => path.join(app.getPath("userData"), "overlay-prefs.json");

export function loadPrefs(): OverlayPrefs {
  try {
    prefs = { ...prefs, ...JSON.parse(fs.readFileSync(file(), "utf-8")) };
  } catch {
    /* valeurs par défaut */
  }
  return prefs;
}

export function savePrefs(next: Partial<OverlayPrefs>): OverlayPrefs {
  prefs = { ...prefs, ...next };
  fs.writeFileSync(file(), JSON.stringify(prefs, null, 2));
  return prefs;
}

export const getPrefs = (): OverlayPrefs => prefs;
