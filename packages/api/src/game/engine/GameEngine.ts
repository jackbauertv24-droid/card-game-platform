import type { Player, Card, GameState, GameAction, GameResult, GameType } from 'shared';
import { Deck } from './Deck';
import { BlackjackGame } from './BlackjackGame';

export class GameEngine {
  gameId: string;
  roomId: string;
  gameType: GameType;
  minBet: number;
  players: Player[];
  deck: Deck;
  game: BlackjackGame | null;
  gameState: GameState;
  bets: Map<string, number>;

  constructor(
    gameId: string,
    roomId: string,
    gameType: GameType,
    minBet: number,
    players: Player[]
  ) {
    this.gameId = gameId;
    this.roomId = roomId;
    this.gameType = gameType;
    this.minBet = minBet;
    this.players = players.map((p) => ({ ...p, hand: [], currentBet: 0, isFolded: false }));
    this.deck = new Deck();
    this.game = null;
    this.bets = new Map();

    this.gameState = {
      phase: 'waiting',
      currentPlayerIndex: 0,
      dealerHand: [],
      dealerHiddenCard: true,
      pot: 0,
      minBet: minBet,
      currentBet: minBet,
    };
  }

  getState(): GameState {
    return this.gameState;
  }

  start(): GameState {
    if (this.gameType === 'blackjack') {
      this.game = new BlackjackGame(this.players, this.deck, this.minBet);
      this.gameState = this.game.start();
    }
    return this.gameState;
  }

  handleAction(
    playerId: string,
    action: GameAction
  ): {
    success: boolean;
    error?: string;
    newState: GameState;
    events?: { type: string; data: unknown }[];
  } {
    if (!this.game) {
      return { success: false, error: 'Game not started', newState: this.gameState };
    }

    if (this.gameType === 'blackjack') {
      const result = this.game.handleAction(playerId, action);
      if (!result.success) {
        return { success: false, error: result.error, newState: this.gameState };
      }

      this.gameState = result.newState;

      if (result.gameEnded) {
        const results: GameResult[] = [];
        for (const player of this.players) {
          const playerResult = this.game.getPlayerResult(player.id);
          results.push({
            playerId: player.id,
            result: playerResult.result,
            amount: playerResult.amount,
          });
        }

        return {
          success: true,
          newState: this.gameState,
          events: [{ type: 'game:end', data: results }],
        };
      }

      return { success: true, newState: this.gameState };
    }

    return { success: false, error: 'Unknown game type', newState: this.gameState };
  }
}
