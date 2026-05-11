import type { GameType } from 'shared';
import type { RoomManager } from '../game/room/RoomManager';
import { v4 as uuidv4 } from 'uuid';

interface QueuedPlayer {
  userId: string;
  username: string;
  balance: number;
  gameType: GameType;
  joinedAt: Date;
}

export class QuickMatch {
  private queues: Map<GameType, QueuedPlayer[]> = new Map();
  private roomManager: RoomManager;
  private io: import('socket.io').Server;

  constructor(roomManager: RoomManager, io: import('socket.io').Server) {
    this.roomManager = roomManager;
    this.io = io;
    this.queues.set('blackjack', []);
    this.queues.set('poker', []);
    this.queues.set('custom', []);
  }

  joinQueue(userId: string, username: string, balance: number, gameType: GameType): void {
    const queue = this.queues.get(gameType) || [];

    const existing = queue.find((p) => p.userId === userId);
    if (existing) return;

    const player: QueuedPlayer = {
      userId,
      username,
      balance,
      gameType,
      joinedAt: new Date(),
    };

    queue.push(player);
    this.queues.set(gameType, queue);

    this.tryMatch(gameType);
  }

  leaveQueue(userId: string, gameType?: GameType): void {
    if (gameType) {
      const queue = this.queues.get(gameType) || [];
      this.queues.set(
        gameType,
        queue.filter((p) => p.userId !== userId)
      );
    } else {
      for (const [type, queue] of this.queues.entries()) {
        this.queues.set(
          type,
          queue.filter((p) => p.userId !== userId)
        );
      }
    }
  }

  private tryMatch(gameType: GameType): void {
    const queue = this.queues.get(gameType) || [];

    const minPlayers = gameType === 'blackjack' ? 1 : 2;
    const maxPlayers = gameType === 'blackjack' ? 5 : 6;

    if (queue.length >= minPlayers) {
      const matchSize = Math.min(queue.length, maxPlayers);
      const matchedPlayers = queue.slice(0, matchSize);

      const firstPlayer = matchedPlayers[0];
      const room = this.roomManager.createRoom(
        firstPlayer.userId,
        `Quick Match ${gameType}`,
        gameType,
        maxPlayers,
        100
      );

      for (const player of matchedPlayers) {
        this.roomManager.joinRoom(room.id, player.userId);
        this.io.emit('quickmatch:found', { roomId: room.id });
      }

      const remaining = queue.slice(matchSize);
      this.queues.set(gameType, remaining);
    }
  }
}
