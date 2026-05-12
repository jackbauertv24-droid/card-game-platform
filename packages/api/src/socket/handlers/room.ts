import type { GameSocketServer } from '../index';
import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, GameState, GameActionType } from 'shared';
import type { RoomManager, InMemoryRoom } from '../../game/room/RoomManager';
import type { QuickMatch } from '../../game/matching/QuickMatch';
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

function emitTurnInfo(
  io: GameSocketServer,
  roomId: string,
  room: InMemoryRoom,
  gameState: GameState,
  validActions: GameActionType[]
) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  if (!currentPlayer) return;

  const now = new Date();
  const startedAt = gameState.turnStartedAt || now.toISOString();
  const elapsed = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000);
  const remaining = Math.max(0, 30 - elapsed);

  io.to(roomId).emit('game:turn', {
    playerId: currentPlayer.id,
    playerName: currentPlayer.username,
    seatIndex: currentPlayer.seatIndex,
    validActions,
    startedAt,
    remainingSeconds: remaining,
  });

  const existing = timerIntervals.get(roomId);
  if (existing) {
    clearInterval(existing);
    timerIntervals.delete(roomId);
  }

  const interval = setInterval(() => {
    const newRemaining = Math.max(0, remaining - 1);
    io.to(roomId).emit('game:timer_update', { remainingSeconds: newRemaining });
    if (newRemaining <= 0) {
      clearInterval(interval);
      timerIntervals.delete(roomId);
    }
  }, 1000);

  timerIntervals.set(roomId, interval);
}

function startTurnTimer(
  io: GameSocketServer,
  roomId: string,
  gameId: string,
  playerId: string,
  game: GameEngine,
  roomManager: RoomManager
) {
  const existing = turnTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    turnTimers.delete(roomId);
  }

  const timer = setTimeout(() => {
    console.log(`[game] Turn timeout for player ${playerId} in room ${roomId}`);
    const interval = timerIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      timerIntervals.delete(roomId);
    }

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

      if (gameState.phase === 'betting' || gameState.phase === 'playing') {
        const nextPlayer = gameState.players[gameState.currentPlayerIndex];
        if (nextPlayer && !nextPlayer.isFolded) {
          const validActions: GameActionType[] =
            gameState.phase === 'betting' ? ['bet'] : ['hit', 'stand', 'double'];
          gameState.turnStartedAt = new Date().toISOString();
          emitTurnInfo(io, roomId, room, gameState, validActions);
          startTurnTimer(io, roomId, gameId, nextPlayer.id, game, roomManager);
        }
      }
    }
  }, 30000);

  turnTimers.set(roomId, timer);
}

function loadGameState(roomId: string): { state: import('shared').GameState } | null {
  const row = db
    .prepare(
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

      if (room.players.length === 1) {
        console.log(`[room:create] Solo player, auto-starting game`);
        const gameId = uuidv4();
        const game = new GameEngine(gameId, room.id, room.gameType, room.minBet, room.players);
        activeGames.set(room.id, game);
        roomManager.updateRoomStatus(room.id, 'playing');
        roomManager.setRoomGameId(room.id, gameId);

        const initialState = game.start();
        initialState.gameId = gameId;
        initialState.turnStartedAt = new Date().toISOString();

        saveGameState(gameId, room.id, initialState, game.getDeck());
        roomManager.invalidateCache(room.id);

        io.to(room.id).emit('game:started', { gameState: initialState });

        const currentPlayer = initialState.players[initialState.currentPlayerIndex];
        if (currentPlayer) {
          emitTurnInfo(io, room.id, room, initialState, ['bet']);
          startTurnTimer(io, room.id, gameId, currentPlayer.id, game, roomManager);
        }

        callback({ success: true, room, gameState: initialState });
      } else {
        callback({ success: true, room });
      }
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

  socket.on('room:set-stand-up-after-round', (data) => {
    const result = roomManager.setStandUpAfterRound(user.id, data.standUp);
    if (result) {
      socket
        .to(result.roomId)
        .emit('room:player_stand_up_after_round', { playerId: user.id, standUp: data.standUp });
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
