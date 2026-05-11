import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/middleware';
import db from '../db';

const router = Router();

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

router.get('/me/balance', authMiddleware, (req: Request, res: Response) => {
  res.json({ balance: req.user!.balance });
});

export default router;
