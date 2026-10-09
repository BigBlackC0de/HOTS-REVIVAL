import { Link } from "react-router-dom";
import { Bar, Card, Empty, ErrorBox, List, Loading, Stat } from "../components/ui";
import { ScoreRadar } from "../components/ScoreRadar";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { CATEGORY_FR, pct, ROLE_FR, scoreColor } from "../lib/format";
import type { ProgressionPoint } from "../lib/types";

function Sparkline({ points }: { points: ProgressionPoint[] }) {
  const values = points.map((p) => p.heros_score ?? 0);
  if (values.length < 2) return <p className="text-sm text-slate-500">Jouez quelques parties pour voir votre courbe.</p>;
  const w = 560, h = 120;
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i / (values.length - 1)) * w},${h - (v / 100) * h}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" preserveAspectRatio="none">
      <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="#2a3060" strokeDasharray="4 4" />
      <path d={path} fill="none" stroke="url(#g)" strokeWidth={3} />
      <defs>
        <linearGradient id="g" x1="0" x2="1">
          <stop offset="0" stopColor="#1f8fff" />
          <stop offset="1" stopColor="#a87bff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Dashboard() {
  const profile = useAsync(api.profile);
  const prog = useAsync(api.progression);

  if (profile.loading) return <Loading />;
  if (profile.error) return <ErrorBox message={profile.error} />;
  const p = profile.data!;

  if (!p.total.games)
    return (
      <Empty title="Bienvenue dans HOTS REVIVAL">
        Aucune partie importée pour l'instant. Lancez une partie : le replay sera analysé automatiquement à la fin,
        ou importez vos replays existants depuis les <Link className="text-storm-300 underline" to="/settings">paramètres</Link>.
      </Empty>
    );

  const heroes = Object.entries(p.by_hero).sort((a, b) => b[1].games - a[1].games);
  const trendIcon = { up: "▲", down: "▼", stable: "■", unknown: "·" }[p.trend.direction];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="title-display text-3xl">{p.player.battletag ?? p.player.name ?? "Joueur"}</h1>
          <p className="text-sm text-slate-400">
            Rôle principal : <b className="text-white">{ROLE_FR[p.main_role ?? ""] ?? "–"}</b> · secondaire :{" "}
            <b className="text-white">{ROLE_FR[p.secondary_role ?? ""] ?? "–"}</b>
            {p.player.rank && <> · Rang : <b className="text-gold-400">{p.player.rank}</b></>}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Winrate global" value={pct(p.total.winrate, 1)} hint={`${p.total.wins} V / ${p.total.games - p.total.wins} D`} tone="text-storm-300" />
        <Stat label="Parties analysées" value={p.total.games} />
        <Stat label="HEROS SCORE moyen" value={p.total.avg_heros_score ?? "–"}
          tone={scoreColor(p.total.avg_heros_score ?? 0)} hint="sur 100" />
        <Stat label="Tendance (10 parties)" value={`${trendIcon} ${pct(p.trend.last_10_winrate)}`}
          hint={`précédentes : ${pct(p.trend.previous_10_winrate)}`}
          tone={p.trend.direction === "down" ? "text-rose-400" : "text-emerald-400"} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title="HEROS SCORE moyen">
          <div className="flex justify-center"><ScoreRadar score={p.category_averages} /></div>
        </Card>
        <Card title="Winrate par rôle">
          <div className="space-y-3">
            {Object.entries(p.by_role).sort((a, b) => b[1].games - a[1].games).map(([role, b]) => (
              <div key={role}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{ROLE_FR[role] ?? role}</span>
                  <span className="text-slate-400">{pct(b.winrate)} · {b.games} parties</span>
                </div>
                <Bar value={(b.winrate ?? 0) * 100} />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Synthèse">
          <div className="space-y-3 text-sm">
            <div>Meilleur héros : <b className="text-gold-400">{p.best_hero ?? "–"}</b></div>
            <div>Héros le plus difficile : <b className="text-rose-300">{p.worst_hero ?? "–"}</b></div>
            <div>
              <div className="mb-1 text-slate-400">Héros à éviter pour l'instant :</div>
              <List items={p.heroes_to_avoid} icon="⚠" tone="text-rose-300" empty="Aucun — continuez ainsi." />
            </div>
            <div className="text-xs text-slate-500">Calculs lissés (min. 3 parties par héros).</div>
          </div>
        </Card>
      </div>

      <Card title="Progression du HEROS SCORE">
        {prog.data ? <Sparkline points={prog.data} /> : <Loading />}
      </Card>

      <Card title="Héros">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="py-2">Héros</th><th>Parties</th><th>Winrate</th><th>HEROS SCORE</th></tr>
          </thead>
          <tbody>
            {heroes.map(([id, h]) => (
              <tr key={id} className="border-t border-void-700">
                <td className="py-2 font-medium text-white">{h.hero}</td>
                <td>{h.games}</td>
                <td className={(h.winrate ?? 0) >= 0.5 ? "text-emerald-400" : "text-rose-300"}>{pct(h.winrate)}</td>
                <td className={scoreColor(h.avg_heros_score ?? 0)}>{h.avg_heros_score ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-slate-500">
        Catégories : {Object.values(CATEGORY_FR).join(" · ")}. Le placement est estimé par des indicateurs indirects du replay.
      </p>
    </div>
  );
}
