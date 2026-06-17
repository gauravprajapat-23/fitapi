import { Request, Response, NextFunction } from 'express';

const isDev = process.env.NODE_ENV !== 'production';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (!isDev) {
    next();
    return;
  }

  const start = Date.now();
  const { method, url } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 400 ? 'ERR' : status >= 300 ? 'WARN' : 'OK ';
    console.log(`[HTTP] ${level} ${method} ${url} → ${status} (${duration}ms)`);
    if (status >= 400 && req.body && Object.keys(req.body).length > 0) {
      const sanitized = { ...req.body };
      if (sanitized.password) sanitized.password = '***';
      if (sanitized.passwordHash) sanitized.passwordHash = '***';
      console.log(`[HTTP]   Body:`, JSON.stringify(sanitized).slice(0, 500));
    }
  });

  next();
}
