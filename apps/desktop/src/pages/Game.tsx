import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HeroSelect } from "../components/HeroSelect";
import { Card, Empty, List } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { useLiveState } from "../hooks/liveContext";
import { api } from "../lib/api";
import { bridge, type OverlayPrefs, type ReaderState, type ScreenStatus } from "../lib/bridge";
import { speak } from "../lib/voice";
import { clock, pct } from "../lib/format";
import type { HeroMeta, LobbyPlayer, OverlayState, TeamMember } from "../lib/types";

const ALERT_TONE = {
  info: "border-storm-400 bg-storm-700/20 text-storm-50",
  warning: "border-gold-400 bg-gold-500/10 text-gold-300",
  success: "border-emerald-400 bg-emerald-500/10 text-emerald-200",
  danger: "border-rose-500 bg-rose-500/10 text-rose-200",
};
const CAMPS = [
  { id: "siege", label: "Siège" },
  { id: "bruiser", label: "Combattant" },
  { id: "boss", label: "Boss" },
  { id: "support", label: "Soutien" },
];
const SOURCE_LABEL: Record<string, string> = {
  "vos replays": "calibré sur vos replays", mesuré: "mesuré sur replays réels", estimation: "valeurs de référence",
};

function Levels({ s, act }: { s: OverlayState; act: (p: Promise<OverlayState>) => void }) {
  const l = s.levels;
  const diff = l ? l.ally_tier - l.enemy_tier : 0;
  return (
    <Card title="Niveaux & talents">
      <div className="flex items-end justify-around text-center">
        <div>
          <div className="text-xs uppercase text-slate-400">Alliés</div>
          <div className="text-5xl font-bold text-storm-300">{l ? l.ally : "—"}</div>
        </div>
        <div className={`pb-2 text-sm font-semibold ${!l ? "text-slate-500" : diff > 0 ? "text-emerald-300" : diff < 0 ? "text-rose-300" : "text-slate-400"}`}>
          {!l ? "" : diff > 0 ? "▲ avantage de talent" : diff < 0 ? "▼ désavantage de talent" : "talents égaux"}
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Adverses</div>
          <div className="text-5xl font-bold text-rose-300">{l ? l.enemy : "—"}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-1">
        <button className="btn-ghost justify-center py-1" onClick={() => act(api.live.levels({ ally_delta: 1 }))}>Allié +1</button>
        <button className="btn-ghost justify-center py-1" onClick={() => act(api.live.levels({ ally_delta: -1 }))}>Allié −1</button>
        <button className="btn-ghost justify-center py-1" onClick={() => act(api.live.levels({ enemy_delta: 1 }))}>Adv. +1</button>
        <button className="btn-ghost justify-center py-1" onClick={() => act(api.live.levels({ enemy_delta: -1 }))}>Adv. −1</button>
      </div>
      {l && <p className="mt-2 text-xs text-slate-500">Source : {l.source}</p>}
      <ScreenReaderBadge />
    </Card>
  );
}

const ROLE_FR: Record<string, string> = {
  Tank: "Tank", Bruiser: "Combattant", Healer: "Soigneur", Support: "Soutien",
  "Ranged Assassin": "Assassin à distance", "Melee Assassin": "Assassin de mêlée",
};

/** Compositions lues sur l'écran de chargement. Rien tant qu'elles ne sont pas lues. */
function TeamsCard({ s }: { s: OverlayState }) {
  const t = s.teams;
  if (!t) return null;
  const column = (title: string, tone: string, members: TeamMember[]) => (
    <div>
      <div className={`mb-1 text-xs font-semibold uppercase ${tone}`}>{title}</div>
      <div className="space-y-1">
        {members.map((m) => (
          <div key={m.hero_id + (m.player ?? "")} className={`flex justify-between rounded-md border px-2 py-1 text-sm ${m.me ? "border-gold-400" : "border-void-600"}`}>
            <span className="text-white">{m.hero}</span>
            <span className="text-xs text-slate-400">{m.role ? ROLE_FR[m.role] ?? m.role : ""}{m.player ? ` · ${m.player}` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <Card title="Compositions">
      <div className="grid grid-cols-2 gap-4">
        {column(t.sides_known ? "Votre équipe" : "Équipe 1", "text-storm-300", t.ally)}
        {column(t.sides_known ? "Adversaires" : "Équipe 2", "text-rose-300", t.enemy)}
      </div>
      {!t.complete && <p className="mt-2 text-xs text-slate-500">Lecture de l'écran de chargement en cours…</p>}
    </Card>
  );
}

const READER_TEXT: Record<ReaderState, [string, string]> = {
  off: ["text-slate-500", "Lecture de l'écran désactivée (Paramètres)."],
  idle: ["text-slate-400", "Lecture de l'écran : en attente de la partie."],
  starting: ["text-slate-400", "Lecture de l'écran : démarrage…"],
  searching: ["text-gold-300", "Recherche de l'horloge et des niveaux en haut de l'écran du jeu…"],
  partial: ["text-gold-300", "✓ Horloge lue à l'écran. Recherche des niveaux d'équipe…"],
  ok: ["text-emerald-300", "✓ Horloge et niveaux lus à l'écran en direct."],
  black: ["text-rose-300", "L'écran du jeu est capturé tout noir. Clic droit sur HeroesOfTheStorm_x64.exe → Propriétés → Compatibilité → décochez « Désactiver les optimisations du plein écran »."],
  error: ["text-rose-300", "Capture de l'écran du jeu impossible."],
};

/** État de la lecture de l'écran (horloge + niveaux). */
function ScreenReaderBadge() {
  const b = bridge();
  const [status, setStatus] = useState<ScreenStatus | null>(null);
  useEffect(() => {
    if (!b) return;
    const load = () => void b.screen.status().then(setStatus);
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [b]);
  if (!status) return null;
  const [tone, text] = READER_TEXT[status.state] ?? READER_TEXT.idle;
  return <p className={`mt-2 text-xs ${tone}`}>{text}{status.error ? ` (${status.error})` : ""}</p>;
}

function HeroCard({ s, heroes, act }: { s: OverlayState; heroes: Parameters<typeof HeroSelect>[0]["heroes"]; act: (p: Promise<OverlayState>) => void }) {
  const meta = useAsync<HeroMeta | null>(() => (s.my_hero_id ? api.heroMeta(s.my_hero_id) : Promise.resolve(null)), [s.my_hero_id]);
  const g = meta.data?.guide;
  return (
    <Card title="Votre héros">
      <HeroSelect heroes={heroes} value={s.my_hero_id ?? ""} placeholder="— Choisir votre héros —" onChange={(id) => id && act(api.live.hero(id))} />
      {s.talents.length > 0 && (
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {s.talents.map((t) => {
            const next = s.next_talent?.level === t.level;
            const done = !!s.levels && t.level <= s.levels.ally;
            return (
              <div key={t.level} className={`rounded-md border p-1.5 text-center ${next ? "border-gold-400 bg-gold-500/10" : done ? "border-void-600 opacity-60" : "border-void-600"}`}>
                <div className="text-[10px] text-slate-500">Niv. {t.level}</div>
                <div className="text-xs leading-tight text-white">{t.recommended.name ?? t.recommended.talent}</div>
                {t.recommended.winrate != null && <div className="text-[10px] text-slate-400">{pct(t.recommended.winrate)}</div>}
              </div>
            );
          })}
        </div>
      )}
      {s.talents[0]?.source && <p className="mt-1 text-[11px] text-slate-500">Build : {s.talents[0].source}</p>}
      {g && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><div className="card-title mb-1">Synergies</div>{g.synergies.map((h) => h.hero).join(", ") || "—"}</div>
          <div><div className="card-title mb-1">Contré par</div>{g.counters.map((h) => h.hero).join(", ") || "—"}</div>
        </div>
      )}
    </Card>
  );
}

function Players({ gameId }: { gameId: number }) {
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  useEffect(() => {
    void api.live.lobby().then(setPlayers).catch(() => setPlayers([]));
  }, [gameId]);
  if (!players.length) return null;
  return (
    <Card title="Joueurs de la partie (écran de chargement)">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {players.map((p) => (
          <div key={p.battletag} className="flex justify-between gap-2">
            <span className={p.is_me ? "font-semibold text-gold-300" : "text-white"}>{p.battletag}</span>
            <span className="text-xs text-slate-400">
              {p.is_me ? "vous" : [
                p.with.games ? `avec : ${p.with.wins}/${p.with.games} V` : "",
                p.against.games ? `contre : ${p.against.wins}/${p.against.games} V` : "",
                p.top_heroes.length ? p.top_heroes.join(", ") : "",
              ].filter(Boolean).join(" · ") || "jamais croisé"}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Historique tiré de vos replays importés uniquement.</p>
    </Card>
  );
}

function VoiceToggle() {
  const b = bridge();
  const [prefs, setPrefs] = useState<OverlayPrefs | null>(null);
  useEffect(() => {
    void b?.prefs.get().then(setPrefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!b || !prefs) return null;
  const update = (next: Partial<OverlayPrefs>) => void b.prefs.set(next).then(setPrefs);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-void-600 px-2">
      <button className="py-1 text-sm" title="Guide vocal" onClick={() => update({ voice: !prefs.voice })}>
        {prefs.voice ? "🔊" : "🔇"}
      </button>
      <input type="range" min={0.05} max={1} step={0.05} value={prefs.volume} disabled={!prefs.voice}
        title={`Volume ${Math.round(prefs.volume * 100)} %`} className="w-24 border-0 p-0"
        onChange={(e) => setPrefs({ ...prefs, volume: Number(e.target.value) })}
        onMouseUp={(e) => update({ volume: Number((e.target as HTMLInputElement).value) })}
        onKeyUp={(e) => update({ volume: Number((e.target as HTMLInputElement).value) })} />
      <button className="text-xs text-slate-400 hover:text-white" disabled={!prefs.voice}
        onClick={() => speak("Test du volume.", prefs)}>test</button>
    </div>
  );
}

/** Mode partie : s'ouvre tout seul au chargement d'une partie (alternative à l'overlay). */
export function Game() {
  const { state: s, setState } = useLiveState();
  const heroes = useAsync(api.heroes);
  const maps = useAsync(api.maps);
  const [mapId, setMapId] = useState("");
  const act = (p: Promise<OverlayState>) => void p.then(setState).catch(() => undefined);

  if (!s || s.status === "idle")
    return (
      <Empty title="Aucune partie en cours">
        <p>Cet écran s'ouvre automatiquement dès l'écran de chargement d'une partie, et le guide vocal vous accompagne pendant le jeu.</p>
        <p className="mt-2">{s?.game_running ? "Heroes of the Storm est lancé : en attente d'une partie." : "Heroes of the Storm n'est pas lancé."}</p>
        <button className="btn-ghost mt-4" onClick={() => act(api.live.start(null, null, 0))}>Démarrer une partie manuellement</button>
      </Empty>
    );

  const o = s.objective;
  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-400">
            {s.status === "loading" ? "Chargement de la partie" : s.status === "ended" ? "Partie terminée" : "Partie en cours"}
          </div>
          <h1 className="title-display text-4xl">{s.map_name ?? "Carte inconnue"}</h1>
          {!s.map_id && (
            <select className="mt-2 w-72" value={mapId} onChange={(e) => { setMapId(e.target.value); act(api.live.start(e.target.value || null, null, s.clock_s ?? 0)); }}>
              <option value="">— Indiquer la carte —</option>
              {maps.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
        </div>
        <div className="text-right">
          <div className="font-mono text-6xl text-white">{s.status === "in_game" ? clock(s.clock_s) : "–:––"}</div>
          <div className="mt-1 flex justify-end gap-2">
            <VoiceToggle />
            <button className="btn-ghost py-1" onClick={() => act(api.live.sync(0))}>Horloge à 0:00</button>
            <button className="btn-ghost py-1 text-rose-300" onClick={() => act(api.live.stop())}>Fin</button>
          </div>
        </div>
      </header>

      {s.alerts.length > 0 && (
        <div className="grid gap-2">
          {s.alerts.map((a) => <div key={a.id} className={`rounded-lg border-l-4 px-4 py-3 text-lg font-semibold ${ALERT_TONE[a.level]}`}>{a.text}</div>)}
        </div>
      )}

      <TeamsCard s={s} />

      <div className="grid grid-cols-3 gap-4">
        <Card title={o ? `Objectif : ${o.name}` : "Objectif"}>
          {o ? (
            <>
              <div className="font-mono text-5xl text-gold-400">{o.next_in_s !== null && o.next_in_s > 0 ? clock(o.next_in_s) : s.status === "in_game" ? "en cours" : "–:––"}</div>
              <div className="mt-1 text-sm">Priorité : <b className="text-white">{o.priority}</b></div>
              {!!s.upcoming_objectives?.length && (
                <div className="mt-2 text-xs text-slate-400">Prochains : {s.upcoming_objectives.map((t) => clock(t)).join(" · ")}</div>
              )}
              <div className="mt-1 text-[11px] text-slate-500">Timers : {SOURCE_LABEL[o.source] ?? o.source}{o.samples ? ` (${o.samples} parties)` : ""}</div>
              <button className="btn-ghost mt-3 w-full justify-center py-1" onClick={() => act(api.live.objectiveDone())}>Objectif terminé</button>
            </>
          ) : <p className="text-sm text-slate-500">Carte non reconnue.</p>}
        </Card>
        <Levels s={s} act={act} />
        <Card title="Camps">
          <div className="grid grid-cols-2 gap-1">
            {CAMPS.map((c) => <button key={c.id} className="btn-ghost justify-center py-1" onClick={() => act(api.live.camp(c.id, "ally"))}>{c.label} pris</button>)}
          </div>
          <div className="mt-3 space-y-1 text-sm">
            {s.camps.length ? s.camps.map((c) => (
              <div key={c.camp + c.side} className="flex justify-between">
                <span>Camp {CAMPS.find((x) => x.id === c.camp)?.label.toLowerCase() ?? c.camp}</span>
                <span className="font-mono text-gold-300">{c.respawn_in_s !== null && c.respawn_in_s > 0 ? clock(c.respawn_in_s) : "disponible"}</span>
              </div>
            )) : <p className="text-xs text-slate-500">Cliquez sur un camp quand vous le voyez capturé.</p>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2"><HeroCard s={s} heroes={heroes.data ?? []} act={act} /></div>
        <Card title="Conseils">
          <List items={[...s.tips, ...(o?.tips ?? [])]} icon="✦" tone="text-gold-300" empty="Aucun conseil pour le moment." />
        </Card>
      </div>

      <Players gameId={s.game_id} />
      <p className="text-xs text-slate-500">
        Données : fichier de chargement, écran de chargement, horloge et niveaux (lecture d'écran ou saisie), timers mesurés sur replays. Aucune lecture du jeu.{" "}
        <Link className="underline" to="/settings">Guide vocal et lecture d'écran</Link>
      </p>
    </div>
  );
}
