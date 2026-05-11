import { Router, Request, Response } from 'express';
import { register, login, createInviteCodes } from './service';
import { authMiddleware } from './middleware';
import { registerSchema, loginSchema } from 'shared';
import db from '../db';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid input' });
  }

  const result = await register(parsed.data);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.status(201).json({ user: result.user, token: result.token });
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid input' });
  }

  const result = await login(parsed.data);
  if (result.error) {
    return res.status(401).json({ error: result.error });
  }

  res.json({ user: result.user, token: result.token });
});

router.post('/logout', authMiddleware, (req: Request, res: Response) => {
  res.json({ success: true });
});

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

router.post('/invite-codes', authMiddleware, (req: Request, res: Response) => {
  const count = Math.min(parseInt(req.body.count as string) || 1, 10);

  const existingCodes = db
    .prepare('SELECT COUNT(*) as count FROM invite_codes WHERE created_by = ?')
    .get(req.user!.id) as { count: number };
  if (existingCodes.count >= 5) {
    return res.status(400).json({ error: 'Maximum invite codes reached (5)' });
  }

  const codes = createInviteCodes(count, req.user!.id);
  res.json({ codes });
});

router.get('/invite-codes', authMiddleware, (req: Request, res: Response) => {
  const codes = db
    .prepare('SELECT * FROM invite_codes WHERE created_by = ?')
    .all(req.user!.id) as import('shared').InviteCode[];
  res.json({ codes });
});

export default router;
