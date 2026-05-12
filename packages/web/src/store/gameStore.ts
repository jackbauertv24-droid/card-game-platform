import { create } from 'zustand';
import type { RoomDetail, GameState, GameActionType, GameResult } from 'shared';

interface GameStore {
  currentRoom: RoomDetail | null;
  gameState: GameState | null;
  gameResults: GameResult[] | null;
  myPlayerId: string | null;
  isObserver: boolean;
  timerSeconds: number;
  isMyTurn: boolean;
  validActions: GameActionType[];

  setCurrentRoom: (room: RoomDetail | null) => void;
  setGameState: (state: GameState | null) => void;
  setGameResults: (results: GameResult[] | null) => void;
  setMyPlayerId: (id: string) => void;
  setValidActions: (actions: GameActionType[]) => void;
  setIsMyTurn: (isTurn: boolean) => void;
  setIsObserver: (isObserver: boolean) => void;
  setTimerSeconds: (seconds: number) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  currentRoom: null,
  gameState: null,
  gameResults: null,
  myPlayerId: null,
  isObserver: false,
  timerSeconds: 30,
  isMyTurn: false,
  validActions: [],

  setCurrentRoom: (room) => set({ currentRoom: room }),
  setGameState: (state) => set({ gameState: state }),
  setGameResults: (results) => set({ gameResults: results }),
  setMyPlayerId: (id) => set({ myPlayerId: id }),
  setValidActions: (actions) => set({ validActions: actions }),
  setIsMyTurn: (isTurn) => set({ isMyTurn: isTurn }),
  setIsObserver: (isObserver) => set({ isObserver: isObserver }),
  setTimerSeconds: (seconds) => set({ timerSeconds: seconds }),
  reset: () =>
    set({
      currentRoom: null,
      gameState: null,
      gameResults: null,
      isObserver: false,
      timerSeconds: 30,
      isMyTurn: false,
      validActions: [],
    }),
}));
