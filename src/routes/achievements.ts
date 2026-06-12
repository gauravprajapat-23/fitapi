import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/achievements
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const userAchievements = await prisma.userAchievement.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
    });

    const allBadges = await prisma.badgeDefinition.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { rarity: 'asc' }],
    });

    const earnedIds = new Set(userAchievements.map(ua => ua.badgeId));

    const achievements = allBadges.map(badge => {
      const earned = userAchievements.find(ua => ua.badgeId === badge.id);
      return {
        id: badge.id,
        slug: badge.slug,
        name: badge.name,
        description: badge.description,
        category: badge.category,
        rarity: badge.rarity,
        iconUrl: badge.iconUrl,
        colorHex: badge.colorHex,
        requirementType: badge.requirementType,
        requirementValue: badge.requirementValue,
        fitcoinReward: badge.fitcoinReward,
        earnedAt: earned?.earnedAt ?? null,
        referenceId: earned?.referenceId ?? null,
      };
    });

    const earnedCount = userAchievements.length;
    const totalCount = allBadges.length;

    res.json({ achievements, earnedCount, totalCount });
  } catch (err) {
    console.error('Achievements error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
