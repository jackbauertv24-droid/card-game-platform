import type { GameSocketServer } from '../index';
import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, GameState, GameActionType } from 'shared';
import { TURN_TIMEOUT_SECONDS } from 'shared';
import type { RoomManager } from '../../game/room/RoomManager';
import { GameEngine } from '../../game/engine/GameEngine';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';

const activeGames: Map<string, GameEngine> = new Map();
const turnTimers: Map<string, NodeJS.Timeout> = new Map();

function saveGameState(gameId: string, roomId: string, gameState: GameState, deck?: unknown) {
  const stateJson = JSON.stringify(gameState);
  const deckJson = deck ? JSON.stringify(deck) : null;
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT OR REPLACE INTO games (id, room_id, game_type, state, deck, current_player_index, turn_started_at, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT started_at FROM games WHERE id = ?), ?))
  `
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
      `
    SELECT id, state, deck, current_player_index, turn_started_at 
    FROM games WHERE room_id = ? AND ended_at IS NULL 
    ORDER BY started_at DESC LIMIT 1
  `
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
  const deck = row.deck ? JSON.parse(row.deck) : undefined;

  return { gameId: row.id, state, deck };
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

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const currentPlayer = room.players.find((p) => p.id === playerId);
    if (!currentPlayer) return;

    if (currentPlayer.status === 'disconnected') {
      const result = game.handleAction(playerId, { type: 'fold' });
      if (result.success) {
        const gameState = result.newState;
        saveGameState(gameId, roomId, gameState);
        io.to(roomId).emit('game:state', { gameState });

        if (gameState.phase === 'betting' || gameState.phase === 'playing') {
          const nextPlayer = room.players[gameState.currentPlayerIndex];
          if (nextPlayer) {
            io.to(roomId).emit('game:turn', {
              playerId: nextPlayer.id,
              validActions: gameState.phase === 'betting' ? ['bet'] : ['hit', 'stand'],
            });
            startTurnTimer(io, roomId, gameId, nextPlayer.id, game, roomManager);
          }
        }
      }
    } else {
      const result = game.handleAction(playerId, { type: 'stand' });
      if (result.success) {
        const gameState = result.newState;
        saveGameState(gameId, roomId, gameState);
        io.to(roomId).emit('game:state', { gameState });
        io.to(roomId).emit('game:timeout', { playerId, action: 'stand' });

        if (gameState.phase === 'betting' || gameState.phase === 'playing') {
          const nextPlayer = room.players[gameState.currentPlayerIndex];
          if (nextPlayer) {
            io.to(roomId).emit('game:turn', {
              playerId: nextPlayer.id,
              validActions: gameState.phase === 'betting' ? ['bet'] : ['hit', 'stand'],
            });
            startTurnTimer(io, roomId, gameId, nextPlayer.id, game, roomManager);
          }
        }
      }
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
      const room = roomManager.getPlayersRoom(user.id);
      if (!room) {
        callback({ success: false, message: 'You are not in a room' });
        return;
      }

      if (room.createdBy !== user.id) {
        callback({ success: false, message: 'Only the room owner can start the game' });
        return;
      }

      const existingGame = loadGameState(room.id);
      if (existingGame) {
        const game = new GameEngine(
          existingGame.gameId,
          room.id,
          room.gameType,
          room.minBet,
          room.players
        );
        game.restoreState(existingGame.state, existingGame.deck);
        activeGames.set(room.id, game);

        io.to(room.id).emit('game:started', { gameState: existingGame.state });

        const currentPlayer = room.players[existingGame.state.currentPlayerIndex];
        if (currentPlayer && existingGame.state.phase !== 'finished') {
          const validActions: GameActionType[] =
            existingGame.state.phase === 'betting' ? ['bet'] : ['hit', 'stand', 'double'];
          io.to(room.id).emit('game:turn', { playerId: currentPlayer.id, validActions });
          startTurnTimer(io, room.id, existingGame.gameId, currentPlayer.id, game, roomManager);
        }

        callback({ success: true });
        return;
      }

      console.log(`[game:start] Starting new game for room ${room.id}`);
      const gameId = uuidv4();
      const game = new GameEngine(gameId, room.id, room.gameType, room.minBet, room.players);

      activeGames.set(room.id, game);
      roomManager.updateRoomStatus(room.id, 'playing');
      roomManager.setRoomGameId(room.id, gameId);

      const initialState = game.start();
      initialState.gameId = gameId;

      saveGameState(gameId, room.id, initialState, game.getDeck());

      io.to(room.id).emit('game:started', { gameState: initialState });

      const currentPlayer = room.players[initialState.currentPlayerIndex];
      if (currentPlayer) {
        io.to(room.id).emit('game:turn', { playerId: currentPlayer.id, validActions: ['bet'] });
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
      const room = roomManager.getPlayersRoom(user.id);
      if (!room) {
        callback({ success: false, message: 'You are not in a room' });
        return;
      }

      const game = activeGames.get(room.id);
      let gameEngine: GameEngine | null = game || null;

      if (!gameEngine) {
        const loaded = loadGameState(room.id);
        if (loaded) {
          const restoredGame = new GameEngine(
            loaded.gameId,
            room.id,
            room.gameType,
            room.minBet,
            room.players
          );
          restoredGame.restoreState(loaded.state, loaded.deck);
          activeGames.set(room.id, restoredGame);
          gameEngine = restoredGame;
        } else {
          callback({ success: false, message: 'No active game' });
          return;
        }
      }

      const currentPlayer = room.players[gameEngine.getState().currentPlayerIndex];
      if (currentPlayer?.id !== user.id) {
        callback({ success: false, message: 'Not your turn' });
        return;
      }

      const result = gameEngine.handleAction(user.id, data);

      if (!result.success) {
        callback({ success: false, message: result.error || 'Invalid action' });
        return;
      }

      clearTurnTimer(room.id);

      const newState = result.newState;
      newState.gameId = gameEngine.gameId;

      saveGameState(gameEngine.gameId, room.id, newState, gameEngine.getDeck());

      io.to(room.id).emit('game:state', { gameState: newState });

      if (newState.phase === 'betting' || newState.phase === 'playing') {
        const nextPlayer = room.players[newState.currentPlayerIndex];
        if (nextPlayer && !nextPlayer.isFolded) {
          const validActions: GameActionType[] =
            newState.phase === 'betting' ? ['bet'] : ['hit', 'stand', 'double'];
          io.to(room.id).emit('game:turn', { playerId: nextPlayer.id, validActions });
          startTurnTimer(io, room.id, gameEngine.gameId, nextPlayer.id, gameEngine, roomManager);
        }
      }

      if (result.events) {
        for (const event of result.events) {
          if (event.type === 'game:end') {
            const gameResults = event.data as import('shared').GameResult[];
            console.log('[game:action] GAME END - Results:', JSON.stringify(gameResults));

            for (const gr of gameResults) {
              const player = room.players.find((p) => p.id === gr.playerId);
              if (player) {
                const newBalance = player.balance + gr.amount;
                player.balance = newBalance;
                db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(
                  newBalance,
                  gr.playerId
                );

                db.prepare(
                  'INSERT INTO transactions (id, user_id, amount, type, game_id, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
                ).run(
                  uuidv4(),
                  gr.playerId,
                  gr.amount,
                  gr.result,
                  gameEngine.gameId,
                  newBalance,
                  new Date().toISOString()
                );
              }
            }

            db.prepare('UPDATE games SET ended_at = ? WHERE id = ?').run(
              new Date().toISOString(),
              gameEngine.gameId
            );

            io.to(room.id).emit('game:ended', { results: gameResults });

            roomManager.updateRoomStatus(room.id, 'waiting');
            roomManager.cleanDisconnectedPlayers(room.id);
            activeGames.delete(room.id);
            clearTurnTimer(room.id);
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
