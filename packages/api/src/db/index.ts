import Database from 'better-sqlite3';
import { config } from '../config';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';

const dbPath = config.dbPath.startsWith('./') ? join(process.cwd(), config.dbPath) : config.dbPath;

mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const schemaPath = join(__dirname, 'schema.sql');
const schema = readFileSync(schemaPath, 'utf-8');
db.exec(schema);

export default db;

export function getUserById(id: string) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | import('shared').User
    | undefined;
}

export function getUserByUsername(username: string) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
    | import('shared').User
    | undefined;
}

export function createUser(id: string, username: string, passwordHash: string) {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO users (id, username, password_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?)'
  ).run(id, username, passwordHash, now, now);
  return getUserById(id);
}

export function updateUserBalance(id: string, balance: number) {
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET balance = ?, last_seen = ? WHERE id = ?').run(balance, now, id);
}

export function getInviteCode(code: string) {
  return db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code) as
    | import('shared').InviteCode
    | undefined;
}

export function createInviteCode(code: string, createdBy: string) {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO invite_codes (code, created_by, created_at) VALUES (?, ?, ?)').run(
    code,
    createdBy,
    now
  );
}

export function useInviteCode(code: string, usedBy: string) {
  const now = new Date().toISOString();
  db.prepare('UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ?').run(
    usedBy,
    now,
    code
  );
}

export function createRoom(room: import('shared').Room) {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO rooms (id, name, game_type, created_by, min_bet, max_players, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    room.id,
    room.name,
    room.gameType,
    room.createdBy,
    room.minBet,
    room.maxPlayers,
    room.status,
    now
  );
}

export function getRoomById(id: string) {
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as
    | import('shared').Room
    | undefined;
}

export function getRooms(status?: string) {
  if (status) {
    return db
      .prepare('SELECT * FROM rooms WHERE status = ? ORDER BY created_at DESC')
      .all(status) as import('shared').Room[];
  }
  return db
    .prepare('SELECT * FROM rooms ORDER BY created_at DESC')
    .all() as import('shared').Room[];
}

export function updateRoomStatus(id: string, status: string) {
  db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run(status, id);
}

export function deleteRoom(id: string) {
  db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
}

export function createGame(game: {
  id: string;
  roomId: string;
  gameType: string;
  state: string;
  players: string;
}) {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO games (id, room_id, game_type, state, players, started_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(game.id, game.roomId, game.gameType, game.state, game.players, now);
}

export function updateGameState(id: string, state: string) {
  db.prepare('UPDATE games SET state = ? WHERE id = ?').run(state, id);
}

export function endGame(id: string, winnerId: string | null, pot: number) {
  const now = new Date().toISOString();
  db.prepare('UPDATE games SET ended_at = ?, winner_id = ?, pot = ? WHERE id = ?').run(
    now,
    winnerId,
    pot,
    id
  );
}

export function createTransaction(data: {
  id: string;
  userId: string;
  amount: number;
  type: string;
  gameId: string;
  balanceAfter: number;
}) {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO transactions (id, user_id, amount, type, game_id, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(data.id, data.userId, data.amount, data.type, data.gameId, data.balanceAfter, now);
}
