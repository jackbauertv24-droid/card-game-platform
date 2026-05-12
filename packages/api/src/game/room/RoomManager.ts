import { v4 as uuidv4 } from 'uuid';
import type { RoomDetail, Player, GameType, PlayerStatus } from 'shared';
import { RECONNECT_GRACE_SECONDS } from 'shared';
import db from '../../db';

export interface InMemoryRoom extends RoomDetail {
  players: Player[];
  gameId?: string;
}

export class RoomManager {
  private rooms: Map<string, InMemoryRoom> = new Map();

  createRoom(
    userId: string,
    name: string,
    gameType: GameType,
    maxPlayers: number,
    minBet: number
  ): InMemoryRoom {
    const user = db.prepare('SELECT id, username, balance FROM users WHERE id = ?').get(userId) as
      | {
          id: string;
          username: string;
          balance: number;
        }
      | undefined;
    if (!user) throw new Error('User not found');

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO rooms (id, name, game_type, created_by, min_bet, max_players, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name, gameType, userId, minBet, maxPlayers, 'waiting', now);

    db.prepare(
      'INSERT INTO room_players (room_id, user_id, seat_index, is_ready, status, joined_at) VALUES (?, ?, ?, 0, ?, ?)'
    ).run(id, userId, 0, 'connected', now);

    const player: Player = {
      id: user.id,
      username: user.username,
      balance: user.balance,
      seatIndex: 0,
      isReady: false,
      isFolded: false,
      isAllIn: false,
      currentBet: 0,
      hand: [],
      status: 'connected',
    };

    const room: InMemoryRoom = {
      id,
      name,
      gameType,
      createdBy: userId,
      minBet,
      maxPlayers,
      status: 'waiting',
      createdAt: now,
      playerCount: 1,
      players: [player],
    };

    this.rooms.set(id, room);
    return room;
  }

  getRoom(roomId: string): InMemoryRoom | undefined {
    const cached = this.rooms.get(roomId);
    if (cached) return cached;

    const dbRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as
      | {
          id: string;
          name: string;
          game_type: string;
          created_by: string;
          min_bet: number;
          max_players: number;
          status: string;
          created_at: string;
        }
      | undefined;
    if (!dbRoom) return undefined;

    const dbPlayers = db
      .prepare('SELECT * FROM room_players WHERE room_id = ? ORDER BY seat_index')
      .all(roomId) as {
      user_id: string;
      seat_index: number;
      is_ready: number;
      status: string;
      disconnected_at: string | null;
    }[];

    const players: Player[] = [];
    for (const p of dbPlayers) {
      const user = db
        .prepare('SELECT id, username, balance FROM users WHERE id = ?')
        .get(p.user_id) as
        | {
            id: string;
            username: string;
            balance: number;
          }
        | undefined;
      if (user) {
        players.push({
          id: user.id,
          username: user.username,
          balance: user.balance,
          seatIndex: p.seat_index,
          isReady: p.is_ready === 1,
          isFolded: false,
          isAllIn: false,
          currentBet: 0,
          hand: [],
          status: p.status as PlayerStatus,
          disconnectedAt: p.disconnected_at ?? undefined,
        });
      }
    }

    const room: InMemoryRoom = {
      id: dbRoom.id,
      name: dbRoom.name,
      gameType: dbRoom.game_type as GameType,
      createdBy: dbRoom.created_by,
      minBet: dbRoom.min_bet,
      maxPlayers: dbRoom.max_players,
      status: dbRoom.status as 'waiting' | 'playing' | 'finished',
      createdAt: dbRoom.created_at,
      playerCount: players.length,
      players,
    };

    this.rooms.set(roomId, room);
    return room;
  }

  getAllRooms(gameType?: GameType): import('shared').Room[] {
    const waitingRooms = db
      .prepare('SELECT * FROM rooms WHERE status = ? ORDER BY created_at DESC')
      .all('waiting') as {
      id: string;
      name: string;
      game_type: string;
      created_by: string;
      min_bet: number;
      max_players: number;
      status: string;
      created_at: string;
    }[];

    const rooms = waitingRooms
      .map((r) => {
        const playerCount = db
          .prepare('SELECT COUNT(*) as count FROM room_players WHERE room_id = ? AND status = ?')
          .get(r.id, 'connected') as { count: number };
        return {
          id: r.id,
          name: r.name,
          gameType: r.game_type as GameType,
          createdBy: r.created_by,
          minBet: r.min_bet,
          maxPlayers: r.max_players,
          status: r.status as 'waiting' | 'playing' | 'finished',
          playerCount: playerCount.count,
          createdAt: r.created_at,
        };
      })
      .filter((r) => !gameType || r.gameType === gameType);

    return rooms;
  }

  joinRoom(roomId: string, userId: string): InMemoryRoom | null {
    const room = this.getRoom(roomId);
    if (!room) return null;
    if (room.status !== 'waiting' && room.status !== 'playing') return null;

    const existingPlayer = room.players.find((p) => p.id === userId);
    if (existingPlayer) {
      if (existingPlayer.status === 'disconnected' || existingPlayer.status === 'away') {
        existingPlayer.status = 'connected';
        existingPlayer.disconnectedAt = undefined;
        db.prepare(
          'UPDATE room_players SET status = ?, disconnected_at = NULL WHERE room_id = ? AND user_id = ?'
        ).run('connected', roomId, userId);
      }
      return room;
    }

    const connectedCount = db
      .prepare('SELECT COUNT(*) as count FROM room_players WHERE room_id = ? AND status = ?')
      .get(roomId, 'connected') as { count: number };
    if (connectedCount.count >= room.maxPlayers) return null;

    const user = db.prepare('SELECT id, username, balance FROM users WHERE id = ?').get(userId) as
      | {
          id: string;
          username: string;
          balance: number;
        }
      | undefined;
    if (!user) return null;

    const seatIndex = room.players.length;
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO room_players (room_id, user_id, seat_index, is_ready, status, joined_at) VALUES (?, ?, ?, 0, ?, ?)'
    ).run(roomId, userId, seatIndex, 'connected', now);

    const player: Player = {
      id: user.id,
      username: user.username,
      balance: user.balance,
      seatIndex,
      isReady: false,
      isFolded: false,
      isAllIn: false,
      currentBet: 0,
      hand: [],
      status: 'connected',
    };

    room.players.push(player);
    room.playerCount = room.players.length;
    return room;
  }

  setPlayerStatus(userId: string, status: PlayerStatus): { roomId: string; player: Player } | null {
    const room = this.getPlayersRoom(userId);
    if (!room) return null;

    const player = room.players.find((p) => p.id === userId);
    if (!player) return null;

    player.status = status;
    if (status === 'disconnected') {
      player.disconnectedAt = new Date().toISOString();
      db.prepare(
        'UPDATE room_players SET status = ?, disconnected_at = ? WHERE room_id = ? AND user_id = ?'
      ).run(status, player.disconnectedAt, room.id, userId);
    } else {
      player.disconnectedAt = undefined;
      db.prepare(
        'UPDATE room_players SET status = ?, disconnected_at = NULL WHERE room_id = ? AND user_id = ?'
      ).run(status, room.id, userId);
    }

    return { roomId: room.id, player };
  }

  leaveRoom(userId: string): { roomId: string; wasOwner: boolean } | null {
    const room = this.getPlayersRoom(userId);
    if (!room) return null;

    const wasOwner = room.createdBy === userId;
    const playerIndex = room.players.findIndex((p) => p.id === userId);

    if (playerIndex === -1) return null;

    if (room.status === 'playing') {
      this.setPlayerStatus(userId, 'disconnected');
      return { roomId: room.id, wasOwner };
    }

    room.players.splice(playerIndex, 1);
    room.playerCount = room.players.length;
    db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(room.id, userId);

    for (let i = 0; i < room.players.length; i++) {
      room.players[i].seatIndex = i;
    }
    db.prepare('UPDATE room_players SET seat_index = ? WHERE room_id = ? AND user_id = ?');
    for (const p of room.players) {
      db.prepare('UPDATE room_players SET seat_index = ? WHERE room_id = ? AND user_id = ?').run(
        p.seatIndex,
        room.id,
        p.id
      );
    }

    if (room.players.length === 0) {
      this.rooms.delete(room.id);
      db.prepare('DELETE FROM rooms WHERE id = ?').run(room.id);
    } else if (wasOwner) {
      room.createdBy = room.players[0].id;
      db.prepare('UPDATE rooms SET created_by = ? WHERE id = ?').run(room.players[0].id, room.id);
    }

    return { roomId: room.id, wasOwner };
  }

  cleanDisconnectedPlayers(roomId: string): number {
    const room = this.getRoom(roomId);
    if (!room) return 0;

    const cutoff = new Date(Date.now() - RECONNECT_GRACE_SECONDS * 1000).toISOString();
    const result = db
      .prepare('DELETE FROM room_players WHERE room_id = ? AND status = ? AND disconnected_at < ?')
      .run(roomId, 'disconnected', cutoff);
    const removedCount = result.changes;

    room.players = room.players.filter((p) => {
      if (p.status !== 'disconnected') return true;
      if (!p.disconnectedAt) return true;
      return new Date(p.disconnectedAt).getTime() > Date.now() - RECONNECT_GRACE_SECONDS * 1000;
    });
    room.playerCount = room.players.length;

    if (room.players.length === 0 && room.status !== 'playing') {
      this.rooms.delete(roomId);
      db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
    }

    return removedCount;
  }

  setPlayerReady(userId: string, ready: boolean): { roomId: string; player: Player } | null {
    const room = this.getPlayersRoom(userId);
    if (!room) return null;

    const player = room.players.find((p) => p.id === userId);
    if (!player) return null;

    player.isReady = ready;
    db.prepare('UPDATE room_players SET is_ready = ? WHERE room_id = ? AND user_id = ?').run(
      ready ? 1 : 0,
      room.id,
      userId
    );
    return { roomId: room.id, player };
  }

  getPlayersRoom(userId: string): InMemoryRoom | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.some((p) => p.id === userId)) {
        return room;
      }
    }

    const dbRoom = db
      .prepare(
        `
      SELECT r.* FROM rooms r
      JOIN room_players rp ON r.id = rp.room_id
      WHERE rp.user_id = ? AND r.status IN ('waiting', 'playing')
      ORDER BY rp.joined_at DESC
      LIMIT 1
    `
      )
      .get(userId) as
      | {
          id: string;
          name: string;
          game_type: string;
          created_by: string;
          min_bet: number;
          max_players: number;
          status: string;
          created_at: string;
        }
      | undefined;

    if (dbRoom) {
      return this.getRoom(dbRoom.id);
    }

    return undefined;
  }

  updateRoomStatus(roomId: string, status: 'waiting' | 'playing' | 'finished'): void {
    const room = this.getRoom(roomId);
    if (room) {
      room.status = status;
      db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run(status, roomId);
    }
  }

  setRoomGameId(roomId: string, gameId: string): void {
    const room = this.getRoom(roomId);
    if (room) {
      room.gameId = gameId;
    }
  }

  getConnectedPlayerIds(roomId: string): string[] {
    const room = this.getRoom(roomId);
    if (!room) return [];
    return room.players.filter((p) => p.status === 'connected').map((p) => p.id);
  }
}
