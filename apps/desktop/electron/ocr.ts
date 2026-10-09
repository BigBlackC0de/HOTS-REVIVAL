/**
 * Traitements purs de la lecture d'écran (testables sans Electron) :
 * binarisation des pixels et interprétation du texte reconnu.
 */

export interface Rect { x: number; y: number; w: number; h: number } // fractions de l'écran (0..1)
export interface Regions { clock: Rect; ally: Rect; enemy: Rect }

/** Zones par défaut (haut-centre du HUD) ; à ajuster via le calibrage si la lecture échoue. */
export const DEFAULT_REGIONS: Regions = {
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
