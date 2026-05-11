import type { GameType } from '../types/game';

export const GAME_TYPES: GameType[] = ['blackjack', 'poker', 'custom'];

export const DEFAULT_BALANCE = 10000;

export const MIN_BET = 10;
export const MAX_BET = 10000;

export const BLACKJACK_MIN_PLAYERS = 1;
export const BLACKJACK_MAX_PLAYERS = 7;

export const POKER_MIN_PLAYERS = 2;
export const POKER_MAX_PLAYERS = 8;

export const CARD_VALUES: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 10,
  Q: 10,
  K: 10,
  A: 11,
};

export const SUITS: import('../types/game').Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: import('../types/game').Rank[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];
