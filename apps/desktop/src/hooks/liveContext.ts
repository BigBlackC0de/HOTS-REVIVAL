import { createContext, useContext } from "react";
import type { OverlayState } from "../lib/types";

export interface LiveContextValue {
  state: OverlayState | null;
  setState: (s: OverlayState) => void;
  connected: boolean;
}

export const LiveContext = createContext<LiveContextValue>({ state: null, setState: () => undefined, connected: false });
export const useLiveState = () => useContext(LiveContext);
