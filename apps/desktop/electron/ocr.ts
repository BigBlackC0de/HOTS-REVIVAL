/**
 * Traitements purs de la lecture d'écran (testables sans Electron) :
 * binarisation des pixels et interprétation du texte reconnu.
 */

export interface Rect { x: number; y: number; w: number; h: number } // fractions de l'écran (0..1)
export interface Regions { clock: Rect; ally: Rect; enemy: Rect }

/**
 * Zones du HUD d'après sa géométrie fixe : centré en haut, taille proportionnelle à la
 * hauteur de l'écran. Mesures en pixels pour 1440 px de haut, relatives au centre :
 * horloge à ±38 px, chiffres de niveau centrés vers -90 et +86 px, « contre » de -33 à +35 px.
 * Chaque zone de niveau contient 2 chiffres (10-30) sans toucher « contre » ni l'horloge.
 * `ally`/`enemy` = zone de GAUCHE/de DROITE (noms historiques) : l'équipe se déduit de la couleur.
 */
export function hudRegions(aspect = 16 / 9): Regions {
  const H = 1440;
  const rect = (x0: number, x1: number, y0: number, y1: number): Rect =>
    ({ x: 0.5 + x0 / H / aspect, y: y0 / H, w: (x1 - x0) / H / aspect, h: (y1 - y0) / H });
  return {
    clock: rect(-38, 38, 0, 28),
    ally: rect(-140, -38, 30, 88),
    enemy: rect(38, 140, 30, 88),
  };
}

/** Zones par défaut (écran 16:9). */
export const DEFAULT_REGIONS: Regions = hudRegions();

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
 * Pixels du chiffre de niveau dans une zone BGRA. Le chiffre est rempli de clair peu saturé
 * (bleu pâle ~(195,219,254), rose pâle ~(246,201,214)) et cerné de noir : on garde ces pixels,
 * puis seules les taches assez hautes (les chiffres), ce qui élimine halos, barres de vie et
 * pseudos des héros visibles derrière le HUD.
 */
export function levelMask(bgra: Buffer, width: number, height: number): Uint8Array {
  const n = width * height;
  const ink = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const b = bgra[p * 4], g = bgra[p * 4 + 1], r = bgra[p * 4 + 2];
    ink[p] = Math.max(r, g, b) >= 170 && Math.min(r, g, b) >= 120 ? 1 : 0;
  }
  const out = new Uint8Array(n);
  const label = new Int32Array(n);
  const stack: number[] = [];
  let id = 0;
  for (let p0 = 0; p0 < n; p0++) {
    if (!ink[p0] || label[p0]) continue;
    id++;
    const pixels: number[] = [];
    let y0 = height, y1 = 0;
    label[p0] = id;
    stack.push(p0);
    while (stack.length) {
      const p = stack.pop()!;
      pixels.push(p);
      const x = p % width, y = (p - x) / width;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (q >= 0 && ink[q] && !label[q]) { label[q] = id; stack.push(q); }
      }
    }
    // chiffre : ~70 % de la hauteur de la zone ; pseudos et barres : bien moins
    if (y1 - y0 + 1 >= height * 0.45) for (const p of pixels) out[p] = 1;
  }
  return out;
}

/**
 * Chiffres seuls, noirs sur fond blanc (BGRA), pour l'OCR. Ramenés à ~60 px de haut :
 * tesseract rate les glyphes trop grands (un « 4 » agrandi x3 n'est pas reconnu).
 */
export function levelImage(mask: Uint8Array, width: number, height: number): { data: Buffer; width: number; height: number } {
  const f = Math.max(1, Math.round(height / 60));
  const W = Math.floor(width / f), H = Math.floor(height / f);
  const data = Buffer.alloc(W * H * 4, 255);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let ink = 0;
    for (let yy = 0; yy < f; yy++) for (let xx = 0; xx < f; xx++) ink += mask[(y * f + yy) * width + x * f + xx];
    const i = (y * W + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.round(255 * (1 - ink / (f * f)));
  }
  return { data, width: W, height: H };
}

/**
 * Teinte du chiffre : moyenne de (bleu - rouge) sur ses pixels. Votre équipe : bleu pâle
 * (~ +60), l'adversaire : rose pâle (~ -40). null si pas de chiffre visible.
 */
export function levelTint(bgra: Buffer, mask: Uint8Array): number | null {
  let n = 0, sum = 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    n++;
    sum += bgra[p * 4] - bgra[p * 4 + 2];
  }
  return n >= mask.length * 0.02 ? sum / n : null;
}

export type TeamColor = "bleu" | "rose";
/** Couleur franche du chiffre ; null si ambiguë (chiffre blanc pendant l'animation, absent...). */
export function teamColor(tint: number | null, margin = 15): TeamColor | null {
  if (tint === null) return null;
  return tint >= margin ? "bleu" : tint <= -margin ? "rose" : null;
}

/**
 * Votre équipe (bleue) est à droite du HUD ? Seulement si un côté est franchement bleu
 * ET l'autre franchement rose ; null sinon (on ne devine jamais).
 */
export function allyOnRight(left: TeamColor | null, right: TeamColor | null): boolean | null {
  if (left === "rose" && right === "bleu") return true;
  if (left === "bleu" && right === "rose") return false;
  return null;
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

  /** Recale sur une valeur sûre (correction manuelle du joueur). */
  sync(value: number): void {
    if (value === this.value) return;
    this.candidate = null;
    this.value = value;
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
 * Repère automatiquement l'horloge (m:ss, la plus proche du centre) dans la bande du haut.
 * Les zones de niveau n'en dépendent plus : elles suivent la géométrie fixe du HUD (hudRegions).
 * `width`/`height` : taille en pixels de l'image de la bande analysée.
 */
export function locateClock(words: OcrWord[], width: number, height: number, band: Rect = HUD_BAND): Rect | null {
  const clocks = words.filter((w) => /^\d{1,2}[:.]\d{2}$/.test(w.text.trim()) && parseClock(w.text) !== null);
  if (!clocks.length) return null;
  const center = (w: OcrWord) => (w.bbox.x0 + w.bbox.x1) / 2;
  const b = clocks.sort((a, c) => Math.abs(center(a) - width / 2) - Math.abs(center(c) - width / 2))[0].bbox;
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const x0 = Math.max(0, b.x0 - w * 0.25), y0 = Math.max(0, b.y0 - h * 0.35);
  const x1 = Math.min(width, b.x1 + w * 0.25), y1 = Math.min(height, b.y1 + h * 0.35);
  return { x: band.x + (x0 / width) * band.w, y: band.y + (y0 / height) * band.h, w: ((x1 - x0) / width) * band.w, h: ((y1 - y0) / height) * band.h };
}

export interface LevelRead { value: number | null; color: TeamColor | null }

/** Répartit les niveaux gauche/droite entre votre équipe et l'adversaire selon le côté verrouillé. */
export function assignLevels(side: boolean | null, left: LevelRead, right: LevelRead): { ally: number | null; enemy: number | null } {
  if (side === null) return { ally: null, enemy: null };
  const a = side ? right : left, e = side ? left : right;
  // couleur contraire au côté retenu : lecture écartée (jamais attribuée à la mauvaise équipe)
  return { ally: a.color === "rose" ? null : a.value, enemy: e.color === "bleu" ? null : e.value };
}
