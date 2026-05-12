import type { User, Room, GameType } from 'shared';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TOKEN_FILE = join(tmpdir(), 'cardgame-cli-token.json');

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string;
}

class HttpClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.loadToken();
  }

  loadToken(): void {
    if (existsSync(TOKEN_FILE)) {
      try {
        const data = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
        this.token = data.token;
      } catch {
        this.token = null;
      }
    }
  }

  saveToken(token: string, user: User): void {
    this.token = token;
    writeFileSync(TOKEN_FILE, JSON.stringify({ token, user }));
  }

  clearToken(): void {
    this.token = null;
    if (existsSync(TOKEN_FILE)) {
      unlinkSync(TOKEN_FILE);
    }
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  getStoredUser(): User | null {
    if (existsSync(TOKEN_FILE)) {
      try {
        const data = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
        return data.user;
      } catch {
        return null;
      }
    }
    return null;
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data: any = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data as T;
  }

  async login(username: string, password: string) {
    return this.request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  }

  async register(username: string, password: string, inviteCode: string) {
    return this.request<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: { username, password, inviteCode },
    });
  }

  async getMe() {
    return this.request<{ user: User }>('/users/me');
  }

  async getRooms(gameType?: GameType, status?: string) {
    const params = new URLSearchParams();
    if (gameType) params.append('gameType', gameType);
    if (status) params.append('status', status);
    return this.request<{ rooms: Room[] }>(`/rooms?${params}`);
  }
}

export function createHttpClient(baseUrl: string): HttpClient {
  return new HttpClient(baseUrl);
}

export type { HttpClient };
