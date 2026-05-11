import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import type { ServerToClientEvents, ClientToServerEvents } from 'shared';
import { verifyToken } from '../auth/service';
import db from '../db';
import { RoomManager } from '../game/room/RoomManager';
import { QuickMatch } from '../game/matching/QuickMatch';
import { handleConnection } from './handlers/connection';
import { handleRoomEvents } from './handlers/room';
import { handleGameEvents } from './handlers/game';

export type GameSocketServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function setupSocket(httpServer: HttpServer): GameSocketServer {
  const io: GameSocketServer = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  const roomManager = new RoomManager();
  const quickMatch = new QuickMatch(roomManager, io);

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Missing authentication token'));
    }

    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('Invalid or expired token'));
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as
      | import('shared').User
      | undefined;
    if (!user) {
      return next(new Error('User not found'));
    }

    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    handleConnection(io, socket, roomManager);
    handleRoomEvents(io, socket, roomManager, quickMatch);
    handleGameEvents(io, socket, roomManager);
  });

  return io;
}
