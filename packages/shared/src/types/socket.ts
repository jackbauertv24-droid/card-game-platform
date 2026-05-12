import type { User } from './user';
import type { Room, RoomDetail } from './room';
import type { GameState, GameAction, GameResult, GameType } from './game';

export interface ServerToClientEvents {
  'auth:success': (data: { user: User; token: string }) => void;
  'auth:error': (data: { message: string }) => void;
  'room:created': (data: { room: Room }) => void;
  'room:joined': (data: { room: RoomDetail }) => void;
  'room:player_joined': (data: { player: import('./game').Player }) => void;
  'room:player_left': (data: { playerId: string }) => void;
  'room:player_ready': (data: { playerId: string; ready: boolean }) => void;
  'room:list': (data: { rooms: Room[] }) => void;
  'game:started': (data: { gameState: GameState }) => void;
  'game:state': (data: { gameState: GameState }) => void;
  'game:turn': (data: {
    playerId: string;
    validActions: import('./game').GameActionType[];
  }) => void;
  'game:timeout': (data: { playerId: string; action: string }) => void;
  'game:ended': (data: { results: GameResult[] }) => void;
  error: (data: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'auth:login': (
    data: { username: string; password: string },
    callback: (response: {
      success: boolean;
      user?: User;
      token?: string;
      message?: string;
    }) => void
  ) => void;
  'room:list': (
    data: { gameType?: GameType },
    callback: (response: { rooms: Room[] }) => void
  ) => void;
  'room:create': (
    data: { name: string; gameType: GameType; maxPlayers: number; minBet: number },
    callback: (response: { success: boolean; room?: Room; message?: string }) => void
  ) => void;
  'room:join': (
    data: { roomId: string },
    callback: (response: { success: boolean; room?: RoomDetail; message?: string }) => void
  ) => void;
  'room:leave': (data: {}, callback: (response: { success: boolean }) => void) => void;
  'room:set-ready': (data: { ready: boolean }) => void;
  'game:start': (
    data: {},
    callback: (response: { success: boolean; message?: string }) => void
  ) => void;
  'game:action': (
    data: GameAction,
    callback: (response: { success: boolean; message?: string }) => void
  ) => void;
  'quickmatch:join': (data: { gameType: GameType }) => void;
  'quickmatch:leave': (data: {}) => void;
}
