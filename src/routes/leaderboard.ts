import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const router = Router();

const leaderboardQuerySchema = z.object({
  scope: z.enum(['global', 'friends', 'city', 'challenge']).default('global'),
  metric: z.enum(['streak', 'earned', 'completion_rate', 'challenges_won']).default('streak'),
  period: z.enum(['this_week', 'this_month', 'all_time']).default('all_time'),
  challengeId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/leaderboard
router.get('/', authenticate, validate(leaderboardQuerySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const { scope, metric, period, limit, offset } = req.query as unknown as z.infer<typeof leaderboardQuerySchema>;
    const userId = req.user!.userId;

    // Determine date filter for period
    let dateFilter: Date | undefined;
    const now = new Date();
    if (period === 'this_week') {
      dateFilter = new Date(now);
      dateFilter.setDate(now.getDate() - now.getDay());
      dateFilter.setHours(0, 0, 0, 0);
    } else if (period === 'this_month') {
      dateFilter = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Determine user IDs to include based on scope
    let userIds: string[] | undefined;
    if (scope === 'friends') {
      const friendships = await prisma.friendship.findMany({
        where: {
          status: 'accepted',
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
        select: { requesterId: true, addresseeId: true },
      });
      const friendIds = new Set<string>();
      friendIds.add(userId); // Include self
      for (const f of friendships) {
        friendIds.add(f.requesterId);
        friendIds.add(f.addresseeId);
      }
      userIds = Array.from(friendIds);
    } else if (scope === 'city') {
      const userProfile = await prisma.userProfile.findUnique({
        where: { userId },
        select: { city: true },
      });
      if (userProfile?.city) {
        const cityProfiles = await prisma.userProfile.findMany({
          where: { city: userProfile.city },
          select: { userId: true },
        });
        userIds = cityProfiles.map(p => p.userId);
      } else {
        return res.json({ leaderboard: [], total: 0, offset, limit });
      }
    }

    // Build the where clause for metrics
    const userFilter = userIds ? { userId: { in: userIds } } : {};

    // Compute leaderboard based on metric
    let entries: Array<{ userId: string; username: string; displayName: string; avatarUrl: string | null; value: number; city: string | null }>;

    if (scope === 'challenge') {
      const challengeId = req.query.challengeId as string | undefined;
      if (!challengeId) {
        return res.status(400).json({ error: 'challengeId required for challenge scope' });
      }
      const participants = await prisma.challengeParticipant.findMany({
        where: { challengeId },
        orderBy: { completionPct: 'desc' },
        include: { user: { include: { profile: true } } },
      });
      const entries: Array<{ userId: string; username: string; displayName: string; avatarUrl: string | null; value: number; city: string | null }> =
        participants.map((p, i) => ({
          userId: p.userId,
          username: p.user.profile?.username ?? 'unknown',
          displayName: p.user.profile?.displayName ?? 'Unknown',
          avatarUrl: p.user.profile?.avatarUrl ?? null,
          value: Number(p.completionPct),
          city: p.user.profile?.city ?? null,
        }));
      const total = entries.length;
      const paginated = entries.slice(offset, offset + limit);
      const ranked = paginated.map((e, i) => ({ rank: offset + i + 1, ...e }));
      return res.json({ leaderboard: ranked, total, offset, limit });
    }

    switch (metric) {
      case 'streak': {
        const streaks = await prisma.streak.groupBy({
          by: ['userId'],
          where: {
            ...userFilter,
            ...(dateFilter ? { lastActivityDate: { gte: dateFilter } } : {}),
          },
          _max: { currentStreak: true },
        });
        const userIdsWithStreaks = streaks.map(s => s.userId);
        const profiles = await prisma.userProfile.findMany({
          where: { userId: { in: userIdsWithStreaks } },
          select: { userId: true, username: true, displayName: true, avatarUrl: true, city: true },
        });
        const profileMap = new Map(profiles.map(p => [p.userId, p]));
        entries = streaks.map(s => {
          const p = profileMap.get(s.userId);
          return {
            userId: s.userId,
            username: p?.username ?? 'unknown',
            displayName: p?.displayName ?? 'Unknown',
            avatarUrl: p?.avatarUrl ?? null,
            value: s._max.currentStreak ?? 0,
            city: p?.city ?? null,
          };
        });
        break;
      }

      case 'earned': {
        const profiles = await prisma.userProfile.findMany({
          where: userFilter,
          select: { userId: true, username: true, displayName: true, avatarUrl: true, totalEarned: true, city: true },
        });
        entries = profiles.map(p => ({
          userId: p.userId,
          username: p.username,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl,
          value: Number(p.totalEarned),
          city: p.city,
        }));
        break;
      }

      case 'completion_rate': {
        const profiles = await prisma.userProfile.findMany({
          where: userFilter,
          select: { userId: true, username: true, displayName: true, avatarUrl: true, city: true },
        });
        const userIdsAll = profiles.map(p => p.userId);
        const goals = await prisma.goal.groupBy({
          by: ['userId', 'status'],
          where: {
            userId: { in: userIdsAll },
            deletedAt: null,
            ...(dateFilter ? { startDate: { gte: dateFilter } } : {}),
          },
          _count: { id: true },
        });
        const goalMap = new Map<string, { total: number; completed: number }>();
        for (const g of goals) {
          const entry = goalMap.get(g.userId) ?? { total: 0, completed: 0 };
          entry.total += g._count.id;
          if (g.status === 'completed') entry.completed += g._count.id;
          goalMap.set(g.userId, entry);
        }
        const profileMap = new Map(profiles.map(p => [p.userId, p]));
        entries = Array.from(goalMap.entries()).map(([uid, g]) => {
          const p = profileMap.get(uid);
          return {
            userId: uid,
            username: p?.username ?? 'unknown',
            displayName: p?.displayName ?? 'Unknown',
            avatarUrl: p?.avatarUrl ?? null,
            value: g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0,
            city: p?.city ?? null,
          };
        });
        break;
      }

      case 'challenges_won': {
        const winners = await prisma.challengeParticipant.groupBy({
          by: ['userId'],
          where: {
            ...userFilter,
            finalRank: 1,
            ...(dateFilter ? { challenge: { challengeEnd: { gte: dateFilter } } } : {}),
          },
          _count: { id: true },
        });
        const userIdsWinners = winners.map(w => w.userId);
        const profiles = await prisma.userProfile.findMany({
          where: { userId: { in: userIdsWinners } },
          select: { userId: true, username: true, displayName: true, avatarUrl: true, city: true },
        });
        const profileMap = new Map(profiles.map(p => [p.userId, p]));
        entries = winners.map(w => {
          const p = profileMap.get(w.userId);
          return {
            userId: w.userId,
            username: p?.username ?? 'unknown',
            displayName: p?.displayName ?? 'Unknown',
            avatarUrl: p?.avatarUrl ?? null,
            value: w._count.id,
            city: p?.city ?? null,
          };
        });
        break;
      }

      default:
        return res.status(400).json({ error: 'Invalid metric' });
    }

    // Sort by value descending
    entries.sort((a, b) => b.value - a.value);

    // Apply offset/limit
    const total = entries.length;
    const paginated = entries.slice(offset, offset + limit);

    // Add rank
    const ranked = paginated.map((e, i) => ({
      rank: offset + i + 1,
      ...e,
    }));

    res.json({ leaderboard: ranked, total, offset, limit });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
