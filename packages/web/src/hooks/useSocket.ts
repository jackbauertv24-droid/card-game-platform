import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { socketClient } from '../api/socket';
import type { RoomDetail, GameState, TurnInfo, GameResult } from 'shared';

export function useSocket() {
  const { user, updateBalance } = useAuthStore();
  const gameStore = useGameStore();
  const navigate = useNavigate();

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

    socket.on(
      'room:joined',
      (data: { room: RoomDetail; asObserver: boolean; gameState?: GameState }) => {
        if (gameStore.currentRoom?.id === data.room.id && gameStore.gameState) {
          return;
        }
        gameStore.setCurrentRoom(data.room);
        gameStore.setIsObserver(data.asObserver);
        if (data.gameState) {
          gameStore.setGameState(data.gameState);
        }
        navigate(`/room/${data.room.id}`);
      }
    );

    socket.on('room:left', () => {
      gameStore.setCurrentRoom(null);
      gameStore.reset();
      navigate('/lobby');
    });

    socket.on('room:player_ready', (data: { playerId: string; ready: boolean }) => {
      const room = gameStore.currentRoom;
      if (room) {
        gameStore.setCurrentRoom({
          ...room,
          players: room.players.map((p) =>
            p.id === data.playerId ? { ...p, isReady: data.ready } : p
          ),
        });
      }
    });

    socket.on(
      'room:player_seated',
      (data: { player: import('shared').SeatedPlayer; seatIndex: number }) => {
        const room = gameStore.currentRoom;
        if (room) {
          const existingPlayer = room.players.find((p) => p.id === data.player.id);
          if (!existingPlayer) {
            gameStore.setCurrentRoom({
              ...room,
              players: [...room.players, data.player],
              playerCount: room.playerCount + 1,
              emptySeats: room.emptySeats.filter((s) => s !== data.seatIndex),
            });
          }
        }
      }
    );

    socket.on('room:player_unseated', (data: { playerId: string; seatIndex: number }) => {
      const room = gameStore.currentRoom;
      if (room) {
        gameStore.setCurrentRoom({
          ...room,
          players: room.players.filter((p) => p.id !== data.playerId),
          playerCount: room.playerCount - 1,
          emptySeats: [...room.emptySeats, data.seatIndex].sort((a, b) => a - b),
        });
      }
      if (data.playerId === user?.id) {
        gameStore.setIsObserver(true);
      }
    });

    socket.on('room:observer_joined', (data: { observer: import('shared').Observer }) => {
      const room = gameStore.currentRoom;
      if (room) {
        const existingObserver = room.observers.find((o) => o.id === data.observer.id);
        if (!existingObserver) {
          gameStore.setCurrentRoom({
            ...room,
            observers: [...room.observers, data.observer],
            observerCount: room.observerCount + 1,
          });
        }
      }
    });

    socket.on('room:observer_left', (data: { userId: string }) => {
      const room = gameStore.currentRoom;
      if (room) {
        gameStore.setCurrentRoom({
          ...room,
          observers: room.observers.filter((o) => o.id !== data.userId),
          observerCount: room.observerCount - 1,
        });
      }
    });

    socket.on(
      'room:player_stand_up_after_round',
      (data: { playerId: string; standUp: boolean }) => {
        if (data.playerId === user?.id) {
          gameStore.setStandUpAfterRound(data.standUp);
        }
      }
    );

    socket.on('game:started', (data: { gameState: GameState }) => {
      gameStore.setGameState(data.gameState);
      gameStore.setGameResults(null);
    });

    socket.on('game:state', (data: { gameState: GameState }) => {
      gameStore.setGameState(data.gameState);
      if (data.gameState.players) {
        const myPlayer = data.gameState.players.find((p) => p.id === user?.id);
        if (myPlayer && myPlayer.balance !== user?.balance) {
          updateBalance(myPlayer.balance);
        }
      }
    });

    socket.on('game:turn', (data: TurnInfo) => {
      gameStore.setTimerSeconds(data.remainingSeconds);
      if (data.playerId === user?.id) {
        gameStore.setIsMyTurn(true);
        gameStore.setValidActions(data.validActions);
      } else {
        gameStore.setIsMyTurn(false);
        gameStore.setValidActions([]);
      }
    });

    socket.on('game:timer_update', (data: { remainingSeconds: number }) => {
      gameStore.setTimerSeconds(data.remainingSeconds);
    });

    socket.on('game:ended', (data: { results: GameResult[] }) => {
      gameStore.setGameState(null);
      gameStore.setIsMyTurn(false);
      gameStore.setValidActions([]);
      gameStore.setGameResults(data.results);
      const myResult = data.results.find((r) => r.playerId === user?.id);
      if (myResult && user) {
        updateBalance(user.balance + myResult.amount);
      }
      if (gameStore.standUpAfterRound) {
        gameStore.setStandUpAfterRound(false);
        gameStore.setIsObserver(true);
      }
    });

    socket.on('error', (data: { code: string; message: string }) => {
      console.error('Socket error:', data);
      alert(data.message);
    });

    return () => {
      socket.off('room:joined');
      socket.off('room:state');
      socket.off('room:left');
      socket.off('room:player_ready');
      socket.off('room:player_seated');
      socket.off('room:player_unseated');
      socket.off('room:observer_joined');
      socket.off('room:observer_left');
      socket.off('game:started');
      socket.off('game:state');
      socket.off('game:turn');
      socket.off('game:timer_update');
      socket.off('game:ended');
      socket.off('error');
    };
  }, [user, navigate, gameStore, updateBalance]);

  return socketClient;
}
