/**
 * Catalogue des phrases du guide vocal : clé stable (voice_key envoyée par le moteur) → texte à lire
 * lors de l'enregistrement d'un profil de voix. Un clip s'enregistre sous <profil>/<clé>.webm.
 */
export type PhraseCategory = "Niveaux" | "Adversaires" | "Objectifs & camps" | "Conseils";

export interface VoicePhrase { key: string; text: string; category: PhraseCategory }

const ALLY_LEVELS = [4, 7, 10, 13, 16, 20];
const ENEMY_LEVELS = [10, 16, 20];
const CAMPS: [string, string][] = [
  ["siege", "Le camp de siège est bientôt disponible."],
  ["bruiser", "Le camp de mercenaires est bientôt disponible."],
  ["boss", "Le boss est bientôt disponible."],
  ["support", "Le camp de soutien est bientôt disponible."],
  ["other", "Un camp est bientôt disponible."],
];

export const VOICE_PHRASES: VoicePhrase[] = [
  ...ALLY_LEVELS.map((l): VoicePhrase => ({ key: `ally-level-${l}`, text: `Niveau ${l} atteint !`, category: "Niveaux" })),
  ...ENEMY_LEVELS.map((l): VoicePhrase => ({ key: `enemy-level-${l}`, text: `L'équipe adverse atteint le niveau ${l} !`, category: "Adversaires" })),
  { key: "talent-disadvantage", text: "Désavantage de talent : évitez les combats !", category: "Adversaires" },
  { key: "objective-soon", text: "L'objectif arrive, regroupez-vous !", category: "Objectifs & camps" },
  ...CAMPS.map(([type, text]): VoicePhrase => ({ key: `camp-${type}`, text, category: "Objectifs & camps" })),
  { key: "tip-no-fight", text: "Ne forcez pas un combat en infériorité de talent.", category: "Conseils" },
  { key: "tip-talent-advantage", text: "Avantage de talent : forcez l'objectif ou un combat !", category: "Conseils" },
  ...[10, 16, 20].map((l): VoicePhrase => ({ key: `tip-level-soon-${l}`, text: `Niveau ${l} imminent : attendez le talent avant d'engager.`, category: "Conseils" })),
  { key: "tip-stay-grouped", text: "Restez groupés !", category: "Conseils" },
];

export const PHRASE_KEYS = new Set(VOICE_PHRASES.map((p) => p.key));
