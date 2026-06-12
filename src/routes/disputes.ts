import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const router = Router();

const fileDisputeSchema = z.object({
  transactionId: z.string().uuid(),
  dailyTaskLogId: z.string().uuid().optional(),
  reason: z.string().min(10).max(2000),
});

// POST /api/disputes
router.post('/', authenticate, validate(fileDisputeSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { transactionId, dailyTaskLogId, reason } = req.body;

    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, userId },
    });
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    const existing = await prisma.disputeTicket.findFirst({
      where: { transactionId, status: { in: ['open', 'under_review'] } },
    });
    if (existing) return res.status(409).json({ error: 'Dispute already exists for this transaction' });

    const slaDeadline = new Date();
    slaDeadline.setHours(slaDeadline.getHours() + 48);

    const ticket = await prisma.disputeTicket.create({
      data: {
        userId,
        transactionId,
        dailyTaskLogId,
        reason,
        status: 'open',
        slaDeadline,
      },
    });

    res.status(201).json({ dispute: ticket });
  } catch (err) {
    console.error('Dispute create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/disputes
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const tickets = await prisma.disputeTicket.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      include: { transaction: { select: { id: true, type: true, amount: true, description: true, createdAt: true } } },
    });
    res.json({ disputes: tickets });
  } catch (err) {
    console.error('Disputes list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/disputes/:id
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.disputeTicket.findFirst({
      where: { id: req.params.id as string, userId: req.user!.userId },
      include: { transaction: true },
    });
    if (!ticket) return res.status(404).json({ error: 'Dispute not found' });
    res.json({ dispute: ticket });
  } catch (err) {
    console.error('Dispute get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
