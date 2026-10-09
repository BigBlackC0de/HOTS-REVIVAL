export type Role = "Tank" | "Bruiser" | "Ranged Assassin" | "Melee Assassin" | "Healer" | "Support";

export interface Hero {
  id: string;
  name: string;
  role: Role;
  tags: string[];
  curve: [number, number, number];
}

export interface MapInfo {
  id: string;
  name: string;
  objective: string;
  first_objective_s: number;
  objective_interval_s: number;
  verified: boolean;
  tips: string[];
}

export interface HerosScore {
  placement: number;
  macro: number;
  teamfight: number;
  objectives: number;
  survival: number;
  draft: number;
  overall: number;
  algo_version: string;
  details: Record<string, Record<string, number>>;
}

export interface Talent {
  tier: number;
  level: number;
  name: string;
}

export interface MatchPlayer {
  id: number;
  slot: number;
  team: number;
  is_winner: boolean;
  is_me: boolean;
  name: string;
  hero_id: string;
  hero_name: string;
  role: Role | null;
  kills: number;
  deaths: number;
  assists: number;
  takedowns: number;
  hero_damage: number;
  siege_damage: number;
  healing: number;
  damage_taken: number;
  xp_contribution: number;
  merc_camp_captures: number;
  time_spent_dead_s: number;
  talents: (Talent & { label?: string })[];
  score: HerosScore | null;
}

export interface MatchSummary {
  id: number;
  map_id: string;
  map_name: string;
  game_mode: string | null;
  counted: boolean; // partie rapide ou classée (sinon : hors statistiques)
  played_at: string | null;
  duration_s: number;
  winner_team: number | null;
  me: MatchPlayer | null;
}

export interface MatchEvent {
  t_s: number;
  kind: "death" | "level" | "camp" | "objective";
  team: number | null;
  slot: number | null;
  payload: Record<string, unknown>;
}

export interface MatchDetail extends MatchSummary {
  game_version: string | null;
  team_levels: Record<string, number>;
  players: MatchPlayer[];
  events: MatchEvent[];
}

export interface GameSummary {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  key_moments: string[];
  major_mistakes: string[];
  excellent_actions: string[];
  improvement_plan: string[];
  role_advice?: string[];
}

export interface ReportFacts {
  headline: string;
  result: "win" | "loss";
  map: string;
  duration: string;
  hero: string;
  kda: { kills: number; deaths: number; assists: number };
  kill_participation: number;
  time_spent_dead_s: number;
  shares: Record<string, number>;
  key_moments: string[];
  strengths: string[];
  weaknesses: string[];
  improvement_plan: string[];
  heros_score: (Omit<HerosScore, "algo_version" | "details">) | null;
  role_context?: { role: string; label: string; focus: string[]; normal: string };
}

export interface Report {
  match_id: number;
  facts: ReportFacts;
  ai_summary: GameSummary | null;
  model: string | null;
}

export interface Bucket {
  games: number;
  wins: number;
  winrate: number | null;
  smoothed_winrate: number;
  avg_heros_score: number | null;
}

export interface Profile {
  player: { name: string | null; battletag: string | null; toon_handle: string | null; rank: string | null };
  total: Bucket;
  by_role: Record<string, Bucket>;
  by_hero: Record<string, Bucket & { hero: string }>;
  best_hero: string | null;
  worst_hero: string | null;
  main_role: string | null;
  secondary_role: string | null;
  heroes_to_avoid: string[];
  trend: { last_10_winrate: number | null; previous_10_winrate: number | null; direction: "up" | "down" | "stable" | "unknown" };
  category_averages: Record<string, number>;
  role_balance?: { shares: Record<string, number>; main_role: string | null; advice: string | null };
}

export interface ProgressionPoint {
  match_id: number;
  played_at: string | null;
  hero: string;
  win: boolean;
  heros_score: number | null;
  rolling_winrate: number;
}

export interface DraftResult {
  strengths: string[];
  weaknesses: string[];
  synergies: string[];
  threats: string[];
  win_conditions: string[];
  counters: string[];
  phases: { early: number; mid: number; late: number };
  recommendations: { hero_id: string; hero: string; role: Role; score: number; personal_winrate: number | null; tier: string | null }[];
  composition_score: number;
  unknown_heroes: string[];
}

export interface TalentOption {
  talent: string;
  name?: string;
  games?: number;
  winrate?: number | null;
  popularity?: number | null;
}

export interface OverlayTalent {
  level: number;
  recommended: TalentOption;
  alternatives: TalentOption[];
  source?: string;
}

export interface OverlayState {
  status: "idle" | "loading" | "in_game" | "ended";
  game_id: number;
  game_running: boolean;
  clock_s: number | null;
  clock_source: string | null;
  map_id: string | null;
  map_name: string | null;
  map_source: string | null;
  my_hero_id: string | null;
  lobby_players: string[];
  levels: { ally: number; enemy: number; ally_tier: number; enemy_tier: number; source: string } | null;
  teams: Teams | null;
  objective: {
    name: string; map: string; next_in_s: number | null; source: string; samples: number;
    priority: string; tips: string[];
  } | null;
  camps: { camp: string; side: "ally" | "enemy"; respawn_in_s: number | null }[];
  talents: OverlayTalent[];
  next_talent: OverlayTalent | null;
  upcoming_objectives?: number[];
  alerts: { id: string; text: string; level: "info" | "warning" | "success" | "danger"; voice?: boolean }[];
  tips: string[];
}

export interface RankEntry { id: number; mode: string; league: string; division: number | null; label: string; recorded_at: string }

export interface ReplayStatus {
  folder: string | null;
  folders?: string[];
  toon_handles?: string[];
  folder_exists: boolean;
  watching: boolean;
  toon_handle: string | null;
  counts: Record<string, number>;
}

export interface Compliance {
  allowed_sources: Record<string, string>;
  forbidden: string[];
  statement: string;
}

export interface AppSettings {
  replay_dir: string;
  replay_dir_detected: string | null;
  replay_dir_exists: boolean;
  player_battletag: string;
  player_toon_handle: string | null;
  claude_model: string;
  has_api_key: boolean;
  data_dir: string;
}

export interface TierEntry {
  hero_id: string;
  hero: string;
  tier: "S" | "A" | "B" | "C" | "D";
  role: Role | null;
  my_games: number;
  my_winrate: number | null;
}

export interface TierListData {
  key: string;
  title: string;
  url: string;
  updated_label: string | null;
  fetched_at: string | null;
  entries: TierEntry[];
}

export interface Combo {
  heroes: { hero_id: string; hero: string; tier: string | null }[];
  mutual: boolean;
  score: number;
}

export interface GuideBuild {
  title: string;
  talents: { level: number; position: number; talent: string | null; name: string }[];
}

export interface HeroMeta {
  hero_id: string;
  hero: string;
  role: Role;
  tiers: Record<string, string | null>;
  guide: {
    url: string;
    fetched_at: string;
    synergies: { hero_id: string; hero: string }[];
    counters: { hero_id: string; hero: string }[];
    builds: GuideBuild[];
  } | null;
  talent_catalog: Record<string, { id: string; name: string; sort: number; description: string }[]>;
  replay_talent_stats: { tier: number; level: number; options: { talent: string; name: string; games: number; winrate: number; popularity: number }[] }[];
}

export interface LobbyPlayer {
  battletag: string;
  is_me: boolean;
  with: { games: number; wins: number };
  against: { games: number; wins: number };
  top_heroes: string[];
}

export interface TeamMember { hero_id: string; hero: string; role: string | null; player: string | null; me: boolean }
export interface Teams { ally: TeamMember[]; enemy: TeamMember[]; sides_known: boolean; complete: boolean }
