import { useEffect, useState } from "react";
import { bridge, type OverlayPrefs } from "../lib/bridge";
import { listVoices, speak } from "../lib/voice";

/** Guide vocal (choix de la voix, vitesse, volume, conseils) et overlay optionnel. */
export function OverlaySettings() {
  const b = bridge();
  const [prefs, setPrefs] = useState<OverlayPrefs | null>(null);
  const [displays, setDisplays] = useState<{ id: number; label: string }[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    void b?.prefs.get().then(setPrefs);
    void b?.prefs.displays().then(setDisplays);
    const load = () => setVoices(listVoices());
    load();
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!b || !prefs) return null;
  const update = async (next: Partial<OverlayPrefs>) => setPrefs(await b.prefs.set(next));
  const test = () => speak("Objectif dans 30 secondes : regroupez-vous. Restez groupés.", prefs);

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={prefs.voice} onChange={(e) => void update({ voice: e.target.checked })} />
          <span>Guide vocal pendant les parties (fonctionne en plein écran, sans overlay)</span>
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={prefs.tips} disabled={!prefs.voice} onChange={(e) => void update({ tips: e.target.checked })} />
          <span>Lire aussi les conseils (« Restez groupés », avantage de talent…), au plus une fois toutes les 90 s</span>
        </label>
      </div>
      <div className="grid grid-cols-[140px_1fr] items-center gap-3">
        <span>Voix</span>
        <select value={prefs.voiceName ?? ""} onChange={(e) => void update({ voiceName: e.target.value || null })}>
          <option value="">Automatique (première voix française)</option>
          {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
        </select>
        <span>Vitesse</span>
        <input type="range" min={0.7} max={1.6} step={0.05} value={prefs.rate} onChange={(e) => void update({ rate: Number(e.target.value) })} />
        <span>Volume</span>
        <input type="range" min={0.1} max={1} step={0.05} value={prefs.volume} onChange={(e) => void update({ volume: Number(e.target.value) })} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={test}>Tester la voix</button>
        <span className="text-xs text-slate-400">D'autres voix françaises s'ajoutent dans Windows : Paramètres → Heure et langue → Voix.</span>
      </div>

      <div className="space-y-2 border-t border-void-700 pt-3">
        <label className="flex items-center gap-3">
          <span>Écran du mode partie</span>
          <select value={prefs.gameDisplayId ?? ""} onChange={(e) => void update({ gameDisplayId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Ne pas déplacer la fenêtre</option>
            {displays.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <p className="text-xs text-slate-400">
          Au chargement d'une partie, l'application s'affiche sur cet écran (idéal : votre second écran), sans prendre le focus du jeu.
        </p>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={prefs.overlay} onChange={(e) => void update({ overlay: e.target.checked })} />
          <span>Afficher aussi l'overlay par-dessus le jeu (nécessite le mode « Plein écran fenêtré »)</span>
        </label>
        {prefs.overlay && (
          <label className="flex items-center gap-3">
            <span>Écran de l'overlay</span>
            <select value={prefs.displayId ?? ""} onChange={(e) => void update({ displayId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Écran principal</option>
              {displays.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
        )}
        <p className="text-xs text-slate-400">
          Sans overlay, l'écran « Partie en cours » s'ouvre tout seul dans l'application au chargement d'une partie
          (consultable sur un second écran ou d'un Alt+Tab), et la voix vous guide en jeu.
        </p>
      </div>
    </div>
  );
}
