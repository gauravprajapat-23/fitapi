import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendFriendRequestSchema, respondFriendRequestSchema, sendMessageSchema } from '../validators';

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

// ── Chat ──

// GET /api/social/chat/:challengeId
router.get('/chat/:challengeId', authenticate, async (req: Request, res: Response) => {
  try {
    const messages = await prisma.groupChatMessage.findMany({
      where: { challengeId: req.params.challengeId as string, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { sender: { include: { profile: true } }, reactions: true },
      take: 100,
    });
    res.json({ messages });
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

export default router;
