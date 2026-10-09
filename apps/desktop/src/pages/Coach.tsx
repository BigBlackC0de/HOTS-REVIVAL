import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { useAsync } from "../hooks/useAsync";
import { api, streamCoach } from "../lib/api";
import { track } from "../lib/analytics";

const QUICK = [
  "Pourquoi ai-je perdu ?",
  "Pourquoi ai-je gagné ?",
  "Que dois-je améliorer ?",
  "Pourquoi est-ce que je meurs autant ?",
  "Mon positionnement est-il correct ?",
];

interface Msg { role: "user" | "assistant"; content: string }

export function Coach() {
  const [params] = useSearchParams();
  const status = useAsync(api.coachStatus);
  const matches = useAsync(() => api.matches(15));
  const [matchId, setMatchId] = useState<number | null>(params.get("match") ? Number(params.get("match")) : null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    const append = (t: string) =>
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: m[m.length - 1].content + t }]);
    try {
      await streamCoach({ message: text, conversation_id: conversationId, match_id: matchId }, (event, data) => {
        if (event === "start") setConversationId(data.conversation_id as number);
        if (event === "delta") append(data.text as string);
        if (event === "error") append(`\n\n_${data.message as string}_`);
      });
      track("coach_question", { quick: QUICK.includes(text) });
    } catch (e) {
      append(`_Erreur : ${e instanceof Error ? e.message : String(e)}_`);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void send(input); };

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="title-display text-3xl">Coach IA</h1>
          <p className="text-xs text-slate-400">
            {status.data?.available ? `Propulsé par Claude (${status.data.model})` : "Mode hors-ligne : configurez votre clé Claude dans les paramètres."}
          </p>
        </div>
        <select className="w-72" value={matchId ?? ""} onChange={(e) => { setMatchId(e.target.value ? Number(e.target.value) : null); setConversationId(null); setMessages([]); }}>
          <option value="">Contexte : profil global</option>
          {matches.data?.map((m) => (
            <option key={m.id} value={m.id}>{m.me?.is_winner ? "V" : "D"} · {m.me?.hero_name} · {m.map_name}</option>
          ))}
        </select>
      </header>

      <div className="card flex-1 space-y-4 overflow-y-auto">
        {!messages.length && (
          <div className="py-10 text-center text-sm text-slate-400">
            Votre coach connaît votre historique, vos statistiques et vos héros favoris. Posez-lui une question.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 ${m.role === "user" ? "bg-storm-700/50 text-white" : "border border-nexus-700/60 bg-void-800"}`}>
              {m.role === "assistant" ? (m.content ? <Markdown text={m.content} /> : <span className="animate-pulse text-slate-400">Analyse…</span>) : m.content}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <div className="my-3 flex flex-wrap gap-2">
        {QUICK.map((q) => <button key={q} className="chip hover:border-gold-500 hover:text-gold-300" onClick={() => void send(q)} disabled={busy}>{q}</button>)}
      </div>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input className="flex-1" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Votre question…" maxLength={4000} />
        <button className="btn-primary" disabled={busy || !input.trim()}>Envoyer</button>
      </form>
    </div>
  );
}
