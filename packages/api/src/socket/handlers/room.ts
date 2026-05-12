import type { GameSocketServer } from '../index';
import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from 'shared';
import type { RoomManager, InMemoryRoom } from '../../game/room/RoomManager';
import type { QuickMatch } from '../../game/matching/QuickMatch';

function loadGameState(roomId: string): { state: import('shared').GameState } | null {
  const row = globalThis.db
    ?.prepare(
      `SELECT state FROM games WHERE room_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
    )
    .get(roomId) as { state: string } | undefined;

  if (!row) return null;
  return { state: JSON.parse(row.state) as import('shared').GameState };
}

export function handleRoomEvents(
  io: GameSocketServer,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager,
  quickMatch: QuickMatch
) {
  const user = socket.data.user;

  socket.on('room:list', (data, callback) => {
    const rooms = roomManager.getAllRooms(data.gameType, data.includePlaying);
    callback({ rooms });
  });

  socket.on('room:preview', (data, callback) => {
    const room = roomManager.getRoom(data.roomId);
    if (!room) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      return;
    }

    const gameState = loadGameState(data.roomId);
    callback({ room, gameState: gameState?.state });
  });

  socket.on('room:create', (data, callback) => {
    console.log(`[room:create] Received from ${user.username}:`, JSON.stringify(data));
    try {
      const existingRoom = roomManager.getUserRoom(user.id);
      if (existingRoom) {
        console.log(`[room:create] User ${user.username} already in room ${existingRoom.id}`);
        callback({ success: false, message: 'You are already in a room' });
        return;
      }

      console.log(`[room:create] Creating room for ${user.username}...`);
      const room = roomManager.createRoom(
        user.id,
        data.name,
        data.gameType,
        data.maxPlayers,
        data.minBet
      );
      console.log(`[room:create] Room created: ${room.id}`);

      socket.join(room.id);
      console.log(`[room:create] Socket joined room ${room.id}`);

      io.emit('room:list', { rooms: roomManager.getAllRooms() });

      console.log(`[room:create] Sending callback success`);
      callback({ success: true, room });
    } catch (err) {
      console.error(`[room:create] Error:`, err);
      callback({ success: false, message: 'Failed to create room' });
    }
  });

  socket.on('room:join', (data, callback) => {
    try {
      const existingRoom = roomManager.getUserRoom(user.id);
      if (existingRoom) {
        callback({ success: false, message: 'You are already in a room' });
        return;
      }

      const room = roomManager.getRoom(data.roomId);
      if (!room) {
        callback({ success: false, message: 'Room not found' });
        return;
      }

      const asObserver =
        (data.asObserver ?? room.status === 'playing') || room.players.length >= room.maxPlayers;

      const joinedRoom = roomManager.joinRoom(data.roomId, user.id, asObserver);
      if (!joinedRoom) {
        callback({ success: false, message: 'Failed to join room' });
        return;
      }

      socket.join(joinedRoom.id);

      if (asObserver) {
        const observer = joinedRoom.observers.find((o) => o.id === user.id);
        if (observer) {
          socket.to(joinedRoom.id).emit('room:observer_joined', { observer });
        }
      } else {
        const player = joinedRoom.players.find((p) => p.id === user.id);
        if (player) {
          socket
            .to(joinedRoom.id)
            .emit('room:player_seated', { player, seatIndex: player.seatIndex });
        }
      }

      io.emit('room:list', { rooms: roomManager.getAllRooms(undefined, true) });

      const gameState = loadGameState(joinedRoom.id);
      callback({ success: true, room: joinedRoom, gameState: gameState?.state });
    } catch (err) {
      console.error('[room:join] Error:', err);
      callback({ success: false, message: 'Failed to join room' });
    }
  });

  socket.on('room:sit-down', (data, callback) => {
    try {
      const room = roomManager.getUserRoom(user.id);
      if (!room) {
        callback({ success: false, message: 'You are not in a room' });
        return;
      }

      if (room.status === 'playing') {
        callback({ success: false, message: 'Game in progress, cannot sit down' });
        return;
      }

      const result = roomManager.sitDown(room.id, user.id, data.seatIndex);
      if (!result.success) {
        callback({ success: false, message: result.error || 'Failed to sit down' });
        return;
      }

      const player = room.players.find((p) => p.id === user.id);
      if (player) {
        socket.to(room.id).emit('room:player_seated', { player, seatIndex: player.seatIndex });
        socket.to(room.id).emit('room:observer_left', { userId: user.id });
      }

      io.emit('room:list', { rooms: roomManager.getAllRooms(undefined, true) });

      callback({ success: true, seatIndex: result.seatIndex });
    } catch (err) {
      console.error('[room:sit-down] Error:', err);
      callback({ success: false, message: 'Failed to sit down' });
    }
  });

  socket.on('room:stand-up', (_data, callback) => {
    try {
      const result = roomManager.standUp(user.id);
      if (!result) {
        callback({ success: false });
        return;
      }

      const room = roomManager.getRoom(result.roomId);
      if (room) {
        socket
          .to(room.id)
          .emit('room:player_unseated', { playerId: user.id, seatIndex: result.seatIndex });
        const observer = room.observers.find((o) => o.id === user.id);
        if (observer) {
          socket.to(room.id).emit('room:observer_joined', { observer });
        }
      }

      callback({ success: true });
    } catch (err) {
      console.error('[room:stand-up] Error:', err);
      callback({ success: false });
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

      if (leaveResult.wasPlayer) {
        socket.to(leaveResult.roomId).emit('room:player_left', { playerId: user.id });
      } else {
        socket.to(leaveResult.roomId).emit('room:observer_left', { userId: user.id });
      }

      io.emit('room:list', { rooms: roomManager.getAllRooms(undefined, true) });

      callback({ success: true });
    } catch (err) {
      console.error('[room:leave] Error:', err);
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
    const existingRoom = roomManager.getUserRoom(user.id);
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
