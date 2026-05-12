import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { useSocket } from '../hooks/useSocket';
import { api } from '../api/client';
import { Card } from '../components/game/Card';
import type { SeatedPlayer, GameActionType } from 'shared';

export default function RoomScreen() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const gameStore = useGameStore();
  const socket = useSocket();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [betAmount, setBetAmount] = useState(100);
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
    } catch {
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
    } catch {
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
    } catch {
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

  const handleAction = (actionType: GameActionType, amount?: number) => {
    const skt = socket.getSocket();
    if (skt) {
      skt.emit('game:action', { type: actionType, amount }, (response) => {
        if (!response.success) {
          console.error('Action failed:', response.message);
        }
      });
    }
  };

  const handleContinue = () => {
    gameStore.setGameState(null);
    gameStore.setGameResults(null);
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
  const gameState = gameStore.gameState;
  const gameResults = gameStore.gameResults;
  const myPlayer = gameState?.players?.find((p) => p.id === user?.id);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gold">{room.name}</h1>
            <p className="text-gray-400 text-sm">
              {room.gameType.toUpperCase()} • Min Bet: {room.minBet} •
              {gameState ? `Phase: ${gameState.phase}` : `Status: ${room.status}`}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {user && (
              <span className="text-gold font-bold mr-4">💰 {user.balance.toLocaleString()}</span>
            )}
            {isPlayer && !gameState && (
              <button onClick={handleStandUp} className="btn-secondary text-sm">
                Stand Up
              </button>
            )}
            <button onClick={handleLeave} className="btn-secondary text-sm">
              Leave
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {gameResults && !gameState && (
          <ResultsOverlay
            results={gameResults}
            room={room}
            user={user}
            onContinue={handleContinue}
          />
        )}

        {gameState && (
          <GameView
            gameState={gameState}
            myPlayer={myPlayer}
            isObserver={isObserver}
            isMyTurn={gameStore.isMyTurn}
            validActions={gameStore.validActions}
            timerSeconds={gameStore.timerSeconds}
            betAmount={betAmount}
            setBetAmount={setBetAmount}
            standUpAfterRound={gameStore.standUpAfterRound}
            onAction={handleAction}
            onSetStandUpAfterRound={(standUp) => {
              const skt = socket.getSocket();
              if (skt) {
                skt.emit('room:set-stand-up-after-round', { standUp });
                gameStore.setStandUpAfterRound(standUp);
              }
            }}
          />
        )}

        {!gameState && !gameResults && (
          <WaitingView
            room={room}
            user={user}
            isObserver={isObserver}
            isOwner={isOwner}
            allReady={allReady}
            onSitDown={handleSitDown}
            onReady={handleReady}
            onStartGame={handleStartGame}
          />
        )}
      </main>
    </div>
  );
}

function ResultsOverlay({
  results,
  room,
  user,
  onContinue,
}: {
  results: import('shared').GameResult[];
  room: import('shared').RoomDetail;
  user: import('shared').User | null;
  onContinue: () => void;
}) {
  const myResult = results.find((r) => r.playerId === user?.id);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-8 border border-gold max-w-md text-center">
        <h2 className="text-2xl font-bold text-gold mb-6">Game Over</h2>
        <div className="space-y-3 mb-6">
          {results.map((result) => {
            const player = room.players.find((p) => p.id === result.playerId);
            return (
              <div
                key={result.playerId}
                className="bg-gray-700 rounded-lg p-3 flex justify-between items-center"
              >
                <span className="text-white font-semibold">{player?.username || 'Unknown'}</span>
                <span
                  className={`font-bold ${result.amount > 0 ? 'text-green-400' : result.amount < 0 ? 'text-red-400' : 'text-gray-400'}`}
                >
                  {result.result.toUpperCase()}{' '}
                  {result.amount > 0
                    ? `+${result.amount}`
                    : result.amount < 0
                      ? result.amount
                      : '(push)'}
                </span>
              </div>
            );
          })}
        </div>
        {myResult && user && (
          <p className="text-gray-300 mb-6">
            Your new balance:{' '}
            <span className="text-gold font-bold text-xl">
              {(user.balance + myResult.amount).toLocaleString()}
            </span>
          </p>
        )}
        <button onClick={onContinue} className="btn-primary w-full">
          Continue
        </button>
      </div>
    </div>
  );
}

function GameView({
  gameState,
  myPlayer,
  isObserver,
  isMyTurn,
  validActions,
  timerSeconds,
  betAmount,
  setBetAmount,
  standUpAfterRound,
  onAction,
  onSetStandUpAfterRound,
}: {
  gameState: import('shared').GameState;
  myPlayer: import('shared').Player | undefined;
  isObserver: boolean;
  isMyTurn: boolean;
  validActions: GameActionType[];
  timerSeconds: number;
  betAmount: number;
  setBetAmount: (n: number) => void;
  standUpAfterRound: boolean;
  onAction: (type: GameActionType, amount?: number) => void;
  onSetStandUpAfterRound: (standUp: boolean) => void;
}) {
  const showDealerHidden = gameState.phase === 'playing' || gameState.phase === 'betting';

  return (
    <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-gray-400">Dealer</h2>
        <div className="flex justify-center gap-2 mt-2">
          {gameState.dealerHand.length > 0 ? (
            showDealerHidden && gameState.dealerHand.length === 2 ? (
              <>
                <Card card={gameState.dealerHand[0]} />
                <Card hidden />
              </>
            ) : (
              gameState.dealerHand.map((card, i) => <Card key={i} card={card} />)
            )
          ) : (
            <span className="text-gray-500">Waiting...</span>
          )}
        </div>
        {!showDealerHidden && gameState.dealerHand.length > 0 && (
          <p className="text-white mt-2 font-bold">{calculateHand(gameState.dealerHand)}</p>
        )}
      </div>

      <div className="text-center mb-6">
        <div className="inline-block bg-amber-900 rounded-full px-6 py-2 text-white font-bold">
          Pot: {gameState.pot}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {gameState.players.map((player) => {
          const isCurrentTurn = gameState.currentPlayerIndex === gameState.players.indexOf(player);
          return (
            <div
              key={player.id}
              className={`bg-gray-700 rounded-lg p-4 ${isCurrentTurn ? 'ring-2 ring-gold' : ''}`}
            >
              <div className="text-center">
                <p className="text-white font-semibold truncate">{player.username}</p>
                <p className="text-gray-400 text-sm">💰 {player.balance.toLocaleString()}</p>
                {player.currentBet > 0 && (
                  <p className="text-gold text-sm mt-1">Bet: {player.currentBet}</p>
                )}
                <div className="flex justify-center gap-1 mt-2">
                  {player.hand.map((card, i) => (
                    <Card key={i} card={card} small />
                  ))}
                </div>
                {player.hand.length > 0 && (
                  <p className="text-white text-sm mt-1 font-bold">{calculateHand(player.hand)}</p>
                )}
                {player.isFolded && <p className="text-red-400 text-sm">Bust/Fold</p>}
                {isCurrentTurn && gameState.phase !== 'finished' && (
                  <p className="text-gold text-sm mt-1">⏱ {timerSeconds}s</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isObserver &&
        myPlayer &&
        gameState.phase === 'betting' &&
        myPlayer.currentBet === 0 &&
        isMyTurn && (
          <div className="text-center space-y-4">
            <div className="flex justify-center items-center gap-4">
              <label className="text-gray-300">Bet:</label>
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(parseInt(e.target.value) || gameState.minBet)}
                className="input-field w-32"
                min={gameState.minBet}
                max={myPlayer.balance}
              />
            </div>
            <button onClick={() => onAction('bet', betAmount)} className="btn-primary">
              Place Bet
            </button>
          </div>
        )}

      {!isObserver && myPlayer && gameState.phase === 'playing' && isMyTurn && (
        <div className="text-center">
          <p className="text-gold mb-4 font-semibold">Your Turn - {timerSeconds}s</p>
          <div className="flex justify-center gap-4">
            <button onClick={() => onAction('hit')} className="btn-primary">
              Hit
            </button>
            <button onClick={() => onAction('stand')} className="btn-secondary">
              Stand
            </button>
            {validActions.includes('double') && myPlayer.balance >= myPlayer.currentBet && (
              <button onClick={() => onAction('double')} className="btn-secondary">
                Double
              </button>
            )}
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={standUpAfterRound}
                onChange={(e) => onSetStandUpAfterRound(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Stand up after this round</span>
            </label>
          </div>
        </div>
      )}

      {!isObserver && myPlayer && gameState.phase === 'playing' && !isMyTurn && (
        <div className="text-center">
          <p className="text-gray-400 mb-4">Waiting for other players...</p>
          <label className="flex items-center gap-2 text-gray-400 cursor-pointer justify-center">
            <input
              type="checkbox"
              checked={standUpAfterRound}
              onChange={(e) => onSetStandUpAfterRound(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Stand up after this round</span>
          </label>
        </div>
      )}

      {isObserver && gameState.phase !== 'finished' && (
        <p className="text-center text-gray-400">Observing - {gameState.phase} phase</p>
      )}

      {gameState.phase === 'dealer-turn' && (
        <p className="text-center text-white text-lg">Dealer is playing...</p>
      )}

      {gameState.phase === 'finished' && (
        <p className="text-center text-gray-400">Calculating results...</p>
      )}
    </div>
  );
}

function WaitingView({
  room,
  user,
  isObserver,
  isOwner,
  allReady,
  onSitDown,
  onReady,
  onStartGame,
}: {
  room: import('shared').RoomDetail;
  user: import('shared').User | null;
  isObserver: boolean;
  isOwner: boolean;
  allReady: boolean;
  onSitDown: (seatIndex: number) => void;
  onReady: (ready: boolean) => void;
  onStartGame: () => void;
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white">{isObserver ? 'Observing' : 'Waiting'}</h2>
        <p className="text-gray-400">
          {isObserver
            ? 'Click an empty seat to join'
            : `Players: ${room.players.length}/${room.maxPlayers}`}
        </p>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-5 gap-4 mb-6 justify-items-center">
        {Array.from({ length: room.maxPlayers }, (_, i) => {
          const player = room.players.find((p) => p.seatIndex === i);
          const isEmpty = room.emptySeats.includes(i);

          if (player) {
            return (
              <PlayerSeatCard
                key={i}
                player={player}
                isCurrentUser={player.id === user?.id}
                onReadyChange={player.id === user?.id ? onReady : undefined}
              />
            );
          }

          if (isEmpty && isObserver) {
            return (
              <button
                key={i}
                onClick={() => onSitDown(i)}
                className="bg-gray-700 rounded-lg p-4 w-32 text-center hover:bg-gray-600 transition-colors border border-gray-600"
              >
                <div className="text-2xl mb-2 text-gray-400">🪑</div>
                <p className="text-gray-400">Seat {i}</p>
                <p className="text-gold text-sm mt-2">Sit Here</p>
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
            </div>
          );
        })}
      </div>

      {room.observers.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">
            Observers ({room.observers.length})
          </h3>
          <div className="flex gap-2 flex-wrap">
            {room.observers.map((obs) => (
              <span
                key={obs.id}
                className={`px-3 py-1 rounded ${obs.id === user?.id ? 'bg-gold text-black font-semibold' : 'bg-gray-700 text-gray-300'}`}
              >
                {obs.username}
              </span>
            ))}
          </div>
        </div>
      )}

      {room.players.length < 1 && (
        <p className="text-center text-gray-500 mb-4">Need at least 1 player to start</p>
      )}

      <div className="flex justify-center gap-4">
        {isOwner && room.players.length >= 1 && (
          <button
            onClick={onStartGame}
            disabled={!allReady}
            className={`btn-primary ${!allReady ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Start Game
          </button>
        )}
      </div>
    </div>
  );
}

function PlayerSeatCard({
  player,
  isCurrentUser,
  onReadyChange,
}: {
  player: SeatedPlayer;
  isCurrentUser: boolean;
  onReadyChange?: (ready: boolean) => void;
}) {
  return (
    <div className="bg-gray-700 rounded-lg p-4 w-32 text-center">
      <div className="text-2xl mb-2">👤</div>
      <p className="text-white font-semibold truncate">{player.username}</p>
      <p className="text-gray-400 text-sm">💰 {player.balance.toLocaleString()}</p>
      {isCurrentUser && onReadyChange ? (
        <button
          onClick={() => onReadyChange(!player.isReady)}
          className={`mt-2 px-3 py-1 rounded text-sm w-full ${
            player.isReady
              ? 'bg-green-600 text-white'
              : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
          }`}
        >
          {player.isReady ? 'Ready ✓' : 'Ready?'}
        </button>
      ) : (
        <p className={`mt-2 text-sm ${player.isReady ? 'text-green-400' : 'text-gray-500'}`}>
          {player.isReady ? 'Ready ✓' : 'Waiting'}
        </p>
      )}
    </div>
  );
}

function calculateHand(hand: import('shared').Card[]): number {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === 'A') {
      aces++;
      total += 11;
    } else if (['K', 'Q', 'J'].includes(card.rank)) {
      total += 10;
    } else {
      total += parseInt(card.rank, 10);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}
