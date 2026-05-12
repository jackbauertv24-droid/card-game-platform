import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware';
import db from '../db';
import { createRoomSchema } from 'shared';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', authMiddleware, (req: Request, res: Response) => {
  const gameType = req.query.gameType as string | undefined;
  const includePlaying = req.query.includePlaying === 'true';

  let query = 'SELECT * FROM rooms WHERE status IN (?, ?) ORDER BY created_at DESC';
  let statuses: string[] = ['waiting'];
  if (includePlaying) {
    statuses = ['waiting', 'playing'];
  } else {
    query = 'SELECT * FROM rooms WHERE status = ? ORDER BY created_at DESC';
  }

  const dbRooms = db.prepare(query).all(...statuses) as {
    id: string;
    name: string;
    game_type: string;
    created_by: string;
    min_bet: number;
    max_players: number;
    status: string;
    created_at: string;
  }[];

  const rooms: import('shared').RoomPreview[] = dbRooms
    .filter((r) => !gameType || r.game_type === gameType)
    .map((r) => {
      const playerCount = db
        .prepare('SELECT COUNT(*) as count FROM room_players WHERE room_id = ? AND status = ?')
        .get(r.id, 'connected') as { count: number };
      const observerCount = db
        .prepare('SELECT COUNT(*) as count FROM room_observers WHERE room_id = ?')
        .get(r.id) as { count: number };

      return {
        id: r.id,
        name: r.name,
        gameType: r.game_type as import('shared').GameType,
        status: r.status,
        playerCount: playerCount.count,
        observerCount: observerCount.count,
        minBet: r.min_bet,
        maxPlayers: r.max_players,
        canJoin: playerCount.count < r.max_players && r.status === 'waiting',
        canObserve: true,
        createdAt: r.created_at,
      };
    });

  res.json({ rooms });
});

router.post('/', authMiddleware, (req: Request, res: Response) => {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid input' });
  }

  const existingRoom = db
    .prepare(
      `SELECT r.id FROM rooms r
       JOIN room_players rp ON r.id = rp.room_id
       WHERE rp.user_id = ? AND r.status IN ('waiting', 'playing')`
    )
    .get(req.user!.id) as { id: string } | undefined;

  const existingObserver = db
    .prepare(
      `SELECT r.id FROM rooms r
       JOIN room_observers ro ON r.id = ro.room_id
       WHERE ro.user_id = ? AND r.status IN ('waiting', 'playing')`
    )
    .get(req.user!.id) as { id: string } | undefined;

  if (existingRoom || existingObserver) {
    return res.status(400).json({ error: 'You are already in a room' });
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO rooms (id, name, game_type, created_by, min_bet, max_players, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    parsed.data.name,
    parsed.data.gameType,
    req.user!.id,
    parsed.data.minBet,
    parsed.data.maxPlayers,
    'waiting',
    now
  );

  db.prepare('INSERT INTO room_observers (room_id, user_id, joined_at) VALUES (?, ?, ?)').run(
    id,
    req.user!.id,
    now
  );

  const room: import('shared').RoomDetail = {
    id,
    name: parsed.data.name,
    gameType: parsed.data.gameType,
    createdBy: req.user!.id,
    minBet: parsed.data.minBet,
    maxPlayers: parsed.data.maxPlayers,
    status: 'waiting',
    createdAt: now,
    playerCount: 0,
    observerCount: 1,
    players: [],
    observers: [{ id: req.user!.id, username: req.user!.username, joinedAt: now }],
    emptySeats: Array.from({ length: parsed.data.maxPlayers }, (_, i) => i),
  };

  res.status(201).json({ room, asObserver: true });
});

router.get('/:id', authMiddleware, (req: Request, res: Response) => {
  const dbRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id) as
    | {
        id: string;
        name: string;
        game_type: string;
        created_by: string;
        min_bet: number;
        max_players: number;
        status: string;
        created_at: string;
      }
    | undefined;

  if (!dbRoom) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const dbPlayers = db
    .prepare(
      'SELECT rp.*, u.username, u.balance FROM room_players rp JOIN users u ON rp.user_id = u.id WHERE rp.room_id = ? AND rp.is_player = 1 ORDER BY rp.seat_index'
    )
    .all(dbRoom.id) as {
    user_id: string;
    seat_index: number;
    is_ready: number;
    status: string;
    joined_at: string;
    username: string;
    balance: number;
  }[];

  const dbObservers = db
    .prepare(
      'SELECT ro.*, u.username FROM room_observers ro JOIN users u ON ro.user_id = u.id WHERE ro.room_id = ? ORDER BY ro.joined_at'
    )
    .all(dbRoom.id) as {
    user_id: string;
    joined_at: string;
    username: string;
  }[];

  const players: import('shared').SeatedPlayer[] = dbPlayers.map((p) => ({
    id: p.user_id,
    username: p.username,
    balance: p.balance,
    seatIndex: p.seat_index,
    isReady: p.is_ready === 1,
    isFolded: false,
    isAllIn: false,
    currentBet: 0,
    hand: [],
    status: p.status,
    joinedAt: p.joined_at,
  }));

  const observers: import('shared').Observer[] = dbObservers.map((o) => ({
    id: o.user_id,
    username: o.username,
    joinedAt: o.joined_at,
  }));

  const occupiedSeats = players.map((p) => p.seatIndex);
  const emptySeats = Array.from({ length: dbRoom.max_players }, (_, i) => i).filter(
    (i) => !occupiedSeats.includes(i)
  );

  const room: import('shared').RoomDetail = {
    id: dbRoom.id,
    name: dbRoom.name,
    gameType: dbRoom.game_type,
    createdBy: dbRoom.created_by,
    minBet: dbRoom.min_bet,
    maxPlayers: dbRoom.max_players,
    status: dbRoom.status,
    createdAt: dbRoom.created_at,
    playerCount: players.length,
    observerCount: observers.length,
    players,
    observers,
    emptySeats,
  };

  const gameStateRow = db
    .prepare(
      'SELECT state FROM games WHERE room_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
    )
    .get(dbRoom.id) as { state: string } | undefined;

  let gameState: import('shared').GameState | undefined;
  if (gameStateRow) {
    gameState = JSON.parse(gameStateRow.state);
  }

  res.json({ room, gameState });
});

router.post('/:id/join', authMiddleware, (req: Request, res: Response) => {
  const { asObserver } = req.body;

  const dbRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id) as
    | {
        id: string;
        name: string;
        game_type: string;
        created_by: string;
        min_bet: number;
        max_players: number;
        status: string;
        created_at: string;
      }
    | undefined;

  if (!dbRoom) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const existingRoom = db
    .prepare(
      `SELECT r.id FROM rooms r
       JOIN room_players rp ON r.id = rp.room_id
       WHERE rp.user_id = ? AND r.status IN ('waiting', 'playing')`
    )
    .get(req.user!.id) as { id: string } | undefined;

  const existingObserver = db
    .prepare(
      `SELECT r.id FROM rooms r
       JOIN room_observers ro ON r.id = ro.room_id
       WHERE ro.user_id = ? AND r.status IN ('waiting', 'playing')`
    )
    .get(req.user!.id) as { id: string } | undefined;

  if (existingRoom || existingObserver) {
    return res.status(400).json({ error: 'You are already in a room' });
  }

  const now = new Date().toISOString();
  const shouldBeObserver = asObserver || dbRoom.status === 'playing';

  if (shouldBeObserver) {
    db.prepare('INSERT INTO room_observers (room_id, user_id, joined_at) VALUES (?, ?, ?)').run(
      dbRoom.id,
      req.user!.id,
      now
    );
  }

  const dbPlayers = db
    .prepare(
      'SELECT rp.*, u.username, u.balance FROM room_players rp JOIN users u ON rp.user_id = u.id WHERE rp.room_id = ? AND rp.is_player = 1 ORDER BY rp.seat_index'
    )
    .all(dbRoom.id) as {
    user_id: string;
    seat_index: number;
    is_ready: number;
    status: string;
    joined_at: string;
    username: string;
    balance: number;
  }[];

  const dbObservers = db
    .prepare(
      'SELECT ro.*, u.username FROM room_observers ro JOIN users u ON ro.user_id = u.id WHERE ro.room_id = ? ORDER BY ro.joined_at'
    )
    .all(dbRoom.id) as {
    user_id: string;
    joined_at: string;
    username: string;
  }[];

  const players: import('shared').SeatedPlayer[] = dbPlayers.map((p) => ({
    id: p.user_id,
    username: p.username,
    balance: p.balance,
    seatIndex: p.seat_index,
    isReady: p.is_ready === 1,
    isFolded: false,
    isAllIn: false,
    currentBet: 0,
    hand: [],
    status: p.status,
    joinedAt: p.joined_at,
  }));

  const observers: import('shared').Observer[] = dbObservers.map((o) => ({
    id: o.user_id,
    username: o.username,
    joinedAt: o.joined_at,
  }));

  const occupiedSeats = players.map((p) => p.seatIndex);
  const emptySeats = Array.from({ length: dbRoom.max_players }, (_, i) => i).filter(
    (i) => !occupiedSeats.includes(i)
  );

  const room: import('shared').RoomDetail = {
    id: dbRoom.id,
    name: dbRoom.name,
    gameType: dbRoom.game_type,
    createdBy: dbRoom.created_by,
    minBet: dbRoom.min_bet,
    maxPlayers: dbRoom.max_players,
    status: dbRoom.status,
    createdAt: dbRoom.created_at,
    playerCount: players.length,
    observerCount: observers.length,
    players,
    observers,
    emptySeats,
  };

  const gameStateRow = db
    .prepare(
      'SELECT state FROM games WHERE room_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
    )
    .get(dbRoom.id) as { state: string } | undefined;

  let gameState: import('shared').GameState | undefined;
  if (gameStateRow) {
    gameState = JSON.parse(gameStateRow.state);
  }

  res.json({ room, gameState, asObserver: shouldBeObserver });
});

router.post('/:id/sit-down', authMiddleware, (req: Request, res: Response) => {
  const { seatIndex } = req.body;

  if (typeof seatIndex !== 'number' || seatIndex < 0) {
    return res.status(400).json({ error: 'Invalid seat index' });
  }

  const dbRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id) as
    | {
        id: string;
        name: string;
        game_type: string;
        created_by: string;
        min_bet: number;
        max_players: number;
        status: string;
        created_at: string;
      }
    | undefined;

  if (!dbRoom) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (seatIndex >= dbRoom.max_players) {
    return res.status(400).json({ error: 'Seat index out of range' });
  }

  if (dbRoom.status === 'playing') {
    return res.status(400).json({ error: 'Game in progress' });
  }

  const existingPlayer = db
    .prepare('SELECT * FROM room_players WHERE room_id = ? AND user_id = ? AND is_player = 1')
    .get(dbRoom.id, req.user!.id);

  if (existingPlayer) {
    return res.status(400).json({ error: 'You are already a player' });
  }

  const seatOccupied = db
    .prepare('SELECT * FROM room_players WHERE room_id = ? AND seat_index = ? AND is_player = 1')
    .get(dbRoom.id, seatIndex);

  if (seatOccupied) {
    return res.status(400).json({ error: 'Seat is occupied' });
  }

  db.prepare('DELETE FROM room_observers WHERE room_id = ? AND user_id = ?').run(
    dbRoom.id,
    req.user!.id
  );

  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO room_players (room_id, user_id, seat_index, is_ready, is_player, status, joined_at) VALUES (?, ?, ?, 0, 1, ?, ?)'
  ).run(dbRoom.id, req.user!.id, seatIndex, 'connected', now);

  const dbPlayers = db
    .prepare(
      'SELECT rp.*, u.username, u.balance FROM room_players rp JOIN users u ON rp.user_id = u.id WHERE rp.room_id = ? AND rp.is_player = 1 ORDER BY rp.seat_index'
    )
    .all(dbRoom.id) as {
    user_id: string;
    seat_index: number;
    is_ready: number;
    status: string;
    joined_at: string;
    username: string;
    balance: number;
  }[];

  const dbObservers = db
    .prepare(
      'SELECT ro.*, u.username FROM room_observers ro JOIN users u ON ro.user_id = u.id WHERE ro.room_id = ? ORDER BY ro.joined_at'
    )
    .all(dbRoom.id) as {
    user_id: string;
    joined_at: string;
    username: string;
  }[];

  const players: import('shared').SeatedPlayer[] = dbPlayers.map((p) => ({
    id: p.user_id,
    username: p.username,
    balance: p.balance,
    seatIndex: p.seat_index,
    isReady: p.is_ready === 1,
    isFolded: false,
    isAllIn: false,
    currentBet: 0,
    hand: [],
    status: p.status,
    joinedAt: p.joined_at,
  }));

  const observers: import('shared').Observer[] = dbObservers.map((o) => ({
    id: o.user_id,
    username: o.username,
    joinedAt: o.joined_at,
  }));

  const occupiedSeats = players.map((p) => p.seatIndex);
  const emptySeats = Array.from({ length: dbRoom.max_players }, (_, i) => i).filter(
    (i) => !occupiedSeats.includes(i)
  );

  const room: import('shared').RoomDetail = {
    id: dbRoom.id,
    name: dbRoom.name,
    gameType: dbRoom.game_type as import('shared').GameType,
    createdBy: dbRoom.created_by,
    minBet: dbRoom.min_bet,
    maxPlayers: dbRoom.max_players,
    status: dbRoom.status,
    createdAt: dbRoom.created_at,
    playerCount: players.length,
    observerCount: observers.length,
    players,
    observers,
    emptySeats,
  };

  res.json({
    success: true,
    seatIndex,
    room,
  });
});

router.post('/:id/stand-up', authMiddleware, (req: Request, res: Response) => {
  const dbRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id) as
    | {
        id: string;
        status: string;
        max_players: number;
      }
    | undefined;

  if (!dbRoom) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (dbRoom.status === 'playing') {
    return res.status(400).json({ error: 'Game in progress, cannot stand up' });
  }

  const player = db
    .prepare('SELECT * FROM room_players WHERE room_id = ? AND user_id = ? AND is_player = 1')
    .get(dbRoom.id, req.user!.id) as
    | {
        seat_index: number;
      }
    | undefined;

  if (!player) {
    return res.status(400).json({ error: 'You are not a seated player' });
  }

  db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(
    dbRoom.id,
    req.user!.id
  );

  const now = new Date().toISOString();
  db.prepare('INSERT INTO room_observers (room_id, user_id, joined_at) VALUES (?, ?, ?)').run(
    dbRoom.id,
    req.user!.id,
    now
  );

  const dbPlayers = db
    .prepare(
      'SELECT rp.*, u.username, u.balance FROM room_players rp JOIN users u ON rp.user_id = u.id WHERE rp.room_id = ? AND rp.is_player = 1 ORDER BY rp.seat_index'
    )
    .all(dbRoom.id) as {
    user_id: string;
    seat_index: number;
    is_ready: number;
    status: string;
    joined_at: string;
    username: string;
    balance: number;
  }[];

  const dbObservers = db
    .prepare(
      'SELECT ro.*, u.username FROM room_observers ro JOIN users u ON ro.user_id = u.id WHERE ro.room_id = ? ORDER BY ro.joined_at'
    )
    .all(dbRoom.id) as {
    user_id: string;
    joined_at: string;
    username: string;
  }[];

  const players: import('shared').SeatedPlayer[] = dbPlayers.map((p) => ({
    id: p.user_id,
    username: p.username,
    balance: p.balance,
    seatIndex: p.seat_index,
    isReady: p.is_ready === 1,
    isFolded: false,
    isAllIn: false,
    currentBet: 0,
    hand: [],
    status: p.status,
    joinedAt: p.joined_at,
  }));

  const observers: import('shared').Observer[] = dbObservers.map((o) => ({
    id: o.user_id,
    username: o.username,
    joinedAt: o.joined_at,
  }));

  const occupiedSeats = players.map((p) => p.seatIndex);
  const emptySeats = Array.from({ length: dbRoom.max_players }, (_, i) => i).filter(
    (i) => !occupiedSeats.includes(i)
  );

  res.json({
    success: true,
    seatIndex: player.seat_index,
    room: {
      id: dbRoom.id,
      playerCount: players.length,
      observerCount: observers.length,
      players,
      observers,
      emptySeats,
    },
  });
});

router.post('/:id/leave', authMiddleware, (req: Request, res: Response) => {
  const dbRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id) as
    | {
        id: string;
        created_by: string;
        status: string;
      }
    | undefined;

  if (!dbRoom) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const player = db
    .prepare('SELECT * FROM room_players WHERE room_id = ? AND user_id = ?')
    .get(dbRoom.id, req.user!.id);
  const observer = db
    .prepare('SELECT * FROM room_observers WHERE room_id = ? AND user_id = ?')
    .get(dbRoom.id, req.user!.id);

  if (!player && !observer) {
    return res.status(400).json({ error: 'You are not in this room' });
  }

  if (player && dbRoom.status === 'playing') {
    db.prepare('UPDATE room_players SET status = ? WHERE room_id = ? AND user_id = ?').run(
      'disconnected',
      dbRoom.id,
      req.user!.id
    );
    return res.json({ success: true, markedDisconnected: true });
  }

  if (player) {
    db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(
      dbRoom.id,
      req.user!.id
    );
  }

  if (observer) {
    db.prepare('DELETE FROM room_observers WHERE room_id = ? AND user_id = ?').run(
      dbRoom.id,
      req.user!.id
    );
  }

  const remainingPlayers = db
    .prepare('SELECT COUNT(*) as count FROM room_players WHERE room_id = ?')
    .get(dbRoom.id) as { count: number };
  const remainingObservers = db
    .prepare('SELECT COUNT(*) as count FROM room_observers WHERE room_id = ?')
    .get(dbRoom.id) as { count: number };

  if (remainingPlayers.count === 0 && remainingObservers.count === 0) {
    db.prepare('DELETE FROM rooms WHERE id = ?').run(dbRoom.id);
  } else if (dbRoom.created_by === req.user!.id && remainingPlayers.count > 0) {
    const newOwner = db
      .prepare('SELECT user_id FROM room_players WHERE room_id = ? ORDER BY seat_index LIMIT 1')
      .get(dbRoom.id) as { user_id: string } | undefined;
    if (newOwner) {
      db.prepare('UPDATE rooms SET created_by = ? WHERE id = ?').run(newOwner.user_id, dbRoom.id);
    }
  }

  res.json({ success: true });
});

export default router;
