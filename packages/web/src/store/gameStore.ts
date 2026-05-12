import { create } from 'zustand';
import type { RoomDetail, GameState, GameActionType, GameResult } from 'shared';

interface GameStore {
  currentRoom: RoomDetail | null;
  gameState: GameState | null;
  gameResults: GameResult[] | null;
  myPlayerId: string | null;
  isObserver: boolean;
  isStandby: boolean;
  standUpAfterRound: boolean;
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
  setIsStandby: (isStandby: boolean) => void;
  setStandUpAfterRound: (standUp: boolean) => void;
  setTimerSeconds: (seconds: number) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  currentRoom: null,
  gameState: null,
  gameResults: null,
  myPlayerId: null,
  isObserver: false,
  isStandby: false,
  standUpAfterRound: false,
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
  setIsStandby: (isStandby) => set({ isStandby: isStandby }),
  setStandUpAfterRound: (standUp) => set({ standUpAfterRound: standUp }),
  setTimerSeconds: (seconds) => set({ timerSeconds: seconds }),
  reset: () =>
    set({
      currentRoom: null,
      gameState: null,
      gameResults: null,
      isObserver: false,
      isStandby: false,
      standUpAfterRound: false,
      timerSeconds: 30,
      isMyTurn: false,
      validActions: [],
    }),
}));
