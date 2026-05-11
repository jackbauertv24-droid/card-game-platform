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
  console.log(`[socket] Socket connected: ${socket.connected}`);

  socket.emit('auth:success', { user, token: socket.handshake.auth.token });
  console.log(`[socket] Sent auth:success to ${user.username}`);

  const existingRoom = roomManager.getPlayersRoom(user.id);
  if (existingRoom) {
    socket.join(existingRoom.id);

    const player = existingRoom.players.find((p) => p.id === user.id);
    if (player) {
      socket.emit('room:joined', { room: existingRoom });
    } else {
      roomManager.joinRoom(existingRoom.id, user.id);
      socket.emit('room:joined', { room: roomManager.getRoom(existingRoom.id)! });
    }
  }

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${user.username} (${socket.id})`);

    setTimeout(() => {
      const connectedSockets = Array.from(io.sockets.sockets.values());
      const stillConnected = connectedSockets.some((s) => s.data.user?.id === user.id);

      if (!stillConnected) {
        const leaveResult = roomManager.leaveRoom(user.id);
        if (leaveResult) {
          socket.to(leaveResult.roomId).emit('room:player_left', { playerId: user.id });
          io.emit('room:list', { rooms: roomManager.getAllRooms() });
        }
      }
    }, 5000);
  });
}
