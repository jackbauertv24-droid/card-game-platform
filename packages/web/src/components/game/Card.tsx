import React from 'react';
import type { Card as CardType } from 'shared';

interface CardProps {
  card?: CardType;
  hidden?: boolean;
  small?: boolean;
}

export function Card({ card, hidden = false, small = false }: CardProps) {
  const size = small ? 'w-12 h-16' : 'w-16 h-24';

  if (hidden) {
    return (
      <div className={`${size} rounded-lg shadow-lg overflow-hidden`}>
        <div className="h-full bg-gradient-to-br from-blue-800 to-blue-900 border-2 border-blue-600 flex items-center justify-center relative">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-1 left-1 w-2 h-2 bg-blue-400 rounded-full" />
            <div className="absolute top-1 right-1 w-2 h-2 bg-blue-400 rounded-full" />
            <div className="absolute bottom-1 left-1 w-2 h-2 bg-blue-400 rounded-full" />
            <div className="absolute bottom-1 right-1 w-2 h-2 bg-blue-400 rounded-full" />
            <div className="absolute inset-4 border border-blue-400 rounded" />
          </div>
          <div className="text-blue-300 text-2xl font-bold">♠</div>
        </div>
      </div>
    );
  }

  if (!card) return null;

  const suitSymbols: Record<string, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
  };

  const suitColors: Record<string, string> = {
    hearts: 'text-red-600',
    diamonds: 'text-red-600',
    clubs: 'text-black',
    spades: 'text-black',
  };

  const symbol = suitSymbols[card.suit];
  const colorClass = suitColors[card.suit];

  return (
    <div className={`${size} rounded-lg shadow-lg overflow-hidden bg-white`}>
      <div className="h-full flex flex-col items-center justify-center p-1 font-card relative">
        <div className={`absolute top-1 left-1 ${colorClass} text-xs font-bold`}>{card.rank}</div>
        <div className={`absolute top-1 right-1 ${colorClass} text-xs`}>{symbol}</div>
        <div className={`${colorClass} text-3xl ${small ? 'text-xl' : ''}`}>{symbol}</div>
        <div className={`absolute bottom-1 left-1 ${colorClass} text-xs font-bold rotate-180`}>
          {card.rank}
        </div>
        <div className={`absolute bottom-1 right-1 ${colorClass} text-xs rotate-180`}>{symbol}</div>
      </div>
    </div>
  );
}
