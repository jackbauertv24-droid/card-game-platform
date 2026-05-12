import { io, Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  User,
  RoomPreview,
  RoomDetail,
  GameState,
  GameResult,
  GameType,
  GameAction,
  TurnInfo,
  Observer,
  SeatedPlayer,
} from 'shared';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class SocketClient {
  private socket: GameSocket | null = null;
  private connected = false;
  private user: User | null = null;

  private onAuthSuccess: ((user: User) => void) | null = null;
  private onError: ((msg: string) => void) | null = null;
  private onRoomList: ((rooms: RoomPreview[]) => void) | null = null;
  private onRoomJoined: ((room: RoomDetail, asObserver: boolean) => void) | null = null;
  private onGameStarted: ((state: GameState) => void) | null = null;
  private onGameState: ((state: GameState) => void) | null = null;
  private onGameEnded: ((results: GameResult[]) => void) | null = null;
  private onTurn: ((turnInfo: TurnInfo) => void) | null = null;
  private onTimerUpdate: ((remainingSeconds: number) => void) | null = null;
  private onObserverJoined: ((observer: Observer) => void) | null = null;
  private onObserverLeft: ((userId: string) => void) | null = null;
  private onPlayerSeated: ((player: SeatedPlayer, seatIndex: number) => void) | null = null;
  private onPlayerUnseated: ((playerId: string, seatIndex: number) => void) | null = null;

  connect(url: string, token: string): Promise<User> {
    return new Promise((resolve, reject) => {
      this.socket = io(url, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        this.connected = true;
      });

      this.socket.on('auth:success', (data) => {
        this.user = data.user;
        if (this.onAuthSuccess) this.onAuthSuccess(data.user);
        resolve(data.user);
      });

      this.socket.on('auth:error', (data) => {
        if (this.onError) this.onError(data.message);
        reject(new Error(data.message));
      });

      this.socket.on('room:list', (data) => {
        if (this.onRoomList) this.onRoomList(data.rooms);
      });

      this.socket.on('room:joined', (data) => {
        if (this.onRoomJoined) this.onRoomJoined(data.room, data.asObserver);
      });

      this.socket.on('game:started', (data) => {
        if (this.onGameStarted) this.onGameStarted(data.gameState);
      });

      this.socket.on('game:state', (data) => {
        if (this.onGameState) this.onGameState(data.gameState);
      });

      this.socket.on('game:ended', (data) => {
        if (this.onGameEnded) this.onGameEnded(data.results);
      });

      this.socket.on('game:turn', (data) => {
        if (this.onTurn) this.onTurn(data);
      });

      this.socket.on('game:timer_update', (data) => {
        if (this.onTimerUpdate) this.onTimerUpdate(data.remainingSeconds);
      });

      this.socket.on('room:observer_joined', (data) => {
        if (this.onObserverJoined) this.onObserverJoined(data.observer);
      });

      this.socket.on('room:observer_left', (data) => {
        if (this.onObserverLeft) this.onObserverLeft(data.userId);
      });

      this.socket.on('room:player_seated', (data) => {
        if (this.onPlayerSeated) this.onPlayerSeated(data.player, data.seatIndex);
      });

      this.socket.on('room:player_unseated', (data) => {
        if (this.onPlayerUnseated) this.onPlayerUnseated(data.playerId, data.seatIndex);
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
      });
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  getUser(): User | null {
    return this.user;
  }

  setUser(user: User): void {
    this.user = user;
  }

  setOnAuthSuccess(cb: (user: User) => void) {
    this.onAuthSuccess = cb;
  }
  setOnError(cb: (msg: string) => void) {
    this.onError = cb;
  }
  setOnRoomList(cb: (rooms: RoomPreview[]) => void) {
    this.onRoomList = cb;
  }
  setOnRoomJoined(cb: (room: RoomDetail, asObserver: boolean) => void) {
    this.onRoomJoined = cb;
  }
  setOnGameStarted(cb: (state: GameState) => void) {
    this.onGameStarted = cb;
  }
  setOnGameState(cb: (state: GameState) => void) {
    this.onGameState = cb;
  }
  setOnGameEnded(cb: (results: GameResult[]) => void) {
    this.onGameEnded = cb;
  }
  setOnTurn(cb: (turnInfo: TurnInfo) => void) {
    this.onTurn = cb;
  }
  setOnTimerUpdate(cb: (remainingSeconds: number) => void) {
    this.onTimerUpdate = cb;
  }
  setOnObserverJoined(cb: (observer: Observer) => void) {
    this.onObserverJoined = cb;
  }
  setOnObserverLeft(cb: (userId: string) => void) {
    this.onObserverLeft = cb;
  }
  setOnPlayerSeated(cb: (player: SeatedPlayer, seatIndex: number) => void) {
    this.onPlayerSeated = cb;
  }
  setOnPlayerUnseated(cb: (playerId: string, seatIndex: number) => void) {
    this.onPlayerUnseated = cb;
  }

  getRooms(gameType?: GameType, includePlaying?: boolean) {
    if (this.socket) {
      this.socket.emit('room:list', { gameType, includePlaying }, (res) => {
        if (this.onRoomList) this.onRoomList(res.rooms);
      });
    }
  }

  createRoom(name: string, gameType: GameType, maxPlayers: number, minBet: number) {
    if (this.socket) {
      this.socket.emit('room:create', { name, gameType, maxPlayers, minBet }, (res) => {
        if (res.success && res.room && this.onRoomJoined) {
          this.onRoomJoined(res.room, false);
        } else if (this.onError) {
          this.onError(res.message || 'Failed to create room');
        }
      });
    }
  }

  joinRoom(roomId: string, asObserver?: boolean) {
    if (this.socket) {
      this.socket.emit('room:join', { roomId, asObserver }, (res) => {
        if (res.success && res.room && this.onRoomJoined) {
          this.onRoomJoined(res.room, asObserver ?? false);
        } else if (this.onError) {
          this.onError(res.message || 'Failed to join room');
        }
      });
    }
  }

  sitDown(seatIndex: number) {
    if (this.socket) {
      this.socket.emit('room:sit-down', { seatIndex }, (res) => {
        if (!res.success && this.onError) {
          this.onError(res.message || 'Failed to sit down');
        }
      });
    }
  }

  standUp() {
    if (this.socket) {
      this.socket.emit('room:stand-up', {}, (res) => {
        if (!res.success && this.onError) {
          this.onError('Failed to stand up');
        }
      });
    }
  }

  leaveRoom() {
    if (this.socket) {
      this.socket.emit('room:leave', {}, () => {});
    }
  }

  startGame() {
    if (this.socket) {
      this.socket.emit('game:start', {}, (res) => {
        if (!res.success && this.onError) {
          this.onError(res.message || 'Failed to start game');
        }
      });
    }
  }

  sendAction(action: GameAction) {
    if (this.socket) {
      this.socket.emit('game:action', action, (res) => {
        if (!res.success && this.onError) {
          this.onError(res.message || 'Action failed');
        }
      });
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }
}

export const socketClient = new SocketClient();
