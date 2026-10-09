import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bar, Card, ErrorBox, List, Loading } from "../components/ui";
import { ScoreRadar } from "../components/ScoreRadar";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { track } from "../lib/analytics";
import { CATEGORY_FR, clock, compact, pct, scoreColor } from "../lib/format";
import type { MatchPlayer } from "../lib/types";

function Scoreboard({ players }: { players: MatchPlayer[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
        <tr><th className="py-2">Joueur</th><th>Héros</th><th>K/D/A</th><th>Dégâts héros</th><th>Siège</th><th>Soins</th><th>XP</th><th>Score</th></tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.id} className={`border-t border-void-700 ${p.is_me ? "bg-nexus-700/20" : ""}`}>
            <td className={`py-1.5 ${p.team === 0 ? "text-storm-300" : "text-rose-300"}`}>{p.name}{p.is_me && " (vous)"}</td>
            <td>{p.hero_name}</td>
            <td>{p.kills}/{p.deaths}/{p.assists}</td>
            <td>{compact(p.hero_damage)}</td>
            <td>{compact(p.siege_damage)}</td>
            <td>{compact(p.healing)}</td>
            <td>{compact(p.xp_contribution)}</td>
            <td className={`font-bold ${scoreColor(p.score?.overall ?? 0)}`}>{p.score?.overall ?? "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MatchReport() {
  const id = Number(useParams().id);
  const match = useAsync(() => api.match(id), [id]);
  const report = useAsync(() => api.report(id), [id]);
  const [generating, setGenerating] = useState(false);

  if (match.loading) return <Loading />;
  if (match.error) return <ErrorBox message={match.error} />;
  const m = match.data!;
  const me = m.me;
  const facts = report.data?.facts;
  const ai = report.data?.ai_summary;

  const generate = async () => {
    setGenerating(true);
    try {
      report.setData(await api.generateReport(id));
      track("report_ai_requested");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link to="/matches" className="text-xs text-slate-400 hover:text-white">← Parties</Link>
          <h1 className="title-display text-3xl">{m.map_name}</h1>
          <p className="text-sm text-slate-400">{m.game_mode ?? "–"} · {clock(m.duration_s)} · {me?.hero_name}</p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-slate-400">HEROS SCORE</div>
          <div className={`text-5xl font-bold ${scoreColor(me?.score?.overall ?? 0)}`}>{me?.score?.overall ?? "–"}</div>
        </div>
      </header>

      {facts && (
        <Card title="Résumé">
          <p className="text-base text-white">{ai?.summary ?? facts.headline}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="chip">Participation {pct(facts.kill_participation)}</span>
            <span className="chip">K/D/A {facts.kda.kills}/{facts.kda.deaths}/{facts.kda.assists}</span>
            <span className="chip">Temps mort {facts.time_spent_dead_s} s</span>
            <span className="chip">Part des dégâts {pct(facts.shares.hero_damage)}</span>
            <span className="chip">Part d'XP {pct(facts.shares.xp_contribution)}</span>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button className="btn-primary" onClick={generate} disabled={generating}>
              {generating ? "Analyse en cours…" : ai ? "Regénérer l'analyse IA" : "✦ Générer l'analyse IA"}
            </button>
            <Link className="btn-ghost" to={`/coach?match=${id}`}>Poser une question au coach</Link>
            {report.data?.model && (
              <span className="text-xs text-slate-500">
                Analyse : {report.data.model === "deterministic" ? "sans IA (règles)" : `Claude · ${report.data.model}`}
              </span>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card title="HEROS SCORE">
          {me?.score ? (
            <>
              <div className="flex justify-center"><ScoreRadar score={me.score} /></div>
              <div className="mt-2 space-y-2">
                {Object.entries(CATEGORY_FR).map(([k, label]) => {
                  const value = (me.score as unknown as Record<string, number>)[k];
                  return (
                    <div key={k}>
                      <div className="flex justify-between text-xs"><span>{label}</span><span>{value}</span></div>
                      <Bar value={value} />
                    </div>
                  );
                })}
              </div>
            </>
          ) : <p className="text-sm text-slate-500">Score indisponible.</p>}
        </Card>
        <Card title="Points forts">
          <List items={ai?.strengths ?? facts?.strengths ?? []} icon="✔" tone="text-emerald-300" />
          <h3 className="card-title mt-5">Actions excellentes</h3>
          <List items={ai?.excellent_actions ?? []} icon="★" tone="text-gold-300" empty="Générez l'analyse IA." />
        </Card>
        <Card title="Points faibles">
          <List items={ai?.weaknesses ?? facts?.weaknesses ?? []} icon="✖" tone="text-rose-300" />
          <h3 className="card-title mt-5">Erreurs majeures</h3>
          <List items={ai?.major_mistakes ?? []} icon="!" tone="text-rose-200" empty="Générez l'analyse IA." />
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card title="Moments clés">
          <List items={ai?.key_moments ?? facts?.key_moments ?? []} icon="⏱" />
        </Card>
        <Card title="Plan d'amélioration" className="border-gold-600/40">
          <List items={ai?.improvement_plan ?? facts?.improvement_plan ?? []} icon="➜" tone="text-gold-300" />
        </Card>
      </div>

      <Card title="Tableau des scores"><Scoreboard players={m.players} /></Card>

      {me?.talents.length ? (
        <Card title="Talents choisis">
          <div className="flex flex-wrap gap-2">
            {me.talents.map((t) => <span key={t.tier} className="chip">Niv. {t.level} · {t.name}</span>)}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
