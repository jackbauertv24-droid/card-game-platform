import { io, Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  User,
  Room,
  RoomDetail,
  GameState,
  GameResult,
  GameType,
  GameAction,
  GameActionType,
} from 'shared';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class SocketClient {
  private socket: GameSocket | null = null;
  private connected = false;
  private user: User | null = null;

  private onAuthSuccess: ((user: User) => void) | null = null;
  private onError: ((msg: string) => void) | null = null;
  private onRoomList: ((rooms: Room[]) => void) | null = null;
  private onRoomJoined: ((room: RoomDetail) => void) | null = null;
  private onGameStarted: ((state: GameState) => void) | null = null;
  private onGameState: ((state: GameState) => void) | null = null;
  private onGameEnded: ((results: GameResult[]) => void) | null = null;
  private onTurn: ((playerId: string, actions: GameActionType[]) => void) | null = null;

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
        if (this.onRoomJoined) this.onRoomJoined(data.room);
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
        if (this.onTurn) this.onTurn(data.playerId, data.validActions);
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
  setOnRoomList(cb: (rooms: Room[]) => void) {
    this.onRoomList = cb;
  }
  setOnRoomJoined(cb: (room: RoomDetail) => void) {
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
  setOnTurn(cb: (playerId: string, actions: GameActionType[]) => void) {
    this.onTurn = cb;
  }

  getRooms(gameType?: GameType) {
    if (this.socket) {
      this.socket.emit('room:list', { gameType }, (res) => {
        if (this.onRoomList) this.onRoomList(res.rooms);
      });
    }
  }

  createRoom(name: string, gameType: GameType, maxPlayers: number, minBet: number) {
    if (this.socket) {
      this.socket.emit('room:create', { name, gameType, maxPlayers, minBet }, (res) => {
        if (res.success && res.room && this.onRoomJoined) {
          this.onRoomJoined(res.room as RoomDetail);
        } else if (this.onError) {
          this.onError(res.message || 'Failed to create room');
        }
      });
    }
  }

  joinRoom(roomId: string) {
    if (this.socket) {
      this.socket.emit('room:join', { roomId }, (res) => {
        if (res.success && res.room && this.onRoomJoined) {
          this.onRoomJoined(res.room);
        } else if (this.onError) {
          this.onError(res.message || 'Failed to join room');
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
