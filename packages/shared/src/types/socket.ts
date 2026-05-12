import type { User } from './user';
import type { Room, RoomDetail, RoomPreview, Observer, SeatedPlayer } from './room';
import type { GameState, GameAction, GameResult, GameType, TurnInfo } from './game';

export interface ServerToClientEvents {
  'auth:success': (data: { user: User; token: string }) => void;
  'auth:error': (data: { message: string }) => void;

  'room:created': (data: { room: Room }) => void;
  'room:joined': (data: { room: RoomDetail; asObserver: boolean; gameState?: GameState }) => void;
  'room:left': (data: { roomId: string }) => void;
  'room:list': (data: { rooms: RoomPreview[] }) => void;
  'room:preview': (data: { room: RoomDetail; gameState?: GameState }) => void;
  'room:state': (data: { room: RoomDetail }) => void;

  'room:observer_joined': (data: { observer: Observer }) => void;
  'room:observer_left': (data: { userId: string }) => void;

  'room:player_seated': (data: { player: SeatedPlayer; seatIndex: number }) => void;
  'room:player_unseated': (data: { playerId: string; seatIndex: number }) => void;
  'room:player_left': (data: { playerId: string }) => void;
  'room:player_ready': (data: { playerId: string; ready: boolean }) => void;
  'room:player_stand_up_after_round': (data: { playerId: string; standUp: boolean }) => void;

  'game:started': (data: { gameState: GameState }) => void;
  'game:state': (data: { gameState: GameState }) => void;
  'game:turn': (data: TurnInfo) => void;
  'game:timeout': (data: { playerId: string; action: string }) => void;
  'game:timer_update': (data: { remainingSeconds: number }) => void;
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
    data: { gameType?: GameType; includePlaying?: boolean },
    callback: (response: { rooms: RoomPreview[] }) => void
  ) => void;
  'room:create': (
    data: { name: string; gameType: GameType; maxPlayers: number; minBet: number },
    callback: (response: {
      success: boolean;
      room?: RoomDetail;
      gameState?: GameState;
      message?: string;
    }) => void
  ) => void;
  'room:join': (
    data: { roomId: string; asObserver?: boolean },
    callback: (response: {
      success: boolean;
      room?: RoomDetail;
      gameState?: GameState;
      message?: string;
    }) => void
  ) => void;
  'room:leave': (data: {}, callback: (response: { success: boolean }) => void) => void;
  'room:preview': (
    data: { roomId: string },
    callback: (response: { room: RoomDetail; gameState?: GameState }) => void
  ) => void;

  'room:sit-down': (
    data: { seatIndex: number },
    callback: (response: { success: boolean; seatIndex?: number; message?: string }) => void
  ) => void;
  'room:stand-up': (data: {}, callback: (response: { success: boolean }) => void) => void;
  'room:set-ready': (data: { ready: boolean }) => void;
  'room:set-stand-up-after-round': (data: { standUp: boolean }) => void;

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
