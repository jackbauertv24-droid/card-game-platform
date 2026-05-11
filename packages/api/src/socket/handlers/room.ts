import type { GameSocketServer } from '../index';
import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from 'shared';
import type { RoomManager } from '../../game/room/RoomManager';
import type { QuickMatch } from '../../game/matching/QuickMatch';

export function handleRoomEvents(
  io: GameSocketServer,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager,
  quickMatch: QuickMatch
) {
  const user = socket.data.user;

  socket.on('room:list', (data, callback) => {
    const rooms = roomManager.getAllRooms(data.gameType);
    callback({ rooms });
  });

  socket.on('room:create', (data, callback) => {
    try {
      const existingRoom = roomManager.getPlayersRoom(user.id);
      if (existingRoom) {
        callback({ success: false, message: 'You are already in a room' });
        return;
      }

      const room = roomManager.createRoom(
        user.id,
        data.name,
        data.gameType,
        data.maxPlayers,
        data.minBet
      );

      socket.join(room.id);
      io.emit('room:list', { rooms: roomManager.getAllRooms() });

      callback({ success: true, room: { ...room, playerCount: room.players.length } });
    } catch (err) {
      callback({ success: false, message: 'Failed to create room' });
    }
  });

  socket.on('room:join', (data, callback) => {
    try {
      const existingRoom = roomManager.getPlayersRoom(user.id);
      if (existingRoom) {
        callback({ success: false, message: 'You are already in a room' });
        return;
      }

      const room = roomManager.joinRoom(data.roomId, user.id);
      if (!room) {
        callback({ success: false, message: 'Room not found or full' });
        return;
      }

      socket.join(room.id);
      socket
        .to(room.id)
        .emit('room:player_joined', { player: room.players[room.players.length - 1] });
      io.emit('room:list', { rooms: roomManager.getAllRooms() });

      callback({ success: true, room });
    } catch (err) {
      callback({ success: false, message: 'Failed to join room' });
    }
  });

  socket.on('room:leave', (_data, callback) => {
    try {
      const leaveResult = roomManager.leaveRoom(user.id);
      if (!leaveResult) {
        callback({ success: false });
        return;
      }

      socket.leave(leaveResult.roomId);
      socket.to(leaveResult.roomId).emit('room:player_left', { playerId: user.id });
      io.emit('room:list', { rooms: roomManager.getAllRooms() });

      callback({ success: true });
    } catch (err) {
      callback({ success: false });
    }
  });

  socket.on('room:set-ready', (data) => {
    const result = roomManager.setPlayerReady(user.id, data.ready);
    if (result) {
      socket.to(result.roomId).emit('room:player_ready', { playerId: user.id, ready: data.ready });
    }
  });

  socket.on('quickmatch:join', (data) => {
    const existingRoom = roomManager.getPlayersRoom(user.id);
    if (existingRoom) {
      socket.emit('error', { code: 'ALREADY_IN_ROOM', message: 'You are already in a room' });
      return;
    }

    quickMatch.joinQueue(user.id, user.username, user.balance, data.gameType);
  });

  socket.on('quickmatch:leave', () => {
    quickMatch.leaveQueue(user.id);
  });
}
