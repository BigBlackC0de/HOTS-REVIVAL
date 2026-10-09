import { useEffect, useRef, useState } from "react";
import { WS_LIVE } from "../lib/api";
import type { OverlayState } from "../lib/types";

type LiveMessage =
  | { type: "overlay"; state: OverlayState }
  | { type: "match_imported"; match_id: number; file: string }
  | { type: "game_loading"; players: string[] };

/** Connexion WebSocket à l'état live (reconnexion automatique). */
export function useLive(onEvent?: (msg: LiveMessage) => void) {
  const [state, setState] = useState<OverlayState | null>(null);
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(WS_LIVE);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data) as LiveMessage;
        if (msg.type === "overlay") setState(msg.state);
        handler.current?.(msg);
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return { state, connected, setState };
}
