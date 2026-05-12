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

    socket.on('room:joined', (data: { room: RoomDetail; asObserver: boolean }) => {
      gameStore.setCurrentRoom(data.room);
      gameStore.setIsObserver(data.asObserver);
      navigate(`/room/${data.room.id}`);
    });

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

    socket.on('game:started', (data: { gameState: GameState }) => {
      gameStore.setGameState(data.gameState);
      navigate(`/game/${gameStore.currentRoom?.id}`);
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
      if (data.playerId === user?.id) {
        gameStore.setIsMyTurn(true);
        gameStore.setValidActions(data.validActions);
        gameStore.setTimerSeconds(data.remainingSeconds);
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
      const myResult = data.results.find((r) => r.playerId === user?.id);
      if (myResult) {
        console.log('Game result:', myResult);
      }
    });

    socket.on('error', (data: { code: string; message: string }) => {
      console.error('Socket error:', data);
      alert(data.message);
    });

    return () => {
      socket.off('room:joined');
      socket.off('room:left');
      socket.off('room:player_ready');
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
