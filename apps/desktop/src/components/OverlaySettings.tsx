import { useEffect, useState } from "react";
import { bridge, type OverlayPrefs } from "../lib/bridge";

/** Alertes vocales et choix de l'écran de l'overlay. */
export function OverlaySettings() {
  const b = bridge();
  const [prefs, setPrefs] = useState<OverlayPrefs | null>(null);
  const [displays, setDisplays] = useState<{ id: number; label: string }[]>([]);

  useEffect(() => {
    void b?.prefs.get().then(setPrefs);
    void b?.prefs.displays().then(setDisplays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!b || !prefs) return null;
  const update = async (next: Partial<OverlayPrefs>) => setPrefs(await b.prefs.set(next));

  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={prefs.voice} onChange={(e) => void update({ voice: e.target.checked })} />
        <span>Alertes vocales (objectifs, paliers de talent, camps) — fonctionnent même en plein écran</span>
        <button className="btn-ghost py-1" onClick={() => void b.prefs.say("Objectif dans 30 secondes : regroupez-vous.")}>Tester</button>
      </label>
      <label className="flex items-center gap-3">
        <span>Écran de l'overlay</span>
        <select value={prefs.displayId ?? ""} onChange={(e) => void update({ displayId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Écran principal</option>
          {displays.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </label>
      <p className="text-xs text-slate-400">
        Plein écran exclusif : aucune fenêtre ne peut s'afficher par-dessus le jeu sans s'y injecter (interdit par Blizzard).
        Solutions : alertes vocales, overlay sur un second écran, ou mode « Plein écran fenêtré ».
      </p>
    </div>
  );
}
