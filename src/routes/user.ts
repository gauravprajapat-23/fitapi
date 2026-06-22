import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/user/:id/profile
router.get('/:id/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.params.id as string },
      include: { user: { select: { createdAt: true } } },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (profile.profileVisibility === 'private') {
      return res.status(403).json({ error: 'Profile is private' });
    }

    const streaks = await prisma.streak.findMany({
      where: { userId: profile.userId },
      select: { currentStreak: true, bestStreak: true, totalDaysCompleted: true },
    });

    const bestStreak = streaks.reduce((max, s) => Math.max(max, s.bestStreak), 0);
    const totalDays = streaks.reduce((sum, s) => sum + s.totalDaysCompleted, 0);

    const goalsCompleted = await prisma.goal.count({
      where: { userId: profile.userId, status: 'completed' },
    });

    const challengesWon = await prisma.challengeParticipant.count({
      where: { userId: profile.userId, finalRank: 1 },
    });

    // Determine friendship status between current user and viewed user
    let friendshipStatus: string | null = null;
    const currentUserId = req.user!.userId;
    if (currentUserId && currentUserId !== profile.userId) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { requesterId: currentUserId, addresseeId: profile.userId },
            { requesterId: profile.userId, addresseeId: currentUserId },
          ],
        },
        select: { status: true },
      });
      friendshipStatus = friendship?.status ?? null;
    }

    res.json({
      profile: {
        id: profile.userId,
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        city: profile.city,
        fitnessLevel: profile.fitnessLevel,
        totalEarned: profile.totalEarned,
        totalStaked: profile.totalStaked,
        totalChallengesWon: profile.totalChallengesWon,
        createdAt: profile.user.createdAt,
      },
      stats: {
        bestStreak,
        totalDaysCompleted: totalDays,
        goalsCompleted,
        challengesWon,
      },
      friendshipStatus,
    });
  } catch (err) {
    console.error('User profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/user/:id/stats
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.params.id as string },
    });

    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    const period = (req.query.period as string) || 'all_time';
    let startDate: Date | undefined;
    const now = new Date();

    switch (period) {
      case 'this_week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'this_year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    const goals = await prisma.goal.findMany({
      where: {
        userId: profile.userId,
        deletedAt: null,
        ...(startDate ? { startDate: { gte: startDate } } : {}),
      },
      select: {
        status: true,
        activityType: true,
        totalEarned: true,
        totalForfeited: true,
        durationDays: true,
      },
    });

    const streaks = await prisma.streak.findMany({
      where: { userId: profile.userId },
      select: { currentStreak: true, bestStreak: true, totalDaysCompleted: true },
    });

    const bestStreak = streaks.reduce((max, s) => Math.max(max, s.bestStreak), 0);
    const totalDays = streaks.reduce((sum, s) => sum + s.totalDaysCompleted, 0);

    const activeGoals = goals.filter(g => g.status === 'active').length;
    const completedGoals = goals.filter(g => g.status === 'completed').length;
    const totalEarned = goals.reduce((sum, g) => sum + Number(g.totalEarned), 0);
    const totalForfeited = goals.reduce((sum, g) => sum + Number(g.totalForfeited), 0);

    const activityBreakdown = goals.reduce((acc: Record<string, number>, g) => {
      acc[g.activityType] = (acc[g.activityType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      stats: {
        bestStreak,
        totalDaysCompleted: totalDays,
        activeGoals,
        completedGoals,
        totalEarned,
        totalForfeited,
        completionRate: goals.length > 0 ? Math.round((completedGoals / goals.length) * 100) : 0,
        activityBreakdown,
      },
    });
  } catch (err) {
    console.error('User stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
