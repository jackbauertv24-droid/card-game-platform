import type { GameType } from './game';

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface Room {
  id: string;
  name: string;
  gameType: GameType;
  createdBy: string;
  minBet: number;
  maxPlayers: number;
  status: RoomStatus;
  playerCount: number;
  createdAt: string;
}

export interface RoomDetail extends Room {
  players: import('./game').Player[];
}
