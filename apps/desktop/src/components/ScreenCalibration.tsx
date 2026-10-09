import { MouseEvent, useEffect, useRef, useState } from "react";
import { bridge, type Rect, type Regions, type ScreenConfig, type ScreenReading } from "../lib/bridge";
import { clock } from "../lib/format";

const ZONES: { key: keyof Regions; label: string; color: string }[] = [
  { key: "clock", label: "Horloge", color: "#f5c451" },
  { key: "ally", label: "Niveau allié", color: "#46a8ff" },
  { key: "enemy", label: "Niveau adverse", color: "#f43f5e" },
];

/** Activation et calibrage de la lecture d'écran (horloge + niveaux d'équipe). */
export function ScreenCalibration() {
  const b = bridge();
  const [cfg, setCfg] = useState<ScreenConfig | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [zone, setZone] = useState<keyof Regions>("clock");
  const [reading, setReading] = useState<ScreenReading | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void b?.screen.status().then((s) => { setCfg(s.config); setReading(s.last); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!b || !cfg) return null;

  const toggle = async (enabled: boolean) => setCfg(await b.screen.save({ enabled }));

  const capture = async (fresh: boolean) => {
    const res = await b.screen.capture(fresh);
    if (!res) { setMessage("Aucune capture disponible : appuyez sur Ctrl+Shift+K pendant une partie."); return; }
    setImage(res.image);
    setReading(res.reading);
    setMessage(null);
  };

  const pos = (e: MouseEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const finish = async (e: MouseEvent) => {
    if (!drag) return;
    const p = pos(e);
    const rect: Rect = { x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) };
    setDrag(null);
    if (rect.w < 0.005 || rect.h < 0.005) return;
    const regions = { ...cfg.regions, [zone]: rect };
    setCfg({ ...cfg, regions });
    setReading(await b.screen.test(regions));
  };

  const save = async () => {
    setCfg(await b.screen.save({ regions: cfg.regions }));
    setMessage("Zones enregistrées.");
  };

  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => void toggle(e.target.checked)} />
        <span>Lire automatiquement l'horloge et les niveaux d'équipe à l'écran pendant les parties (recommandé)</span>
      </label>
      <p className="text-xs text-slate-400">
        Activée par défaut. L'horloge et les niveaux sont repérés tout seuls en haut de l'écran du jeu ; seules ces
        petites zones publiques sont lues (jamais la mini-carte), sans rien enregistrer ni envoyer au jeu, avec un flux
        d'écran léger qui ne fait pas ramer. Zones actuelles : <b>{cfg.regionsSource === "manuel" ? "placées à la main" : cfg.regionsSource === "auto" ? "repérées automatiquement" : "par défaut (repérage à la première partie)"}</b>.
        Si la lecture échoue : en jeu, appuyez sur <b>Ctrl+Shift+K</b>, puis revenez ici et cliquez sur « Utiliser la
        capture faite en jeu » pour placer les zones à la main.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={() => void capture(false)}>Utiliser la capture faite en jeu</button>
        {ZONES.map((z) => (
          <button key={z.key} onClick={() => setZone(z.key)}
            className={`btn-ghost ${zone === z.key ? "border-gold-400 text-white" : ""}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: z.color }} /> {z.label}
          </button>
        ))}
        {cfg.regionsSource === "manuel" && (
          <button className="btn-ghost ml-auto" onClick={() => void b.screen.save({ regionsSource: "défaut" }).then(setCfg)}>Repérage automatique</button>
        )}
        <button className={`btn-primary ${cfg.regionsSource === "manuel" ? "" : "ml-auto"}`} onClick={() => void save()}>Enregistrer les zones</button>
      </div>
      {message && <div className="text-gold-300">{message}</div>}
      {reading && (
        <div className="flex gap-4 text-xs">
          <span>Lu : horloge <b className="text-gold-300">{reading.clock !== null ? clock(reading.clock) : "—"}</b></span>
          <span>allié <b className="text-storm-300">{reading.ally ?? "—"}</b></span>
          <span>adverse <b className="text-rose-300">{reading.enemy ?? "—"}</b></span>
        </div>
      )}
      {image && (
        <>
          <p className="text-xs text-slate-500">Sélectionnez une zone puis tracez un rectangle autour du texte correspondant.</p>
          <div ref={box} className="relative cursor-crosshair select-none overflow-hidden rounded-lg border border-void-600"
            onMouseDown={(e) => setDrag(pos(e))} onMouseUp={(e) => void finish(e)}>
            <img src={image} alt="Capture du jeu" className="block w-full" draggable={false} />
            {ZONES.map((z) => {
              const r = cfg.regions[z.key];
              return (
                <div key={z.key} className="pointer-events-none absolute border-2"
                  style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, borderColor: z.color }} />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
