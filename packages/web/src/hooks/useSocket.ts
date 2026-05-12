import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { socketClient } from '../api/socket';
import type { RoomDetail, GameState, Player, GameResult } from 'shared';

export function useSocket() {
  const { user, updateBalance } = useAuthStore();
  const gameStore = useGameStore();

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    if (!socketClient.connected) {
      socketClient
        .connect(token)
        .then(() => {
          gameStore.setMyPlayerId(user.id);
        })
        .catch(console.error);
    }

    const socket = socketClient.getSocket();
    if (!socket) return;

    socket.on('room:joined', (data: { room: RoomDetail }) => {
      gameStore.setCurrentRoom(data.room);
    });

    socket.on('room:player_joined', (data: { player: Player }) => {
      gameStore.addPlayer(data.player);
    });

    socket.on('room:player_left', (data: { playerId: string }) => {
      gameStore.removePlayer(data.playerId);
    });

    socket.on('room:player_ready', (data: { playerId: string; ready: boolean }) => {
      gameStore.updatePlayerReady(data.playerId, data.ready);
    });

    socket.on('game:started', (data: { gameState: GameState }) => {
      gameStore.setGameState(data.gameState);
    });

    socket.on('game:state', (data: { gameState: GameState }) => {
      gameStore.setGameState(data.gameState);
      // Update balance from game state (real-time)
      if (data.gameState.players) {
        const myPlayer = data.gameState.players.find((p) => p.id === user?.id);
        if (myPlayer && myPlayer.balance !== user?.balance) {
          updateBalance(myPlayer.balance);
        }
      }
    });

    socket.on(
      'game:turn',
      (data: { playerId: string; validActions: import('shared').GameActionType[] }) => {
        if (data.playerId === user.id) {
          gameStore.setIsMyTurn(true);
          gameStore.setValidActions(data.validActions);
        } else {
          gameStore.setIsMyTurn(false);
          gameStore.setValidActions([]);
        }
      }
    );

    socket.on('game:ended', (data: { results: GameResult[] }) => {
      const myResult = data.results.find((r) => r.playerId === user?.id);
      if (myResult) {
        console.log('Game result:', myResult);
        // Calculate new balance from result
        // result.amount is the net win/loss (positive for win, negative for loss)
        // For blackjack: amount is bet * 1.5 for blackjack, bet for win, -bet for loss
        // New balance should come from the game state, not calculated here
      }
      gameStore.setGameState(null);
      // Refresh balance from server after game ends
      // The game:state before game:ended should have updated balance
    });

    socket.on('quickmatch:found', (data: { roomId: string }) => {
      gameStore.setCurrentRoom(null);
      window.location.href = `/room/${data.roomId}`;
    });

    socket.on('error', (data: { code: string; message: string }) => {
      console.error('Socket error:', data);
      alert(data.message);
    });

    return () => {
      socket.off('room:joined');
      socket.off('room:player_joined');
      socket.off('room:player_left');
      socket.off('room:player_ready');
      socket.off('game:started');
      socket.off('game:state');
      socket.off('game:turn');
      socket.off('game:ended');
      socket.off('quickmatch:found');
      socket.off('error');
    };
  }, [user]);

  return socketClient;
}
