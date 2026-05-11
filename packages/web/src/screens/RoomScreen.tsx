import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { useSocket } from '../hooks/useSocket';
import { api } from '../api/client';
import type { Player } from 'shared';

export default function RoomScreen() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const gameStore = useGameStore();
  const socket = useSocket();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!roomId || !user) return;

    const skt = socket.getSocket();
    if (!skt) {
      setLoading(true);
      return;
    }

    if (!gameStore.currentRoom || gameStore.currentRoom.id !== roomId) {
      skt.emit('room:join', { roomId }, (response) => {
        setLoading(false);
        if (response.success && response.room) {
          gameStore.setCurrentRoom(response.room);
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

  const handleLeave = () => {
    const skt = socket.getSocket();
    if (skt) {
      skt.emit('room:leave', {}, () => {
        gameStore.setCurrentRoom(null);
        navigate('/lobby');
      });
    }
  };

  const handleReady = (ready: boolean) => {
    const skt = socket.getSocket();
    if (skt) {
      skt.emit('room:set-ready', { ready });
      gameStore.updatePlayerReady(user!.id, ready);
    }
  };

  const handleStartGame = () => {
    const skt = socket.getSocket();
    if (skt) {
      skt.emit('game:start', {}, (response) => {
        if (!response.success) {
          alert(response.message || 'Failed to start game');
        }
      });
    }
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
  const allReady = room.players.every((p) => p.isReady);

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
          <button onClick={handleLeave} className="btn-secondary text-sm">
            Leave Room
          </button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
          <h2 className="text-2xl font-bold text-center text-white mb-8">
            Waiting for Players ({room.players.length}/{room.maxPlayers})
          </h2>

          <div className="flex justify-center gap-4 mb-8 flex-wrap">
            {room.players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                isMe={player.id === user?.id}
                onReadyChange={player.id === user?.id ? handleReady : undefined}
              />
            ))}
          </div>

          {room.players.length < (room.gameType === 'blackjack' ? 1 : 2) && (
            <p className="text-center text-gray-400 mb-4">
              Need at least {room.gameType === 'blackjack' ? 1 : 2} players to start
            </p>
          )}

          <div className="flex justify-center gap-4">
            {isOwner && (
              <button
                onClick={handleStartGame}
                disabled={room.gameType === 'blackjack' ? false : !allReady}
                className={`btn-primary ${!allReady && room.gameType !== 'blackjack' ? 'opacity-50' : ''}`}
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
  player: Player;
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
