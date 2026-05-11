import { v4 as uuidv4 } from 'uuid';
import type { RoomDetail, Player, GameType } from 'shared';
import db from '../../db';

export interface InMemoryRoom extends RoomDetail {
  players: Player[];
}

export class RoomManager {
  private rooms: Map<string, InMemoryRoom> = new Map();
  private playerRooms: Map<string, string> = new Map();

  createRoom(
    userId: string,
    name: string,
    gameType: GameType,
    maxPlayers: number,
    minBet: number
  ): InMemoryRoom {
    const user = db.prepare('SELECT id, username, balance FROM users WHERE id = ?').get(userId) as {
      id: string;
      username: string;
      balance: number;
    };

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO rooms (id, name, game_type, created_by, min_bet, max_players, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name, gameType, userId, minBet, maxPlayers, 'waiting', now);

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
    this.playerRooms.set(userId, id);

    return room;
  }

  getRoom(roomId: string): InMemoryRoom | undefined {
    return this.rooms.get(roomId);
  }

  getAllRooms(gameType?: GameType): import('shared').Room[] {
    let rooms = Array.from(this.rooms.values())
      .filter((r) => r.status === 'waiting')
      .map((r) => ({
        id: r.id,
        name: r.name,
        gameType: r.gameType,
        createdBy: r.createdBy,
        minBet: r.minBet,
        maxPlayers: r.maxPlayers,
        status: r.status,
        playerCount: r.players.length,
        createdAt: r.createdAt,
      }));

    if (gameType) {
      rooms = rooms.filter((r) => r.gameType === gameType);
    }

    return rooms;
  }

  joinRoom(roomId: string, userId: string): InMemoryRoom | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.status !== 'waiting') return null;
    if (room.players.length >= room.maxPlayers) return null;

    const existingPlayer = room.players.find((p) => p.id === userId);
    if (existingPlayer) return room;

    const user = db.prepare('SELECT id, username, balance FROM users WHERE id = ?').get(userId) as {
      id: string;
      username: string;
      balance: number;
    };

    const player: Player = {
      id: user.id,
      username: user.username,
      balance: user.balance,
      seatIndex: room.players.length,
      isReady: false,
      isFolded: false,
      isAllIn: false,
      currentBet: 0,
      hand: [],
    };

    room.players.push(player);
    room.playerCount = room.players.length;
    this.playerRooms.set(userId, roomId);

    return room;
  }

  leaveRoom(userId: string): { roomId: string; wasOwner: boolean } | null {
    const roomId = this.playerRooms.get(userId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    const wasOwner = room.createdBy === userId;
    const playerIndex = room.players.findIndex((p) => p.id === userId);

    if (playerIndex === -1) {
      this.playerRooms.delete(userId);
      return null;
    }

    room.players.splice(playerIndex, 1);
    room.playerCount = room.players.length;
    this.playerRooms.delete(userId);

    for (let i = 0; i < room.players.length; i++) {
      room.players[i].seatIndex = i;
    }

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
    } else if (wasOwner) {
      room.createdBy = room.players[0].id;
      db.prepare('UPDATE rooms SET created_by = ? WHERE id = ?').run(room.players[0].id, roomId);
    }

    return { roomId, wasOwner };
  }

  setPlayerReady(userId: string, ready: boolean): { roomId: string; player: Player } | null {
    const roomId = this.playerRooms.get(userId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.find((p) => p.id === userId);
    if (!player) return null;

    player.isReady = ready;
    return { roomId, player };
  }

  getPlayersRoom(userId: string): InMemoryRoom | undefined {
    const roomId = this.playerRooms.get(userId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  updateRoomStatus(roomId: string, status: 'waiting' | 'playing' | 'finished'): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.status = status;
      db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run(status, roomId);
    }
  }
}
