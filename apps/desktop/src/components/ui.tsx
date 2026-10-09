import type { ReactNode } from "react";

export function Card({ title, children, className = "", action }: {
  title?: string; children: ReactNode; className?: string; action?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="card-title mb-0">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "text-white" }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: string;
}) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-widest text-slate-400">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${tone}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export function Bar({ value, max = 100, color = "from-storm-500 to-nexus-500" }: {
  value: number; max?: number; color?: string;
}) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-void-700">
      <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function List({ items, icon = "•", tone = "text-slate-300", empty = "Rien à signaler." }: {
  items: string[]; icon?: string; tone?: string; empty?: string;
}) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className={`flex gap-2 text-sm ${tone}`}>
          <span className="select-none">{icon}</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 py-12 text-center">
      <div className="title-display text-xl">{title}</div>
      <div className="max-w-lg text-sm text-slate-400">{children}</div>
    </div>
  );
}

export function Loading() {
  return <div className="animate-pulse p-6 text-sm text-slate-400">Chargement…</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="card border-rose-800 text-sm text-rose-300">
      {message}
      <div className="mt-1 text-xs text-slate-400">Le moteur d&apos;analyse ne répond pas : fermez puis relancez HOTS REVIVAL.</div>
    </div>
  );
}
