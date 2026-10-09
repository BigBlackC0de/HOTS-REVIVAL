import { useEffect, useState } from "react";
import { bridge, type UpdateStatus } from "../lib/bridge";

function useUpdateStatus(): [UpdateStatus | null, (s: UpdateStatus) => void] {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    const b = bridge();
    if (!b) return;
    void b.updater.status().then(setStatus);
    return b.updater.onStatus(setStatus);
  }, []);
  return [status, setStatus];
}

/** Bandeau en haut de chaque page dès qu'une nouvelle version est publiée. */
export function UpdateBanner() {
  const [status] = useUpdateStatus();
  const [hidden, setHidden] = useState<string | null>(null);
  const b = bridge();
  if (!b || !status || !["available", "downloading", "ready"].includes(status.state)) return null;
  if (hidden === `${status.state}-${status.version}`) return null;

  return (
    <div className="mb-6 flex items-center gap-4 rounded-xl border border-gold-500/60 bg-gradient-to-r from-gold-500/20 to-void-850 px-5 py-4 shadow-gold">
      <span className="text-2xl text-gold-400">⬆</span>
      <div className="flex-1">
        <div className="font-semibold text-white">
          {status.state === "ready" ? `Version ${status.version} prête à installer` : `Nouvelle version disponible : ${status.version}`}
        </div>
        <div className="text-xs text-slate-400">
          {status.state === "downloading"
            ? `Téléchargement… ${status.percent ?? 0} %`
            : `Vous avez la version ${status.current}. La mise à jour prend quelques secondes.`}
        </div>
        {status.state === "downloading" && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-void-700">
            <div className="h-full bg-gold-400 transition-all" style={{ width: `${status.percent ?? 0}%` }} />
          </div>
        )}
      </div>
      {status.state === "available" && (
        <button className="btn-gold px-5" onClick={() => void b.updater.download()}>Mettre à jour</button>
      )}
      {status.state === "ready" && (
        <button className="btn-gold px-5" onClick={() => void b.updater.install()}>Redémarrer et installer</button>
      )}
      {status.state !== "downloading" && (
        <button className="text-slate-400 hover:text-white" title="Plus tard" aria-label="Plus tard"
          onClick={() => setHidden(`${status.state}-${status.version}`)}>✕</button>
      )}
    </div>
  );
}

/** Bouton de mise à jour : apparaît dès qu'une nouvelle version est publiée. */
export function UpdateButton({ full = false }: { full?: boolean }) {
  const [status, setStatus] = useUpdateStatus();

  const b = bridge();
  if (!b || !status) return null;

  if (status.state === "available")
    return (
      <button className="btn-gold w-full justify-center" onClick={() => void b.updater.download()}>
        Mettre à jour (v{status.version})
      </button>
    );
  if (status.state === "downloading")
    return <div className="text-center text-xs text-gold-300">Téléchargement… {status.percent ?? 0} %</div>;
  if (status.state === "ready")
    return (
      <button className="btn-gold w-full justify-center" onClick={() => void b.updater.install()}>
        Redémarrer et installer v{status.version}
      </button>
    );
  if (!full)
    return (
      <button className="text-left text-slate-500 hover:text-white" disabled={status.state === "checking"}
        onClick={() => void b.updater.check().then(setStatus)}>
        v{status.current} · {status.state === "checking" ? "vérification…" : status.state === "none" ? "à jour" : "vérifier les mises à jour"}
      </button>
    );
  return (
    <div className="flex items-center gap-3 text-sm">
      <span>Version {status.current}</span>
      <button className="btn-ghost" disabled={status.state === "checking"} onClick={() => void b.updater.check().then(setStatus)}>
        {status.state === "checking" ? "Vérification…" : "Vérifier les mises à jour"}
      </button>
      {status.state === "none" && <span className="text-xs text-emerald-300">Vous avez la dernière version.</span>}
      {status.state === "error" && <span className="text-xs text-rose-300">Vérification impossible : {status.message}</span>}
    </div>
  );
}
