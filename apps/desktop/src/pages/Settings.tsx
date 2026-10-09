import { FormEvent, useEffect, useState } from "react";
import { Card, ErrorBox, List, Loading } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { bridge } from "../lib/bridge";

export function Settings() {
  const settings = useAsync(api.settings);
  const status = useAsync(api.replayStatus);
  const compliance = useAsync(api.compliance);
  const [replayDir, setReplayDir] = useState("");
  const [battletag, setBattletag] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) {
      setReplayDir(settings.data.replay_dir || settings.data.replay_dir_detected || "");
      setBattletag(settings.data.player_battletag);
    }
  }, [settings.data]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(null);
    setSaveError(null);
    try {
      const body: Record<string, string> = { player_battletag: battletag };
      if (replayDir && replayDir !== settings.data?.replay_dir_detected) body.replay_dir = replayDir;
      if (apiKey) body.anthropic_api_key = apiKey;
      settings.setData(await api.saveSettings(body));
      setApiKey("");
      setSaved("Paramètres enregistrés.");
      status.reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const runImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const r = await api.importReplays();
      setImportResult(`${r.imported} partie(s) importée(s), ${r.duplicates} déjà connue(s), ${r.failed} en échec.`);
      status.reload();
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  if (settings.loading) return <Loading />;
  if (settings.error) return <ErrorBox message={settings.error} />;
  const s = settings.data!;
  const counts = status.data?.counts ?? {};

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="title-display text-3xl">Paramètres</h1>

      <form onSubmit={save}>
        <Card title="Mon compte" action={<button className="btn-primary">Enregistrer</button>}>
          <div className="grid gap-4">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-300">Dossier des replays</span>
              <input value={replayDir} onChange={(e) => setReplayDir(e.target.value)}
                placeholder="C:\Users\…\Documents\Heroes of the Storm\Accounts\…\Replays\Multiplayer" />
              <span className="text-xs text-slate-500">
                {s.replay_dir_exists ? "✔ Dossier trouvé" : "✖ Dossier introuvable : collez le chemin de votre dossier Replays\\Multiplayer"}
                {s.player_toon_handle && <> · compte détecté <code>{s.player_toon_handle}</code></>}
              </span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-300">BattleTag</span>
              <input value={battletag} onChange={(e) => setBattletag(e.target.value)} placeholder="Pseudo#1234" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-300">Clé Claude (coach IA)</span>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={s.has_api_key ? "•••••••• (clé enregistrée — laisser vide pour la conserver)" : "sk-ant-…"} autoComplete="off" />
              <span className="text-xs text-slate-500">
                {s.has_api_key ? "✔ Coach IA actif" : "Optionnel : sans clé, les rapports restent disponibles (version sans IA)."}{" "}
                Clé à créer sur console.anthropic.com. Elle reste sur votre PC.
              </span>
            </label>
            {saved && <div className="text-sm text-emerald-300">{saved}</div>}
            {saveError && <div className="text-sm text-rose-300">{saveError}</div>}
          </div>
        </Card>
      </form>

      <Card title="Replays">
        <div className="space-y-2 text-sm">
          <div>Import automatique : {status.data?.watching ? "✔ actif — chaque partie terminée est analysée" : "inactif (dossier introuvable)"}</div>
          <div>Parties analysées : {counts.parsed ?? 0}{counts.failed ? ` · ${counts.failed} replay(s) illisible(s)` : ""}</div>
          <div className="flex gap-2 pt-1">
            <button className="btn-gold" onClick={runImport} disabled={importing}>{importing ? "Import en cours…" : "Importer mes anciens replays"}</button>
            {bridge() && <button className="btn-ghost" onClick={() => void bridge()?.openPath("logs")}>Ouvrir le journal</button>}
          </div>
          {importResult && <div className="text-gold-300">{importResult}</div>}
        </div>
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
      <p className="text-xs text-slate-500">Données stockées dans {s.data_dir}</p>
    </div>
  );
}
