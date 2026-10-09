import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { LiveContext } from "../hooks/liveContext";
import { useLive } from "../hooks/useLive";
import { useVoiceGuide } from "../hooks/useVoiceGuide";
import { bridge } from "../lib/bridge";
import { UpdateBanner, UpdateButton } from "./UpdateButton";

const NAV = [
  { to: "/game", label: "Partie en cours", icon: "▶" },
  { to: "/", label: "Tableau de bord", icon: "◆" },
  { to: "/matches", label: "Parties", icon: "⚔" },
  { to: "/meta", label: "Méta & tier lists", icon: "★" },
  { to: "/draft", label: "Draft Assistant", icon: "♜" },
  { to: "/coach", label: "Coach IA", icon: "✦" },
  { to: "/live", label: "Overlay (option)", icon: "◎" },
  { to: "/settings", label: "Paramètres", icon: "⚙" },
];

export function Layout() {
  const navigate = useNavigate();
  const [toast, setToast] = useState<{ text: string; matchId?: number } | null>(null);
  const location = useLocation();
  const onGamePage = useRef(false);
  onGamePage.current = location.pathname === "/game";
  const { state, setState, connected } = useLive((msg) => {
    if (msg.type === "match_imported") {
      // fin de partie : depuis le mode partie, on enchaîne directement sur le rapport
      if (onGamePage.current && msg.match_id) navigate(`/matches/${msg.match_id}`);
      else setToast({ text: "Nouvelle partie analysée : rapport disponible.", matchId: msg.match_id });
    }
  });
  useVoiceGuide(state);

  // Chargement d'une partie : bascule automatique sur le mode partie (une fois par partie).
  const shownGame = useRef<number | null>(null);
  useEffect(() => {
    if (state && (state.status === "loading" || state.status === "in_game") && shownGame.current !== state.game_id) {
      shownGame.current = state.game_id;
      if (location.pathname !== "/game") navigate("/game");
      void bridge()?.showGameWindow(); // second écran si configuré
    }
  }, [state, location.pathname, navigate]);

  return (
    <LiveContext.Provider value={{ state, setState, connected }}>
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-void-700 bg-void-950/80 p-4">
        <div className="mb-8">
          <div className="title-display text-2xl leading-none">HOTS</div>
          <div className="title-display text-2xl leading-none text-storm-400">REVIVAL</div>
          <div className="mt-2 text-[11px] leading-snug text-slate-500">Conçue par des joueurs, pour des joueurs.</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? "bg-gradient-to-r from-nexus-700/70 to-storm-700/40 text-white shadow-glow" : "text-slate-400 hover:bg-void-800 hover:text-white"}`}>
              <span className="w-4 text-center text-gold-400">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 text-xs text-slate-500">
          <UpdateButton />
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-500"}`} />
            {connected ? "Moteur d'analyse actif" : "Moteur d'analyse arrêté"}
          </div>
          <div>Partie : {state?.status === "in_game" ? "en cours" : state?.status === "loading" ? "chargement" : "aucune"}</div>

          <div className="pt-2 text-[10px] leading-snug">Overlay passif conforme : aucune lecture mémoire, aucune action automatique.</div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <UpdateBanner />
        <Outlet />
      </main>
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-gold-500/50 bg-void-850 px-4 py-3 shadow-gold">
          <span className="text-sm">{toast.text}</span>
          {toast.matchId && (
            <button className="btn-gold py-1" onClick={() => { navigate(`/matches/${toast.matchId}`); setToast(null); }}>Voir</button>
          )}
          <button className="text-slate-400 hover:text-white" onClick={() => setToast(null)} aria-label="Fermer">✕</button>
        </div>
      )}
    </div>
    </LiveContext.Provider>
  );
}
