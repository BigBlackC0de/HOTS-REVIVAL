import { CATEGORY_FR } from "../lib/format";

const AXES = ["placement", "macro", "teamfight", "objectives", "survival", "draft"] as const;

/** Radar hexagonal du HEROS SCORE (SVG pur). */
export function ScoreRadar({ score, size = 240 }: { score: object; size?: number }) {
  const values = score as Partial<Record<string, number>>;
  const pad = 44; // place pour les libellés
  const c = size / 2;
  const r = size / 2 - 34;
  const point = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
    return [c + Math.cos(a) * r * (v / 100), c + Math.sin(a) * r * (v / 100)];
  };
  const polygon = AXES.map((k, i) => point(i, values[k] ?? 0).join(",")).join(" ");
  return (
    <svg width={size + pad * 2} height={size} viewBox={`${-pad} 0 ${size + pad * 2} ${size}`} role="img" aria-label="HEROS SCORE">
      {[25, 50, 75, 100].map((ring) => (
        <polygon key={ring} points={AXES.map((_, i) => point(i, ring).join(",")).join(" ")}
          fill="none" stroke="#2a3060" strokeWidth={1} />
      ))}
      {AXES.map((_, i) => {
        const [x, y] = point(i, 100);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#2a3060" />;
      })}
      <polygon points={polygon} fill="rgba(139,92,246,0.35)" stroke="#a87bff" strokeWidth={2} />
      {AXES.map((k, i) => {
        const [x, y] = point(i, 122);
        return (
          <text key={k} x={x} y={y} fill="#cbd5e1" fontSize={11} textAnchor="middle" dominantBaseline="middle">
            {CATEGORY_FR[k]} <tspan fill="#f5c451" fontWeight={700}>{values[k] ?? "–"}</tspan>
          </text>
        );
      })}
    </svg>
  );
}
