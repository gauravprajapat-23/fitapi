import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createNotification } from './notifications';
import { requireCronSecret } from '../middleware/rateLimit';

const router = Router();
const isDev = process.env.NODE_ENV !== 'production';

// POST /api/notifications/cron/goal-reminders — Send daily task reminders
// Schedule: daily at user's preferred reminder time (default 7am IST)
router.post('/cron/goal-reminders', requireCronSecret, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const today = new Date(now.toISOString().split('T')[0]);

    // Find all active goals where user hasn't completed today's task
    const activeGoals = await prisma.goal.findMany({
      where: {
        status: 'active',
        startDate: { lte: today },
        endDate: { gte: today },
      },
      include: {
        user: {
          include: { settings: true, devices: { where: { isActive: true } } },
        },
        dailyLogs: {
          where: { taskDate: today },
        },
      },
    });

    let sentCount = 0;

    for (const goal of activeGoals) {
      // Skip if already completed today
      if (goal.dailyLogs.length > 0) continue;

      // Skip if today is a rest day
      if (goal.restDaysEnabled && goal.restDayOfWeek.length > 0) {
        const dayOfWeek = new Date(today).getDay();
        const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
        if (goal.restDayOfWeek.includes(adjustedDay)) continue;
      }

      // Check user notification preferences
      const settings = goal.user.settings;
      if (settings && !settings.notifTaskReminder) continue;

      // Check if user has any active devices
      if (goal.user.devices.length === 0) continue;

      try {
        await createNotification({
          userId: goal.userId,
          type: 'task_reminder',
          title: 'Time to complete your task!',
          body: `Don't break your streak! Complete "${goal.title}" today.`,
          deepLinkScreen: 'goal-detail',
          deepLinkParams: { goalId: goal.id },
          referenceId: goal.id,
          referenceType: 'goal',
          sendPush: true,
        });
        sentCount++;
      } catch (err) {
        if (isDev) console.error('[Cron] Goal reminder failed for', goal.id, err);
      }
    }

    res.json({ message: 'Goal reminders processed', sent: sentCount, total: activeGoals.length });
  } catch (err) {
    console.error('[Cron] Goal reminders error:', err);
    res.status(500).json({ error: 'Failed to process goal reminders' });
  }
});

// POST /api/notifications/cron/streak-alerts — Alert users with at-risk streaks
// Schedule: daily at 6pm IST (1 hour before end of day)
router.post('/cron/streak-alerts', requireCronSecret, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const today = new Date(now.toISOString().split('T')[0]);

    // Find streaks where user hasn't completed today and streak > 0
    const atRiskStreaks = await prisma.streak.findMany({
      where: {
        currentStreak: { gte: 3 },
      },
      include: {
        user: {
          include: { settings: true, devices: { where: { isActive: true } } },
        },
        goal: true,
      },
    });

    let sentCount = 0;

    for (const streak of atRiskStreaks) {
      if (!streak.lastActivityDate) continue;
      const lastActivity = new Date(streak.lastActivityDate);

      // If last activity was today, streak is safe
      if (lastActivity.toISOString().split('T')[0] === today.toISOString().split('T')[0]) continue;

      // If last activity was yesterday, streak is at risk (today not yet completed)
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastActivity.toISOString().split('T')[0] !== yesterday.toISOString().split('T')[0]) continue;

      // Check user notification preferences
      const settings = streak.user.settings;
      if (settings && !settings.notifStreakAlert) continue;

      // Check if user has any active devices
      if (streak.user.devices.length === 0) continue;

      // Check if today is a rest day for the goal
      if (streak.goal?.restDaysEnabled && streak.goal.restDayOfWeek.length > 0) {
        const dayOfWeek = new Date(today).getDay();
        const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
        if (streak.goal.restDayOfWeek.includes(adjustedDay)) continue;
      }

      try {
        await createNotification({
          userId: streak.userId,
          type: 'streak_at_risk',
          title: `${streak.currentStreak}-day streak at risk!`,
          body: `Complete a task now to keep your ${streak.currentStreak}-day streak alive.`,
          deepLinkScreen: 'goals',
          referenceId: streak.goalId ?? undefined,
          referenceType: 'streak',
          sendPush: true,
        });
        sentCount++;
      } catch (err) {
        if (isDev) console.error('[Cron] Streak alert failed for', streak.id, err);
      }
    }

    res.json({ message: 'Streak alerts processed', sent: sentCount, total: atRiskStreaks.length });
  } catch (err) {
    console.error('[Cron] Streak alerts error:', err);
    res.status(500).json({ error: 'Failed to process streak alerts' });
  }
});

// POST /api/notifications/cron/challenge-updates — Send challenge lifecycle notifications
// Schedule: run every hour
router.post('/cron/challenge-updates', requireCronSecret, async (req: Request, res: Response) => {
  try {
    const now = new Date();

    // 1. Notify when challenges start
    const startingChallenges = await prisma.challenge.findMany({
      where: {
        status: 'open',
        challengeStart: { lte: now },
      },
      include: {
        participants: {
          include: {
            user: {
              include: { devices: { where: { isActive: true } } },
            },
          },
        },
      },
    });

    let sentCount = 0;

    for (const challenge of startingChallenges) {
      // Update challenge status
      await prisma.challenge.update({
        where: { id: challenge.id },
        data: { status: 'active' },
      });

      // Notify all participants
      for (const participant of challenge.participants) {
        if (participant.user.devices.length === 0) continue;
        try {
          await createNotification({
            userId: participant.userId,
            type: 'challenge_update',
            title: 'Challenge started!',
            body: `"${challenge.title}" has begun. Good luck!`,
            deepLinkScreen: 'challenge-detail',
            deepLinkParams: { challengeId: challenge.id },
            referenceId: challenge.id,
            referenceType: 'challenge',
            sendPush: true,
          });
          sentCount++;
        } catch (err) {
          if (isDev) console.error('[Cron] Challenge start notification failed', err);
        }
      }
    }

    // 2. Notify when challenges end
    const endingChallenges = await prisma.challenge.findMany({
      where: {
        status: 'active',
        challengeEnd: { lt: now },
      },
    });

    for (const challenge of endingChallenges) {
      await prisma.challenge.update({
        where: { id: challenge.id },
        data: { status: 'completed', completedAt: now },
      });

      const participants = await prisma.challengeParticipant.findMany({
        where: { challengeId: challenge.id },
        include: {
          user: {
            include: { devices: { where: { isActive: true } } },
          },
        },
        orderBy: { completionPct: 'desc' },
      });

      for (const participant of participants) {
        if (participant.user.devices.length === 0) continue;
        const rank = participants.indexOf(participant) + 1;
        try {
          await createNotification({
            userId: participant.userId,
            type: 'challenge_results',
            title: 'Challenge ended!',
            body: `"${challenge.title}" has ended. You finished #${rank}. Check your earnings!`,
            deepLinkScreen: 'challenge-detail',
            deepLinkParams: { challengeId: challenge.id },
            referenceId: challenge.id,
            referenceType: 'challenge',
            sendPush: true,
          });
          sentCount++;
        } catch (err) {
          if (isDev) console.error('[Cron] Challenge end notification failed', err);
        }
      }
    }

    res.json({
      message: 'Challenge updates processed',
      started: startingChallenges.length,
      ended: endingChallenges.length,
      notificationsSent: sentCount,
    });
  } catch (err) {
    console.error('[Cron] Challenge updates error:', err);
    res.status(500).json({ error: 'Failed to process challenge updates' });
  }
});

// POST /api/notifications/cron/expire-goals — Auto-expire overdue goals
// Schedule: daily at 1am IST
router.post('/cron/expire-goals', requireCronSecret, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const today = new Date(now.toISOString().split('T')[0]);

    const expiredGoals = await prisma.goal.updateMany({
      where: {
        status: 'active',
        endDate: { lt: today },
      },
      data: {
        status: 'expired',
      },
    });

    res.json({ message: 'Goals expired', count: expiredGoals.count });
  } catch (err) {
    console.error('[Cron] Expire goals error:', err);
    res.status(500).json({ error: 'Failed to expire goals' });
  }
});

export default router;
