import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

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
import userRoutes from './routes/user';

app.use('/api/auth', authRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/streak', streakRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/user', userRoutes);

app.listen(PORT, () => {
  console.log(`FitStake API running on port ${PORT}`);
});
