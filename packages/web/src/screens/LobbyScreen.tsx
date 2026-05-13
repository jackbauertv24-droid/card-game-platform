import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { useSocket } from '../hooks/useSocket';
import type { RoomPreview, RoomDetail, GameType } from 'shared';

export default function LobbyScreen() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [gameType, setGameType] = useState<GameType>('blackjack');
  const [rooms, setRooms] = useState<RoomPreview[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { user, logout } = useAuthStore();
  const gameStore = useGameStore();
  const socket = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    loadRooms();
  }, [gameType]);

  useEffect(() => {
    if (gameStore.currentRoom) {
      loadRooms();
    }
  }, [gameStore.currentRoom]);

  const loadRooms = async () => {
    setRefreshing(true);
    const skt = socket.getSocket();
    if (skt) {
      skt.emit('room:list', { gameType, includePlaying: true }, (response) => {
        setRooms(response.rooms);
        setRefreshing(false);
      });
    } else {
      setRefreshing(false);
    }
  };

  const handleLogout = () => {
    logout();
    socket.disconnect();
    navigate('/login');
  };

  const handleJoinRoom = (roomId: string) => {
    const skt = socket.getSocket();
    if (!skt) return;

    if (gameStore.currentRoom && gameStore.currentRoom.id === roomId) {
      navigate(`/room/${roomId}`);
      return;
    }

    if (gameStore.currentRoom) {
      skt.emit('room:leave', {}, () => {
        gameStore.setCurrentRoom(null);
        gameStore.reset();
        doJoinRoom(roomId);
      });
    } else {
      doJoinRoom(roomId);
    }
  };

  const doJoinRoom = (roomId: string) => {
    const skt = socket.getSocket();
    if (!skt) return;

    skt.emit('room:join', { roomId, asObserver: true }, (response) => {
      if (response.success && response.room) {
        gameStore.setCurrentRoom(response.room);
        gameStore.setIsObserver(true);
        if (response.gameState) {
          gameStore.setGameState(response.gameState);
        }
        navigate(`/room/${roomId}`);
      } else {
        alert(response.message || 'Failed to join room');
      }
    });
  };

  const handleRejoinRoom = () => {
    if (gameStore.currentRoom) {
      navigate(`/room/${gameStore.currentRoom.id}`);
    }
  };

  const currentRoomId = gameStore.currentRoom?.id;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gold">Card Game Platform</h1>
          <div className="flex items-center gap-4">
            <div className="text-gray-300">
              <span className="font-semibold">{user?.username}</span>
              <span className="ml-3 text-gold font-bold">💰 {user?.balance.toLocaleString()}</span>
            </div>
            <button onClick={handleLogout} className="btn-secondary text-sm">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {gameStore.currentRoom && (
          <div className="bg-gold/20 border-2 border-gold rounded-xl p-6 mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gold">You are in a room</h2>
                <p className="text-white mt-1">{gameStore.currentRoom.name}</p>
                <p className="text-gray-300 text-sm">
                  {gameStore.currentRoom.gameType.toUpperCase()} •
                  {gameStore.isObserver ? 'Observer' : 'Player'} •
                  {gameStore.currentRoom.players.length}/{gameStore.currentRoom.maxPlayers} players
                </p>
              </div>
              <button onClick={handleRejoinRoom} className="btn-primary">
                Rejoin Room
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setGameType('blackjack')}
            className={`px-4 py-2 rounded font-semibold ${gameType === 'blackjack' ? 'bg-gold text-black' : 'bg-gray-700 text-white'}`}
          >
            Blackjack
          </button>
          <button
            onClick={() => setGameType('poker')}
            className={`px-4 py-2 rounded font-semibold ${gameType === 'poker' ? 'bg-gold text-black' : 'bg-gray-700 text-white'}`}
          >
            Poker
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div
            className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gold cursor-pointer transition-all"
            onClick={() => setShowCreateModal(true)}
          >
            <div className="text-center">
              <div className="text-4xl mb-4">➕</div>
              <h3 className="text-xl font-semibold text-white">Create New Room</h3>
              <p className="text-gray-400 mt-2">Start a new game</p>
            </div>
          </div>

          <div
            className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gold cursor-pointer transition-all"
            onClick={loadRooms}
          >
            <div className="text-center">
              <div className="text-4xl mb-4">🔄</div>
              <h3 className="text-xl font-semibold text-white">Refresh Rooms</h3>
              <p className="text-gray-400 mt-2">{refreshing ? 'Loading...' : 'Click to refresh'}</p>
            </div>
          </div>

          <div
            className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gold cursor-pointer transition-all"
            onClick={() => {
              const skt = socket.getSocket();
              if (skt) {
                skt.emit('quickmatch:join', { gameType });
              }
            }}
          >
            <div className="text-center">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-semibold text-white">Quick Match</h3>
              <p className="text-gray-400 mt-2">Find a game instantly</p>
            </div>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-white mb-4">Available Rooms</h2>
        {rooms.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-center">
              No rooms available. Create one to start playing!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.map((room) => {
              const isCurrentRoom = room.id === currentRoomId;
              return (
                <div
                  key={room.id}
                  className={`bg-gray-800 rounded-xl p-6 border transition-all ${
                    isCurrentRoom
                      ? 'border-gold bg-gold/10'
                      : 'border-gray-700 hover:border-gold cursor-pointer'
                  }`}
                  onClick={() => !isCurrentRoom && handleJoinRoom(room.id)}
                >
                  <h3 className="text-lg font-semibold text-white">{room.name}</h3>
                  <div className="mt-2 text-gray-400">
                    <p>Game: {room.gameType.toUpperCase()}</p>
                    <p>
                      Players: {room.playerCount}/{room.maxPlayers}
                    </p>
                    <p>Min Bet: {room.minBet}</p>
                  </div>
                  {isCurrentRoom && (
                    <button onClick={handleRejoinRoom} className="btn-primary mt-4 w-full">
                      Rejoin
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showCreateModal && (
        <CreateRoomModal
          gameType={gameType}
          onClose={() => setShowCreateModal(false)}
          socket={socket}
          onCreate={(room, gameState) => {
            setShowCreateModal(false);
            gameStore.setCurrentRoom(room);
            if (gameState) {
              gameStore.setGameState(gameState);
              gameStore.setIsObserver(false);
            } else {
              gameStore.setIsObserver(!room.players.some((p) => p.id === user?.id));
            }
            navigate(`/room/${room.id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateRoomModal({
  gameType,
  onClose,
  socket,
  onCreate,
}: {
  gameType: GameType;
  onClose: () => void;
  socket: ReturnType<typeof useSocket>;
  onCreate: (room: RoomDetail, gameState?: import('shared').GameState) => void;
}) {
  const [name, setName] = useState(`My ${gameType} Room`);
  const [minBet, setMinBet] = useState(100);
  const [maxPlayers, setMaxPlayers] = useState(gameType === 'blackjack' ? 5 : 6);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = () => {
    setIsLoading(true);
    setError('');

    const skt = socket.getSocket();
    if (!skt) {
      setError('Not connected to server. Please refresh the page.');
      setIsLoading(false);
      return;
    }

    if (!skt.connected) {
      setError('Socket not connected. Please wait or refresh.');
      setIsLoading(false);
      return;
    }

    console.log('Creating room:', { name, gameType, maxPlayers, minBet });

    const timeout = setTimeout(() => {
      setIsLoading(false);
      setError('Request timed out. Please try again.');
    }, 10000);

    skt.emit('room:create', { name, gameType, maxPlayers, minBet }, (response) => {
      clearTimeout(timeout);
      setIsLoading(false);
      console.log('Room create response:', response);
      if (response.success && response.room) {
        onCreate(response.room as RoomDetail, response.gameState);
      } else {
        setError(response.message || 'Failed to create room');
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-8 w-full max-w-md border border-gray-700">
        <h2 className="text-2xl font-bold text-gold mb-6">Create Room</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-gray-300 mb-2">Room Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2">Game Type</label>
            <div className="bg-gray-700 rounded px-3 py-2 text-white">{gameType.toUpperCase()}</div>
          </div>

          <div>
            <label className="block text-gray-300 mb-2">Minimum Bet</label>
            <input
              type="number"
              value={minBet}
              onChange={(e) => setMinBet(parseInt(e.target.value) || 10)}
              className="input-field"
              min={10}
              max={10000}
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2">Max Players</label>
            <input
              type="number"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(parseInt(e.target.value) || 1)}
              className="input-field"
              min={1}
              max={gameType === 'blackjack' ? 7 : 8}
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        <div className="flex gap-4 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={isLoading} className="btn-primary flex-1">
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
