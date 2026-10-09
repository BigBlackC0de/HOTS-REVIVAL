/** Synthèse vocale (voix française de Windows) : alertes audibles quel que soit le mode d'affichage du jeu. */
let frenchVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (frenchVoice) return frenchVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  frenchVoice = voices.find((v) => v.lang.toLowerCase().startsWith("fr")) ?? null;
  return frenchVoice;
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { frenchVoice = null; pickVoice(); };
}

export function speak(text: string): void {
  const synth = window.speechSynthesis;
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(text.replace(/≈/g, "environ"));
  const voice = pickVoice();
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "fr-FR";
  u.rate = 1.1;
  synth.speak(u);
}
