import type { Card, Suit, Rank } from 'shared';
import { SUITS, RANKS } from 'shared';

export class Deck {
  private cards: Card[];
  private usedDecks: number;

  constructor(numDecks: number = 6) {
    this.usedDecks = numDecks;
    this.cards = [];
    this.shuffle();
  }

  shuffle(): void {
    this.cards = [];
    for (let i = 0; i < this.usedDecks; i++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.cards.push({ suit, rank });
        }
      }
    }

    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(): Card | null {
    if (this.cards.length < 52) {
      this.shuffle();
    }
    return this.cards.pop() || null;
  }

  dealMultiple(count: number): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < count; i++) {
      const card = this.deal();
      if (card) cards.push(card);
    }
    return cards;
  }

  remaining(): number {
    return this.cards.length;
  }

  getCards(): Card[] {
    return this.cards;
  }

  restore(cards: { suit: string; rank: string }[]): void {
    this.cards = cards.map((c) => ({
      suit: c.suit as Suit,
      rank: c.rank as Rank,
    }));
  }
}
