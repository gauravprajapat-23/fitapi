import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createChallengeSchema, joinChallengeSchema } from '../validators';

const router = Router();

// GET /api/challenges
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const challenges = await prisma.challenge.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        participants: {
          include: { user: { include: { profile: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    res.json({ challenges });
  } catch (err) {
    console.error('Challenges list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/challenges/mine
router.get('/mine', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const participants = await prisma.challengeParticipant.findMany({
      where: { userId },
      include: { challenge: true },
      orderBy: { joinedAt: 'desc' },
    });
    res.json({ challenges: participants.map(p => ({ ...p.challenge, participant: p })) });
  } catch (err) {
    console.error('My challenges error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/challenges/:id
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const challenge = await prisma.challenge.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        participants: {
          include: { user: { include: { profile: true } } },
          orderBy: { completionPct: 'desc' },
        },
      },
    });
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    res.json({ challenge });
  } catch (err) {
    console.error('Challenge get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/challenges
router.post('/', authenticate, validate(createChallengeSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = req.body;

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.availableBalance < data.entryStake) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const challengeStart = new Date(data.challengeStart);
    const challengeEnd = new Date(challengeStart);
    challengeEnd.setDate(challengeEnd.getDate() + data.durationDays - 1);

    const result = await prisma.$transaction(async (tx) => {
      const challenge = await tx.challenge.create({
        data: {
          creatorId: userId,
          title: data.title,
          description: data.description,
          activityType: data.activityType,
          challengeType: data.challengeType,
          prizeModel: data.prizeModel,
          dailyTaskDesc: data.dailyTaskDesc,
          targetValue: data.targetValue,
          targetUnit: data.targetUnit,
          verificationMethod: data.verificationMethod,
          entryStake: data.entryStake,
          maxParticipants: data.maxParticipants,
          currentParticipants: 1,
          durationDays: data.durationDays,
          registrationStart: new Date(),
          registrationEnd: new Date(data.registrationEnd),
          challengeStart,
          challengeEnd,
          prizePool: data.entryStake,
          inviteCode: data.inviteCode ?? Math.random().toString(36).substring(2, 8).toUpperCase(),
          status: data.challengeType === 'private' ? 'draft' : 'open',
        },
      });

      await tx.challengeParticipant.create({
        data: { challengeId: challenge.id, userId, stakePaid: data.entryStake, status: 'active' },
      });

      await tx.wallet.update({
        where: { userId },
        data: {
          availableBalance: { decrement: data.entryStake },
          escrowBalance: { increment: data.entryStake },
          totalStakedAllTime: { increment: data.entryStake },
          version: { increment: 1 },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'stake',
          direction: 'debit',
          amount: data.entryStake,
          balanceBefore: Number(wallet.availableBalance),
          balanceAfter: Number(wallet.availableBalance) - data.entryStake,
          status: 'completed',
          referenceId: challenge.id,
          referenceType: 'challenge',
          description: `Staked for challenge: ${data.title}`,
          processedAt: new Date(),
        },
      });

      const participant = await tx.challengeParticipant.findFirst({
        where: { challengeId: challenge.id, userId },
        include: { user: { include: { profile: true } } },
      });

      return { ...challenge, participants: participant ? [participant] : [] };
    });

    res.status(201).json({ challenge: result });
  } catch (err) {
    console.error('Challenge create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/challenges/join
router.post('/join', authenticate, validate(joinChallengeSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { challengeId } = req.body;

    const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge || challenge.status !== 'open') {
      return res.status(400).json({ error: 'Challenge not available for joining' });
    }

    const existing = await prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId, userId } },
    });
    if (existing) return res.status(409).json({ error: 'Already joined' });

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.availableBalance < challenge.entryStake) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.challenge.updateMany({
        where: { id: challengeId, currentParticipants: { lt: challenge.maxParticipants } },
        data: {
          currentParticipants: { increment: 1 },
          prizePool: { increment: challenge.entryStake },
        },
      });
      if (updated.count === 0) {
        throw new Error('CHALLENGE_FULL');
      }

      const freshChallenge = await tx.challenge.findUnique({ where: { id: challengeId } });
      if (freshChallenge && freshChallenge.currentParticipants >= freshChallenge.maxParticipants) {
        await tx.challenge.update({ where: { id: challengeId }, data: { status: 'full' } });
      }

      await tx.challengeParticipant.create({
        data: { challengeId, userId, stakePaid: challenge.entryStake, status: 'active' },
      });

      await tx.wallet.update({
        where: { userId },
        data: {
          availableBalance: { decrement: challenge.entryStake },
          escrowBalance: { increment: challenge.entryStake },
          totalStakedAllTime: { increment: challenge.entryStake },
          version: { increment: 1 },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'stake',
          direction: 'debit',
          amount: challenge.entryStake,
          balanceBefore: Number(wallet.availableBalance),
          balanceAfter: Number(wallet.availableBalance) - Number(challenge.entryStake),
          status: 'completed',
          referenceId: challengeId,
          referenceType: 'challenge',
          description: `Staked for challenge: ${challenge.title}`,
          processedAt: new Date(),
        },
      });
    });

    res.status(200).json({ message: 'Joined challenge' });
  } catch (err: any) {
    if (err?.message === 'CHALLENGE_FULL') {
      return res.status(400).json({ error: 'Challenge is full' });
    }
    console.error('Join challenge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/challenges/leaderboard/:id
router.get('/leaderboard/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const participants = await prisma.challengeParticipant.findMany({
      where: { challengeId: req.params.id as string },
      orderBy: { completionPct: 'desc' },
      include: { user: { include: { profile: true } } },
    });
    res.json({ leaderboard: participants.map((p, i) => ({ rank: i + 1, ...p })) });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
