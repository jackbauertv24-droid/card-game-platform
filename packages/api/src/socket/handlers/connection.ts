import type { GameSocketServer } from '../index';
import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from 'shared';
import type { RoomManager } from '../../game/room/RoomManager';

export function handleConnection(
  io: GameSocketServer,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager
) {
  const user = socket.data.user;
  console.log(`[socket] User connected: ${user.username} (${socket.id})`);

  socket.emit('auth:success', { user, token: socket.handshake.auth.token });
  console.log(`[socket] Sent auth:success to ${user.username}`);

  const existingRoom = roomManager.getPlayersRoom(user.id);
  if (existingRoom) {
    socket.join(existingRoom.id);

    const result = roomManager.setPlayerStatus(user.id, 'connected');
    if (result) {
      socket.emit('room:joined', { room: existingRoom });
      socket
        .to(existingRoom.id)
        .emit('room:player_ready', {
          playerId: user.id,
          ready: existingRoom.players.find((p) => p.id === user.id)?.isReady ?? false,
        });

      io.to(existingRoom.id).emit('room:player_joined', {
        player: existingRoom.players.find((p) => p.id === user.id)!,
      });

      console.log(`[socket] User ${user.username} reconnected to room ${existingRoom.id}`);
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
