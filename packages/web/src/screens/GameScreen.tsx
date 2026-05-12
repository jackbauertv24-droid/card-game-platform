import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { useSocket } from '../hooks/useSocket';
import { Card } from '../components/game/Card';
import type { GameActionType } from 'shared';

export default function GameScreen() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const gameStore = useGameStore();
  const socket = useSocket();
  const [betAmount, setBetAmount] = useState(100);

  const gameState = gameStore.gameState;
  const gameResults = gameStore.gameResults;
  const room = gameStore.currentRoom;
  const myPlayer = gameState?.players?.find((p) => p.id === user?.id);

  useEffect(() => {
    if (!gameState && !gameResults && room) {
      navigate(`/room/${roomId}`);
    }
  }, [gameState, gameResults, room, roomId, navigate]);

  const handleLeave = () => {
    const skt = socket.getSocket();
    if (skt) {
      skt.emit('room:leave', {}, () => {
        gameStore.setCurrentRoom(null);
        gameStore.setGameState(null);
        gameStore.setGameResults(null);
        navigate('/lobby');
      });
    }
  };

  const handleBackToRoom = () => {
    gameStore.setGameState(null);
    gameStore.setGameResults(null);
    navigate(`/room/${roomId}`);
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

  const handleBet = () => {
    handleAction('bet', betAmount);
  };

  if (!gameState && !gameResults) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading game...</div>
      </div>
    );
  }

  if (gameResults && !gameState) {
    const myResult = gameResults.find((r) => r.playerId === user?.id);
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 max-w-md text-center">
          <h2 className="text-2xl font-bold text-gold mb-6">Game Over</h2>
          <div className="space-y-4 mb-8">
            {gameResults.map((result) => (
              <div key={result.playerId} className="bg-gray-700 rounded-lg p-4">
                <p className="text-white font-semibold">
                  {room?.players.find((p) => p.id === result.playerId)?.username || 'Unknown'}
                </p>
                <p
                  className={`text-xl font-bold ${result.amount > 0 ? 'text-green-400' : result.amount < 0 ? 'text-red-400' : 'text-gray-400'}`}
                >
                  {result.result.toUpperCase()}
                  {result.amount > 0 && ` +${result.amount}`}
                  {result.amount < 0 && ` ${result.amount}`}
                  {result.amount === 0 && ' (Push)'}
                </p>
              </div>
            ))}
          </div>
          {myResult && user ? (
            <p className="text-gray-300 mb-4">
              Your balance:{' '}
              <span className="text-gold font-bold">
                {(user.balance + myResult.amount).toLocaleString()}
              </span>
            </p>
          ) : null}
          <div className="flex gap-4 justify-center">
            <button onClick={handleBackToRoom} className="btn-primary">
              Play Again
            </button>
            <button onClick={handleLeave} className="btn-secondary">
              Leave Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!gameState || !myPlayer) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading game...</div>
      </div>
    );
  }

  const phase = gameState.phase;
  const myHand = myPlayer.hand;
  const myBet = myPlayer.currentBet;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gold">{room?.name || 'Blackjack'}</h1>
            <p className="text-gray-400 text-sm capitalize">{phase}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gold font-bold">💰 {myPlayer.balance.toLocaleString()}</span>
            <button onClick={handleLeave} className="btn-secondary text-sm">
              Leave
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="game-table p-8 mx-auto max-w-4xl">
          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold text-white">Dealer</h2>
            <div className="flex justify-center gap-2 mt-4">
              {gameState.dealerHiddenCard && gameState.dealerHand.length > 0 ? (
                <>
                  <Card card={gameState.dealerHand[0]} />
                  <Card hidden />
                </>
              ) : (
                gameState.dealerHand.map((card, i) => <Card key={i} card={card} />)
              )}
              {gameState.dealerHand.length === 0 && <div className="text-gray-400">Waiting...</div>}
            </div>
            {gameState.dealerHand.length > 0 && !gameState.dealerHiddenCard && (
              <p className="text-white mt-2 font-bold">{calculateHand(gameState.dealerHand)}</p>
            )}
          </div>

          <div className="text-center my-8">
            <div className="inline-block bg-amber-900 rounded-full px-6 py-2 text-white font-bold">
              Pot: {gameState.pot}
            </div>
            {myBet > 0 && <div className="text-white mt-2">Your Bet: {myBet}</div>}
          </div>

          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold text-white">Your Hand</h2>
            <div className="flex justify-center gap-2 mt-4">
              {myHand.map((card, i) => (
                <Card key={i} card={card} />
              ))}
              {myHand.length === 0 && <div className="text-gray-400">Place your bet</div>}
            </div>
            {myHand.length > 0 && (
              <p className="text-white mt-2 font-bold text-xl">{calculateHand(myHand)}</p>
            )}
          </div>

          <div className="text-center">
            {phase === 'betting' && myBet === 0 && (
              <div className="space-y-4">
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
                <button
                  onClick={handleBet}
                  disabled={betAmount > myPlayer.balance}
                  className="btn-primary"
                >
                  Place Bet
                </button>
              </div>
            )}

            {phase === 'playing' && gameStore.isMyTurn && (
              <div className="flex justify-center gap-4">
                <button onClick={() => handleAction('hit')} className="btn-primary">
                  Hit
                </button>
                <button onClick={() => handleAction('stand')} className="btn-secondary">
                  Stand
                </button>
                {gameStore.validActions.includes('double') && (
                  <button onClick={() => handleAction('double')} className="btn-secondary">
                    Double
                  </button>
                )}
              </div>
            )}

            {phase === 'playing' && !gameStore.isMyTurn && (
              <p className="text-gray-400">Waiting for your turn...</p>
            )}

            {phase === 'dealer-turn' && <p className="text-white text-xl">Dealer is playing...</p>}

            {phase === 'showdown' && <p className="text-white text-xl">Calculating results...</p>}

            {phase === 'finished' && (
              <div className="space-y-4">
                <p className="text-xl font-bold text-white">Game Over</p>
                <button
                  onClick={() => {
                    gameStore.setGameState(null);
                    navigate(`/room/${roomId}`);
                  }}
                  className="btn-primary"
                >
                  Back to Room
                </button>
              </div>
            )}
          </div>
        </div>

        {(gameStore.gameState?.players || []).length > 1 && (
          <div className="mt-8 bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Other Players</h3>
            <div className="flex gap-4 justify-center flex-wrap">
              {(gameStore.gameState?.players || [])
                .filter((p) => p.id !== user?.id)
                .map((player) => (
                  <div key={player.id} className="bg-gray-700 rounded-lg p-4 text-center">
                    <p className="text-white font-semibold">{player.username}</p>
                    <p className="text-gray-400 text-sm">💰 {player.balance.toLocaleString()}</p>
                    <div className="flex justify-center gap-1 mt-2">
                      {player.hand.map((card, i) => (
                        <div
                          key={i}
                          className="w-10 h-14 bg-white rounded text-xs flex items-center justify-center"
                        >
                          {card.rank}
                        </div>
                      ))}
                    </div>
                    {player.isFolded && <p className="text-red-400 text-sm">Bust</p>}
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>
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
