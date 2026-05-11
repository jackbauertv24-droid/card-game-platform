import { Request, Response, NextFunction } from 'express';

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 100;
const WINDOW_MS = 60 * 1000;

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || 'unknown';
  const now = Date.now();

  const entry = rateLimits.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  if (entry.count >= LIMIT) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  entry.count++;
  next();
}
