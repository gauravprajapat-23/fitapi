import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
}

export function rateLimit(opts: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    cleanup();

    const userId = (req as any).user?.userId;
    if (!userId) {
      next();
      return;
    }

    const key = `${opts.keyPrefix}:${userId}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    entry.count++;

    if (entry.count > opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        error: opts.message || 'Too many requests. Please try again later.',
        retryAfter,
      });
      return;
    }

    next();
  };
}

export const activitySessionRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyPrefix: 'act-session',
  message: 'Too many activity sessions. Maximum 10 per hour.',
});

export const goalCompleteRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  keyPrefix: 'goal-complete',
  message: 'Too many completion requests. Maximum 5 per day.',
});

export const challengeCompleteRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  keyPrefix: 'ch-complete',
  message: 'Too many challenge completion requests. Maximum 3 per day.',
});

const CRON_SECRET = process.env.CRON_SECRET || 'fitstake-cron-secret-change-me';

export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-cron-secret'];
  if (header !== CRON_SECRET) {
    res.status(403).json({ error: 'Forbidden: invalid cron secret' });
    return;
  }
  next();
}
