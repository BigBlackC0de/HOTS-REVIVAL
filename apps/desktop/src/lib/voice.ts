/**
 * Guide audible quel que soit le mode d'affichage du jeu : clips du profil de voix enregistré par le joueur
 * quand la phrase existe, sinon synthèse vocale (voix installées sur Windows).
 */
import { bridge } from "./bridge";

export interface VoiceOptions { voiceName?: string | null; rate?: number; volume?: number; voiceProfile?: string | null }

export function listVoices(): SpeechSynthesisVoice[] {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  // voix françaises d'abord
  return [...voices].sort((a, b) => Number(b.lang.startsWith("fr")) - Number(a.lang.startsWith("fr")));
}

function pickVoice(name?: string | null): SpeechSynthesisVoice | null {
  const voices = listVoices();
  return voices.find((v) => v.name === name) ?? voices.find((v) => v.lang.toLowerCase().startsWith("fr")) ?? null;
}

function utterance(text: string, opts: VoiceOptions): SpeechSynthesisUtterance {
  // « 30 s » -> « 30 secondes » : seulement après un nombre (\b ignore les accents : « groupés » cassait)
  const spoken = text.replace(/≈/g, "environ")
    .replace(/(\d+)\s?s(?![\p{L}\d])/gu, (_, n: string) => `${n} seconde${n === "1" || n === "0" ? "" : "s"}`);
  const u = new SpeechSynthesisUtterance(spoken);
  const voice = pickVoice(opts.voiceName);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "fr-FR";
  u.rate = opts.rate ?? 1.05;
  u.volume = opts.volume ?? 1;
  return u;
}

/** Lecture immédiate par la synthèse Windows (bouton « Tester la voix »). */
export function speak(text: string, opts: VoiceOptions = {}): void {
  window.speechSynthesis?.speak(utterance(text, opts));
}

function speakAsync(text: string, opts: VoiceOptions): Promise<void> {
  const synth = window.speechSynthesis;
  if (!synth) return Promise.resolve();
  return new Promise((resolve) => {
    const u = utterance(text, opts);
    // garde-fou : onend n'est pas toujours émis par Chromium
    const timer = window.setTimeout(resolve, 2000 + text.length * 120);
    u.onend = u.onerror = () => { window.clearTimeout(timer); resolve(); };
    synth.speak(u);
  });
}

// ---- clips des profils de voix --------------------------------------------------------------
const clipUrls = new Map<string, Promise<string | null>>(); // « profil/clé » -> URL blob (null = pas enregistré)

/** Vide le cache (clip enregistré, supprimé ou profil renommé). */
export function forgetClips(profile?: string): void {
  for (const [id, url] of clipUrls) {
    if (profile && !id.startsWith(`${profile}/`)) continue;
    void url.then((u) => u && URL.revokeObjectURL(u));
    clipUrls.delete(id);
  }
}

export function clipUrl(profile: string, key: string): Promise<string | null> {
  const id = `${profile}/${key}`;
  let url = clipUrls.get(id);
  if (!url) {
    url = (bridge()?.voices.read(profile, key) ?? Promise.resolve(null))
      .then((clip) => (clip ? URL.createObjectURL(new Blob([clip.data], { type: clip.mime })) : null))
      .catch(() => null);
    clipUrls.set(id, url);
  }
  return url;
}

export function playUrl(url: string, volume = 1): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    const timer = window.setTimeout(resolve, 15_000);
    const done = () => { window.clearTimeout(timer); resolve(); };
    audio.onended = audio.onerror = done;
    audio.play().catch(done);
  });
}

// ---- file d'attente : une annonce à la fois, clips et synthèse confondus ----------------------
export interface Announcement { text: string; key?: string | null }
const MAX_PENDING = 4;
const queue: { item: Announcement; opts: VoiceOptions }[] = [];
let playing = false;

async function drain(): Promise<void> {
  if (playing) return;
  playing = true;
  try {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const { item, opts } = next;
      const url = opts.voiceProfile && item.key ? await clipUrl(opts.voiceProfile, item.key) : null;
      if (url) await playUrl(url, opts.volume ?? 1);
      else await speakAsync(item.text, opts);
    }
  } finally {
    playing = false;
  }
}

/** Annonce une phrase : le clip enregistré de la clé s'il existe dans le profil choisi, sinon la voix Windows. */
export function announce(item: Announcement, opts: VoiceOptions = {}): void {
  if (queue.length >= MAX_PENDING) queue.shift(); // en retard : on abandonne la plus ancienne
  queue.push({ item, opts });
  void drain();
}
