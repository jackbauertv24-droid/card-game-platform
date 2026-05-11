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

  socket.on('game:start', async (_data, callback) => {
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

      if (!room.players.every((p) => p.balance >= room.minBet)) {
        callback({ success: false, message: 'Some players do not have enough balance' });
        return;
      }

      const gameId = uuidv4();
      const game = new GameEngine(gameId, room.id, room.gameType, room.minBet, room.players);

      activeGames.set(room.id, game);
      roomManager.updateRoomStatus(room.id, 'playing');

      db.prepare(
        'INSERT INTO games (id, room_id, game_type, state, players, started_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        gameId,
        room.id,
        room.gameType,
        JSON.stringify(game.getState()),
        JSON.stringify(room.players),
        new Date().toISOString()
      );

      const initialState = game.start();
      io.to(room.id).emit('game:started', { gameState: initialState });

      callback({ success: true });
    } catch (err) {
      console.error('Game start error:', err);
      callback({ success: false, message: 'Failed to start game' });
    }
  });

  socket.on('game:action', async (data, callback) => {
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

      const result = game.handleAction(user.id, data);

      if (!result.success) {
        callback({ success: false, message: result.error || 'Invalid action' });
        return;
      }

      io.to(room.id).emit('game:state', { gameState: result.newState });

      if (result.events) {
        for (const event of result.events) {
          if (event.type === 'game:end') {
            const gameResults = event.data as import('shared').GameResult[];

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
