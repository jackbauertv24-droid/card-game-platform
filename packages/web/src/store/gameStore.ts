import { create } from 'zustand';
import type { Room, RoomDetail, Player, GameState, GameActionType } from 'shared';

interface GameStore {
  currentRoom: RoomDetail | null;
  gameState: GameState | null;
  players: Player[];
  myPlayerId: string | null;

  isMyTurn: boolean;
  validActions: GameActionType[];

  setCurrentRoom: (room: RoomDetail | null) => void;
  setGameState: (state: GameState) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (playerId: string) => void;
  updatePlayerReady: (playerId: string, ready: boolean) => void;
  setMyPlayerId: (id: string) => void;
  setValidActions: (actions: GameActionType[]) => void;
  setIsMyTurn: (isTurn: boolean) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  currentRoom: null,
  gameState: null,
  players: [],
  myPlayerId: null,
  isMyTurn: false,
  validActions: [],

  setCurrentRoom: (room) => set({ currentRoom: room, players: room?.players || [] }),
  setGameState: (state) => set({ gameState: state }),
  addPlayer: (player) => set((s) => ({ players: [...s.players, player] })),
  removePlayer: (playerId) => set((s) => ({ players: s.players.filter((p) => p.id !== playerId) })),
  updatePlayerReady: (playerId, ready) =>
    set((s) => ({
      players: s.players.map((p) => (p.id === playerId ? { ...p, isReady: ready } : p)),
    })),
  setMyPlayerId: (id) => set({ myPlayerId: id }),
  setValidActions: (actions) => set({ validActions: actions }),
  setIsMyTurn: (isTurn) => set({ isMyTurn: isTurn }),
}));
