import { useCallback, useEffect, useRef, useState } from "react";
import { trimSilence } from "../lib/audioTrim";
import { bridge, type OverlayPrefs, type VoiceClip } from "../lib/bridge";
import { clipUrl, forgetClips, playUrl } from "../lib/voice";
import { VOICE_PHRASES, type PhraseCategory } from "../lib/voicePhrases";

const MAX_RECORD_MS = 10_000;
const CATEGORIES: PhraseCategory[] = ["Niveaux", "Adversaires", "Objectifs & camps", "Conseils"];
const errText = (err: unknown) => (err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(err));

/**
 * Profils de voix : le joueur enregistre lui-même chaque phrase du guide (par ex. avec un changeur de voix
 * comme Voicemod, qui apparaît comme un micro). Le guide joue ces clips à la place de la voix Windows.
 */
export function VoiceProfiles() {
  const b = bridge();
  const [prefs, setPrefs] = useState<OverlayPrefs | null>(null);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [profile, setProfile] = useState<string | null>(null); // profil affiché (édition)
  const [clips, setClips] = useState<Map<string, VoiceClip>>(new Map());
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);
  const [trim, setTrim] = useState(true);
  const [unmatched, setUnmatched] = useState<{ path: string; name: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  const loadMics = useCallback(async () => {
    const devices = await navigator.mediaDevices?.enumerateDevices().catch(() => []) ?? [];
    setMics(devices.filter((d) => d.kind === "audioinput"));
  }, []);

  const loadClips = useCallback(async (p: string | null) => {
    if (!b || !p) { setClips(new Map()); return; }
    try {
      setClips(new Map((await b.voices.clips(p)).map((c) => [c.key, c])));
    } catch (err) {
      setMessage(errText(err));
    }
  }, [b]);

  useEffect(() => {
    if (!b) return;
    void (async () => {
      const [p, list] = await Promise.all([b.prefs.get(), b.voices.profiles()]);
      setPrefs(p);
      setProfiles(list);
      setProfile(p.voiceProfile && list.includes(p.voiceProfile) ? p.voiceProfile : list[0] ?? null);
    })();
    void loadMics();
    navigator.mediaDevices?.addEventListener("devicechange", loadMics);
    const off = b.onPrefs(setPrefs);
    return () => {
      off();
      navigator.mediaDevices?.removeEventListener("devicechange", loadMics);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, [b, loadMics]);

  useEffect(() => { void loadClips(profile); }, [profile, loadClips]);

  if (!b || !prefs) return null;
  const update = async (next: Partial<OverlayPrefs>) => setPrefs(await b.prefs.set(next));
  const run = async (fn: () => Promise<unknown>) => {
    setMessage(null);
    try { await fn(); } catch (err) { setMessage(errText(err)); }
  };
  const refreshProfiles = async (select: string | null) => {
    setProfiles(await b.voices.profiles());
    setProfile(select);
  };

  const submitName = () => run(async () => {
    if (renaming && profile) {
      const renamed = await b.voices.rename(profile, name);
      forgetClips(profile);
      await refreshProfiles(renamed);
    } else {
      const created = await b.voices.create(name);
      await refreshProfiles(created);
      await update({ voiceProfile: created });
    }
    setName("");
    setRenaming(false);
  });

  const removeProfile = () => run(async () => {
    if (!profile || !window.confirm(`Supprimer le profil « ${profile} » et tous ses enregistrements ?`)) return;
    await b.voices.remove(profile);
    forgetClips(profile);
    const list = await b.voices.profiles();
    await refreshProfiles(list[0] ?? null);
  });

  // Les noms des micros ne sont visibles qu'après une première autorisation d'accès.
  const unlockMics = () => run(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    await loadMics();
  });

  const start = (key: string) => run(async () => {
    if (!profile || recorder.current) return;
    const deviceId = prefs.micDeviceId;
    // traitements désactivés : la voix transformée (Voicemod) doit arriver telle quelle
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    void loadMics(); // les noms apparaissent après la première autorisation
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    const chunks: Blob[] = [];
    const target = profile;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => void run(async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setRecording(null);
      const raw = new Blob(chunks, { type: "audio/webm" });
      const trimmed = trim ? await trimSilence(raw) : null;
      const blob = trimmed ?? raw;
      if (trim && !trimmed) setMessage("Silence non coupé (enregistrement vide ou illisible) : vérifiez le micro.");
      await b.voices.save(target, key, new Uint8Array(await blob.arrayBuffer()), trimmed ? "wav" : "webm");
      forgetClips(target);
      await loadClips(target);
    });
    recorder.current = rec;
    setRecording(key);
    rec.start();
    window.setTimeout(() => { if (recorder.current === rec && rec.state === "recording") rec.stop(); }, MAX_RECORD_MS);
  });

  const stop = () => { if (recorder.current?.state === "recording") recorder.current.stop(); };

  const listen = (key: string) => run(async () => {
    const url = profile ? await clipUrl(profile, key) : null;
    if (url) await playUrl(url, prefs.volume);
  });

  const removeClip = (key: string) => run(async () => {
    if (!profile) return;
    await b.voices.deleteClip(profile, key);
    forgetClips(profile);
    await loadClips(profile);
  });

  const importFiles = () => run(async () => {
    if (!profile) return;
    const res = await b.voices.import(profile, VOICE_PHRASES.map((p) => p.key));
    setUnmatched(res.unmatched);
    forgetClips(profile);
    await loadClips(profile);
    if (res.imported.length || res.unmatched.length) {
      setMessage(`${res.imported.length} fichier(s) importé(s)${res.unmatched.length ? `, ${res.unmatched.length} à attribuer ci-dessous` : ""}.`);
    }
  });

  const assign = (file: string, key: string) => run(async () => {
    if (!profile || !key) return;
    await b.voices.assign(profile, key, file);
    setUnmatched((u) => u.filter((f) => f.path !== file));
    forgetClips(profile);
    await loadClips(profile);
  });

  const recorded = VOICE_PHRASES.filter((p) => clips.has(p.key)).length;
  const hiddenLabels = mics.some((m) => !m.label);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-[140px_1fr] items-center gap-3">
        <span>Voix du guide</span>
        <select value={prefs.voiceProfile ?? ""} onChange={(e) => void update({ voiceProfile: e.target.value || null })}>
          <option value="">Voix Windows (synthèse)</option>
          {profiles.map((p) => <option key={p} value={p}>Profil « {p} »</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-400">
        Une phrase non enregistrée dans le profil choisi est lue par la voix Windows. Volume et activation du guide : réglages ci-dessus.
      </p>

      <div className="space-y-2 border-t border-void-700 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span>Profil à enregistrer</span>
          <select value={profile ?? ""} onChange={(e) => { setProfile(e.target.value || null); setUnmatched([]); }}>
            {!profiles.length && <option value="">Aucun profil</option>}
            {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {profile && <button className="btn-ghost py-1" onClick={() => { setRenaming(true); setName(profile); }}>Renommer</button>}
          {profile && <button className="btn-ghost py-1" onClick={() => void removeProfile()}>Supprimer</button>}
          {profile && <button className="btn-ghost py-1" onClick={() => void b.voices.openFolder(profile)}>Ouvrir le dossier</button>}
          {profile && <button className="btn-ghost py-1" onClick={() => void importFiles()}>Importer des fichiers…</button>}
        </div>
        <div className="flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40}
            placeholder={renaming ? "Nouveau nom du profil" : "Nom d'un nouveau profil (ex. Annonceur)"}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && void submitName()} />
          <button className="btn-gold py-1" disabled={!name.trim()} onClick={() => void submitName()}>{renaming ? "Renommer" : "Créer le profil"}</button>
          {renaming && <button className="btn-ghost py-1" onClick={() => { setRenaming(false); setName(""); }}>Annuler</button>}
        </div>
      </div>

      <div className="space-y-2 border-t border-void-700 pt-3">
        <div className="grid grid-cols-[140px_1fr] items-center gap-3">
          <span>Micro</span>
          <select value={prefs.micDeviceId ?? ""} onChange={(e) => void update({ micDeviceId: e.target.value || null })}>
            <option value="">Micro par défaut de Windows</option>
            {mics.filter((m) => m.deviceId && m.deviceId !== "default").map((m, i) => (
              <option key={m.deviceId} value={m.deviceId}>{m.label || `Micro ${i + 1}`}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          {hiddenLabels && <button className="btn-ghost py-1" onClick={() => void unlockMics()}>Afficher les noms des micros</button>}
          <span>Avec Voicemod, choisissez « Voicemod Virtual Audio Device » : la voix transformée est enregistrée.</span>
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
          <span>Couper automatiquement les silences au début et à la fin (enregistré en WAV)</span>
        </label>
      </div>

      {message && <div className="text-gold-300">{message}</div>}

      {unmatched.length > 0 && (
        <div className="space-y-1 rounded-lg border border-void-600 p-3">
          <div className="text-xs text-slate-400">Fichiers dont le nom ne correspond à aucune phrase : choisissez la phrase.</div>
          {unmatched.map((f) => (
            <div key={f.path} className="flex items-center gap-2">
              <span className="w-56 truncate" title={f.path}>{f.name}</span>
              <select defaultValue="" onChange={(e) => void assign(f.path, e.target.value)}>
                <option value="">— Phrase —</option>
                {VOICE_PHRASES.map((p) => <option key={p.key} value={p.key}>{p.text}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {profile && (
        <div className="space-y-3 border-t border-void-700 pt-3">
          <div className="flex items-center gap-3">
            <span className="font-semibold">{recorded}/{VOICE_PHRASES.length} phrases enregistrées</span>
            <div className="h-1.5 flex-1 rounded bg-void-700">
              <div className="h-1.5 rounded bg-gold-500" style={{ width: `${(recorded / VOICE_PHRASES.length) * 100}%` }} />
            </div>
          </div>
          {CATEGORIES.map((cat) => (
            <div key={cat}>
              <h3 className="card-title mb-1">{cat}</h3>
              <div className="divide-y divide-void-700">
                {VOICE_PHRASES.filter((p) => p.category === cat).map((p) => {
                  const has = clips.has(p.key);
                  const rec = recording === p.key;
                  return (
                    <div key={p.key} className="flex items-center gap-2 py-1.5">
                      <span className={`w-4 text-center ${has ? "text-emerald-400" : "text-slate-600"}`} title={has ? "Enregistrée" : "Manquante"}>
                        {has ? "✔" : "○"}
                      </span>
                      <span className="flex-1">« {p.text} »<span className="ml-2 text-[10px] text-slate-500">{p.key}</span></span>
                      {rec
                        ? <button className="btn-gold py-1" onClick={stop}>■ Stop</button>
                        : <button className="btn-ghost py-1" disabled={recording !== null} onClick={() => void start(p.key)}>● Enregistrer</button>}
                      <button className="btn-ghost py-1" disabled={!has || rec} onClick={() => void listen(p.key)}>▶ Écouter</button>
                      <button className="btn-ghost py-1" disabled={!has || rec} onClick={() => void removeClip(p.key)} title="Supprimer l'enregistrement">🗑</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-400">
            Lisez la phrase après avoir cliqué sur « Enregistrer », puis « Stop » (arrêt automatique après 10 s).
            Fichiers rangés dans le dossier du profil sous le nom de la clé (ex. ally-level-10.webm) : un fichier
            importé nommé ainsi est reconnu automatiquement.
          </p>
        </div>
      )}
    </div>
  );
}
