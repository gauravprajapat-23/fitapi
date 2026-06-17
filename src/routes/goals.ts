import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createGoalSchema, completeTaskSchema, shieldDaySchema, updateGoalSchema, forfeitGoalSchema, createActivitySessionSchema } from '../validators';
import { validateActivitySession, validatePhotoExif } from '../lib/antiSpoof';
import { activitySessionRateLimit, goalCompleteRateLimit } from '../middleware/rateLimit';

const router = Router();

// GET /api/goals
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const goals = await prisma.goal.findMany({
      where: { userId: req.user!.userId, deletedAt: null, status: { not: 'expired' } },
      orderBy: { createdAt: 'desc' },
      include: {
        dailyLogs: { orderBy: { taskDate: 'desc' } },
        streak: true,
      },
    });

    const goalsWithCount = await Promise.all(goals.map(async (g) => {
      const completedDays = await prisma.dailyTaskLog.count({
        where: { goalId: g.id, status: 'completed' },
      });
      return { ...g, completedDays };
    }));

    res.json({ goals: goalsWithCount });
  } catch (err) {
    console.error('Goals list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/goals/activity-sessions (MUST be before /:id to avoid route collision)
router.get('/activity-sessions', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const goalId = req.query.goalId as string | undefined;

    const where: Record<string, unknown> = { userId };
    if (goalId) where.goalId = goalId;

    const sessions = await prisma.activitySession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: {
        routePoints: { orderBy: { pointIndex: 'asc' } },
      },
    });

    res.json({ sessions });
  } catch (err) {
    console.error('Activity sessions list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/goals/activity-sessions (MUST be before /:id to avoid route collision)
router.post('/activity-sessions', authenticate, activitySessionRateLimit, validate(createActivitySessionSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { goalId, activityType, startedAt, endedAt, durationSeconds, distanceMeters, steps, caloriesBurned, avgPaceSecsPerKm, gpsAccuracyMeters, routePoints, photoUrl, photoExifData } = req.body;

    let goalActivityType: string | undefined;
    let goalStartDate: string | undefined;
    let goalEndDate: string | undefined;
    if (goalId) {
      const goal = await prisma.goal.findFirst({ where: { id: goalId, userId, deletedAt: null } });
      if (goal) {
        goalActivityType = goal.activityType;
        goalStartDate = goal.startDate.toISOString();
        goalEndDate = goal.endDate.toISOString();
      }
    }

    const sessionStart = new Date(startedAt).getTime();
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recentDuplicate = await prisma.activitySession.findFirst({
      where: {
        userId,
        startedAt: { gte: new Date(fiveMinAgo) },
        durationSeconds,
      },
    });
    if (recentDuplicate) {
      return res.status(409).json({ error: 'Duplicate session detected' });
    }

    const antiSpoof = validateActivitySession({
      activityType,
      startedAt,
      endedAt,
      durationSeconds,
      distanceMeters,
      routePoints,
      goalActivityType,
      goalStartDate,
      goalEndDate,
    });

    if (!antiSpoof.passed) {
      return res.status(400).json({
        error: 'Activity session failed validation',
        flags: antiSpoof.flags,
        score: antiSpoof.score,
      });
    }

    let photoResult: { passed: boolean; flags: string[]; score: number } | undefined;
    if (photoExifData || photoUrl) {
      photoResult = validatePhotoExif({
        photoExifData: photoExifData as Record<string, unknown> | undefined,
        sessionStartedAt: startedAt,
        sessionEndedAt: endedAt,
      });
      if (!photoResult.passed) {
        return res.status(400).json({
          error: 'Photo verification failed',
          flags: photoResult.flags,
          score: photoResult.score,
        });
      }
    }

    const combinedFlags = [...antiSpoof.flags, ...(photoResult?.flags ?? [])];
    const combinedScore = antiSpoof.score + (photoResult?.score ?? 0);
    const combinedPassed = combinedScore < 30;

    const session = await prisma.$transaction(async (tx) => {
      const s = await tx.activitySession.create({
        data: {
          userId,
          goalId,
          source: 'gps_app',
          activityType,
          startedAt: new Date(startedAt),
          endedAt: new Date(endedAt),
          durationSeconds,
          distanceMeters,
          steps,
          caloriesBurned,
          avgPaceSecsPerKm,
          gpsAccuracyMeters,
          photoUrl: photoUrl ?? null,
          photoExifData: photoExifData ?? null,
          verificationStatus: combinedPassed ? 'passed' : 'pending',
          antiSpoofPassed: combinedPassed,
          antiSpoofFlags: combinedFlags,
        },
      });

      if (routePoints?.length) {
        await tx.routePoint.createMany({
          data: routePoints.map((p: { latitude: number; longitude: number; altitudeMeters?: number; speedMps?: number; accuracyMeters?: number; recordedAt: string }, i: number) => ({
            sessionId: s.id,
            pointIndex: i,
            latitude: p.latitude,
            longitude: p.longitude,
            altitudeMeters: p.altitudeMeters,
            speedMps: p.speedMps,
            accuracyMeters: p.accuracyMeters,
            recordedAt: new Date(p.recordedAt),
          })),
        });
      }

      return s;
    });

    res.status(201).json({ session, antiSpoof: { passed: combinedPassed, score: combinedScore } });
  } catch (err) {
    console.error('Activity session create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/goals/:id
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const goal = await prisma.goal.findFirst({
      where: { id: req.params.id as string, userId: req.user!.userId, deletedAt: null },
      include: {
        dailyLogs: { orderBy: { taskDate: 'desc' } },
        streak: true,
      },
    });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const completedDays = await prisma.dailyTaskLog.count({
      where: { goalId: goal.id, status: 'completed' },
    });

    res.json({
      goal: {
        ...goal,
        completedDays,
      },
    });
  } catch (err) {
    console.error('Goal get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/goals/:id
router.patch('/:id', authenticate, validate(updateGoalSchema), async (req: Request, res: Response) => {
  try {
    const goal = await prisma.goal.findFirst({
      where: { id: req.params.id as string, userId: req.user!.userId, deletedAt: null },
    });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const updated = await prisma.goal.update({
      where: { id: goal.id },
      data: req.body,
      include: {
        dailyLogs: { orderBy: { taskDate: 'desc' } },
        streak: true,
      },
    });

    res.json({
      goal: {
        ...updated,
        completedDays: updated.dailyLogs.filter(l => l.status === 'completed').length,
      },
    });
  } catch (err) {
    console.error('Goal update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/goals
router.post('/', authenticate, validate(createGoalSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = req.body;

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.availableBalance < data.stakeAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const startDate = new Date(data.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + data.durationDays - 1);

    const dailyEarnback = Math.round((data.stakeAmount / data.durationDays) * data.earnbackRate * 100) / 100;

    const goal = await prisma.$transaction(async (tx) => {
      const g = await tx.goal.create({
        data: {
          userId,
          activityType: data.activityType,
          title: data.title,
          taskDescription: data.taskDescription,
          targetValue: data.targetValue,
          targetUnit: data.targetUnit,
          verificationMethod: data.verificationMethod,
          earnbackRate: data.earnbackRate,
          durationDays: data.durationDays,
          startDate,
          endDate,
          stakeAmount: data.stakeAmount,
          dailyEarnback,
          status: 'active',
          restDaysEnabled: data.restDaysEnabled,
          restDayOfWeek: data.restDayOfWeek,
        },
      });

      await tx.wallet.update({
        where: { userId },
        data: {
          availableBalance: { decrement: data.stakeAmount },
          escrowBalance: { increment: data.stakeAmount },
          totalStakedAllTime: { increment: data.stakeAmount },
          version: { increment: 1 },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'stake',
          direction: 'debit',
          amount: data.stakeAmount,
          balanceBefore: wallet.availableBalance,
          balanceAfter: Number(wallet.availableBalance) - data.stakeAmount,
          status: 'completed',
          referenceId: g.id,
          referenceType: 'goal',
          description: `Staked for goal: ${data.title}`,
          processedAt: new Date(),
        },
      });

      const streak = await tx.streak.create({
        data: { userId, goalId: g.id, shieldRestoresLimit: 0 },
      });

      return { ...g, streak };
    });

    res.status(201).json({
      goal: {
        ...goal,
        completedDays: 0,
        dailyLogs: [],
      },
    });
  } catch (err) {
    console.error('Goal create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/goals/complete
router.post('/complete', authenticate, goalCompleteRateLimit, validate(completeTaskSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { goalId, activitySessionId } = req.body;

    const goal = await prisma.goal.findFirst({ where: { id: goalId, userId, deletedAt: null } });
    if (!goal || goal.status !== 'active') {
      return res.status(400).json({ error: 'Goal not found or not active' });
    }

    const today = new Date().toISOString().split('T')[0];
    const existing = await prisma.dailyTaskLog.findFirst({
      where: { goalId, taskDate: new Date(today) }
    });
    if (existing?.status === 'completed') {
      return res.status(400).json({ error: 'Task already completed today' });
    }

    const session = await prisma.activitySession.findUnique({ where: { id: activitySessionId } });
    if (!session) {
      return res.status(400).json({ error: 'Activity session not found' });
    }
    if (session.userId !== userId) {
      return res.status(403).json({ error: 'Session does not belong to you' });
    }
    if (session.verificationStatus === 'failed') {
      return res.status(400).json({ error: 'Activity session failed verification' });
    }
    if (session.activityType !== goal.activityType) {
      return res.status(400).json({ error: `Session activity type (${session.activityType}) does not match goal (${goal.activityType})` });
    }

    const sessionDate = new Date(session.endedAt).toISOString().split('T')[0];
    if (sessionDate !== today) {
      return res.status(400).json({ error: 'Activity session must be from today' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const logCount = await tx.dailyTaskLog.count({
        where: { goalId, status: 'completed' },
      });

      const log = await tx.dailyTaskLog.create({
        data: {
          goalId,
          userId,
          taskDate: new Date(today),
          status: 'completed',
          activitySessionId,
          earnedAmount: goal.dailyEarnback,
          completedAt: new Date(),
        },
      });

      const dailyEarnback = Number(goal.dailyEarnback);

      await tx.goal.update({
        where: { id: goalId },
        data: {
          totalEarned: { increment: dailyEarnback },
          status: logCount + 1 >= goal.durationDays ? 'completed' : 'active',
        },
      });

      const wallet = await tx.wallet.findUnique({ where: { userId } });
       if (!wallet) {
         throw new Error('Wallet not found for user');
       }

       await tx.wallet.update({
        where: { userId },
        data: {
          availableBalance: { increment: dailyEarnback },
          escrowBalance: { decrement: dailyEarnback },
          totalEarnedAllTime: { increment: dailyEarnback },
          version: { increment: 1 },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet!.id,
          type: 'earnback',
          direction: 'credit',
          amount: dailyEarnback,
          balanceBefore: wallet!.availableBalance,
          balanceAfter: Number(wallet!.availableBalance) + dailyEarnback,
          status: 'completed',
          referenceId: goalId,
          referenceType: 'goal',
          description: `Earnback for ${goal.title}`,
          processedAt: new Date(),
        },
      });

      const streak = await tx.streak.findUnique({ where: { userId_goalId: { userId, goalId } } });
      if (streak) {
        const newCurrentStreak = streak.currentStreak + 1;
        await tx.streak.update({ 
          where: { id: streak.id }, 
          data: { 
            currentStreak: newCurrentStreak, 
            totalDaysCompleted: streak.totalDaysCompleted + 1, 
            lastActivityDate: new Date(today),
            bestStreak: Math.max(streak.bestStreak, newCurrentStreak)
          } 
        });
      }

      return log;
    });

    res.status(201).json({ log: result });
  } catch (err) {
    console.error('Complete task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/goals/shield
router.post('/shield', authenticate, validate(shieldDaySchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { goalId, date } = req.body;

    const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const streak = await prisma.streak.findUnique({ where: { userId_goalId: { userId, goalId } } });
    if (!streak || streak.shieldRestoresUsed >= streak.shieldRestoresLimit) {
      return res.status(400).json({ error: 'No shield restores available' });
    }

    const existing = await prisma.dailyTaskLog.findFirst({
      where: { goalId, taskDate: new Date(date) },
    });
    if (existing) {
      return res.status(400).json({ error: 'A log already exists for this date' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.dailyTaskLog.create({
        data: { goalId, userId, taskDate: new Date(date), status: 'shielded', earnedAmount: goal.dailyEarnback },
      });
      await tx.streak.update({
        where: { id: streak.id },
        data: { shieldRestoresUsed: { increment: 1 } },
      });

      const dailyEarnback = Number(goal.dailyEarnback);

      await tx.goal.update({
        where: { id: goalId },
        data: { totalEarned: { increment: dailyEarnback } },
      });

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (wallet) {
        await tx.wallet.update({
          where: { userId },
          data: {
            availableBalance: { increment: dailyEarnback },
            escrowBalance: { decrement: dailyEarnback },
            totalEarnedAllTime: { increment: dailyEarnback },
            version: { increment: 1 },
          },
        });
        await tx.transaction.create({
          data: {
            userId,
            walletId: wallet.id,
            type: 'earnback',
            direction: 'credit',
            amount: dailyEarnback,
            balanceBefore: wallet.availableBalance,
            balanceAfter: Number(wallet.availableBalance) + dailyEarnback,
            status: 'completed',
            referenceId: goalId,
            referenceType: 'goal',
            description: `Earnback for shielded day on ${goal.title}`,
            processedAt: new Date(),
          },
        });
      }
    });

    res.status(201).json({ log: { goalId, date, status: 'shielded' } });
  } catch (err) {
    console.error('Shield error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/goals/forfeit
router.post('/forfeit', authenticate, validate(forfeitGoalSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { goalId } = req.body;

    const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (goal.status !== 'active') return res.status(400).json({ error: 'Goal is not active' });

    const today = new Date().toISOString().split('T')[0];

    const existing = await prisma.dailyTaskLog.findFirst({
      where: { goalId, taskDate: new Date(today) },
    });
    if (existing) {
      return res.status(400).json({ error: 'A log already exists for today' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.dailyTaskLog.create({
        data: { goalId, userId, taskDate: new Date(today), status: 'missed', forfeitedAmount: goal.dailyEarnback },
      });

      await tx.goal.update({
        where: { id: goalId },
        data: {
          totalForfeited: { increment: goal.dailyEarnback },
          status: 'abandoned',
        },
      });

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (wallet) {
        const newEscrowBalance = Number(wallet.escrowBalance) - Number(goal.dailyEarnback);
        await tx.wallet.update({
          where: { userId },
          data: {
            escrowBalance: { decrement: goal.dailyEarnback },
            totalForfeitedAllTime: { increment: goal.dailyEarnback },
            version: { increment: 1 },
          },
        });
        await tx.transaction.create({
          data: {
            userId,
            walletId: wallet.id,
            type: 'forfeit',
            direction: 'debit',
            amount: goal.dailyEarnback,
            balanceBefore: Number(wallet.escrowBalance),
            balanceAfter: newEscrowBalance,
            status: 'completed',
            referenceId: goalId,
            referenceType: 'goal',
            description: `Forfeit for missing ${goal.title}`,
            processedAt: new Date(),
          },
        });
      }

      await tx.streak.update({
        where: { userId_goalId: { userId, goalId } },
        data: { currentStreak: 0, lastActivityDate: new Date(today) },
      });
    });

    res.json({ log: { goalId, date: today, status: 'missed', forfeitedAmount: goal.dailyEarnback }, forfeitedAmount: goal.dailyEarnback });
  } catch (err) {
    console.error('Forfeit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/goals/expire-expired (cron endpoint)
router.post('/expire-expired', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const expiredGoals = await prisma.goal.findMany({
      where: {
        status: 'active',
        endDate: { lt: now },
      },
    });

    let count = 0;
    for (const goal of expiredGoals) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.goal.update({
            where: { id: goal.id },
            data: { status: 'expired' },
          });

          const wallet = await tx.wallet.findUnique({ where: { userId: goal.userId } });
          if (wallet) {
            const refundAmount = Number(goal.stakeAmount) - Number(goal.totalEarned);
            if (refundAmount > 0) {
              await tx.wallet.update({
                where: { userId: goal.userId },
                data: {
                  availableBalance: { increment: refundAmount },
                  escrowBalance: { decrement: refundAmount },
                  version: { increment: 1 },
                },
              });
              await tx.transaction.create({
                data: {
                  userId: goal.userId,
                  walletId: wallet.id,
                  type: 'deposit',
                  direction: 'credit',
                  amount: refundAmount,
                  balanceBefore: wallet.availableBalance,
                  balanceAfter: Number(wallet.availableBalance) + refundAmount,
                  status: 'completed',
                  referenceId: goal.id,
                  referenceType: 'goal',
                  description: `Refund for expired goal: ${goal.title}`,
                  processedAt: new Date(),
                },
              });
            }
          }
        });
        count++;
      } catch (err) {
        console.error(`Failed to expire goal ${goal.id}:`, err);
      }
    }

    res.json({ expired: count });
  } catch (err) {
    console.error('Goal expiry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
