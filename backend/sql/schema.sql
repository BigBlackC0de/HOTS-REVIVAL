-- Généré par scripts/export_schema.py – ne pas éditer à la main.

CREATE TABLE drafts (
	id SERIAL NOT NULL, 
	map_id VARCHAR(48), 
	allies JSONB NOT NULL, 
	enemies JSONB NOT NULL, 
	bans JSONB NOT NULL, 
	result JSONB NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE players (
	id SERIAL NOT NULL, 
	toon_handle VARCHAR(64) NOT NULL, 
	name VARCHAR(64) NOT NULL, 
	battletag VARCHAR(80), 
	region INTEGER, 
	rank VARCHAR(32), 
	is_me BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE INDEX ix_players_is_me ON players (is_me);

CREATE UNIQUE INDEX ix_players_toon_handle ON players (toon_handle);

CREATE TABLE replays (
	id SERIAL NOT NULL, 
	file_path TEXT NOT NULL, 
	file_hash VARCHAR(64) NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	error TEXT, 
	imported_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_replays_file_hash ON replays (file_hash);

CREATE TABLE matches (
	id SERIAL NOT NULL, 
	replay_id INTEGER NOT NULL, 
	map_id VARCHAR(48) NOT NULL, 
	map_name VARCHAR(80) NOT NULL, 
	game_mode VARCHAR(32), 
	game_version VARCHAR(32), 
	played_at TIMESTAMP WITH TIME ZONE, 
	duration_s INTEGER NOT NULL, 
	winner_team INTEGER, 
	team_levels JSONB NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (replay_id), 
	FOREIGN KEY(replay_id) REFERENCES replays (id) ON DELETE CASCADE
);

CREATE INDEX ix_matches_map_id ON matches (map_id);

CREATE INDEX ix_matches_played_at ON matches (played_at);

CREATE TABLE coach_conversations (
	id SERIAL NOT NULL, 
	match_id INTEGER, 
	title VARCHAR(120) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(match_id) REFERENCES matches (id) ON DELETE SET NULL
);

CREATE TABLE match_events (
	id SERIAL NOT NULL, 
	match_id INTEGER NOT NULL, 
	t_s FLOAT NOT NULL, 
	kind VARCHAR(32) NOT NULL, 
	team INTEGER, 
	slot INTEGER, 
	payload JSONB NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(match_id) REFERENCES matches (id) ON DELETE CASCADE
);

CREATE INDEX ix_match_events_kind ON match_events (kind);

CREATE INDEX ix_match_events_match_id ON match_events (match_id);

CREATE TABLE match_players (
	id SERIAL NOT NULL, 
	match_id INTEGER NOT NULL, 
	player_id INTEGER, 
	slot INTEGER NOT NULL, 
	team INTEGER NOT NULL, 
	is_winner BOOLEAN NOT NULL, 
	is_me BOOLEAN NOT NULL, 
	name VARCHAR(64) NOT NULL, 
	toon_handle VARCHAR(64), 
	hero_id VARCHAR(48) NOT NULL, 
	hero_name VARCHAR(64) NOT NULL, 
	role VARCHAR(32), 
	kills INTEGER NOT NULL, 
	deaths INTEGER NOT NULL, 
	assists INTEGER NOT NULL, 
	takedowns INTEGER NOT NULL, 
	hero_damage INTEGER NOT NULL, 
	siege_damage INTEGER NOT NULL, 
	healing INTEGER NOT NULL, 
	self_healing INTEGER NOT NULL, 
	damage_taken INTEGER NOT NULL, 
	xp_contribution INTEGER NOT NULL, 
	merc_camp_captures INTEGER NOT NULL, 
	time_spent_dead_s INTEGER NOT NULL, 
	stats JSONB NOT NULL, 
	talents JSONB NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (match_id, slot), 
	FOREIGN KEY(match_id) REFERENCES matches (id) ON DELETE CASCADE, 
	FOREIGN KEY(player_id) REFERENCES players (id)
);

CREATE INDEX ix_match_players_hero_id ON match_players (hero_id);

CREATE INDEX ix_match_players_is_me ON match_players (is_me);

CREATE INDEX ix_match_players_match_id ON match_players (match_id);

CREATE INDEX ix_match_players_player_id ON match_players (player_id);

CREATE TABLE coach_messages (
	id SERIAL NOT NULL, 
	conversation_id INTEGER NOT NULL, 
	role VARCHAR(16) NOT NULL, 
	content TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(conversation_id) REFERENCES coach_conversations (id) ON DELETE CASCADE
);

CREATE INDEX ix_coach_messages_conversation_id ON coach_messages (conversation_id);

CREATE TABLE heros_scores (
	id SERIAL NOT NULL, 
	match_player_id INTEGER NOT NULL, 
	placement INTEGER NOT NULL, 
	macro INTEGER NOT NULL, 
	teamfight INTEGER NOT NULL, 
	objectives INTEGER NOT NULL, 
	survival INTEGER NOT NULL, 
	draft INTEGER NOT NULL, 
	overall INTEGER NOT NULL, 
	algo_version VARCHAR(16) NOT NULL, 
	details JSONB NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (match_player_id), 
	FOREIGN KEY(match_player_id) REFERENCES match_players (id) ON DELETE CASCADE
);

CREATE INDEX ix_heros_scores_overall ON heros_scores (overall);

CREATE TABLE reports (
	id SERIAL NOT NULL, 
	match_id INTEGER NOT NULL, 
	match_player_id INTEGER NOT NULL, 
	facts JSONB NOT NULL, 
	ai_summary JSONB, 
	model VARCHAR(64), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (match_id, match_player_id), 
	FOREIGN KEY(match_id) REFERENCES matches (id) ON DELETE CASCADE, 
	FOREIGN KEY(match_player_id) REFERENCES match_players (id) ON DELETE CASCADE
);

CREATE INDEX ix_reports_match_id ON reports (match_id);
