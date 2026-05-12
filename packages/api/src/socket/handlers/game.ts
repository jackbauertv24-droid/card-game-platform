import type { GameSocketServer } from '../index';
import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameState,
  GameActionType,
  TurnInfo,
  GameResult,
} from 'shared';
import { TURN_TIMEOUT_SECONDS } from 'shared';
import type { RoomManager, InMemoryRoom } from '../../game/room/RoomManager';
import { GameEngine } from '../../game/engine/GameEngine';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';

const activeGames: Map<string, GameEngine> = new Map();
const turnTimers: Map<string, NodeJS.Timeout> = new Map();
const timerIntervals: Map<string, NodeJS.Timeout> = new Map();

function saveGameState(gameId: string, roomId: string, gameState: GameState, deck?: unknown) {
  const stateJson = JSON.stringify(gameState);
  const deckJson = deck ? JSON.stringify(deck) : null;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT OR REPLACE INTO games (id, room_id, game_type, state, deck, current_player_index, turn_started_at, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT started_at FROM games WHERE id = ?), ?))`
  ).run(
    gameId,
    roomId,
    gameState.gameId || roomId,
    stateJson,
    deckJson,
    gameState.currentPlayerIndex,
    now,
    gameId,
    now
  );
}

function loadGameState(
  roomId: string
): { gameId: string; state: GameState; deck?: unknown } | null {
  const row = db
    .prepare(
      `SELECT id, state, deck, current_player_index, turn_started_at 
     FROM games WHERE room_id = ? AND ended_at IS NULL 
     ORDER BY started_at DESC LIMIT 1`
    )
    .get(roomId) as
    | {
        id: string;
        state: string;
        deck: string | null;
        current_player_index: number;
        turn_started_at: string | null;
      }
    | undefined;

  if (!row) return null;

  const state = JSON.parse(row.state) as GameState;
  state.gameId = row.id;
  state.turnStartedAt = row.turn_started_at;
  const deck = row.deck ? JSON.parse(row.deck) : undefined;

  return { gameId: row.id, state, deck };
}

function createTurnInfo(
  room: InMemoryRoom,
  gameState: GameState,
  validActions: GameActionType[]
): TurnInfo | null {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer) return null;

  const now = new Date();
  const startedAt = gameState.turnStartedAt || now.toISOString();
  const elapsed = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000);
  const remaining = Math.max(0, TURN_TIMEOUT_SECONDS - elapsed);

  return {
    playerId: currentPlayer.id,
    playerName: currentPlayer.username,
    seatIndex: currentPlayer.seatIndex,
    validActions,
    startedAt,
    remainingSeconds: remaining,
  };
}

function emitTurnInfo(
  io: GameSocketServer,
  roomId: string,
  room: InMemoryRoom,
  gameState: GameState,
  validActions: GameActionType[]
) {
  const turnInfo = createTurnInfo(room, gameState, validActions);
  if (turnInfo) {
    io.to(roomId).emit('game:turn', turnInfo);

    clearTimerInterval(roomId);

    const interval = setInterval(() => {
      const remaining = Math.max(0, turnInfo.remainingSeconds - 1);
      io.to(roomId).emit('game:timer_update', { remainingSeconds: remaining });

      if (remaining <= 0) {
        clearInterval(interval);
        timerIntervals.delete(roomId);
      }
    }, 1000);

    timerIntervals.set(roomId, interval);
  }
}

function clearTimerInterval(roomId: string) {
  const existing = timerIntervals.get(roomId);
  if (existing) {
    clearInterval(existing);
    timerIntervals.delete(roomId);
  }
}

function startTurnTimer(
  io: GameSocketServer,
  roomId: string,
  gameId: string,
  playerId: string,
  game: GameEngine,
  roomManager: RoomManager
) {
  clearTurnTimer(roomId);

  const timer = setTimeout(() => {
    console.log(`[game] Turn timeout for player ${playerId} in room ${roomId}`);
    clearTimerInterval(roomId);

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const currentPlayer = room.players.find((p) => p.id === playerId);
    if (!currentPlayer) return;

    const actionType = currentPlayer.status === 'disconnected' ? 'fold' : 'stand';
    console.log(`[game] Turn timeout action: ${actionType} for player ${playerId}`);

    const result = game.handleAction(playerId, { type: actionType });
    if (result.success) {
      const gameState = result.newState;
      gameState.gameId = gameId;
      gameState.turnStartedAt = undefined;
      saveGameState(gameId, roomId, gameState, game.getDeck());
      io.to(roomId).emit('game:state', { gameState });

      if (actionType === 'stand') {
        io.to(roomId).emit('game:timeout', { playerId, action: 'stand' });
      }

      if (gameState.phase === 'finished') {
        handleGameEnd(io, roomId, gameId, room, gameState, game, roomManager);
      } else if (gameState.phase === 'betting' || gameState.phase === 'playing') {
        const nextPlayer = gameState.players[gameState.currentPlayerIndex];
        if (nextPlayer && !nextPlayer.isFolded) {
          const validActions: GameActionType[] =
            gameState.phase === 'betting' ? ['bet'] : ['hit', 'stand', 'double'];
          gameState.turnStartedAt = new Date().toISOString();
          emitTurnInfo(io, roomId, room, gameState, validActions);
          startTurnTimer(io, roomId, gameId, nextPlayer.id, game, roomManager);
        }
      }
    } else {
      console.log(`[game] Turn timeout action failed: ${result.error}`);
    }
  }, TURN_TIMEOUT_SECONDS * 1000);

  turnTimers.set(roomId, timer);
}

function clearTurnTimer(roomId: string) {
  const existing = turnTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    turnTimers.delete(roomId);
  }
}

function handleGameEnd(
  io: GameSocketServer,
  roomId: string,
  gameId: string,
  room: InMemoryRoom,
  gameState: GameState,
  game: GameEngine,
  roomManager: RoomManager
) {
  console.log(`[game] Game ended in room ${roomId}`);

  const results: GameResult[] = [];
  for (const player of gameState.players) {
    const playerResult = game.game?.getPlayerResult?.(player.id) || {
      result: 'lose' as const,
      amount: -player.currentBet,
    };
    results.push({
      playerId: player.id,
      result: playerResult.result,
      amount: playerResult.amount,
    });

    const roomPlayer = room.players.find((p) => p.id === player.id);
    if (roomPlayer) {
      const newBalance = player.balance;
      roomPlayer.balance = newBalance;
      db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, player.id);

      db.prepare(
        `INSERT INTO transactions (id, user_id, amount, type, game_id, balance_after, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(),
        player.id,
        playerResult.amount,
        playerResult.result,
        gameId,
        newBalance,
        new Date().toISOString()
      );
    }
  }

  io.to(roomId).emit('game:ended', { results });

  db.prepare('UPDATE games SET ended_at = ? WHERE id = ?').run(new Date().toISOString(), gameId);
  roomManager.updateRoomStatus(roomId, 'waiting');
  roomManager.cleanDisconnectedPlayers(roomId);

  const stoodUp = roomManager.standUpMarkedPlayers(roomId);
  for (const player of stoodUp.players) {
    io.to(roomId).emit('room:player_unseated', {
      playerId: player.id,
      seatIndex: player.seatIndex,
    });
  }
  for (const observer of stoodUp.observers) {
    io.to(roomId).emit('room:observer_joined', { observer });
  }

  roomManager.autoReadyPlayers(roomId);
  const updatedRoom = roomManager.getRoom(roomId);
  if (updatedRoom) {
    io.to(roomId).emit('room:state', { room: updatedRoom });
  }

  activeGames.delete(roomId);
  clearTurnTimer(roomId);
  clearTimerInterval(roomId);
}

export function handleGameEvents(
  io: GameSocketServer,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager
) {
  const user = socket.data.user;
  console.log(`[game] Registering game events for ${user.username}`);

  socket.on('game:start', async (_data, callback) => {
    console.log(`[game:start] Received from ${user.username}`);
    try {
      const room = roomManager.getUserRoom(user.id);
      if (!room) {
        callback({ success: false, message: 'You are not in a room' });
        return;
      }

      socket.join(room.id);
      console.log(`[game:start] Socket joined room ${room.id}`);

      if (room.createdBy !== user.id) {
        callback({ success: false, message: 'Only the room owner can start the game' });
        return;
      }

      const activePlayers = roomManager.getActivePlayers(room.id);
      if (activePlayers.length === 0) {
        callback({ success: false, message: 'No seated players to start game' });
        return;
      }

      const existingGame = loadGameState(room.id);
      if (existingGame) {
        const game = new GameEngine(
          existingGame.gameId,
          room.id,
          room.gameType,
          room.minBet,
          activePlayers
        );
        game.restoreState(existingGame.state, existingGame.deck);
        activeGames.set(room.id, game);

        io.to(room.id).emit('game:started', { gameState: existingGame.state });

        const currentPlayer = existingGame.state.players[existingGame.state.currentPlayerIndex];
        if (currentPlayer && existingGame.state.phase !== 'finished') {
          const validActions: GameActionType[] =
            existingGame.state.phase === 'betting' ? ['bet'] : ['hit', 'stand', 'double'];
          existingGame.state.turnStartedAt = new Date().toISOString();
          emitTurnInfo(io, room.id, room, existingGame.state, validActions);
          startTurnTimer(io, room.id, existingGame.gameId, currentPlayer.id, game, roomManager);
        }

        callback({ success: true });
        return;
      }

      console.log(`[game:start] Starting new game for room ${room.id}`);
      const gameId = uuidv4();
      const game = new GameEngine(gameId, room.id, room.gameType, room.minBet, activePlayers);

      activeGames.set(room.id, game);
      roomManager.updateRoomStatus(room.id, 'playing');
      roomManager.setRoomGameId(room.id, gameId);

      const initialState = game.start();
      initialState.gameId = gameId;
      initialState.turnStartedAt = new Date().toISOString();

      saveGameState(gameId, room.id, initialState, game.getDeck());

      io.to(room.id).emit('game:started', { gameState: initialState });

      const currentPlayer = initialState.players[initialState.currentPlayerIndex];
      if (currentPlayer) {
        emitTurnInfo(io, room.id, room, initialState, ['bet']);
        startTurnTimer(io, room.id, gameId, currentPlayer.id, game, roomManager);
      }

      callback({ success: true });
    } catch (err) {
      console.error('[game:start] Error:', err);
      callback({ success: false, message: 'Failed to start game' });
    }
  });

  socket.on('game:action', async (data, callback) => {
    console.log(`[game:action] Received from ${user.username}:`, JSON.stringify(data));
    try {
      const room = roomManager.getUserRoom(user.id);
      if (!room) {
        callback({ success: false, message: 'You are not in a room' });
        return;
      }

      const isPlayer = room.players.some((p) => p.id === user.id);
      if (!isPlayer) {
        callback({ success: false, message: 'You are an observer, not a player' });
        return;
      }

      let game = activeGames.get(room.id);
      if (!game) {
        const loaded = loadGameState(room.id);
        if (loaded) {
          const activePlayers = roomManager.getActivePlayers(room.id);
          const restoredGame = new GameEngine(
            loaded.gameId,
            room.id,
            room.gameType,
            room.minBet,
            activePlayers
          );
          restoredGame.restoreState(loaded.state, loaded.deck);
          activeGames.set(room.id, restoredGame);
          game = restoredGame;
        } else {
          callback({ success: false, message: 'No active game' });
          return;
        }
      }

      const currentPlayer = game.getState().players[game.getState().currentPlayerIndex];
      if (currentPlayer?.id !== user.id) {
        callback({ success: false, message: 'Not your turn' });
        return;
      }

      const result = game.handleAction(user.id, data);

      if (!result.success) {
        callback({ success: false, message: result.error || 'Invalid action' });
        return;
      }

      clearTurnTimer(room.id);
      clearTimerInterval(room.id);

      const newState = result.newState;
      newState.gameId = game.gameId;
      newState.turnStartedAt = undefined;

      saveGameState(game.gameId, room.id, newState, game.getDeck());

      io.to(room.id).emit('game:state', { gameState: newState });

      if (newState.phase === 'betting' || newState.phase === 'playing') {
        const nextPlayer = newState.players[newState.currentPlayerIndex];
        if (nextPlayer && !nextPlayer.isFolded) {
          const validActions: GameActionType[] =
            newState.phase === 'betting' ? ['bet'] : ['hit', 'stand', 'double'];
          newState.turnStartedAt = new Date().toISOString();
          emitTurnInfo(io, room.id, room, newState, validActions);
          startTurnTimer(io, room.id, game.gameId, nextPlayer.id, game, roomManager);
        }
      }

      if (result.events) {
        for (const event of result.events) {
          if (event.type === 'game:end') {
            handleGameEnd(io, room.id, game.gameId, room, newState, game, roomManager);
          }
        }
      }

      callback({ success: true });
    } catch (err) {
      console.error('Game action error:', err);
      callback({ success: false, message: 'Failed to process action' });
    }
  });
}
