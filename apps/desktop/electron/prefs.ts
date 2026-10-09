/** Préférences de l'overlay (voix, écran d'affichage), stockées dans le dossier utilisateur. */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface OverlayPrefs {
  voice: boolean; // guide vocal (fonctionne même en plein écran exclusif)
  tips: boolean; // lire aussi les conseils (« Restez groupés »…)
  voiceName: string | null; // voix Windows choisie (null = première voix française)
  rate: number;
  volume: number;
  overlay: boolean; // fenêtre overlay par-dessus le jeu (désactivée par défaut)
  displayId: number | null; // écran de l'overlay (null = écran principal)
  gameDisplayId: number | null; // écran où afficher le mode partie (null = ne pas déplacer)
  voiceProfile: string | null; // profil de voix enregistré (null = voix Windows uniquement)
  micDeviceId: string | null; // micro utilisé pour enregistrer (ex. Voicemod), null = micro par défaut
}

let prefs: OverlayPrefs = { voice: true, tips: true, voiceName: null, rate: 1.05, volume: 1, overlay: false, displayId: null, gameDisplayId: null, voiceProfile: null, micDeviceId: null };
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
