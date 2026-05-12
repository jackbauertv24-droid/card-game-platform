import { createHttpClient } from './api/http';
import { socketClient } from './api/socket';
import type {
  User,
  RoomPreview,
  RoomDetail,
  GameState,
  GameType,
  GameAction,
  TurnInfo,
} from 'shared';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const API_URL = process.env.API_URL || 'http://localhost:4000/api';
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:4000';

const STATE_FILE = join(tmpdir(), 'cardgame-cli-state.json');
const http = createHttpClient(API_URL);

export interface CLIState {
  user: User | null;
  token: string | null;
  room: RoomDetail | null;
  roomId: string | null;
  gameState: GameState | null;
  isObserver: boolean;
  turnInfo: TurnInfo | null;
  timerSeconds: number;
}

function loadState(): CLIState {
  const storedUser = http.getStoredUser();
  const storedToken = http.getToken();

  let room: RoomDetail | null = null;
  let roomId: string | null = null;
  let gameState: GameState | null = null;
  let isObserver = false;

  if (existsSync(STATE_FILE)) {
    try {
      const data = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      room = data.room;
      roomId = data.roomId || data.room?.id;
      gameState = data.gameState;
      isObserver = data.isObserver ?? false;
    } catch {
      // ignore
    }
  }

  return {
    user: storedUser,
    token: storedToken,
    room,
    roomId,
    gameState,
    isObserver,
    turnInfo: null,
    timerSeconds: 30,
  };
}

function saveState(): void {
  const roomId = state.room?.id || state.roomId;
  writeFileSync(
    STATE_FILE,
    JSON.stringify({
      room: state.room,
      roomId,
      gameState: state.gameState,
      isObserver: state.isObserver,
    })
  );
  state.roomId = roomId;
}

export const state: CLIState = loadState();
let isReconnecting = false;

async function ensureConnected(): Promise<void> {
  if (!socketClient.isConnected() && state.token) {
    await socketClient.connect(SOCKET_URL, state.token);

    if (!isReconnecting) {
      isReconnecting = true;
      const roomIdToJoin = state.roomId || state.room?.id;
      if (roomIdToJoin) {
        try {
          await joinRoomInternal(roomIdToJoin, state.isObserver);
        } catch {
          state.room = null;
          state.roomId = null;
          state.gameState = null;
          saveState();
        }
      }
      isReconnecting = false;
    }
  }
}

export async function login(username: string, password: string): Promise<User> {
  const result = await http.login(username, password);
  http.saveToken(result.token, result.user);
  state.user = result.user;
  state.token = result.token;
  await socketClient.connect(SOCKET_URL, result.token);
  return result.user;
}

export async function register(
  username: string,
  password: string,
  inviteCode: string
): Promise<User> {
  const result = await http.register(username, password, inviteCode);
  http.saveToken(result.token, result.user);
  state.user = result.user;
  state.token = result.token;
  await socketClient.connect(SOCKET_URL, result.token);
  return result.user;
}

export function logout(): void {
  socketClient.disconnect();
  state.user = null;
  state.token = null;
  state.room = null;
  state.roomId = null;
  state.gameState = null;
  state.isObserver = false;
  http.clearToken();
  if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }
}

export async function getRooms(
  gameType?: GameType,
  includePlaying?: boolean
): Promise<RoomPreview[]> {
  await ensureConnected();
  return new Promise((resolve) => {
    socketClient.setOnRoomList((rooms) => resolve(rooms));
    socketClient.getRooms(gameType, includePlaying);
  });
}

export async function createRoom(
  name: string,
  gameType: GameType,
  maxPlayers: number,
  minBet: number
): Promise<RoomDetail> {
  await ensureConnected();
  return new Promise((resolve, reject) => {
    socketClient.setOnRoomJoined((room, asObserver) => {
      state.room = room;
      state.isObserver = asObserver;
      saveState();
      resolve(room);
    });
    socketClient.setOnError((msg) => reject(new Error(msg)));
    socketClient.createRoom(name, gameType, maxPlayers, minBet);
  });
}

async function joinRoomInternal(roomId: string, asObserver?: boolean): Promise<RoomDetail> {
  return new Promise((resolve, reject) => {
    socketClient.setOnRoomJoined((room, wasObserver) => {
      state.room = room;
      state.isObserver = wasObserver;
      saveState();
      resolve(room);
    });
    socketClient.setOnError((msg) => reject(new Error(msg)));
    socketClient.joinRoom(roomId, asObserver);
  });
}

export async function joinRoom(roomId: string, asObserver?: boolean): Promise<RoomDetail> {
  await ensureConnected();
  return joinRoomInternal(roomId, asObserver);
}

export async function sitDown(seatIndex: number): Promise<void> {
  await ensureConnected();
  return new Promise((resolve, reject) => {
    socketClient.setOnPlayerSeated(() => {
      state.isObserver = false;
      if (state.room) {
        const me = state.room.players.find((p) => p.id === state.user?.id);
        if (me) {
          me.seatIndex = seatIndex;
        }
      }
      saveState();
      resolve();
    });
    socketClient.setOnError((msg) => reject(new Error(msg)));
    socketClient.sitDown(seatIndex);
  });
}

export async function standUp(): Promise<void> {
  await ensureConnected();
  return new Promise((resolve, reject) => {
    socketClient.setOnPlayerUnseated(() => {
      state.isObserver = true;
      saveState();
      resolve();
    });
    socketClient.setOnError((msg) => reject(new Error(msg)));
    socketClient.standUp();
  });
}

export function leaveRoom(): void {
  socketClient.leaveRoom();
  state.room = null;
  state.roomId = null;
  state.gameState = null;
  state.isObserver = false;
  saveState();
}

export async function startGame(): Promise<void> {
  await ensureConnected();
  return new Promise((resolve, reject) => {
    socketClient.setOnGameStarted((gs) => {
      state.gameState = gs;
      saveState();
      resolve();
    });
    socketClient.setOnError((msg) => reject(new Error(msg)));
    socketClient.startGame();
  });
}

export async function sendAction(action: GameAction): Promise<void> {
  await ensureConnected();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Action timeout')), 5000);
    socketClient.sendAction(action);
    socketClient.setOnGameState((gs) => {
      clearTimeout(timeout);
      state.gameState = gs;
      saveState();
      resolve();
    });
    socketClient.setOnError((msg) => {
      clearTimeout(timeout);
      reject(new Error(msg));
    });
  });
}

export function waitForGameState(): Promise<GameState> {
  return new Promise((resolve) => {
    socketClient.setOnGameState((gs) => {
      state.gameState = gs;
      saveState();
      resolve(gs);
    });
  });
}

export function waitForGameEnd(): Promise<{
  results: { playerId: string; result: string; amount: number }[];
}> {
  return new Promise((resolve) => {
    socketClient.setOnGameEnded((results) => {
      state.gameState = null;
      saveState();
      resolve({ results });
    });
  });
}

export function setOnTimerUpdate(callback: (seconds: number) => void): void {
  socketClient.setOnTimerUpdate(callback);
}

export function getMe(): User | null {
  return state.user;
}

export function getCurrentRoom(): RoomDetail | null {
  return state.room;
}

export function getGameState(): GameState | null {
  return state.gameState;
}

export function isConnected(): boolean {
  return socketClient.isConnected();
}

export function isObserver(): boolean {
  return state.isObserver;
}

async function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Usage: tui <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  login <username> <password>');
    console.log('  register <username> <password> <inviteCode>');
    console.log('  rooms [gameType] [--playing]');
    console.log('  create-room <name> <gameType> [maxPlayers] [minBet]');
    console.log('  join-room <roomId> [--observer]');
    console.log('  sit-down <seatIndex>');
    console.log('  stand-up');
    console.log('  leave-room');
    console.log('  start-game');
    console.log('  action <type> [amount]');
    console.log('  wait-state');
    console.log('  wait-end');
    console.log('  timer');
    console.log('  status');
    console.log('  logout');
    console.log('');
    console.log('Game Actions: bet, hit, stand, double, fold');
    console.log('Game Types: blackjack, poker');
    console.log('');
    console.log('Observer mode: join as observer to watch games');
    console.log('Sit down: choose a seat to become a player');
    process.exit(0);
  }

  try {
    switch (command) {
      case 'login': {
        const username = args[1];
        const password = args[2];
        if (!username || !password) {
          console.error('Usage: login <username> <password>');
          process.exit(1);
        }
        const user = await login(username, password);
        console.log(JSON.stringify({ success: true, user }, null, 2));
        break;
      }

      case 'register': {
        const username = args[1];
        const password = args[2];
        const inviteCode = args[3];
        if (!username || !password || !inviteCode) {
          console.error('Usage: register <username> <password> <inviteCode>');
          process.exit(1);
        }
        const user = await register(username, password, inviteCode);
        console.log(JSON.stringify({ success: true, user }, null, 2));
        break;
      }

      case 'rooms': {
        const gameType = args[1] as GameType | undefined;
        const includePlaying = args.includes('--playing');
        const rooms = await getRooms(gameType, includePlaying);
        console.log(JSON.stringify({ rooms }, null, 2));
        break;
      }

      case 'create-room': {
        const name = args[1];
        const gameType = args[2] as GameType;
        const maxPlayers = parseInt(args[3]) || 5;
        const minBet = parseInt(args[4]) || 100;
        if (!name || !gameType) {
          console.error('Usage: create-room <name> <gameType> [maxPlayers] [minBet]');
          process.exit(1);
        }
        const room = await createRoom(name, gameType, maxPlayers, minBet);
        console.log(JSON.stringify({ success: true, room }, null, 2));
        break;
      }

      case 'join-room': {
        const roomId = args[1];
        const asObserver = args.includes('--observer');
        if (!roomId) {
          console.error('Usage: join-room <roomId> [--observer]');
          process.exit(1);
        }
        const room = await joinRoom(roomId, asObserver);
        console.log(JSON.stringify({ success: true, room, asObserver }, null, 2));
        break;
      }

      case 'sit-down': {
        const seatIndex = parseInt(args[1]);
        if (seatIndex === undefined || seatIndex < 0) {
          console.error('Usage: sit-down <seatIndex>');
          console.error('Seat index must be 0-4');
          process.exit(1);
        }
        await sitDown(seatIndex);
        console.log(JSON.stringify({ success: true, seatIndex }, null, 2));
        break;
      }

      case 'stand-up': {
        await standUp();
        console.log(JSON.stringify({ success: true }));
        break;
      }

      case 'leave-room': {
        leaveRoom();
        console.log(JSON.stringify({ success: true }));
        break;
      }

      case 'start-game': {
        await startGame();
        console.log(JSON.stringify({ success: true, gameState: state.gameState }, null, 2));
        break;
      }

      case 'action': {
        const type = args[1] as GameAction['type'];
        const amount = args[2] ? parseInt(args[2]) : undefined;
        if (!type) {
          console.error('Usage: action <type> [amount]');
          console.error('Types: bet, hit, stand, double, fold');
          process.exit(1);
        }
        await sendAction({ type, amount });
        console.log(JSON.stringify({ success: true, gameState: state.gameState }, null, 2));
        break;
      }

      case 'wait-state': {
        const gs = await waitForGameState();
        console.log(JSON.stringify({ gameState: gs }, null, 2));
        break;
      }

      case 'wait-end': {
        const result = await waitForGameEnd();
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'timer': {
        console.log(JSON.stringify({ remainingSeconds: state.timerSeconds }, null, 2));
        break;
      }

      case 'status': {
        console.log(
          JSON.stringify(
            {
              connected: isConnected(),
              user: state.user,
              room: state.room,
              isObserver: state.isObserver,
              gameState: state.gameState,
              turnInfo: state.turnInfo,
              timerSeconds: state.timerSeconds,
            },
            null,
            2
          )
        );
        break;
      }

      case 'logout': {
        logout();
        console.log(JSON.stringify({ success: true }));
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  setTimeout(() => process.exit(0), 100);
}

runCLI();
