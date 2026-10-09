import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { clock, pct } from "../lib/format";
import type { Hero, MapInfo, OverlayState } from "../lib/types";
import { HeroSelect } from "./HeroSelect";

const ALERT_TONE = {
  info: "border-storm-500 text-storm-50",
  warning: "border-gold-500 text-gold-300",
  success: "border-emerald-500 text-emerald-200",
  danger: "border-rose-500 text-rose-200",
};
const CAMPS = [
  { id: "siege", label: "Siège" },
  { id: "bruiser", label: "Combattant" },
  { id: "boss", label: "Boss" },
  { id: "support", label: "Soutien" },
];

/** Contenu de l'overlay. `interactive` affiche les commandes de saisie (overlay cliquable). */
export function OverlayPanel({ state, interactive, heroes, maps, onState }: {
  state: OverlayState | null;
  interactive: boolean;
  heroes: Hero[];
  maps: MapInfo[];
  onState: (s: OverlayState) => void;
}) {
  const [mapId, setMapId] = useState("");
  const [heroId, setHeroId] = useState("");
  const [visibleAlerts, setVisibleAlerts] = useState<OverlayState["alerts"]>([]);
  const [seen] = useState(() => new Set<string>());

  // Les alertes s'affichent 8 s puis disparaissent (une seule fois chacune).
  useEffect(() => {
    const fresh = (state?.alerts ?? []).filter((a) => !seen.has(a.id));
    if (!fresh.length) return;
    fresh.forEach((a) => seen.add(a.id));
    setVisibleAlerts((v) => [...v, ...fresh]);
    const t = setTimeout(() => setVisibleAlerts((v) => v.filter((a) => !fresh.includes(a))), 8000);
    return () => clearTimeout(t);
  }, [state, seen]);

  const act = (p: Promise<OverlayState>) => p.then(onState).catch(() => undefined);
  const s = state;
  const inGame = s?.status === "in_game";

  return (
    <div className="w-[340px] space-y-2 text-[13px] text-slate-100">
      <div className="flex items-center justify-between rounded-lg border border-nexus-600/60 bg-void-950/80 px-3 py-2 backdrop-blur">
        <span className="font-display text-sm text-gold-400">HOTS REVIVAL</span>
        <span className="font-mono text-lg text-white">{clock(s?.clock_s)}</span>
      </div>

      {visibleAlerts.map((a) => (
        <div key={a.id} className={`rounded-lg border-l-4 bg-void-950/85 px-3 py-2 font-semibold ${ALERT_TONE[a.level]}`}>{a.text}</div>
      ))}

      {s?.status === "loading" && (
        <div className="rounded-lg bg-void-950/80 px-3 py-2">Partie en chargement · {s.lobby_players.length} joueurs détectés</div>
      )}

      {s?.objective && (
        <div className="rounded-lg bg-void-950/80 px-3 py-2">
          <div className="flex justify-between">
            <span className="text-storm-300">{s.objective.name}</span>
            <span className="font-mono font-bold text-gold-400">{s.objective.next_in_s !== null && s.objective.next_in_s > 0 ? clock(s.objective.next_in_s) : "en cours"}</span>
          </div>
          <div className="text-xs text-slate-300">Priorité : <b>{s.objective.priority}</b>{s.objective.estimated && " · estimation"}</div>
        </div>
      )}

      {inGame && (
        <div className="flex justify-between rounded-lg bg-void-950/80 px-3 py-2">
          <span>Alliés <b className="text-storm-300">niv. {s.levels.ally}</b></span>
          <span className={s.levels.ally_tier > s.levels.enemy_tier ? "text-emerald-300" : s.levels.ally_tier < s.levels.enemy_tier ? "text-rose-300" : "text-slate-400"}>
            {s.levels.ally_tier === s.levels.enemy_tier ? "=" : s.levels.ally_tier > s.levels.enemy_tier ? "▲ talent" : "▼ talent"}
          </span>
          <span>Adverses <b className="text-rose-300">niv. {s.levels.enemy}</b></span>
        </div>
      )}

      {!!s?.camps.length && (
        <div className="rounded-lg bg-void-950/80 px-3 py-2">
          {s.camps.map((c) => (
            <div key={c.camp + c.side} className="flex justify-between">
              <span className={c.side === "ally" ? "text-storm-300" : "text-rose-300"}>
                Camp {CAMPS.find((x) => x.id === c.camp)?.label.toLowerCase() ?? c.camp}
              </span>
              <span className="font-mono">{c.respawn_in_s !== null && c.respawn_in_s > 0 ? clock(c.respawn_in_s) : "disponible"}</span>
            </div>
          ))}
        </div>
      )}

      {!!s?.talents.length && (
        <div className="rounded-lg bg-void-950/80 px-3 py-2">
          <div className="mb-1 text-xs uppercase tracking-widest text-nexus-300">Build recommandé</div>
          {s.talents.map((t) => (
            <div key={t.level} className="flex justify-between gap-2">
              <span className="text-slate-400">{t.level}</span>
              <span className="flex-1 truncate">{t.recommended.talent}</span>
              <span className="text-xs text-slate-400">{pct(t.recommended.winrate)} · {pct(t.recommended.popularity)}</span>
            </div>
          ))}
        </div>
      )}

      {!!s?.tips.length && (
        <div className="rounded-lg border border-gold-600/40 bg-void-950/80 px-3 py-2">
          {s.tips.map((t) => <div key={t}>✦ {t}</div>)}
        </div>
      )}

      {interactive && (
        <div className="space-y-2 rounded-lg border border-storm-600 bg-void-900/95 p-3">
          {!inGame ? (
            <>
              <select className="w-full" value={mapId} onChange={(e) => setMapId(e.target.value)}>
                <option value="">— Carte —</option>
                {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <HeroSelect heroes={heroes} value={heroId} onChange={setHeroId} placeholder="— Votre héros —" />
              <button className="btn-gold w-full justify-center" onClick={() => act(api.live.start(mapId || null, heroId || null, 0))}>
                Démarrer à 0:00
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-1">
                <button className="btn-ghost px-2 py-1" onClick={() => act(api.live.levels({ ally_delta: 1 }))}>Allié +1</button>
                <button className="btn-ghost px-2 py-1" onClick={() => act(api.live.levels({ ally_delta: -1 }))}>Allié −1</button>
                <button className="btn-ghost px-2 py-1" onClick={() => act(api.live.levels({ enemy_delta: 1 }))}>Adv. +1</button>
                <button className="btn-ghost px-2 py-1" onClick={() => act(api.live.levels({ enemy_delta: -1 }))}>Adv. −1</button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {CAMPS.map((c) => (
                  <button key={c.id} className="btn-ghost px-1 py-1 text-xs" onClick={() => act(api.live.camp(c.id, "ally"))}>{c.label}</button>
                ))}
              </div>
              <div className="flex gap-1">
                <button className="btn-ghost flex-1 justify-center py-1" onClick={() => act(api.live.objectiveDone())}>Objectif terminé</button>
                <button className="btn-ghost justify-center py-1" onClick={() => act(api.live.sync(0))}>Sync 0:00</button>
                <button className="btn-ghost justify-center py-1 text-rose-300" onClick={() => act(api.live.stop())}>Fin</button>
              </div>
            </>
          )}
          <div className="text-[10px] text-slate-500">Saisie manuelle d'informations visibles à l'écran. Aucune lecture du jeu.</div>
        </div>
      )}
    </div>
  );
}
