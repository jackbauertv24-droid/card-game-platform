import type { GameSocketServer } from '../index';
import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from 'shared';
import type { RoomManager } from '../../game/room/RoomManager';
import { GameEngine } from '../../game/engine/GameEngine';
import { v4 as uuidv4 } from 'uuid';
import db from '../../db';

const activeGames: Map<string, GameEngine> = new Map();

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
        console.log(`[game:start] User ${user.username} not in room`);
        callback({ success: false, message: 'You are not in a room' });
        return;
      }

      if (room.createdBy !== user.id) {
        console.log(`[game:start] User ${user.username} not room owner`);
        callback({ success: false, message: 'Only the room owner can start the game' });
        return;
      }

      console.log(`[game:start] Starting game for room ${room.id}`);
      const gameId = uuidv4();
      const game = new GameEngine(gameId, room.id, room.gameType, room.minBet, room.players);

      activeGames.set(room.id, game);
      roomManager.updateRoomStatus(room.id, 'playing');

      console.log(`[game:start] Game engine created, calling game.start()`);
      const initialState = game.start();
      console.log(`[game:start] Initial state:`, JSON.stringify(initialState));

      io.to(room.id).emit('game:started', { gameState: initialState });
      console.log(`[game:start] Emitted game:started to room ${room.id}`);

      // Emit turn event for first player in betting phase
      const currentPlayerId = room.players[initialState.currentPlayerIndex]?.id;
      if (currentPlayerId) {
        console.log(`[game:start] First turn for player ${currentPlayerId}`);
        io.to(room.id).emit('game:turn', { playerId: currentPlayerId, validActions: ['bet'] });
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
      if (!game) {
        callback({ success: false, message: 'No active game' });
        return;
      }

      console.log(`[game:action] Processing action for game ${room.id}`);
      const result = game.handleAction(user.id, data);
      console.log(
        `[game:action] Result:`,
        JSON.stringify({ success: result.success, error: result.error })
      );

      if (!result.success) {
        callback({ success: false, message: result.error || 'Invalid action' });
        return;
      }

      // Log the full state including player hands
      console.log(`[game:action] New state phase: ${result.newState.phase}`);
      console.log(
        `[game:action] Player hands:`,
        JSON.stringify(
          result.newState.players.map((p) => ({ id: p.id, hand: p.hand, currentBet: p.currentBet }))
        )
      );
      console.log(`[game:action] Dealer hand:`, JSON.stringify(result.newState.dealerHand));
      console.log(`[game:action] Game ended:`, result.newState.phase === 'finished');
      console.log(`[game:action] Events:`, result.events ? 'present' : 'none');

      io.to(room.id).emit('game:state', { gameState: result.newState });

      // Emit turn event for next player
      const state = result.newState;
      if (state.phase === 'betting' || state.phase === 'playing') {
        const currentPlayerId = room.players[state.currentPlayerIndex]?.id;
        if (currentPlayerId && !room.players[state.currentPlayerIndex]?.isFolded) {
          const validActions =
            state.phase === 'betting'
              ? (['bet'] as import('shared').GameActionType[])
              : (['hit', 'stand'] as import('shared').GameActionType[]);
          console.log(
            `[game:action] Next turn for player ${currentPlayerId}, actions:`,
            validActions
          );
          io.to(room.id).emit('game:turn', { playerId: currentPlayerId, validActions });
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
                  game.gameId,
                  newBalance,
                  new Date().toISOString()
                );
              }
            }

            io.to(room.id).emit('game:ended', { results: gameResults });

            roomManager.updateRoomStatus(room.id, 'waiting');
            activeGames.delete(room.id);
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
