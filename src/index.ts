import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { requestLogger } from './middleware/requestLogger';

export const prisma = new PrismaClient();

// Allow JSON serialization of BigInt (Prisma returns BigInt for @db.BigInt fields)
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Security headers
app.use(helmet());

// CORS — allow configured origins in production, all in development
const allowedOrigins = (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean);
app.use(cors({
  origin: isProduction && allowedOrigins.length > 0 ? allowedOrigins : true,
  credentials: true,
}));

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later' },
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Webhook rate limit exceeded' },
});

app.use('/api/', globalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/wallet/razorpay-webhook', webhookLimiter);

// Store raw body for Razorpay webhook signature verification
app.use('/api/wallet/razorpay-webhook', (req, _res, next) => {
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => {
    (req as any).rawBody = data;
    try {
      req.body = JSON.parse(data);
    } catch {
      req.body = {};
    }
    next();
  });
});

app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
import authRoutes from './routes/auth';
import goalsRoutes from './routes/goals';
import walletRoutes from './routes/wallet';
import challengeRoutes from './routes/challenges';
import socialRoutes from './routes/social';
import notificationRoutes from './routes/notifications';
import notificationCronRoutes from './routes/notificationCron';
import adminRoutes from './routes/admin';
import streakRoutes from './routes/streak';
import achievementsRoutes from './routes/achievements';
import leaderboardRoutes from './routes/leaderboard';
import subscriptionRoutes from './routes/subscription';
import userRoutes from './routes/user';
import deviceRoutes from './routes/devices';
import wearableRoutes from './routes/wearables';
import disputeRoutes from './routes/disputes';

app.use('/api/auth', authRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notifications', notificationCronRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/streak', streakRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/user', userRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/wearables', wearableRoutes);
app.use('/api/disputes', disputeRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} (${isProduction ? 'production' : 'development'})`);
});
