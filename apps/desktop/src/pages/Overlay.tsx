import { useEffect, useState } from "react";
import { OverlayPanel } from "../components/OverlayPanel";
import { useAsync } from "../hooks/useAsync";
import { useLive } from "../hooks/useLive";
import { api } from "../lib/api";
import { bridge } from "../lib/bridge";

/** Route chargée par la fenêtre overlay transparente d'Electron (option). Le guide vocal est
 *  porté par la fenêtre principale pour ne jamais parler deux fois. */
export function Overlay() {
  const { state, setState } = useLive();
  const heroes = useAsync(api.heroes);
  const maps = useAsync(api.maps);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    document.body.classList.add("overlay");
    const off = bridge()?.onOverlayMode((m) => setInteractive(m.interactive));
    return () => {
      document.body.classList.remove("overlay");
      off?.();
    };
  }, []);

  return (
    <div className="p-2">
      <OverlayPanel state={state} interactive={interactive} heroes={heroes.data ?? []} maps={maps.data ?? []} onState={setState} />
    </div>
  );
}
