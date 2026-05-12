import { create } from 'zustand';
import type { User } from 'shared';
import { api } from '../api/client';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string, inviteCode: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  updateBalance: (newBalance: number) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const { user, token } = await api.login(username, password);
      api.setToken(token);
      set({ user, isLoading: false });
      return true;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return false;
    }
  },

  register: async (username, password, inviteCode) => {
    set({ isLoading: true, error: null });
    try {
      const { user, token } = await api.register(username, password, inviteCode);
      api.setToken(token);
      set({ user, isLoading: false });
      return true;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return false;
    }
  },

  logout: () => {
    api.setToken(null);
    set({ user: null });
  },

  checkAuth: async () => {
    const token = api.getToken();
    if (!token) {
      set({ user: null });
      return;
    }

    try {
      const { user } = await api.getMe();
      set({ user });
    } catch {
      api.setToken(null);
      set({ user: null });
    }
  },

  updateBalance: (newBalance: number) => {
    set((state) => {
      if (state.user) {
        return { user: { ...state.user, balance: newBalance } };
      }
      return state;
    });
  },
}));
