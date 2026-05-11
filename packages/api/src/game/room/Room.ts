import type { Player } from 'shared';

export class Room {
  id: string;
  name: string;
  gameType: import('shared').GameType;
  createdBy: string;
  minBet: number;
  maxPlayers: number;
  status: import('shared').RoomStatus;
  players: Player[];
  createdAt: string;
  gameId: string | null = null;

  constructor(
    id: string,
    createdBy: string,
    name: string,
    gameType: import('shared').GameType,
    maxPlayers: number,
    minBet: number
  ) {
    this.id = id;
    this.name = name;
    this.gameType = gameType;
    this.createdBy = createdBy;
    this.minBet = minBet;
    this.maxPlayers = maxPlayers;
    this.status = 'waiting';
    this.players = [];
    this.createdAt = new Date().toISOString();
  }

  addPlayer(player: Player): boolean {
    if (this.players.length >= this.maxPlayers) return false;
    if (this.status !== 'waiting') return false;
    if (this.players.find((p) => p.id === player.id)) return false;

    player.seatIndex = this.players.length;
    this.players.push(player);
    return true;
  }

  removePlayer(playerId: string): boolean {
    const index = this.players.findIndex((p) => p.id === playerId);
    if (index === -1) return false;

    this.players.splice(index, 1);

    for (let i = 0; i < this.players.length; i++) {
      this.players[i].seatIndex = i;
    }

    if (this.players.length === 0) {
      this.status = 'finished';
    }

    return true;
  }

  setPlayerReady(playerId: string, ready: boolean): boolean {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return false;
    player.isReady = ready;
    return true;
  }

  canStart(): boolean {
    if (this.gameType === 'blackjack') {
      return this.players.length >= 1;
    }
    return this.players.length >= 2 && this.players.every((p) => p.isReady);
  }

  getOwner(): Player | undefined {
    return this.players.find((p) => p.id === this.createdBy);
  }

  transferOwnership(): void {
    if (this.players.length > 0 && this.players[0].id !== this.createdBy) {
      this.createdBy = this.players[0].id;
    }
  }
}
