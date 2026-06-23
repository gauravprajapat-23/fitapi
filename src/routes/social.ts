import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendFriendRequestSchema, respondFriendRequestSchema, sendMessageSchema, addReactionSchema, removeReactionSchema } from '../validators';

const router = Router();

// ── Friends ──

// GET /api/social/friends
router.get('/friends', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const friends = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { addresseeId: userId }],
        status: 'accepted',
      },
      include: {
        requester: { include: { profile: true } },
        addressee: { include: { profile: true } },
      },
    });
    const mapped = friends.map(f => {
      const friend = f.requesterId === userId ? f.addressee : f.requester;
      return { friendshipId: f.id, user: friend, since: f.createdAt };
    });
    res.json({ friends: mapped });
  } catch (err) {
    console.error('Friends list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/social/friend-requests
router.get('/friend-requests', authenticate, async (req: Request, res: Response) => {
  try {
    const requests = await prisma.friendship.findMany({
      where: { addresseeId: req.user!.userId, status: 'pending' },
      include: { requester: { include: { profile: true } } },
    });
    res.json({ requests });
  } catch (err) {
    console.error('Friend requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/social/friend-requests/sent
router.get('/friend-requests/sent', authenticate, async (req: Request, res: Response) => {
  try {
    const requests = await prisma.friendship.findMany({
      where: { requesterId: req.user!.userId, status: 'pending' },
      include: { addressee: { include: { profile: true } } },
    });
    res.json({ requests });
  } catch (err) {
    console.error('Sent friend requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/social/friend-requests/cancel
router.post('/friend-requests/cancel', authenticate, async (req: Request, res: Response) => {
  try {
    const { friendshipId } = req.body;
    const friendship = await prisma.friendship.findFirst({
      where: { id: friendshipId, requesterId: req.user!.userId, status: 'pending' },
    });
    if (!friendship) return res.status(404).json({ error: 'Request not found' });

    await prisma.friendship.delete({ where: { id: friendshipId } });
    res.json({ success: true });
  } catch (err) {
    console.error('Cancel friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/social/friend-request
router.post('/friend-request', authenticate, validate(sendFriendRequestSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { addresseeId } = req.body;

    if (userId === addresseeId) return res.status(400).json({ error: 'Cannot friend yourself' });

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId },
          { requesterId: addresseeId, addresseeId: userId },
        ],
      },
    });
    if (existing) return res.status(409).json({ error: 'Friend request already exists' });

    const friend = await prisma.friendship.create({
      data: { requesterId: userId, addresseeId },
    });
    res.status(201).json({ friendship: friend });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/social/friend-respond
router.post('/friend-respond', authenticate, validate(respondFriendRequestSchema), async (req: Request, res: Response) => {
  try {
    const { friendshipId, action } = req.body;
    const friendship = await prisma.friendship.findFirst({
      where: { id: friendshipId, addresseeId: req.user!.userId, status: 'pending' },
    });
    if (!friendship) return res.status(404).json({ error: 'Request not found' });

    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: action === 'accept' ? 'accepted' : 'blocked' },
    });
    res.json({ friendship: updated });
  } catch (err) {
    console.error('Friend respond error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/social/friend-remove
router.post('/friend-remove', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { friendshipId } = req.body;
    if (!friendshipId) return res.status(400).json({ error: 'friendshipId required' });

    const friendship = await prisma.friendship.findFirst({
      where: {
        id: friendshipId,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
        status: 'accepted',
      },
    });
    if (!friendship) return res.status(404).json({ error: 'Friendship not found' });

    await prisma.friendship.delete({ where: { id: friendshipId } });
    res.json({ success: true });
  } catch (err) {
    console.error('Friend remove error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Search ──

// GET /api/social/search?q=...
router.get('/search', authenticate, async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string)?.trim();
    if (!query || query.length < 2) {
      return res.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        id: { not: req.user!.userId },
        OR: [
          { profile: { username: { contains: query, mode: 'insensitive' } } },
          { profile: { displayName: { contains: query, mode: 'insensitive' } } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        profile: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            city: true,
            fitnessLevel: true,
          },
        },
      },
      take: 20,
    });

    const userIds = users.map(u => u.id);
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: req.user!.userId, addresseeId: { in: userIds } },
          { addresseeId: req.user!.userId, requesterId: { in: userIds } },
        ],
      },
      select: { requesterId: true, addresseeId: true, status: true },
    });
    const friendshipMap = new Map<string, string>();
    for (const f of friendships) {
      const otherId = f.requesterId === req.user!.userId ? f.addresseeId : f.requesterId;
      friendshipMap.set(otherId, f.status);
    }

    const mapped = users.map(u => ({
      id: u.id,
      username: u.profile?.username,
      displayName: u.profile?.displayName,
      avatarUrl: u.profile?.avatarUrl,
      bio: u.profile?.bio,
      city: u.profile?.city,
      fitnessLevel: u.profile?.fitnessLevel,
      friendshipStatus: friendshipMap.get(u.id) ?? 'none',
    }));

    res.json({ users: mapped });
  } catch (err) {
    console.error('User search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Referrals ──

// GET /api/social/referral-code
router.get('/referral-code', authenticate, async (req: Request, res: Response) => {
  try {
    let referral = await prisma.referral.findFirst({
      where: { referrerId: req.user!.userId },
    });
    if (!referral) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      referral = await prisma.referral.create({
        data: {
          referrerId: req.user!.userId,
          referralCode: code,
          referralLink: `fitstake://register?ref=${code}`,
        },
      });
    }
    res.json({ referral });
  } catch (err) {
    console.error('Referral code error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/social/referral-stats
router.get('/referral-stats', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const referrals = await prisma.referral.findMany({
      where: { referrerId: userId },
    });
    const referral = referrals[0];
    if (!referral) {
      return res.json({ stats: { totalReferrals: 0, signedUp: 0, bonusEarned: 0, referralCode: null, referralLink: null, referredUsers: [] } });
    }
    const referredCount = await prisma.referral.count({ where: { referrerId: userId, referredId: { not: null } } });
    const signedUpCount = await prisma.referral.count({ where: { referrerId: userId, status: { in: ['signed_up', 'goal_created', 'bonus_paid'] } } });
    const bonusEarned = Number(referral.referrerBonus ?? 0);

    const referredUsers = await prisma.referral.findMany({
      where: { referrerId: userId, referredId: { not: null } },
      include: { referred: { include: { profile: true } } },
      orderBy: { signedUpAt: 'desc' },
      take: 20,
    });
    const mappedReferred = referredUsers.map(r => ({
      id: r.referredId,
      name: r.referred?.profile?.displayName ?? r.referred?.email ?? 'User',
      avatar: r.referred?.profile?.avatarUrl,
      status: r.status,
      signedUpAt: r.signedUpAt,
    }));

    res.json({ stats: { totalReferrals: referredCount, signedUp: signedUpCount, bonusEarned, referralCode: referral.referralCode, referralLink: referral.referralLink, referredUsers: mappedReferred } });
  } catch (err) {
    console.error('Referral stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Chat ──

// GET /api/social/chat/:challengeId
router.get('/chat/:challengeId', authenticate, async (req: Request, res: Response) => {
  try {
    const { challengeId } = req.params;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const where: any = { challengeId, deletedAt: null };
    if (cursor) {
      const cursorMsg = await prisma.groupChatMessage.findUnique({ where: { id: cursor } });
      if (cursorMsg) {
        where.createdAt = { gt: cursorMsg.createdAt };
      }
    }

    const messages = await prisma.groupChatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { include: { profile: true } },
        reactions: { include: { user: { select: { id: true, profile: { select: { displayName: true } } } } } },
      },
      take: limit,
    });

    const hasMore = messages.length === limit;
    res.json({ messages, hasMore, nextCursor: hasMore ? messages[messages.length - 1]?.id : null });
  } catch (err) {
    console.error('Chat messages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/social/chat
router.post('/chat', authenticate, validate(sendMessageSchema), async (req: Request, res: Response) => {
  try {
    const message = await prisma.groupChatMessage.create({
      data: {
        challengeId: req.body.challengeId,
        senderId: req.user!.userId,
        messageType: req.body.messageType,
        content: req.body.content,
        stickerId: req.body.stickerId,
      },
      include: { sender: { include: { profile: true } } },
    });
    res.status(201).json({ message });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Message Reactions ──

// POST /api/social/chat/:messageId/reactions
router.post('/chat/:messageId/reactions', authenticate, validate(addReactionSchema), async (req: Request, res: Response) => {
  try {
    const { emoji } = req.body;
    if (!emoji || emoji.length > 8) {
      return res.status(400).json({ error: 'Invalid emoji' });
    }
    const messageId = req.params.messageId as string;
    const reaction = await prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId: req.user!.userId,
          emoji,
        },
      },
      create: {
        messageId,
        userId: req.user!.userId,
        emoji,
      },
      update: {},
    });
    res.status(201).json({ reaction });
  } catch (err) {
    console.error('Reaction add error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/social/chat/:messageId/reactions
router.delete('/chat/:messageId/reactions', authenticate, validate(removeReactionSchema), async (req: Request, res: Response) => {
  try {
    const { emoji } = req.body;
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji required' });
    }
    await prisma.messageReaction.deleteMany({
      where: {
        messageId: req.params.messageId as string,
        userId: req.user!.userId,
        emoji,
      },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Reaction remove error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Activity Feed (Social) ──

// GET /api/social/activity-feed?page=1&limit=20
router.get('/activity-feed', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const skip = (page - 1) * limit;

    const friendIds = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { addresseeId: userId }],
        status: 'accepted',
      },
      select: {
        requesterId: true,
        addresseeId: true,
      },
    });
    const ids = friendIds.flatMap(f => [f.requesterId, f.addresseeId]).filter(id => id !== userId);
    ids.push(userId);

    const [activities, total] = await Promise.all([
      prisma.activitySession.findMany({
        where: { userId: { in: ids }, verificationStatus: 'passed' },
        include: {
          user: { include: { profile: { select: { displayName: true, avatarUrl: true } } } },
          goal: { select: { title: true, activityType: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.activitySession.count({
        where: { userId: { in: ids }, verificationStatus: 'passed' },
      }),
    ]);

    const mapped = activities.map(a => ({
      id: a.id,
      type: 'activity_completed' as const,
      user: { id: a.userId, name: a.user.profile?.displayName ?? 'User', avatar: a.user.profile?.avatarUrl },
      activity: {
        type: a.goal?.activityType ?? 'running',
        distance: a.distanceMeters,
        duration: a.durationSeconds,
        calories: a.caloriesBurned,
        goalTitle: a.goal?.title,
      },
      timestamp: a.createdAt,
    }));

    res.json({ activities: mapped, total, page, hasMore: skip + limit < total });
  } catch (err) {
    console.error('Activity feed error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Friend Streaks ──

// GET /api/social/friend-streaks
router.get('/friend-streaks', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const friends = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { addresseeId: userId }],
        status: 'accepted',
      },
    });
    const friendIds = friends.map(f => f.requesterId === userId ? f.addresseeId : f.requesterId);

    const streaks = await prisma.streak.findMany({
      where: { userId: { in: friendIds } },
      include: { user: { include: { profile: { select: { displayName: true, avatarUrl: true } } } } },
    });

    const mapped = streaks.map(s => ({
      userId: s.userId,
      name: s.user.profile?.displayName ?? 'User',
      avatar: s.user.profile?.avatarUrl,
      currentStreak: s.currentStreak,
      bestStreak: s.bestStreak,
      lastActivityDate: s.lastActivityDate,
    }));

    res.json({ friendStreaks: mapped });
  } catch (err) {
    console.error('Friend streaks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
