import { useState } from "react";
import { Card, ErrorBox, List, Loading } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";

export function Settings() {
  const status = useAsync(api.replayStatus);
  const coach = useAsync(api.coachStatus);
  const compliance = useAsync(api.compliance);
  const [path, setPath] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      const r = await api.importReplays(path || undefined);
      setResult(`${r.imported} importé(s), ${r.duplicates} déjà connu(s), ${r.failed} en échec.`);
      status.reload();
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  if (status.loading) return <Loading />;
  if (status.error) return <ErrorBox message={status.error} />;
  const s = status.data!;

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="title-display text-3xl">Paramètres</h1>
      <Card title="Replays">
        <div className="space-y-2 text-sm">
          <div>Dossier surveillé : <code className="text-storm-300">{s.folder ?? "non trouvé"}</code> {s.folder_exists ? "✔" : "✖"}</div>
          <div>Surveillance automatique : {s.watching ? "active" : "inactive"}</div>
          <div>Identifiant joueur (toon) : <code>{s.toon_handle ?? "–"}</code></div>
          <div>Replays : {Object.entries(s.counts).map(([k, v]) => `${k} ${v}`).join(" · ") || "aucun"}</div>
          <div className="flex gap-2 pt-2">
            <input className="flex-1" placeholder="Autre dossier ou fichier .StormReplay (optionnel)" value={path} onChange={(e) => setPath(e.target.value)} />
            <button className="btn-primary" onClick={runImport} disabled={importing}>{importing ? "Import…" : "Importer"}</button>
          </div>
          {result && <div className="text-gold-300">{result}</div>}
          <p className="text-xs text-slate-500">Le dossier se configure via HOTS_REPLAY_DIR dans backend/.env.</p>
        </div>
      </Card>
      <Card title="Coach IA (Claude)">
        <p className="text-sm">
          {coach.data?.available
            ? <>Actif · modèle <code>{coach.data.model}</code></>
            : <>Inactif : renseignez <code>ANTHROPIC_API_KEY</code> dans backend/.env. Les rapports restent disponibles en mode déterministe.</>}
        </p>
      </Card>
      {compliance.data && (
        <Card title="Conformité Blizzard">
          <p className="mb-3 text-sm text-white">{compliance.data.statement}</p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="card-title">Sources utilisées</h3>
              <List items={Object.values(compliance.data.allowed_sources)} icon="✔" tone="text-emerald-300" />
            </div>
            <div>
              <h3 className="card-title">Jamais</h3>
              <List items={compliance.data.forbidden} icon="✖" tone="text-rose-300" />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
