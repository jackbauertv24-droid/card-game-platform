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

export function addRoomPlayer(roomId: string, userId: string, seatIndex: number) {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO room_players (room_id, user_id, seat_index, is_ready, status, joined_at) VALUES (?, ?, ?, 0, "connected", ?)'
  ).run(roomId, userId, seatIndex, now);
}

export function updateRoomPlayerStatus(roomId: string, userId: string, status: string) {
  const disconnectedAt = status === 'disconnected' ? new Date().toISOString() : null;
  db.prepare(
    'UPDATE room_players SET status = ?, disconnected_at = ? WHERE room_id = ? AND user_id = ?'
  ).run(status, disconnectedAt, roomId, userId);
}

export function getRoomPlayers(roomId: string) {
  return db
    .prepare('SELECT * FROM room_players WHERE room_id = ? ORDER BY seat_index')
    .all(roomId) as {
    room_id: string;
    user_id: string;
    seat_index: number;
    is_ready: number;
    status: string;
    disconnected_at: string | null;
    joined_at: string;
  }[];
}

export function removeRoomPlayer(roomId: string, userId: string) {
  db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(roomId, userId);
}

export function getActiveGameForRoom(roomId: string) {
  return db
    .prepare(
      'SELECT * FROM games WHERE room_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
    )
    .get(roomId) as
    | {
        id: string;
        room_id: string;
        game_type: string;
        state: string;
        deck: string | null;
        current_player_index: number;
        turn_started_at: string | null;
        winner_id: string | null;
        pot: number | null;
        started_at: string;
        ended_at: string | null;
      }
    | undefined;
}

export function saveGameState(
  gameId: string,
  state: string,
  deck: string,
  currentPlayerIndex: number
) {
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE games SET state = ?, deck = ?, current_player_index = ?, turn_started_at = ? WHERE id = ?'
  ).run(state, deck, currentPlayerIndex, now, gameId);
}

export function updateGameTurnTimer(gameId: string) {
  const now = new Date().toISOString();
  db.prepare('UPDATE games SET turn_started_at = ? WHERE id = ?').run(now, gameId);
}

export function getUserActiveRoom(userId: string) {
  const result = db
    .prepare(
      `
    SELECT r.* FROM rooms r
    JOIN room_players rp ON r.id = rp.room_id
    WHERE rp.user_id = ? AND r.status IN ('waiting', 'playing')
    ORDER BY rp.joined_at DESC
    LIMIT 1
  `
    )
    .get(userId) as import('shared').Room | undefined;
  return result;
}

export function cleanDisconnectedPlayers(roomId: string, gracePeriodSeconds: number) {
  const cutoff = new Date(Date.now() - gracePeriodSeconds * 1000).toISOString();
  return db
    .prepare(
      `
    DELETE FROM room_players 
    WHERE room_id = ? AND status = 'disconnected' AND disconnected_at < ?
  `
    )
    .run(roomId, cutoff);
}

export function getConnectedPlayerCount(roomId: string) {
  const result = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM room_players 
    WHERE room_id = ? AND status = 'connected'
  `
    )
    .get(roomId) as { count: number };
  return result.count;
}
