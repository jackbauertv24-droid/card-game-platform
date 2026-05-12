import type { Player, GameState, GameAction, Card } from 'shared';
import { Deck } from './Deck';
import { calculateHandValue } from './BlackjackUtils';

export class BlackjackGame {
  players: Player[];
  originalPlayers: Player[];
  deck: Deck;
  dealerHand: Card[];
  minBet: number;
  currentPlayerIndex: number;
  phase: 'betting' | 'playing' | 'dealer-turn' | 'showdown' | 'finished';
  bets: Map<string, number>;
  results: Map<string, { result: 'win' | 'lose' | 'push' | 'blackjack'; amount: number }>;

  constructor(players: Player[], deck: Deck, minBet: number) {
    this.players = players.map((p) => ({ ...p, hand: [], currentBet: 0, isFolded: false }));
    this.originalPlayers = this.players.map((p) => ({ ...p }));
    this.deck = deck;
    this.dealerHand = [];
    this.minBet = minBet;
    this.currentPlayerIndex = 0;
    this.phase = 'betting';
    this.bets = new Map();
    this.results = new Map();
  }

  start(): GameState {
    this.phase = 'betting';
    this.players.forEach((p) => {
      p.hand = [];
      p.currentBet = 0;
      p.isFolded = false;
    });
    this.dealerHand = [];
    this.bets.clear();
    this.results.clear();
    this.currentPlayerIndex = 0;

    return this.getState();
  }

  handleAction(
    playerId: string,
    action: GameAction
  ): { success: boolean; error?: string; newState: GameState; gameEnded?: boolean } {
    const playerIndex = this.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) {
      return { success: false, error: 'Player not found', newState: this.getState() };
    }

    if (this.phase === 'betting') {
      if (action.type === 'bet') {
        const amount = action.amount || this.minBet;
        const player = this.players[playerIndex];

        if (player.balance < amount) {
          return { success: false, error: 'Insufficient balance', newState: this.getState() };
        }

        if (amount < this.minBet) {
          return {
            success: false,
            error: 'Bet must be at least minimum',
            newState: this.getState(),
          };
        }

        player.currentBet = amount;
        player.balance -= amount;
        this.bets.set(playerId, amount);

        const allBetted = this.players.every((p) => p.currentBet > 0);
        if (allBetted) {
          this.phase = 'playing';
          this.dealInitialCards();
          this.currentPlayerIndex = 0;

          while (
            this.currentPlayerIndex < this.players.length &&
            this.players[this.currentPlayerIndex].isFolded
          ) {
            this.currentPlayerIndex++;
          }

          if (this.currentPlayerIndex >= this.players.length) {
            this.playDealer();
          }
        }

        return { success: true, newState: this.getState(), gameEnded: this.checkGameEnded() };
      }

      if (action.type === 'fold') {
        const player = this.players[playerIndex];
        player.isFolded = true;
        this.results.set(playerId, { result: 'lose', amount: 0 });

        const allPlayersDone = this.players.every((p) => p.isFolded || p.currentBet > 0);
        if (allPlayersDone) {
          const activePlayers = this.players.filter((p) => !p.isFolded);
          if (activePlayers.length === 0) {
            this.phase = 'finished';
          } else {
            this.phase = 'playing';
            this.dealInitialCards();
            this.currentPlayerIndex = 0;
            while (
              this.currentPlayerIndex < this.players.length &&
              this.players[this.currentPlayerIndex].isFolded
            ) {
              this.currentPlayerIndex++;
            }
          }
        } else {
          this.currentPlayerIndex++;
          while (
            this.currentPlayerIndex < this.players.length &&
            this.players[this.currentPlayerIndex].isFolded
          ) {
            this.currentPlayerIndex++;
          }
        }

        return { success: true, newState: this.getState(), gameEnded: this.checkGameEnded() };
      }

      return {
        success: false,
        error: 'Only betting or fold is allowed in betting phase',
        newState: this.getState(),
      };
    }

    if (this.phase === 'playing') {
      if (playerIndex !== this.currentPlayerIndex) {
        return { success: false, error: 'Not your turn', newState: this.getState() };
      }

      const player = this.players[playerIndex];

      if (action.type === 'hit') {
        const card = this.deck.deal();
        if (card) {
          player.hand.push(card);
        }

        const value = calculateHandValue(player.hand);
        if (value > 21) {
          player.isFolded = true;
          const bet = this.bets.get(playerId) || this.minBet;
          this.results.set(playerId, { result: 'lose', amount: -bet });
          this.nextPlayer();
        } else if (value === 21) {
          this.nextPlayer();
        }

        return { success: true, newState: this.getState(), gameEnded: this.checkGameEnded() };
      }

      if (action.type === 'stand') {
        this.nextPlayer();
        return { success: true, newState: this.getState(), gameEnded: this.checkGameEnded() };
      }

      if (action.type === 'fold') {
        player.isFolded = true;
        const bet = this.bets.get(playerId) || 0;
        this.results.set(playerId, { result: 'lose', amount: -bet });
        this.nextPlayer();
        return { success: true, newState: this.getState(), gameEnded: this.checkGameEnded() };
      }

      if (action.type === 'double') {
        const bet = this.bets.get(playerId) || this.minBet;
        if (player.balance < bet) {
          return {
            success: false,
            error: 'Insufficient balance for double',
            newState: this.getState(),
          };
        }

        player.balance -= bet;
        player.currentBet += bet;
        this.bets.set(playerId, player.currentBet);

        const card = this.deck.deal();
        if (card) {
          player.hand.push(card);
        }

        const value = calculateHandValue(player.hand);
        if (value > 21) {
          player.isFolded = true;
          const totalBet = this.bets.get(playerId) || this.minBet;
          this.results.set(playerId, { result: 'lose', amount: -totalBet });
        }

        this.nextPlayer();
        return { success: true, newState: this.getState(), gameEnded: this.checkGameEnded() };
      }

      return {
        success: false,
        error: 'Invalid action for playing phase',
        newState: this.getState(),
      };
    }

    return { success: false, error: 'Game not in playable state', newState: this.getState() };
  }

  private checkGameEnded(): boolean {
    return this.phase === 'finished';
  }

  private dealInitialCards(): void {
    for (let i = 0; i < 2; i++) {
      for (const player of this.players) {
        const card = this.deck.deal();
        if (card) {
          player.hand.push(card);
        }
      }
    }

    for (let i = 0; i < 2; i++) {
      const card = this.deck.deal();
      if (card) {
        this.dealerHand.push(card);
      }
    }

    for (const player of this.players) {
      if (calculateHandValue(player.hand) === 21) {
        const bet = this.bets.get(player.id) || this.minBet;
        player.balance += bet * 2.5;
        this.results.set(player.id, { result: 'blackjack', amount: bet * 1.5 });
        player.isFolded = true;
      }
    }

    if (this.players.every((p) => p.isFolded)) {
      this.phase = 'finished';
    }
  }

  private nextPlayer(): void {
    this.currentPlayerIndex++;

    while (
      this.currentPlayerIndex < this.players.length &&
      this.players[this.currentPlayerIndex].isFolded
    ) {
      this.currentPlayerIndex++;
    }

    if (this.currentPlayerIndex >= this.players.length) {
      this.playDealer();
    }
  }

  private playDealer(): void {
    this.phase = 'dealer-turn';

    while (calculateHandValue(this.dealerHand) < 17) {
      const card = this.deck.deal();
      if (card) {
        this.dealerHand.push(card);
      }
    }

    this.resolveResults();
  }

  private resolveResults(): void {
    this.phase = 'showdown';
    const dealerValue = calculateHandValue(this.dealerHand);

    for (const player of this.players) {
      if (this.results.has(player.id)) continue;

      const playerValue = calculateHandValue(player.hand);
      const bet = this.bets.get(player.id) || this.minBet;

      if (dealerValue > 21) {
        player.balance += bet * 2;
        this.results.set(player.id, { result: 'win', amount: bet });
      } else if (playerValue > dealerValue) {
        player.balance += bet * 2;
        this.results.set(player.id, { result: 'win', amount: bet });
      } else if (playerValue < dealerValue) {
        this.results.set(player.id, { result: 'lose', amount: -bet });
      } else {
        player.balance += bet;
        this.results.set(player.id, { result: 'push', amount: 0 });
      }
    }

    this.phase = 'finished';
  }

  getState(): GameState {
    const showDealerCards =
      this.phase === 'dealer-turn' || this.phase === 'showdown' || this.phase === 'finished';

    return {
      phase: this.phase,
      currentPlayerIndex: this.currentPlayerIndex,
      players: this.players,
      dealerHand: showDealerCards ? this.dealerHand : this.dealerHand.slice(0, 1),
      dealerHiddenCard: !showDealerCards,
      pot: Array.from(this.bets.values()).reduce((a, b) => a + b, 0),
      minBet: this.minBet,
      currentBet: this.minBet,
    };
  }

  getPlayerResult(playerId: string): {
    result: 'win' | 'lose' | 'push' | 'blackjack';
    amount: number;
  } {
    return this.results.get(playerId) || { result: 'lose', amount: 0 };
  }

  getValidActions(playerId: string): import('shared').GameActionType[] {
    const playerIndex = this.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return [];

    if (this.phase === 'betting') {
      return ['bet'];
    }

    if (this.phase === 'playing' && playerIndex === this.currentPlayerIndex) {
      const actions: import('shared').GameActionType[] = ['hit', 'stand'];
      const player = this.players[playerIndex];
      if (player.hand.length === 2 && player.balance >= (this.bets.get(playerId) || this.minBet)) {
        actions.push('double');
      }
      return actions;
    }

    return [];
  }

  restoreState(state: GameState): void {
    this.players = state.players;
    this.dealerHand = state.dealerHand;
    this.minBet = state.minBet;
    this.currentPlayerIndex = state.currentPlayerIndex;
    this.phase = state.phase === 'waiting' ? 'betting' : state.phase;

    this.bets.clear();
    for (const player of this.players) {
      if (player.currentBet > 0) {
        this.bets.set(player.id, player.currentBet);
      }
    }
  }
}
