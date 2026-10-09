import { Link } from "react-router-dom";
import { Empty, ErrorBox, Loading } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { clock, date, scoreColor } from "../lib/format";

export function Matches() {
  const { data, error, loading } = useAsync(() => api.matches(50));
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data?.length) return <Empty title="Aucune partie">Les replays apparaîtront ici dès leur import.</Empty>;

  return (
    <div className="space-y-3">
      <h1 className="title-display text-3xl">Historique des parties</h1>
      {data.map((m) => {
        const win = m.me?.is_winner;
        return (
          <Link key={m.id} to={`/matches/${m.id}`}
            className={`card flex items-center gap-6 border-l-4 transition hover:border-nexus-500 ${win ? "border-l-storm-500" : "border-l-rose-500"}`}>
            <div className={`w-20 text-sm font-bold ${win ? "text-storm-300" : "text-rose-300"}`}>{win ? "VICTOIRE" : "DÉFAITE"}</div>
            <div className="w-40">
              <div className="font-semibold text-white">{m.me?.hero_name ?? "?"}</div>
              <div className="text-xs text-slate-400">{m.game_mode ?? "–"}</div>
            </div>
            <div className="w-48 text-sm">{m.map_name}</div>
            <div className="w-24 text-sm">{m.me ? `${m.me.kills} / ${m.me.deaths} / ${m.me.assists}` : "–"}</div>
            <div className="w-16 text-sm text-slate-400">{clock(m.duration_s)}</div>
            <div className="flex-1 text-right text-xs text-slate-500">{date(m.played_at)}</div>
            <div className={`w-14 text-right text-2xl font-bold ${scoreColor(m.me?.score?.overall ?? 0)}`}>
              {m.me?.score?.overall ?? "–"}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
