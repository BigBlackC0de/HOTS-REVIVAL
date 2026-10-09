import { useEffect, useState } from "react";
import { Bar, Card, ErrorBox, List, Loading } from "../components/ui";
import { HeroSelect } from "../components/HeroSelect";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { pct, ROLE_FR } from "../lib/format";
import type { DraftResult } from "../lib/types";

const empty5 = () => ["", "", "", "", ""];

export function Draft() {
  const heroes = useAsync(api.heroes);
  const maps = useAsync(api.maps);
  const [mapId, setMapId] = useState("");
  const [allies, setAllies] = useState<string[]>(empty5());
  const [enemies, setEnemies] = useState<string[]>(empty5());
  const [bans, setBans] = useState<string[]>(["", "", "", ""]);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const picked = [...allies, ...enemies, ...bans].filter(Boolean);

  useEffect(() => {
    const a = allies.filter(Boolean), e = enemies.filter(Boolean);
    if (!a.length && !e.length) { setResult(null); return; }
    const t = setTimeout(() => {
      api.analyzeDraft({ allies: a, enemies: e, bans: bans.filter(Boolean), map_id: mapId || null })
        .then((r) => { setResult(r); setError(null); })
        .catch((err: Error) => setError(err.message));
    }, 250);
    return () => clearTimeout(t);
  }, [allies, enemies, bans, mapId]);

  if (heroes.loading || maps.loading) return <Loading />;
  if (heroes.error) return <ErrorBox message={heroes.error} />;

  const setAt = (list: string[], set: (v: string[]) => void, i: number, v: string) =>
    set(list.map((x, j) => (j === i ? v : x)));

  const Phase = ({ label, value }: { label: string; value: number }) => (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className={value >= 50 ? "text-storm-300" : "text-rose-300"}>{value} %</span></div>
      <Bar value={value} color={value >= 50 ? "from-storm-500 to-storm-300" : "from-rose-600 to-rose-400"} />
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="title-display text-3xl">Draft Assistant</h1>
        <select value={mapId} onChange={(e) => setMapId(e.target.value)} className="w-64">
          <option value="">— Carte —</option>
          {maps.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </header>

      <div className="grid grid-cols-[1fr_1fr_220px] gap-4">
        <Card title="Votre équipe" className="border-storm-700">
          <div className="space-y-2">
            {allies.map((v, i) => <HeroSelect key={i} heroes={heroes.data!} value={v} exclude={picked} onChange={(id) => setAt(allies, setAllies, i, id)} />)}
          </div>
        </Card>
        <Card title="Équipe adverse" className="border-rose-900">
          <div className="space-y-2">
            {enemies.map((v, i) => <HeroSelect key={i} heroes={heroes.data!} value={v} exclude={picked} onChange={(id) => setAt(enemies, setEnemies, i, id)} />)}
          </div>
        </Card>
        <Card title="Bans">
          <div className="space-y-2">
            {bans.map((v, i) => <HeroSelect key={i} heroes={heroes.data!} value={v} exclude={picked} placeholder="— Ban —" onChange={(id) => setAt(bans, setBans, i, id)} />)}
          </div>
        </Card>
      </div>

      {error && <ErrorBox message={error} />}
      {result && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card title="Note de composition">
              <div className="text-5xl font-bold text-gold-400">{result.composition_score}<span className="text-lg text-slate-500">/100</span></div>
              <div className="mt-4 space-y-3">
                <Phase label="Early game" value={result.phases.early} />
                <Phase label="Mid game" value={result.phases.mid} />
                <Phase label="Late game" value={result.phases.late} />
              </div>
            </Card>
            <Card title="Forces"><List items={result.strengths} icon="✔" tone="text-emerald-300" /></Card>
            <Card title="Faiblesses"><List items={result.weaknesses} icon="✖" tone="text-rose-300" /></Card>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Card title="Synergies"><List items={result.synergies} icon="✦" tone="text-nexus-300" /></Card>
            <Card title="Menaces"><List items={result.threats} icon="⚠" tone="text-rose-200" /></Card>
            <Card title="Win conditions"><List items={result.win_conditions} icon="➜" tone="text-gold-300" /></Card>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Card title="Counters"><List items={result.counters} icon="⚔" /></Card>
            <Card title="Picks recommandés">
              {result.recommendations.length ? (
                <div className="space-y-2">
                  {result.recommendations.map((r, i) => (
                    <button key={r.hero_id} onClick={() => {
                      const slot = allies.indexOf("");
                      if (slot >= 0) setAt(allies, setAllies, slot, r.hero_id);
                    }} className="flex w-full items-center justify-between rounded-lg border border-void-600 px-3 py-2 text-left hover:border-gold-500">
                      <span><span className="mr-2 text-gold-400">#{i + 1}</span><b className="text-white">{r.hero}</b> <span className="text-xs text-slate-400">{ROLE_FR[r.role]}</span></span>
                      <span className="text-xs text-slate-400">{r.personal_winrate !== null ? `vous : ${pct(r.personal_winrate)}` : ""} · {r.score.toFixed(1)}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">Composition complète.</p>}
            </Card>
          </div>
          <p className="text-xs text-slate-500">Analyse basée uniquement sur les choix visibles en draft, les profils publics des héros et votre historique personnel.</p>
        </>
      )}
    </div>
  );
}
