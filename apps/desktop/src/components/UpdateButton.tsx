import { useEffect, useState } from "react";
import { bridge, type UpdateStatus } from "../lib/bridge";

/** Bouton de mise à jour : apparaît dès qu'une nouvelle version est publiée. */
export function UpdateButton({ full = false }: { full?: boolean }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    const b = bridge();
    if (!b) return;
    void b.updater.status().then(setStatus);
    return b.updater.onStatus(setStatus);
  }, []);

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
  if (!full) return null;
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
