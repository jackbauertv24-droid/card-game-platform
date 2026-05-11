import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents, User } from 'shared';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class SocketClient {
  socket: GameSocket | null = null;
  connected: boolean = false;
  user: User | null = null;

  connect(token: string): Promise<User> {
    return new Promise((resolve, reject) => {
      // Use relative URL to go through Vite proxy
      const socketUrl = window.location.origin;

      console.log('Connecting to socket:', socketUrl);

      this.socket = io(socketUrl, {
        path: '/socket.io',
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        console.log('Socket connected');
        this.connected = true;
      });

      this.socket.on('auth:success', (data) => {
        this.user = data.user;
        resolve(data.user);
      });

      this.socket.on('auth:error', (data) => {
        reject(new Error(data.message));
      });

      this.socket.on('connect_error', (err) => {
        reject(err);
      });

      this.socket.on('disconnect', () => {
        console.log('Socket disconnected');
        this.connected = false;
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.user = null;
    }
  }

  getSocket(): GameSocket | null {
    return this.socket;
  }
}

export const socketClient = new SocketClient();
