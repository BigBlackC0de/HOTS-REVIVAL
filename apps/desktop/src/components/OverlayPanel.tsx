import { useState } from "react";
import { api } from "../lib/api";
import { clock, pct } from "../lib/format";
import type { Hero, MapInfo, OverlayState, OverlayTalent } from "../lib/types";
import { HeroSelect } from "./HeroSelect";

const ALERT_TONE = {
  info: "border-storm-400 text-storm-50",
  warning: "border-gold-400 text-gold-300",
  success: "border-emerald-400 text-emerald-200",
  danger: "border-rose-500 text-rose-200",
};
const CAMPS = [
  { id: "siege", label: "Siège" },
  { id: "bruiser", label: "Combattant" },
  { id: "boss", label: "Boss" },
  { id: "support", label: "Soutien" },
];
const campLabel = (id: string) => CAMPS.find((c) => c.id === id)?.label.toLowerCase() ?? id;
const box = "rounded-lg bg-void-950/85 px-3 py-1.5 backdrop-blur";

function TalentLine({ t }: { t: OverlayTalent }) {
  const name = t.recommended.name ?? t.recommended.talent;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400">Niv. {t.level}</span>
      <span className="flex-1 truncate text-white">{name}</span>
      {t.recommended.winrate != null && <span className="text-xs text-slate-400">{pct(t.recommended.winrate)}</span>}
    </div>
  );
}

/**
 * Contenu de l'overlay. Hors partie il ne prend aucune place ; en partie il reste compact
 * (alertes calculées par le moteur à chaque seconde : jamais d'empilement).
 */
export function OverlayPanel({ state, interactive, heroes, maps, onState, preview = false }: {
  state: OverlayState | null;
  interactive: boolean;
  heroes: Hero[];
  maps: MapInfo[];
  onState: (s: OverlayState) => void;
  preview?: boolean;
}) {
  const [mapId, setMapId] = useState("");
  const act = (p: Promise<OverlayState>) => p.then(onState).catch(() => undefined);
  const s = state;
  const status = s?.status ?? "idle";

  if (status === "idle" && !interactive && !preview) {
    // Jeu ouvert, pas de partie : petite pastille pour confirmer que l'overlay est actif.
    return s?.game_running ? (
      <div className="inline-flex items-center gap-2 rounded-full border border-nexus-600/60 bg-void-950/80 px-3 py-1 text-[11px] text-slate-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> HOTS REVIVAL prêt
      </div>
    ) : null;
  }

  return (
    <div className="w-[320px] space-y-1.5 text-[13px] text-slate-100">
      {(status !== "idle" || interactive || preview) && (
        <div className="flex items-center justify-between rounded-lg border border-nexus-600/60 bg-void-950/85 px-3 py-1.5">
          <span className="truncate font-display text-xs text-gold-400">
            {s?.map_name ?? (status === "idle" ? "HOTS REVIVAL" : "Carte inconnue")}
          </span>
          <span className="font-mono text-base text-white">
            {status === "loading" ? "chargement" : status === "ended" ? "terminée"
              : `${s?.clock_source === "estimée" ? "≈ " : ""}${clock(s?.clock_s)}`}
          </span>
        </div>
      )}

      {s?.alerts.map((a) => (
        <div key={a.id} className={`rounded-lg border-l-4 bg-void-950/90 px-3 py-1.5 font-semibold ${ALERT_TONE[a.level]}`}>{a.text}</div>
      ))}

      {status === "loading" && s?.objective && (
        <div className={box}>
          <div className="text-xs text-storm-300">{s.objective.name}</div>
          <div className="text-xs text-slate-300">{s.objective.tips[0]}</div>
        </div>
      )}

      {status === "in_game" && s && (
        <>
          {s.objective && (
            <div className={`${box} flex justify-between`}>
              <span className="text-storm-300">{s.objective.name}</span>
              <span className="font-mono font-bold text-gold-400">
                {s.objective.next_in_s !== null && s.objective.next_in_s > 0 ? clock(s.objective.next_in_s) : "en cours"}
              </span>
            </div>
          )}
          <div className={`${box} flex justify-between`}>
            <span>Alliés <b className="text-storm-300">{s.levels.ally}</b></span>
            <span className={s.levels.ally_tier > s.levels.enemy_tier ? "text-emerald-300" : s.levels.ally_tier < s.levels.enemy_tier ? "text-rose-300" : "text-slate-500"}>
              {s.levels.ally_tier === s.levels.enemy_tier ? "talents égaux" : s.levels.ally_tier > s.levels.enemy_tier ? "▲ avantage" : "▼ désavantage"}
            </span>
            <span>Adv. <b className="text-rose-300">{s.levels.enemy}</b></span>
          </div>
          {s.next_talent && <div className={box}><TalentLine t={s.next_talent} /></div>}
          {s.camps.map((c) => (
            <div key={c.camp + c.side} className={`${box} flex justify-between`}>
              <span className={c.side === "ally" ? "text-storm-300" : "text-rose-300"}>Camp {campLabel(c.camp)}</span>
              <span className="font-mono">{c.respawn_in_s !== null && c.respawn_in_s > 0 ? clock(c.respawn_in_s) : "disponible"}</span>
            </div>
          ))}
          {s.tips[0] && <div className={`${box} text-gold-300`}>✦ {s.tips[0]}</div>}
        </>
      )}

      {interactive && (
        <div className="space-y-1.5 rounded-lg border border-storm-600 bg-void-900/95 p-2">
          {status !== "in_game" && (
            <>
              {!s?.map_id && (
                <select className="w-full" value={mapId} onChange={(e) => setMapId(e.target.value)}>
                  <option value="">— Carte (si non détectée) —</option>
                  {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
              <button className="btn-gold w-full justify-center py-1" onClick={() => act(api.live.start(mapId || null, null, 0))}>
                La partie commence (horloge à 0:00)
              </button>
            </>
          )}
          <HeroSelect heroes={heroes} value={s?.my_hero_id ?? ""} placeholder="— Votre héros (build) —"
            onChange={(id) => id && act(api.live.hero(id))} />
          {status === "in_game" && (
            <>
              <div className="grid grid-cols-4 gap-1">
                <button className="btn-ghost justify-center px-1 py-1" onClick={() => act(api.live.levels({ ally_delta: 1 }))}>Allié +1</button>
                <button className="btn-ghost justify-center px-1 py-1" onClick={() => act(api.live.levels({ ally_delta: -1 }))}>Allié −1</button>
                <button className="btn-ghost justify-center px-1 py-1" onClick={() => act(api.live.levels({ enemy_delta: 1 }))}>Adv. +1</button>
                <button className="btn-ghost justify-center px-1 py-1" onClick={() => act(api.live.levels({ enemy_delta: -1 }))}>Adv. −1</button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {CAMPS.map((c) => (
                  <button key={c.id} className="btn-ghost justify-center px-1 py-1 text-xs" onClick={() => act(api.live.camp(c.id, "ally"))}>{c.label}</button>
                ))}
              </div>
              <div className="flex gap-1">
                <button className="btn-ghost flex-1 justify-center py-1" onClick={() => act(api.live.objectiveDone())}>Objectif terminé</button>
                <button className="btn-ghost justify-center py-1 text-rose-300" onClick={() => act(api.live.stop())}>Fin</button>
              </div>
            </>
          )}
          <div className="text-[10px] text-slate-500">Ctrl+Shift+I pour revenir au mode transparent.</div>
        </div>
      )}
    </div>
  );
}
