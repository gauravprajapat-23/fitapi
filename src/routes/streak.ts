import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { useShieldRestoreSchema } from '../validators';

const router = Router();

// GET /api/streak
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const streaks = await prisma.streak.findMany({
      where: { userId },
      include: { goal: { select: { id: true, title: true, activityType: true } } },
      orderBy: { currentStreak: 'desc' },
    });

    const bestStreakOverall = streaks.reduce((max, s) => Math.max(max, s.bestStreak), 0);
    const totalDaysCompleted = streaks.reduce((sum, s) => sum + s.totalDaysCompleted, 0);

    const activeGoal = streaks.find(s => s.goal && s.currentStreak > 0);

    const subscription = await prisma.streakShieldSubscription.findFirst({
      where: { userId, status: { in: ['active', 'trialing'] } },
      orderBy: { currentPeriodEnd: 'desc' },
    });

    const shieldRestoresLimit = subscription?.restoresPerMonth ?? 0;
    const shieldRestoresUsed = activeGoal?.shieldRestoresUsed ?? 0;

    res.json({
      streak: {
        currentStreak: activeGoal?.currentStreak ?? 0,
        bestStreak: bestStreakOverall,
        totalDaysCompleted,
        lastActivityDate: activeGoal?.lastActivityDate,
        shieldRestoresLimit,
        shieldRestoresUsed,
        activeGoal: activeGoal?.goal ?? null,
      },
      goalStreaks: streaks.map(s => ({
        goalId: s.goalId,
        goalTitle: s.goal?.title,
        activityType: s.goal?.activityType,
        currentStreak: s.currentStreak,
        bestStreak: s.bestStreak,
        totalDaysCompleted: s.totalDaysCompleted,
        lastActivityDate: s.lastActivityDate,
      })),
    });
  } catch (err) {
    console.error('Streak get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/streak/restore
router.post('/restore', authenticate, validate(useShieldRestoreSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { goalId, date } = req.body;

    const subscription = await prisma.streakShieldSubscription.findFirst({
      where: { userId, status: { in: ['active', 'trialing'] } },
    });

    if (!subscription) {
      return res.status(400).json({ error: 'No active shield subscription' });
    }

    const streak = goalId
      ? await prisma.streak.findUnique({ where: { userId_goalId: { userId, goalId } } })
      : await prisma.streak.findFirst({
          where: { userId, currentStreak: { gt: 0 } },
          orderBy: { currentStreak: 'desc' },
        });

    if (!streak) {
      return res.status(400).json({ error: 'No active streak found' });
    }

    if (streak.shieldRestoresUsed >= streak.shieldRestoresLimit) {
      return res.status(400).json({ error: 'No shield restores available for this goal' });
    }

    const restoreDate = date ? new Date(date) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      const log = await tx.dailyTaskLog.create({
        data: {
          goalId: streak.goalId!,
          userId,
          taskDate: restoreDate,
          status: 'shielded',
        },
      });

      await tx.streak.update({
        where: { id: streak.id },
        data: { shieldRestoresUsed: { increment: 1 } },
      });

      return log;
    });

    res.status(201).json({ message: 'Streak restored', log: result });
  } catch (err) {
    console.error('Streak restore error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
