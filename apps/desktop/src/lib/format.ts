export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? "–" : `${(v * 100).toFixed(digits)} %`;

export const clock = (s: number | null | undefined) => {
  if (s === null || s === undefined) return "–:––";
  const sign = s < 0 ? "-" : "";
  const abs = Math.abs(Math.round(s));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
};

export const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "–";

export const scoreColor = (score: number) =>
  score >= 75 ? "text-gold-400" : score >= 55 ? "text-storm-300" : score >= 40 ? "text-nexus-300" : "text-rose-400";

export const ROLE_FR: Record<string, string> = {
  Tank: "Tank",
  Bruiser: "Combattant",
  "Ranged Assassin": "Assassin à distance",
  "Melee Assassin": "Assassin de mêlée",
  Healer: "Soigneur",
  Support: "Soutien",
};

export const CATEGORY_FR: Record<string, string> = {
  placement: "Placement",
  macro: "Macro",
  teamfight: "Teamfight",
  objectives: "Objectifs",
  survival: "Survie",
  draft: "Draft",
};
