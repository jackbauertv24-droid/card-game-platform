import type { GameType, Player } from './game';

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface Observer {
  id: string;
  username: string;
  joinedAt: string;
}

export interface SeatedPlayer extends Player {
  seatIndex: number;
  joinedAt: string;
}

export interface Room {
  id: string;
  name: string;
  gameType: GameType;
  createdBy: string;
  minBet: number;
  maxPlayers: number;
  status: RoomStatus;
  playerCount: number;
  observerCount: number;
  createdAt: string;
}

export interface RoomDetail extends Room {
  players: SeatedPlayer[];
  observers: Observer[];
  emptySeats: number[];
}

export interface RoomPreview {
  id: string;
  name: string;
  gameType: GameType;
  status: RoomStatus;
  playerCount: number;
  observerCount: number;
  minBet: number;
  maxPlayers: number;
  canJoin: boolean;
  canObserve: boolean;
}
