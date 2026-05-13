import { createHttpClient } from './api/http';
import { socketClient } from './api/socket';
import type { User, RoomPreview, RoomDetail, GameState, GameType, TurnInfo } from 'shared';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as readline from 'readline';

const API_URL = process.env.API_URL || 'http://localhost:4000/api';
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:4000';
const STATE_FILE = join(tmpdir(), 'cardgame-repl-state.json');

const http = createHttpClient(API_URL);

interface REPLState {
  user: User | null;
  token: string | null;
  room: RoomDetail | null;
  gameState: GameState | null;
  isObserver: boolean;
  turnInfo: TurnInfo | null;
  timerSeconds: number;
  connected: boolean;
}

const state: REPLState = loadState();

function loadState(): REPLState {
  const storedUser = http.getStoredUser();
  const storedToken = http.getToken();

  let room: RoomDetail | null = null;
  let gameState: GameState | null = null;
  let isObserver = false;

  if (existsSync(STATE_FILE)) {
    try {
      const data = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      room = data.room;
      gameState = data.gameState;
      isObserver = data.isObserver ?? false;
    } catch {}
  }

  return {
    user: storedUser,
    token: storedToken,
    room,
    gameState,
    isObserver,
    turnInfo: null,
    timerSeconds: 30,
    connected: false,
  };
}

function saveState(): void {
  if (state.room || state.gameState) {
    writeFileSync(
      STATE_FILE,
      JSON.stringify({
        room: state.room,
        gameState: state.gameState,
        isObserver: state.isObserver,
      })
    );
  } else if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }
}

async function connectSocket(): Promise<void> {
  if (!state.token) {
    console.log('Not logged in. Use: login <username> <password>');
    return;
  }

  if (state.connected) return;

  try {
    await socketClient.connect(SOCKET_URL, state.token);
    state.connected = true;

    socketClient.setOnRoomJoined((room, asObserver) => {
      state.room = room;
      state.isObserver = asObserver;
      saveState();
      console.log(`\n[Room joined: ${room.name}]`);
      console.log(`[Status: ${asObserver ? 'Observer' : 'Player'}]`);
      printRoom();
    });

    socketClient.setOnGameState((gs) => {
      state.gameState = gs;
      saveState();
      console.log('\n[Game state updated]');
      printGameState();
    });

    socketClient.setOnTurn((ti) => {
      state.turnInfo = ti;
      state.timerSeconds = ti.remainingSeconds;
      console.log(`\n[Turn: ${ti.playerName} @ seat ${ti.seatIndex}]`);
      console.log(`[Timer: ${ti.remainingSeconds}s]`);
      console.log(`[Actions: ${ti.validActions.join(', ')}]`);
    });

    socketClient.setOnTimerUpdate((seconds) => {
      state.timerSeconds = seconds;
    });

    socketClient.setOnGameEnded((results) => {
      state.gameState = null;
      state.turnInfo = null;
      saveState();
      console.log('\n[Game ended]');
      for (const r of results) {
        console.log(`  ${r.playerId}: ${r.result} (${r.amount})`);
      }
    });

    console.log('Connected to server');
  } catch (err) {
    console.error('Connection failed:', (err as Error).message);
  }
}

function printGameState(): void {
  if (!state.gameState) {
    console.log('No active game');
    return;
  }

  const gs = state.gameState;
  console.log(`\nPhase: ${gs.phase}`);
  console.log(`Pot: ${gs.pot}`);
  console.log(`Current bet: ${gs.currentBet}`);
  console.log(`\nDealer: ${gs.dealerHand.map((c) => `${c.rank}${c.suit[0]}`).join(' ')}`);

  for (const p of gs.players) {
    const cards = p.hand.map((c) => `${c.rank}${c.suit[0]}`).join(' ');
    const status = p.isFolded ? '[FOLD]' : '';
    console.log(`\n${p.username} (seat ${p.seatIndex}): ${cards} ${status}`);
    console.log(`  Bet: ${p.currentBet} | Balance: ${p.balance}`);
  }
}

function printRoom(): void {
  if (!state.room) {
    console.log('Not in a room');
    return;
  }

  const r = state.room;
  console.log(`\nRoom: ${r.name} (${r.id})`);
  console.log(`Type: ${r.gameType} | Status: ${r.status}`);
  console.log(`Min bet: ${r.minBet} | Max players: ${r.maxPlayers}`);
  console.log(`\nSeats:`);

  for (let i = 0; i < r.maxPlayers; i++) {
    const player = r.players.find((p) => p.seatIndex === i);
    if (player) {
      const ready = player.isReady ? '[READY]' : '';
      console.log(`  [${i}] ${player.username} (balance: ${player.balance}) ${ready}`);
    } else {
      console.log(`  [${i}] (empty)`);
    }
  }

  console.log(`\nObservers (${r.observerCount}):`);
  for (const o of r.observers) {
    console.log(`  ${o.username}`);
  }

  console.log(`\nYour status: ${state.isObserver ? 'Observer' : 'Player'}`);
}

const commands: Record<string, (args: string[]) => Promise<void> | void> = {
  async login(args) {
    if (args.length < 2) {
      console.log('Usage: login <username> <password>');
      return;
    }
    try {
      const result = await http.login(args[0], args[1]);
      http.saveToken(result.token, result.user);
      state.user = result.user;
      state.token = result.token;
      console.log(`Logged in as ${result.user.username} (balance: ${result.user.balance})`);
      await connectSocket();
    } catch (err) {
      console.error((err as Error).message);
    }
  },

  async register(args) {
    if (args.length < 3) {
      console.log('Usage: register <username> <password> <inviteCode>');
      return;
    }
    try {
      const result = await http.register(args[0], args[1], args[2]);
      http.saveToken(result.token, result.user);
      state.user = result.user;
      state.token = result.token;
      console.log(`Registered as ${result.user.username} (balance: ${result.user.balance})`);
      await connectSocket();
    } catch (err) {
      console.error((err as Error).message);
    }
  },

  async rooms(args) {
    await connectSocket();
    const gameType = args[0] as GameType | undefined;
    const includePlaying = args.includes('--playing');

    try {
      const res = await fetch(
        `${API_URL}/rooms?${gameType ? `gameType=${gameType}` : ''}&includePlaying=${includePlaying}`,
        {
          headers: { Authorization: `Bearer ${state.token}` },
        }
      );
      const data = (await res.json()) as { rooms: RoomPreview[] };
      console.log(`\nRooms (${data.rooms.length}):`);
      for (const r of data.rooms) {
        const status = r.status === 'playing' ? '[PLAYING]' : '';
        console.log(`  ${r.name} (${r.id}) ${status}`);
        console.log(
          `    Type: ${r.gameType} | Players: ${r.playerCount}/${r.maxPlayers} | Observers: ${r.observerCount}`
        );
        console.log(`    Min bet: ${r.minBet}`);
      }
    } catch (err) {
      console.error((err as Error).message);
    }
  },

  async create(args) {
    if (args.length < 3) {
      console.log('Usage: create <name> <gameType> [maxPlayers] [minBet]');
      return;
    }
    await connectSocket();

    try {
      const res = await fetch(`${API_URL}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.token}`,
        },
        body: JSON.stringify({
          name: args[0],
          gameType: args[1],
          maxPlayers: parseInt(args[2]) || 5,
          minBet: parseInt(args[3]) || 100,
        }),
      });
      const data = (await res.json()) as {
        room: RoomDetail;
        gameState?: GameState;
        error?: string;
      };
      if (data.error) {
        console.error(data.error);
        return;
      }
      state.room = data.room;
      state.gameState = data.gameState || null;
      const isPlayer = data.room.players.some((p) => p.id === state.user?.id);
      state.isObserver = !isPlayer;
      saveState();
      console.log(`Created room: ${data.room.name} (${data.room.id})`);
      printRoom();
      if (data.gameState) {
        printGameState();
      }
    } catch (err) {
      console.error((err as Error).message);
    }
  },

  async join(args) {
    if (args.length < 1) {
      console.log('Usage: join <roomId> [--observer]');
      return;
    }
    await connectSocket();

    const roomId = args[0];
    const asObserver = args.includes('--observer');

    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.token}`,
        },
        body: JSON.stringify({ asObserver }),
      });
      const data = (await res.json()) as {
        room: RoomDetail;
        gameState?: GameState;
        error?: string;
      };
      if (data.error) {
        console.error(data.error);
        return;
      }
      state.room = data.room;
      state.gameState = data.gameState || null;
      state.isObserver = asObserver || data.room.status === 'playing';
      saveState();
      console.log(`Joined room: ${data.room.name}`);
      printRoom();
      if (data.gameState) {
        printGameState();
      }
    } catch (err) {
      console.error((err as Error).message);
    }
  },

  async sit(args) {
    if (args.length < 1) {
      console.log('Usage: sit <seatIndex>');
      return;
    }
    if (!state.room) {
      console.log('Not in a room');
      return;
    }

    const seatIndex = parseInt(args[0]);
    try {
      const res = await fetch(`${API_URL}/rooms/${state.room.id}/sit-down`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.token}`,
        },
        body: JSON.stringify({ seatIndex }),
      });
      const data = (await res.json()) as { success: boolean; error?: string; room?: RoomDetail };
      if (data.error) {
        console.error(data.error);
        return;
      }
      state.isObserver = false;
      if (data.room) {
        state.room = data.room;
      }
      saveState();
      console.log(`Sat at seat ${seatIndex}`);
      printRoom();
    } catch (err) {
      console.error((err as Error).message);
    }
  },

  async standup() {
    if (!state.room) {
      console.log('Not in a room');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/rooms/${state.room.id}/stand-up`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.token}`,
        },
      });
      const data = (await res.json()) as { success: boolean; error?: string; room?: RoomDetail };
      if (data.error) {
        console.error(data.error);
        return;
      }
      state.isObserver = true;
      if (data.room) {
        state.room = data.room;
      }
      saveState();
      console.log('Stood up, now an observer');
      printRoom();
    } catch (err) {
      console.error((err as Error).message);
    }
  },

  async leave() {
    if (!state.room) {
      console.log('Not in a room');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/rooms/${state.room.id}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.token}`,
        },
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (data.error) {
        console.error(data.error);
        return;
      }
      state.room = null;
      state.gameState = null;
      state.isObserver = false;
      state.turnInfo = null;
      saveState();
      console.log('Left room');
    } catch (err) {
      console.error((err as Error).message);
    }
  },

  async ready(args) {
    await connectSocket();
    const ready = args[0] !== 'false';
    socketClient.setOnError((msg) => console.error(msg));
    // Note: ready toggle needs socket implementation
    console.log(`Ready status: ${ready}`);
  },

  async start() {
    if (!state.room) {
      console.log('Not in a room');
      return;
    }
    if (state.room.createdBy !== state.user?.id) {
      console.log('Only room owner can start game');
      return;
    }
    await connectSocket();
    socketClient.startGame();
    console.log('Starting game...');
  },

  async bet(args: string[]) {
    if (args.length < 1) {
      console.log('Usage: bet <amount>');
      return;
    }
    await connectSocket();
    const amount = parseInt(args[0]);
    socketClient.sendAction({ type: 'bet', amount });
  },

  async hit() {
    await connectSocket();
    socketClient.sendAction({ type: 'hit' });
  },

  async stand() {
    await connectSocket();
    socketClient.sendAction({ type: 'stand' });
  },

  async double() {
    await connectSocket();
    socketClient.sendAction({ type: 'double' });
  },

  fold() {
    console.log('Fold not applicable in Blackjack');
  },

  status() {
    console.log('\n=== Status ===');
    console.log(`User: ${state.user?.username || 'not logged in'}`);
    console.log(`Balance: ${state.user?.balance || 0}`);
    console.log(`Socket: ${state.connected ? 'connected' : 'disconnected'}`);
    if (state.room) {
      printRoom();
    }
    if (state.gameState) {
      printGameState();
    }
    if (state.turnInfo) {
      console.log(`\nTurn: ${state.turnInfo.playerName}`);
      console.log(`Timer: ${state.timerSeconds}s`);
      console.log(`Actions: ${state.turnInfo.validActions.join(', ')}`);
    }
  },

  timer() {
    console.log(`Timer: ${state.timerSeconds}s remaining`);
  },

  logout() {
    socketClient.disconnect();
    state.user = null;
    state.token = null;
    state.room = null;
    state.gameState = null;
    state.connected = false;
    http.clearToken();
    if (existsSync(STATE_FILE)) {
      unlinkSync(STATE_FILE);
    }
    console.log('Logged out');
  },

  help() {
    console.log('\n=== Commands ===');
    console.log('login <username> <password>');
    console.log('register <username> <password> <inviteCode>');
    console.log('rooms [gameType] [--playing]');
    console.log('create <name> <gameType> [maxPlayers] [minBet]');
    console.log('join <roomId> [--observer]');
    console.log('sit <seatIndex>');
    console.log('stand');
    console.log('leave');
    console.log('ready [true|false]');
    console.log('start');
    console.log('bet <amount>');
    console.log('hit');
    console.log('stand');
    console.log('double');
    console.log('fold');
    console.log('status');
    console.log('timer');
    console.log('logout');
    console.log('help');
    console.log('exit');
  },

  exit() {
    if (state.connected) {
      socketClient.disconnect();
    }
    saveState();
    process.exit(0);
  },
};

async function runREPL() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  console.log('Card Game CLI REPL');
  console.log('Type "help" for commands');

  if (state.token) {
    console.log(`\nRestoring session for ${state.user?.username}`);
    await connectSocket();
    if (state.room) {
      printRoom();
    }
  }

  rl.prompt();

  rl.on('line', async (line: string) => {
    const parts = line.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    if (!cmd) {
      rl.prompt();
      return;
    }

    if (commands[cmd]) {
      try {
        await commands[cmd](parts.slice(1));
      } catch (err) {
        console.error('Error:', (err as Error).message);
      }
    } else {
      console.log(`Unknown command: ${cmd}. Type "help"`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    saveState();
    process.exit(0);
  });
}

runREPL();
