CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    balance INTEGER DEFAULT 10000,
    created_at TEXT NOT NULL,
    last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    created_by TEXT REFERENCES users(id),
    used_by TEXT REFERENCES users(id),
    used_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    game_type TEXT NOT NULL,
    created_by TEXT REFERENCES users(id),
    min_bet INTEGER DEFAULT 10,
    max_players INTEGER DEFAULT 8,
    status TEXT DEFAULT 'waiting',
    created_at TEXT NOT NULL,
    ended_at TEXT
);

CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    room_id TEXT REFERENCES rooms(id),
    game_type TEXT NOT NULL,
    state TEXT NOT NULL,
    players TEXT NOT NULL,
    winner_id TEXT REFERENCES users(id),
    pot INTEGER,
    started_at TEXT NOT NULL,
    ended_at TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    game_id TEXT REFERENCES games(id),
    balance_after INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_game_type ON rooms(game_type);
CREATE INDEX IF NOT EXISTS idx_games_room_id ON games(room_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);