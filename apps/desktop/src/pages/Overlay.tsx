import { useEffect, useRef, useState } from "react";
import { OverlayPanel } from "../components/OverlayPanel";
import { useAsync } from "../hooks/useAsync";
import { useLive } from "../hooks/useLive";
import { api } from "../lib/api";
import { bridge, type OverlayPrefs } from "../lib/bridge";
import { speak } from "../lib/voice";

/** Route chargée par la fenêtre overlay transparente d'Electron. */
export function Overlay() {
  const { state, setState } = useLive();
  const heroes = useAsync(api.heroes);
  const maps = useAsync(api.maps);
  const [interactive, setInteractive] = useState(false);
  const prefs = useRef<OverlayPrefs>({ voice: true, displayId: null });
  const spoken = useRef<Set<string>>(new Set());
  const gameId = useRef<number | null>(null);

  useEffect(() => {
    document.body.classList.add("overlay");
    const b = bridge();
    void b?.prefs.get().then((p) => (prefs.current = p));
    const offs = [
      b?.onOverlayMode((m) => setInteractive(m.interactive)),
      b?.onPrefs((p) => (prefs.current = p)),
      b?.onSay((text) => speak(text)),
    ];
    return () => {
      document.body.classList.remove("overlay");
      offs.forEach((off) => off?.());
    };
  }, []);

  // Chaque alerte est lue une fois, au moment où elle apparaît.
  useEffect(() => {
    if (!state) return;
    if (state.game_id !== gameId.current) {
      gameId.current = state.game_id;
      spoken.current.clear();
    }
    const current = new Set(state.alerts.map((a) => a.id));
    for (const a of state.alerts) {
      if (!spoken.current.has(a.id) && prefs.current.voice) speak(a.text);
    }
    spoken.current = current;
  }, [state]);

  return (
    <div className="p-2">
      <OverlayPanel state={state} interactive={interactive} heroes={heroes.data ?? []} maps={maps.data ?? []} onState={setState} />
    </div>
  );
}
