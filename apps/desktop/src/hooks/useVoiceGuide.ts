import { useEffect, useRef } from "react";
import { bridge, type OverlayPrefs } from "../lib/bridge";
import type { OverlayState } from "../lib/types";
import { speak } from "../lib/voice";

const TIP_COOLDOWN_MS = 90_000;
const DEFAULT: OverlayPrefs = { voice: true, tips: true, voiceName: null, rate: 1.05, volume: 1, overlay: false, displayId: null, gameDisplayId: null };

/**
 * Guide vocal : lit chaque alerte quand elle apparaît, et les conseils (« Restez groupés »…)
 * sans répéter le même conseil plus d'une fois toutes les 90 s.
 */
export function useVoiceGuide(state: OverlayState | null) {
  const prefs = useRef<OverlayPrefs>(DEFAULT);
  const activeAlerts = useRef<Set<string>>(new Set());
  const tipSaidAt = useRef<Map<string, number>>(new Map());
  const gameId = useRef<number | null>(null);

  useEffect(() => {
    const b = bridge();
    void b?.prefs.get().then((p) => (prefs.current = p));
    const offs = [
      b?.onPrefs((p) => (prefs.current = p)),
      b?.onSay((text) => speak(text, prefs.current)),
    ];
    return () => offs.forEach((off) => off?.());
  }, []);

  useEffect(() => {
    if (!state) return;
    const p = prefs.current;
    if (state.game_id !== gameId.current) {
      gameId.current = state.game_id;
      activeAlerts.current.clear();
      tipSaidAt.current.clear();
    }
    const current = new Set(state.alerts.filter((a) => a.voice !== false).map((a) => a.id));
    if (p.voice) {
      // seules les infos observées sont annoncées (jamais une estimation)
      for (const a of state.alerts) if (a.voice !== false && !activeAlerts.current.has(a.id)) speak(a.text, p);
      if (p.tips && state.status === "in_game") {
        const now = Date.now();
        for (const tip of state.tips) {
          const last = tipSaidAt.current.get(tip) ?? 0;
          if (now - last > TIP_COOLDOWN_MS) {
            tipSaidAt.current.set(tip, now);
            speak(tip, p);
          }
        }
      }
    }
    activeAlerts.current = current;
  }, [state]);
}
