export type GameType = 'blackjack' | 'poker' | 'custom';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export type PlayerStatus = 'connected' | 'away' | 'disconnected';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: string;
  username: string;
  balance: number;
  seatIndex: number;
  isReady: boolean;
  isFolded: boolean;
  isAllIn: boolean;
  currentBet: number;
  hand: Card[];
  status: PlayerStatus;
  lastActionAt?: string;
  disconnectedAt?: string;
}

export interface GameState {
  phase: 'waiting' | 'betting' | 'playing' | 'dealer-turn' | 'showdown' | 'finished';
  currentPlayerIndex: number;
  players: Player[];
  dealerHand: Card[];
  dealerHiddenCard: boolean;
  pot: number;
  minBet: number;
  currentBet: number;
  turnTimeout?: number;
  gameId?: string;
}

export type GameActionType = 'bet' | 'hit' | 'stand' | 'double' | 'fold' | 'surrender';

export interface GameAction {
  type: GameActionType;
  amount?: number;
}

export interface GameResult {
  playerId: string;
  result: 'win' | 'lose' | 'push' | 'blackjack';
  amount: number;
}

export const TURN_TIMEOUT_SECONDS = 30;
export const RECONNECT_GRACE_SECONDS = 120;
