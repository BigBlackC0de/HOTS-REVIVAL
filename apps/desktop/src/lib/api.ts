import { bridge } from "./bridge";
import type {
  RankEntry,
  AppSettings, Combo, Compliance, HeroMeta, TierListData, DraftResult, Hero, MapInfo, MatchDetail, MatchSummary, OverlayState, Profile,
  ProgressionPoint, Report, ReplayStatus,
} from "./types";

export const API_BASE = bridge()?.apiBase ?? import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8765";
export const WS_LIVE = API_BASE.replace(/^http/, "ws") + "/ws/live";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  heroes: () => request<Hero[]>("/heroes"),
  maps: () => request<MapInfo[]>("/maps"),
  compliance: () => request<Compliance>("/compliance"),
  profile: () => request<Profile>("/profile"),
  progression: () => request<ProgressionPoint[]>("/profile/progression"),
  matches: (limit = 30, offset = 0) => request<MatchSummary[]>(`/matches?limit=${limit}&offset=${offset}`),
  match: (id: number) => request<MatchDetail>(`/matches/${id}`),
  report: (id: number) => request<Report>(`/matches/${id}/report`),
  generateReport: (id: number) => post<Report>(`/matches/${id}/report/ai`),
  replayStatus: () => request<ReplayStatus>("/replays/status"),
  importReplays: (path?: string) =>
    post<{ imported: number; duplicates: number; failed: number; match_ids: number[] }>("/replays/import", { path }),
  analyzeDraft: (body: { allies: string[]; enemies: string[]; bans: string[]; map_id: string | null }) =>
    post<DraftResult>("/draft/analyze", body),
  settings: () => request<AppSettings>("/settings"),
  saveSettings: (body: Partial<{ replay_dir: string; player_battletag: string; anthropic_api_key: string; claude_model: string }>) =>
    request<AppSettings>("/settings", { method: "PUT", body: JSON.stringify(body) }),
  tierLists: () => request<TierListData[]>("/meta/tierlists"),
  combos: () => request<Combo[]>("/meta/combos"),
  heroMeta: (heroId: string) => request<HeroMeta>(`/meta/heroes/${heroId}`),
  refreshMetaDirect: (force = false) => post<{ updated: number; errors: unknown[] }>(`/meta/refresh?force=${force}`),
  ranks: () => request<{ leagues: string[]; history: RankEntry[] }>("/profile/ranks"),
  addRank: (league: string, division: number | null) => post<RankEntry>("/profile/ranks", { league, division }),
  coachStatus: () => request<{ available: boolean; model: string }>("/coach/status"),
  live: {
    state: () => request<OverlayState>("/live/state"),
    start: (map_id: string | null, my_hero_id: string | null, clock_s = 0) =>
      post<OverlayState>("/live/start", { map_id, my_hero_id, clock_s }),
    sync: (clock_s: number) => post<OverlayState>("/live/sync", { clock_s }),
    hero: (hero_id: string) => post<OverlayState>("/live/hero", { hero_id }),
    levels: (body: { ally?: number; enemy?: number; ally_delta?: number; enemy_delta?: number }) =>
      post<OverlayState>("/live/levels", body),
    camp: (camp_type: string, side: "ally" | "enemy") => post<OverlayState>("/live/camp", { camp_type, side }),
    objectiveDone: () => post<OverlayState>("/live/objective-done"),
    stop: () => post<OverlayState>("/live/stop"),
  },
};

/** Chat coach en streaming (Server-Sent Events sur POST). */
export async function streamCoach(
  body: { message: string; conversation_id?: number | null; match_id?: number | null },
  onEvent: (event: string, data: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/coach/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, "Coach indisponible");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = /^event: (.*)$/m.exec(chunk)?.[1] ?? "message";
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (data) onEvent(event, JSON.parse(data));
    }
  }
}
