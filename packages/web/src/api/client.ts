const API_BASE = '/api';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('token');
    }
    return this.token;
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  async login(username: string, password: string) {
    return this.request<{ user: import('shared').User; token: string }>('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  }

  async register(username: string, password: string, inviteCode: string) {
    return this.request<{ user: import('shared').User; token: string }>('/auth/register', {
      method: 'POST',
      body: { username, password, inviteCode },
    });
  }

  async getMe() {
    return this.request<{ user: import('shared').User }>('/users/me');
  }

  async getRooms(gameType?: string, status?: string) {
    const params = new URLSearchParams();
    if (gameType) params.append('gameType', gameType);
    if (status) params.append('status', status);
    return this.request<{ rooms: import('shared').Room[] }>(`/rooms?${params}`);
  }

  async createRoom(data: {
    name: string;
    gameType: import('shared').GameType;
    maxPlayers: number;
    minBet: number;
  }) {
    return this.request<{ room: import('shared').Room }>('/rooms', {
      method: 'POST',
      body: data,
    });
  }

  async getRoom(roomId: string) {
    return this.request<{ room: import('shared').Room }>(`/rooms/${roomId}`);
  }
}

export const api = new ApiClient();
