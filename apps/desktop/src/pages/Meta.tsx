import { useEffect, useState } from "react";
import { Card, Empty, ErrorBox, List, Loading } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { bridge } from "../lib/bridge";
import { date, pct, ROLE_FR } from "../lib/format";
import type { HeroMeta, TierEntry } from "../lib/types";

const TIER_STYLE: Record<string, string> = {
  S: "bg-gold-500 text-void-950",
  A: "bg-nexus-500 text-white",
  B: "bg-storm-600 text-white",
  C: "bg-void-600 text-slate-200",
  D: "bg-void-700 text-slate-400",
};
const ROLES = ["Tank", "Bruiser", "Healer", "Support", "Ranged Assassin", "Melee Assassin"];

function HeroChip({ e, onClick }: { e: TierEntry; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-lg border border-void-600 bg-void-800 px-2.5 py-1.5 text-left hover:border-gold-500">
      <span className="text-sm font-medium text-white">{e.hero}</span>
      {e.my_games > 0 && (
        <span className={`text-[11px] ${(e.my_winrate ?? 0) >= 0.5 ? "text-emerald-300" : "text-rose-300"}`}>
          vous {pct(e.my_winrate)} · {e.my_games}
        </span>
      )}
    </button>
  );
}

function HeroPanel({ heroId, onClose, onPick }: { heroId: string; onClose: () => void; onPick: (id: string) => void }) {
  const { data, loading, error } = useAsync<HeroMeta>(() => api.heroMeta(heroId), [heroId]);
  if (loading) return <Card><Loading /></Card>;
  if (error || !data) return <ErrorBox message={error ?? "Héros introuvable"} />;
  const g = data.guide;
  return (
    <Card title={`${data.hero} · ${ROLE_FR[data.role] ?? data.role}`} action={<button className="text-slate-400 hover:text-white" onClick={onClose}>✕</button>}>
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(data.tiers).map(([k, t]) => t && (
          <span key={k} className="chip">{{ general: "Générale", master: "Master", quick_match: "Partie rapide", aram: "ARAM" }[k] ?? k} : <b className="text-gold-400">{t}</b></span>
        ))}
      </div>
      {g ? (
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2 space-y-4">
            {g.builds.map((b) => (
              <div key={b.title}>
                <h3 className="card-title">{b.title}</h3>
                <div className="grid grid-cols-7 gap-1.5">
                  {b.talents.map((t) => {
                    const desc = data.talent_catalog[String(t.level)]?.find((c) => c.id === t.talent)?.description;
                    return (
                      <div key={t.level} title={desc} className="rounded-md border border-void-600 bg-void-800 p-1.5 text-center">
                        <div className="text-[10px] text-slate-500">Niv. {t.level}</div>
                        <div className="text-xs leading-tight text-white">{t.name}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {!g.builds.length && <p className="text-sm text-slate-500">Aucun build lu sur le guide.</p>}
            <a className="text-xs text-storm-300 underline" href={g.url} target="_blank" rel="noreferrer">Guide complet sur Icy Veins ↗</a>
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="card-title">Synergies</h3>
              <div className="flex flex-wrap gap-1.5">{g.synergies.map((h) => <button key={h.hero_id} className="chip hover:border-emerald-400" onClick={() => onPick(h.hero_id)}>{h.hero}</button>)}</div>
            </div>
            <div>
              <h3 className="card-title">Contré par</h3>
              <div className="flex flex-wrap gap-1.5">{g.counters.map((h) => <button key={h.hero_id} className="chip hover:border-rose-400" onClick={() => onPick(h.hero_id)}>{h.hero}</button>)}</div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Guide Icy Veins pas encore téléchargé (mise à jour automatique en cours).</p>
      )}
      {data.replay_talent_stats.length > 0 && (
        <div className="mt-5">
          <h3 className="card-title">Talents les plus gagnants dans vos replays</h3>
          <List items={data.replay_talent_stats.map((t) => `Niv. ${t.level} : ${t.options[0].name} (${pct(t.options[0].winrate)} sur ${t.options[0].games} parties)`)} />
        </div>
      )}
    </Card>
  );
}

export function Meta() {
  const lists = useAsync(api.tierLists);
  const combos = useAsync(api.combos);
  const [listKey, setListKey] = useState("general");
  const [tab, setTab] = useState<"tiers" | "combos">("tiers");
  const [hero, setHero] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => bridge()?.onMetaProgress((p) => {
    setProgress(p.finished ? null : `Mise à jour Icy Veins : ${p.done}/${p.total}`);
    if (p.finished) { lists.reload(); combos.reload(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const refresh = async () => {
    setProgress("Mise à jour Icy Veins…");
    if (bridge()) await bridge()!.refreshMeta(true);
    else await api.refreshMetaDirect(true).catch(() => undefined);
    setProgress(null);
    lists.reload();
    combos.reload();
  };

  if (lists.loading) return <Loading />;
  if (lists.error) return <ErrorBox message={lists.error} />;
  const current = lists.data!.find((l) => l.key === listKey) ?? lists.data![0];

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="title-display text-3xl">Méta</h1>
          <p className="text-xs text-slate-400">
            Source : <a className="underline" href={current.url} target="_blank" rel="noreferrer">Icy Veins</a>
            {current.updated_label && <> · mise à jour Icy Veins : {current.updated_label}</>}
            {current.fetched_at && <> · récupérée le {date(current.fetched_at)}</>} · actualisation automatique
          </p>
        </div>
        <div className="flex items-center gap-3">
          {progress && <span className="text-xs text-gold-300">{progress}</span>}
          <button className="btn-ghost" onClick={refresh} disabled={!!progress}>Actualiser</button>
        </div>
      </header>

      <div className="flex gap-2">
        <button className={tab === "tiers" ? "btn-primary" : "btn-ghost"} onClick={() => setTab("tiers")}>Tier lists</button>
        <button className={tab === "combos" ? "btn-primary" : "btn-ghost"} onClick={() => setTab("combos")}>Meilleurs duos</button>
        {tab === "tiers" && (
          <select className="ml-auto w-72" value={listKey} onChange={(e) => setListKey(e.target.value)}>
            {lists.data!.map((l) => <option key={l.key} value={l.key}>{l.title}</option>)}
          </select>
        )}
      </div>

      {hero && <HeroPanel heroId={hero} onClose={() => setHero(null)} onPick={setHero} />}

      {tab === "tiers" && (current.entries.length ? (
        <div className="space-y-3">
          {(["S", "A", "B", "C", "D"] as const).map((tier) => {
            const inTier = current.entries.filter((e) => e.tier === tier);
            if (!inTier.length) return null;
            return (
              <div key={tier} className="card flex gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg font-display text-2xl ${TIER_STYLE[tier]}`}>{tier}</div>
                <div className="flex-1 space-y-2">
                  {ROLES.map((role) => {
                    const heroes = inTier.filter((e) => e.role === role);
                    if (!heroes.length) return null;
                    return (
                      <div key={role} className="flex flex-wrap items-center gap-1.5">
                        <span className="w-36 text-xs uppercase tracking-wider text-slate-500">{ROLE_FR[role]}</span>
                        {heroes.map((e) => <HeroChip key={e.hero_id} e={e} onClick={() => setHero(e.hero_id)} />)}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty title="Tier list en cours de récupération">
          La méta est téléchargée automatiquement depuis Icy Veins au démarrage puis toutes les 6 heures. Cliquez sur « Actualiser » pour forcer.
        </Empty>
      ))}

      {tab === "combos" && (combos.data?.length ? (
        <div className="grid grid-cols-3 gap-3">
          {combos.data.map((c) => (
            <div key={c.heroes.map((h) => h.hero_id).join("-")} className="card flex items-center justify-between">
              <div className="flex items-center gap-2">
                {c.heroes.map((h, i) => (
                  <span key={h.hero_id} className="flex items-center gap-2">
                    {i > 0 && <span className="text-gold-400">+</span>}
                    <button className="font-semibold text-white hover:text-gold-300" onClick={() => setHero(h.hero_id)}>{h.hero}</button>
                    {h.tier && <span className={`rounded px-1 text-[10px] ${TIER_STYLE[h.tier]}`}>{h.tier}</span>}
                  </span>
                ))}
              </div>
              {c.mutual && <span className="text-[10px] text-emerald-300">synergie réciproque</span>}
            </div>
          ))}
        </div>
      ) : <Empty title="Duos en cours de récupération">Les synergies viennent des guides de héros Icy Veins.</Empty>)}
    </div>
  );
}
