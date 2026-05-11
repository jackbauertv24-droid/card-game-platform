import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './service';
import db from '../db';

declare global {
  namespace Express {
    interface Request {
      user?: import('shared').User;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as
    | import('shared').User
    | undefined;
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  req.user = user;
  next();
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return next();
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as
    | import('shared').User
    | undefined;
  if (user) {
    req.user = user;
  }

  next();
}
