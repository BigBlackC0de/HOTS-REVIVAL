/** Synthèse vocale (voix installées sur Windows) : guide audible quel que soit le mode d'affichage du jeu. */
export interface VoiceOptions { voiceName?: string | null; rate?: number; volume?: number }

export function listVoices(): SpeechSynthesisVoice[] {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  // voix françaises d'abord
  return [...voices].sort((a, b) => Number(b.lang.startsWith("fr")) - Number(a.lang.startsWith("fr")));
}

function pickVoice(name?: string | null): SpeechSynthesisVoice | null {
  const voices = listVoices();
  return voices.find((v) => v.name === name) ?? voices.find((v) => v.lang.toLowerCase().startsWith("fr")) ?? null;
}

export function speak(text: string, opts: VoiceOptions = {}): void {
  const synth = window.speechSynthesis;
  if (!synth) return;
  // « 30 s » -> « 30 secondes » : seulement après un nombre (\b ignore les accents : « groupés » cassait)
  const spoken = text.replace(/≈/g, "environ")
    .replace(/(\d+)\s?s(?![\p{L}\d])/gu, (_, n: string) => `${n} seconde${n === "1" || n === "0" ? "" : "s"}`);
  const u = new SpeechSynthesisUtterance(spoken);
  const voice = pickVoice(opts.voiceName);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "fr-FR";
  u.rate = opts.rate ?? 1.05;
  u.volume = opts.volume ?? 1;
  synth.speak(u);
}
