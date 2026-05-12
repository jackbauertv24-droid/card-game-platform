import { v4 as uuidv4 } from 'uuid';
import type { RoomDetail, Observer, SeatedPlayer, GameType, PlayerStatus } from 'shared';
import { RECONNECT_GRACE_SECONDS } from 'shared';
import db from '../../db';

export interface InMemoryRoom extends RoomDetail {
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

    const emptySeats = Array.from({ length: maxPlayers }, (_, i) => i);

    const room: InMemoryRoom = {
      id,
      name,
      gameType,
      createdBy: userId,
      minBet,
      maxPlayers,
      status: 'waiting',
      createdAt: now,
      playerCount: 0,
      observerCount: 0,
      players: [],
      observers: [],
      emptySeats,
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
      .prepare(
        'SELECT rp.*, u.username, u.balance FROM room_players rp JOIN users u ON rp.user_id = u.id WHERE rp.room_id = ? AND rp.is_player = 1 ORDER BY rp.seat_index'
      )
      .all(roomId) as {
      user_id: string;
      seat_index: number;
      is_ready: number;
      status: string;
      disconnected_at: string | null;
      joined_at: string;
      username: string;
      balance: number;
    }[];

    const dbObservers = db
      .prepare(
        'SELECT ro.*, u.username FROM room_observers ro JOIN users u ON ro.user_id = u.id WHERE ro.room_id = ? ORDER BY ro.joined_at'
      )
      .all(roomId) as {
      user_id: string;
      joined_at: string;
      username: string;
    }[];

    const players: SeatedPlayer[] = dbPlayers.map((p) => ({
      id: p.user_id,
      username: p.username,
      balance: p.balance,
      seatIndex: p.seat_index,
      isReady: p.is_ready === 1,
      isFolded: false,
      isAllIn: false,
      currentBet: 0,
      hand: [],
      status: p.status as PlayerStatus,
      disconnectedAt: p.disconnected_at ?? undefined,
      joinedAt: p.joined_at,
    }));

    const observers: Observer[] = dbObservers.map((o) => ({
      id: o.user_id,
      username: o.username,
      joinedAt: o.joined_at,
    }));

    const occupiedSeats = players.map((p) => p.seatIndex);
    const emptySeats = Array.from({ length: dbRoom.max_players }, (_, i) => i).filter(
      (i) => !occupiedSeats.includes(i)
    );

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
      observerCount: observers.length,
      players,
      observers,
      emptySeats,
    };

    this.rooms.set(roomId, room);
    return room;
  }

  getAllRooms(gameType?: GameType, includePlaying?: boolean): import('shared').RoomPreview[] {
    const statusFilter = includePlaying ? ['waiting', 'playing'] : ['waiting'];
    const statusClause = `status IN (${statusFilter.map(() => '?').join(', ')})`;

    const allRooms = db
      .prepare(`SELECT * FROM rooms WHERE ${statusClause} ORDER BY created_at DESC`)
      .all(...statusFilter) as {
      id: string;
      name: string;
      game_type: string;
      created_by: string;
      min_bet: number;
      max_players: number;
      status: string;
      created_at: string;
    }[];

    const rooms = allRooms
      .map((r) => {
        const playerCount = db
          .prepare(
            'SELECT COUNT(*) as count FROM room_players WHERE room_id = ? AND is_player = 1 AND status = ?'
          )
          .get(r.id, 'connected') as { count: number };
        const observerCount = db
          .prepare('SELECT COUNT(*) as count FROM room_observers WHERE room_id = ?')
          .get(r.id) as { count: number };
        const maxPlayers = r.max_players;

        return {
          id: r.id,
          name: r.name,
          gameType: r.game_type as GameType,
          status: r.status as 'waiting' | 'playing' | 'finished',
          playerCount: playerCount.count,
          observerCount: observerCount.count,
          minBet: r.min_bet,
          maxPlayers: maxPlayers,
          canJoin: playerCount.count < maxPlayers,
          canObserve: true,
          createdAt: r.created_at,
        };
      })
      .filter((r) => !gameType || r.gameType === gameType);

    return rooms;
  }

  joinRoom(roomId: string, userId: string, asObserver: boolean): InMemoryRoom | null {
    const room = this.getRoom(roomId);
    if (!room) return null;

    const existingPlayer = room.players.find((p) => p.id === userId);
    const existingObserver = room.observers.find((o) => o.id === userId);

    if (existingPlayer) {
      if (existingPlayer.status === 'disconnected') {
        existingPlayer.status = 'connected';
        existingPlayer.disconnectedAt = undefined;
        db.prepare(
          'UPDATE room_players SET status = ?, disconnected_at = NULL WHERE room_id = ? AND user_id = ?'
        ).run('connected', roomId, userId);
      }
      return room;
    }

    if (existingObserver) {
      return room;
    }

    const user = db.prepare('SELECT id, username, balance FROM users WHERE id = ?').get(userId) as
      | {
          id: string;
          username: string;
          balance: number;
        }
      | undefined;
    if (!user) return null;

    const now = new Date().toISOString();

    if (asObserver) {
      db.prepare('INSERT INTO room_observers (room_id, user_id, joined_at) VALUES (?, ?, ?)').run(
        roomId,
        userId,
        now
      );
      room.observers.push({
        id: user.id,
        username: user.username,
        joinedAt: now,
      });
      room.observerCount = room.observers.length;
      return room;
    }

    return room;
  }

  sitDown(
    roomId: string,
    userId: string,
    seatIndex: number
  ): { success: boolean; seatIndex?: number; error?: string } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, error: 'Room not found' };

    if (seatIndex < 0 || seatIndex >= room.maxPlayers) {
      return { success: false, error: 'Invalid seat index' };
    }

    if (!room.emptySeats.includes(seatIndex)) {
      return { success: false, error: 'Seat already occupied' };
    }

    const existingObserver = room.observers.find((o) => o.id === userId);
    const existingPlayer = room.players.find((p) => p.id === userId);

    if (existingPlayer) {
      return { success: false, error: 'Already seated' };
    }

    const user = db.prepare('SELECT id, username, balance FROM users WHERE id = ?').get(userId) as
      | {
          id: string;
          username: string;
          balance: number;
        }
      | undefined;
    if (!user) return { success: false, error: 'User not found' };

    const now = new Date().toISOString();

    if (existingObserver) {
      room.observers = room.observers.filter((o) => o.id !== userId);
      room.observerCount = room.observers.length;
      db.prepare('DELETE FROM room_observers WHERE room_id = ? AND user_id = ?').run(
        roomId,
        userId
      );
    }

    db.prepare(
      'INSERT INTO room_players (room_id, user_id, seat_index, is_ready, is_player, status, joined_at) VALUES (?, ?, ?, 0, 1, ?, ?)'
    ).run(roomId, userId, seatIndex, 'connected', now);

    const player: SeatedPlayer = {
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
      joinedAt: now,
    };

    room.players.push(player);
    room.playerCount = room.players.length;
    room.emptySeats = room.emptySeats.filter((s) => s !== seatIndex);
    room.players.sort((a, b) => a.seatIndex - b.seatIndex);

    return { success: true, seatIndex };
  }

  standUp(userId: string): { roomId: string; seatIndex: number } | null {
    const room = this.getPlayersRoom(userId);
    if (!room) return null;

    const playerIndex = room.players.findIndex((p) => p.id === userId);
    if (playerIndex === -1) return null;

    if (room.status === 'playing') {
      return null;
    }

    const player = room.players[playerIndex];
    const seatIndex = player.seatIndex;

    room.players.splice(playerIndex, 1);
    room.playerCount = room.players.length;
    room.emptySeats.push(seatIndex);
    room.emptySeats.sort((a, b) => a - b);

    db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(room.id, userId);

    const now = new Date().toISOString();
    db.prepare('INSERT INTO room_observers (room_id, user_id, joined_at) VALUES (?, ?, ?)').run(
      room.id,
      userId,
      now
    );
    room.observers.push({
      id: userId,
      username: player.username,
      joinedAt: now,
    });
    room.observerCount = room.observers.length;

    return { roomId: room.id, seatIndex };
  }

  setPlayerStatus(
    userId: string,
    status: PlayerStatus
  ): { roomId: string; player: SeatedPlayer } | null {
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

  leaveRoom(userId: string): { roomId: string; wasPlayer: boolean; wasOwner: boolean } | null {
    const room = this.getPlayersRoom(userId) || this.getObserversRoom(userId);
    if (!room) return null;

    const wasPlayer = room.players.some((p) => p.id === userId);
    const wasObserver = room.observers.some((o) => o.id === userId);
    const wasOwner = room.createdBy === userId;

    if (wasPlayer) {
      const playerIndex = room.players.findIndex((p) => p.id === userId);
      if (playerIndex !== -1) {
        if (room.status === 'playing') {
          this.setPlayerStatus(userId, 'disconnected');
          return { roomId: room.id, wasPlayer: true, wasOwner };
        }

        const seatIndex = room.players[playerIndex].seatIndex;
        room.players.splice(playerIndex, 1);
        room.playerCount = room.players.length;
        room.emptySeats.push(seatIndex);
        room.emptySeats.sort((a, b) => a - b);
        db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(
          room.id,
          userId
        );
      }
    }

    if (wasObserver) {
      room.observers = room.observers.filter((o) => o.id !== userId);
      room.observerCount = room.observers.length;
      db.prepare('DELETE FROM room_observers WHERE room_id = ? AND user_id = ?').run(
        room.id,
        userId
      );
    }

    if (room.players.length === 0 && room.observers.length === 0) {
      this.rooms.delete(room.id);
      db.prepare('DELETE FROM room_observers WHERE room_id = ?').run(room.id);
      db.prepare('DELETE FROM rooms WHERE id = ?').run(room.id);
    } else if (wasOwner && room.players.length > 0) {
      room.createdBy = room.players[0].id;
      db.prepare('UPDATE rooms SET created_by = ? WHERE id = ?').run(room.players[0].id, room.id);
    }

    return { roomId: room.id, wasPlayer, wasOwner };
  }

  cleanDisconnectedPlayers(roomId: string): number {
    const room = this.getRoom(roomId);
    if (!room) return 0;

    const cutoff = new Date(Date.now() - RECONNECT_GRACE_SECONDS * 1000).toISOString();
    const result = db
      .prepare(
        'DELETE FROM room_players WHERE room_id = ? AND status = ? AND disconnected_at < ? AND is_player = 1'
      )
      .run(roomId, 'disconnected', cutoff);
    const removedCount = result.changes;

    room.players = room.players.filter((p) => {
      if (p.status !== 'disconnected') return true;
      if (!p.disconnectedAt) return true;
      return new Date(p.disconnectedAt).getTime() > Date.now() - RECONNECT_GRACE_SECONDS * 1000;
    });
    room.playerCount = room.players.length;

    if (room.players.length === 0 && room.observers.length === 0 && room.status !== 'playing') {
      this.rooms.delete(roomId);
      db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
    }

    return removedCount;
  }

  setPlayerReady(userId: string, ready: boolean): { roomId: string; player: SeatedPlayer } | null {
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
      WHERE rp.user_id = ? AND rp.is_player = 1 AND r.status IN ('waiting', 'playing')
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

  getObserversRoom(userId: string): InMemoryRoom | undefined {
    for (const room of this.rooms.values()) {
      if (room.observers.some((o) => o.id === userId)) {
        return room;
      }
    }

    const dbRoom = db
      .prepare(
        `
      SELECT r.* FROM rooms r
      JOIN room_observers ro ON r.id = ro.room_id
      WHERE ro.user_id = ? AND r.status IN ('waiting', 'playing')
      ORDER BY ro.joined_at DESC
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

  getUserRoom(userId: string): InMemoryRoom | undefined {
    return this.getPlayersRoom(userId) || this.getObserversRoom(userId);
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

  getActivePlayers(roomId: string): SeatedPlayer[] {
    const room = this.getRoom(roomId);
    if (!room) return [];
    return room.players.filter((p) => p.status === 'connected' && !p.isFolded);
  }
}
