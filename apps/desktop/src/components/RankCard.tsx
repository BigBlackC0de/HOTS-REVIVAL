import { useState } from "react";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { date } from "../lib/format";
import { Card } from "./ui";

/** Saisie du rang Storm League (Blizzard ne fournit aucune API de rang pour HotS). */
export function RankCard() {
  const ranks = useAsync(api.ranks);
  const [league, setLeague] = useState("Platine");
  const [division, setDivision] = useState(3);
  const noDivision = league === "Maître" || league === "Grand Maître";

  const save = async () => {
    await api.addRank(league, noDivision ? null : division);
    ranks.reload();
  };

  return (
    <Card title="Mon rang (Storm League)">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={league} onChange={(e) => setLeague(e.target.value)}>
          {(ranks.data?.leagues ?? []).map((l) => <option key={l}>{l}</option>)}
        </select>
        {!noDivision && (
          <select value={division} onChange={(e) => setDivision(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <button className="btn-primary" onClick={() => void save()}>Enregistrer mon rang</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Blizzard ne met à disposition aucune API Heroes of the Storm (ni via Battle.net) : le rang n'est pas dans les replays.
        Indiquez-le ici après vos placements ou une promotion, pour suivre votre progression et l'adapter dans les conseils du coach.
      </p>
      {!!ranks.data?.history.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ranks.data.history.slice(0, 8).map((r, i) => (
            <span key={r.id} className={`chip ${i === 0 ? "border-gold-500 text-gold-300" : ""}`}>{r.label} · {date(r.recorded_at)}</span>
          ))}
        </div>
      )}
    </Card>
  );
}
