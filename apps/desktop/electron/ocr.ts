/**
 * Traitements purs de la lecture d'écran (testables sans Electron) :
 * binarisation des pixels et interprétation du texte reconnu.
 */

export interface Rect { x: number; y: number; w: number; h: number } // fractions de l'écran (0..1)
export interface Regions { clock: Rect; ally: Rect; enemy: Rect }

/** Zones par défaut (haut-centre du HUD) ; à ajuster via le calibrage si la lecture échoue. */
export const DEFAULT_REGIONS: Regions = {
  clock: { x: 0.475, y: 0.0, w: 0.05, h: 0.035 },
  ally: { x: 0.447, y: 0.02, w: 0.035, h: 0.045 },
  enemy: { x: 0.517, y: 0.02, w: 0.035, h: 0.045 },
};

/** Anciennes zones par défaut (mal placées) : ne doivent pas être prises pour un calibrage manuel. */
export const LEGACY_DEFAULT_REGIONS: Regions = {
  clock: { x: 0.475, y: 0.0, w: 0.05, h: 0.035 },
  ally: { x: 0.415, y: 0.0, w: 0.035, h: 0.05 },
  enemy: { x: 0.55, y: 0.0, w: 0.035, h: 0.05 },
};

/**
 * Image BGRA -> texte sombre sur fond blanc : les chiffres du HUD sont clairs
 * (blanc, bleu ou rouge) sur fond sombre.
 */
export function binarize(bgra: Buffer, threshold = 150): Buffer {
  const out = Buffer.alloc(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) {
    const bright = Math.max(bgra[i], bgra[i + 1], bgra[i + 2]);
    const v = bright >= threshold ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Teinte des chiffres clairs d'une zone BGRA : moyenne de (bleu - rouge). Le niveau de
 * votre équipe est bleuté (> 0), celui de l'adversaire rose (< 0). null si trop peu de pixels.
 */
export function blueness(bgra: Buffer, threshold = 150): number | null {
  let n = 0, sum = 0;
  for (let i = 0; i < bgra.length; i += 4) {
    if (Math.max(bgra[i], bgra[i + 1], bgra[i + 2]) < threshold) continue;
    n++;
    sum += bgra[i] - bgra[i + 2];
  }
  return n >= 50 ? sum / n : null;
}

/** Votre équipe (bleue) est à droite du HUD ? null si les couleurs ne tranchent pas. */
export function allyOnRight(left: number | null, right: number | null, margin = 40): boolean | null {
  if (left === null || right === null || Math.abs(left - right) < margin) return null;
  return right > left;
}

export function parseClock(text: string): number | null {
  const m = /(\d{1,2})\s*[:.]\s*(\d{2})/.exec(text);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (sec > 59 || min > 59) return null;
  return min * 60 + sec;
}

export function parseLevel(text: string): number | null {
  const m = /\d{1,2}/.exec(text.replace(/\s/g, ""));
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 1 && n <= 30 ? n : null;
}

/**
 * Filtre anti-erreur : une valeur n'est retenue que si elle est lue deux fois de suite,
 * et un niveau ne peut pas baisser ni sauter de plus de 3.
 */
export class Stabilizer {
  private candidate: number | null = null;
  value: number | null = null;

  constructor(private readonly accept: (prev: number | null, next: number) => boolean = () => true) {}

  push(read: number | null): number | null {
    if (read === null) return null;
    if (read !== this.candidate) {
      this.candidate = read;
      return null;
    }
    if (read === this.value || !this.accept(this.value, read)) return null;
    this.value = read;
    return read;
  }

  reset(): void {
    this.candidate = null;
    this.value = null;
  }
}

// Première valeur : tout niveau 1-30 (l'application peut démarrer en pleine partie) ;
// ensuite un niveau ne baisse jamais et ne saute pas de plus de 3.
export const levelRule = (prev: number | null, next: number): boolean =>
  prev === null ? next >= 1 && next <= 30 : next >= prev && next - prev <= 3;

/** Empreinte d'une zone binarisée : si elle ne change pas, inutile de relancer l'OCR. */
export function signature(bin: Buffer): string {
  let h = 2166136261;
  for (let i = 0; i < bin.length; i += 4) h = Math.imul(h ^ bin[i], 16777619);
  return `${bin.length}:${h >>> 0}`;
}

export interface OcrWord { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }

/** Bande du haut de l'écran où se trouvent l'horloge et les niveaux d'équipe. */
export const HUD_BAND: Rect = { x: 0.25, y: 0, w: 0.5, h: 0.1 };

/**
 * Repère automatiquement l'horloge (m:ss, la plus proche du centre) et les niveaux
 * d'équipe (nombres 1-30 juste à gauche et à droite) dans la bande du haut.
 * `width`/`height` : taille en pixels de l'image de la bande analysée.
 */
export function locateHud(words: OcrWord[], width: number, height: number, band: Rect = HUD_BAND): Partial<Regions> {
  const frac = (b: OcrWord["bbox"], padX: number, padY: number): Rect => {
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    const x0 = Math.max(0, b.x0 - w * padX), y0 = Math.max(0, b.y0 - h * padY);
    const x1 = Math.min(width, b.x1 + w * padX), y1 = Math.min(height, b.y1 + h * padY);
    return { x: band.x + (x0 / width) * band.w, y: band.y + (y0 / height) * band.h, w: ((x1 - x0) / width) * band.w, h: ((y1 - y0) / height) * band.h };
  };
  const clocks = words.filter((w) => /^\d{1,2}[:.]\d{2}$/.test(w.text.trim()) && parseClock(w.text) !== null);
  if (!clocks.length) return {};
  const cx = width / 2;
  const center = (w: OcrWord) => (w.bbox.x0 + w.bbox.x1) / 2;
  const clockWord = clocks.sort((a, b) => Math.abs(center(a) - cx) - Math.abs(center(b) - cx))[0];
  const cb = clockWord.bbox;
  const ch = cb.y1 - cb.y0, cy = (cb.y0 + cb.y1) / 2;
  const levels = words.filter((w) => {
    const t = w.text.trim();
    if (!/^\d{1,2}$/.test(t) || Number(t) < 1 || Number(t) > 30) return false;
    return Math.abs((w.bbox.y0 + w.bbox.y1) / 2 - cy) <= ch * 3;
  });
  const near = (side: "left" | "right") => levels
    .filter((w) => (side === "left" ? w.bbox.x1 <= cb.x0 : w.bbox.x0 >= cb.x1))
    .sort((a, b) => Math.abs(center(a) - center(clockWord)) - Math.abs(center(b) - center(clockWord)))[0];
  const out: Partial<Regions> = { clock: frac(cb, 0.25, 0.35) };
  const ally = near("left"), enemy = near("right");
  // la zone d'un niveau doit pouvoir contenir 2 chiffres (9 -> 10)
  if (ally) out.ally = frac(ally.bbox, 0.8, 0.35);
  if (enemy) out.enemy = frac(enemy.bbox, 0.8, 0.35);
  return out;
}
