import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';
import { requestLogger } from './middleware/requestLogger';

export const prisma = new PrismaClient();

// Allow JSON serialization of BigInt (Prisma returns BigInt for @db.BigInt fields)
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
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
app.use('/api/admin', adminRoutes);
app.use('/api/streak', streakRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/user', userRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/wearables', wearableRoutes);
app.use('/api/disputes', disputeRoutes);

// Use the parsed number in your listen call
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

