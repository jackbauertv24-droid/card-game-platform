import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { useSocket } from '../hooks/useSocket';
import { api } from '../api/client';
import type { SeatedPlayer } from 'shared';

export default function RoomScreen() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const gameStore = useGameStore();
  const socket = useSocket();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const token = api.getToken();

  useEffect(() => {
    if (!roomId || !user) return;

    const skt = socket.getSocket();
    if (!skt) {
      setLoading(true);
      return;
    }

    if (!gameStore.currentRoom || gameStore.currentRoom.id !== roomId) {
      skt.emit('room:join', { roomId, asObserver: true }, (response) => {
        setLoading(false);
        if (response.success && response.room) {
          gameStore.setCurrentRoom(response.room);
          gameStore.setIsObserver(true);
        } else {
          setError(response.message || 'Failed to join room');
        }
      });
    } else {
      setLoading(false);
    }
  }, [roomId, user, socket]);

  useEffect(() => {
    if (gameStore.gameState) {
      navigate(`/game/${roomId}`);
    }
  }, [gameStore.gameState, roomId, navigate]);

  const handleLeave = async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        gameStore.setCurrentRoom(null);
        gameStore.reset();
        navigate('/lobby');
      } else {
        alert(data.error || 'Failed to leave');
      }
    } catch (err) {
      alert('Failed to leave room');
    }
  };

  const handleSitDown = async (seatIndex: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}/sit-down`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ seatIndex }),
      });
      const data = await res.json();
      if (data.success && data.room) {
        gameStore.setCurrentRoom(data.room);
        gameStore.setIsObserver(false);
      } else {
        alert(data.error || 'Failed to sit down');
      }
    } catch (err) {
      alert('Failed to sit down');
    }
  };

  const handleStandUp = async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}/stand-up`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success && data.room) {
        gameStore.setCurrentRoom(data.room);
        gameStore.setIsObserver(true);
      } else {
        alert(data.error || 'Failed to stand up');
      }
    } catch (err) {
      alert('Failed to stand up');
    }
  };

  const handleReady = (ready: boolean) => {
    const skt = socket.getSocket();
    if (skt) {
      skt.emit('room:set-ready', { ready });
      const room = gameStore.currentRoom;
      if (room) {
        gameStore.setCurrentRoom({
          ...room,
          players: room.players.map((p) => (p.id === user?.id ? { ...p, isReady: ready } : p)),
        });
      }
    }
  };

  const handleStartGame = () => {
    const skt = socket.getSocket();
    if (!skt || !skt.connected) {
      alert('Socket disconnected. Please refresh.');
      return;
    }
    skt.emit('game:start', {}, (response) => {
      if (!response.success) {
        alert(response.message || 'Failed to start game');
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading room...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
          <p className="text-red-500">{error}</p>
          <button onClick={() => navigate('/lobby')} className="btn-primary mt-4">
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const room = gameStore.currentRoom;
  if (!room) return null;

  const isOwner = room.createdBy === user?.id;
  const isPlayer = room.players.some((p) => p.id === user?.id);
  const isObserver = gameStore.isObserver || !isPlayer;
  const allReady = room.players.length > 0 && room.players.every((p) => p.isReady);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gold">{room.name}</h1>
            <p className="text-gray-400 text-sm">
              {room.gameType.toUpperCase()} • Min Bet: {room.minBet}
            </p>
          </div>
          <div className="flex gap-2">
            {isPlayer && room.status === 'waiting' && (
              <button onClick={handleStandUp} className="btn-secondary text-sm">
                Stand Up
              </button>
            )}
            <button onClick={handleLeave} className="btn-secondary text-sm">
              Leave Room
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white">
              {isObserver ? 'Observing' : 'Waiting for Players'}
            </h2>
            <p className="text-gray-400">
              {isObserver
                ? 'Click an empty seat to join the game'
                : `Players: ${room.players.length}/${room.maxPlayers}`}
            </p>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-5 gap-4 mb-8 justify-items-center">
            {Array.from({ length: room.maxPlayers }, (_, i) => {
              const player = room.players.find((p) => p.seatIndex === i);
              const isEmpty = room.emptySeats.includes(i);

              if (player) {
                return (
                  <PlayerCard
                    key={i}
                    player={player}
                    isMe={player.id === user?.id}
                    onReadyChange={player.id === user?.id ? handleReady : undefined}
                  />
                );
              }

              if (isEmpty && isObserver) {
                return (
                  <button
                    key={i}
                    onClick={() => handleSitDown(i)}
                    className="bg-gray-700 rounded-lg p-4 w-32 text-center hover:bg-gray-600 transition-colors border border-gray-600"
                  >
                    <div className="text-2xl mb-2 text-gray-400">🪑</div>
                    <p className="text-gray-400">Seat {i}</p>
                    <p className="text-gold text-sm mt-2">Click to sit</p>
                  </button>
                );
              }

              return (
                <div
                  key={i}
                  className="bg-gray-700/50 rounded-lg p-4 w-32 text-center border border-gray-600/30"
                >
                  <div className="text-2xl mb-2 text-gray-500">🪑</div>
                  <p className="text-gray-500">Seat {i}</p>
                  <p className="text-gray-600 text-sm mt-2">Empty</p>
                </div>
              );
            })}
          </div>

          {room.observers.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Observers ({room.observers.length})
              </h3>
              <div className="flex gap-2 flex-wrap">
                {room.observers.map((obs) => (
                  <div
                    key={obs.id}
                    className={`px-3 py-1 rounded ${obs.id === user?.id ? 'bg-gold text-black' : 'bg-gray-700 text-gray-300'}`}
                  >
                    {obs.username}
                    {obs.id === user?.id && ' (You)'}
                  </div>
                ))}
              </div>
            </div>
          )}

          {room.players.length < 1 && (
            <p className="text-center text-gray-400 mb-4">Need at least 1 player to start</p>
          )}

          <div className="flex justify-center gap-4">
            {isOwner && room.players.length >= 1 && (
              <button
                onClick={handleStartGame}
                disabled={!allReady}
                className={`btn-primary ${!allReady ? 'opacity-50' : ''}`}
              >
                Start Game
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function PlayerCard({
  player,
  isMe,
  onReadyChange,
}: {
  player: SeatedPlayer;
  isMe: boolean;
  onReadyChange?: (ready: boolean) => void;
}) {
  return (
    <div className="bg-gray-700 rounded-lg p-4 w-32 text-center">
      <div className="text-2xl mb-2">👤</div>
      <p className="text-white font-semibold truncate">{player.username}</p>
      <p className="text-gray-400 text-sm">💰 {player.balance.toLocaleString()}</p>
      {isMe && onReadyChange ? (
        <button
          onClick={() => onReadyChange(!player.isReady)}
          className={`mt-2 px-3 py-1 rounded text-sm ${
            player.isReady ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
          }`}
        >
          {player.isReady ? 'Ready ✓' : 'Click Ready'}
        </button>
      ) : (
        <p className={`mt-2 text-sm ${player.isReady ? 'text-green-400' : 'text-gray-400'}`}>
          {player.isReady ? 'Ready ✓' : 'Waiting...'}
        </p>
      )}
    </div>
  );
}
