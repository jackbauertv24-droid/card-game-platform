import type { GameSocketServer } from '../index';
import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, GameState } from 'shared';
import type { RoomManager } from '../../game/room/RoomManager';
import db from '../../db';

function loadGameState(roomId: string): GameState | null {
  const row = db
    .prepare(
      `SELECT state FROM games WHERE room_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
    )
    .get(roomId) as { state: string } | undefined;

  if (!row) return null;
  return JSON.parse(row.state) as GameState;
}

export function handleConnection(
  io: GameSocketServer,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager
) {
  const user = socket.data.user;
  console.log(`[socket] User connected: ${user.username} (${socket.id})`);

  socket.emit('auth:success', { user, token: socket.handshake.auth.token });
  console.log(`[socket] Sent auth:success to ${user.username}`);

  const playerRoom = roomManager.getPlayersRoom(user.id);
  if (playerRoom) {
    socket.join(playerRoom.id);

    const result = roomManager.setPlayerStatus(user.id, 'connected');
    if (result) {
      const gameState = loadGameState(playerRoom.id);
      socket.emit('room:joined', { room: playerRoom, asObserver: false, gameState });
      socket.to(playerRoom.id).emit('room:player_ready', {
        playerId: user.id,
        ready: playerRoom.players.find((p) => p.id === user.id)?.isReady ?? false,
      });

      console.log(`[socket] User ${user.username} reconnected to room ${playerRoom.id} as player`);
    }
  } else {
    const observerRoom = roomManager.getObserversRoom(user.id);
    if (observerRoom) {
      socket.join(observerRoom.id);
      const gameState = loadGameState(observerRoom.id);
      socket.emit('room:joined', { room: observerRoom, asObserver: true, gameState });
      socket.to(observerRoom.id).emit('room:observer_joined', {
        observer: observerRoom.observers.find((o) => o.id === user.id)!,
      });
      console.log(
        `[socket] User ${user.username} reconnected to room ${observerRoom.id} as observer`
      );
    }
  }

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${user.username} (${socket.id})`);

    setTimeout(() => {
      const connectedSockets = Array.from(io.sockets.sockets.values());
      const stillConnected = connectedSockets.some((s) => s.data.user?.id === user.id);

      if (!stillConnected) {
        const result = roomManager.setPlayerStatus(user.id, 'disconnected');
        if (result) {
          console.log(
            `[socket] User ${user.username} marked as disconnected in room ${result.roomId}`
          );
          socket.to(result.roomId).emit('room:player_left', { playerId: user.id });
          io.emit('room:list', { rooms: roomManager.getAllRooms() });
        }
      }
    }, 5000);
  });
}
