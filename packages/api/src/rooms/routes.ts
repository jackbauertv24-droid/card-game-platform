import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware';
import db from '../db';
import { createRoomSchema } from 'shared';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', authMiddleware, (req: Request, res: Response) => {
  const gameType = req.query.gameType as string | undefined;
  const status = req.query.status as string | undefined;

  let rooms: import('shared').Room[];
  if (status) {
    rooms = db
      .prepare('SELECT * FROM rooms WHERE status = ? ORDER BY created_at DESC')
      .all(status) as import('shared').Room[];
  } else {
    rooms = db
      .prepare('SELECT * FROM rooms ORDER BY created_at DESC')
      .all() as import('shared').Room[];
  }

  if (gameType) {
    rooms = rooms.filter((r) => r.gameType === gameType);
  }

  res.json({ rooms });
});

router.post('/', authMiddleware, (req: Request, res: Response) => {
  const parsed = createRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid input' });
  }

  const id = uuidv4();
  const room: import('shared').Room = {
    id,
    name: parsed.data.name,
    gameType: parsed.data.gameType,
    createdBy: req.user!.id,
    minBet: parsed.data.minBet,
    maxPlayers: parsed.data.maxPlayers,
    status: 'waiting',
    playerCount: 0,
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    `
    INSERT INTO rooms (id, name, game_type, created_by, min_bet, max_players, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(id, room.name, room.gameType, room.createdBy, room.minBet, room.maxPlayers, room.status);

  res.json({ room });
});

router.get('/:id', authMiddleware, (req: Request, res: Response) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id) as
    | import('shared').Room
    | undefined;
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  res.json({ room });
});

export default router;
