import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const router = Router();

// ── Admin Helper ──
// TODO: Replace with proper admin role field once schema is updated
function isAdmin(req: Request): boolean {
  // Temporary: hardcoded admin emails or check via env
  const adminEmails = (process.env.ADMIN_EMAILS || 'admin@fitstake.com').split(',');
  return adminEmails.includes(req.user?.email || '');
}

// ── KYC Management ──

// GET /api/admin/kyc/list - List all KYC submissions
router.get('/kyc/list', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const status = req.query.status as string | undefined;
    const where = status && ['pending', 'approved', 'rejected', 're_submit'].includes(status)
      ? { status: status as any }
      : {};

    const verifications = await prisma.kYCVerification.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, createdAt: true, profile: { select: { displayName: true, username: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ verifications });
  } catch (err) {
    console.error('Admin KYC list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const updateKycSchema = z.object({
  status: z.enum(['approved', 'rejected', 're_submit']),
  rejectionReason: z.string().optional(),
});

// PATCH /api/admin/kyc/:id - Review KYC
router.patch('/kyc/:id', authenticate, validate(updateKycSchema), async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const { status, rejectionReason } = req.body;

    const verification = await prisma.kYCVerification.update({
      where: { id: req.params.id as string },
      data: {
        status,
        rejectionReason: status === 'rejected' ? rejectionReason : undefined,
        approvedAt: status === 'approved' ? new Date() : undefined,
      },
    });

    res.json({ verification });
  } catch (err) {
    console.error('Admin KYC update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── User Management ──

// GET /api/admin/users - List users
router.get('/users', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          phone: true,
          isActive: true,
          isBanned: true,
          banReason: true,
          authProvider: true,
          createdAt: true,
          lastLoginAt: true,
          profile: { select: { displayName: true, username: true, avatarUrl: true, city: true } },
          wallet: { select: { availableBalance: true, totalEarnedAllTime: true } },
          _count: { select: { goals: true, challengeEntries: true } },
        },
      }),
      prisma.user.count(),
    ]);

    res.json({ users, total, page, limit });
  } catch (err) {
    console.error('Admin users list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const banUserSchema = z.object({
  banReason: z.string().min(1).max(500),
});

// POST /api/admin/users/:id/ban
router.post('/users/:id/ban', authenticate, validate(banUserSchema), async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { isBanned: true, banReason: req.body.banReason, isActive: false },
      select: { id: true, email: true, isBanned: true, banReason: true },
    });

    res.json({ user, message: 'User banned' });
  } catch (err) {
    console.error('Admin ban user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/users/:id/unban
router.post('/users/:id/unban', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { isBanned: false, banReason: null, isActive: true },
      select: { id: true, email: true, isBanned: true },
    });

    res.json({ user, message: 'User unbanned' });
  } catch (err) {
    console.error('Admin unban user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/activity-sessions - List sessions
router.get('/activity-sessions', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where = status && ['pending', 'passed', 'failed', 'disputed'].includes(status)
      ? { verificationStatus: status as any }
      : {};

    const [sessions, total] = await Promise.all([
      prisma.activitySession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, profile: { select: { displayName: true, username: true } } } },
          goal: { select: { id: true, title: true } },
        },
      }),
      prisma.activitySession.count({ where }),
    ]);

    res.json({ sessions, total, page, limit });
  } catch (err) {
    console.error('Admin sessions list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Wearable Connections ──

// GET /api/admin/wearables - List all wearable connections
router.get('/wearables', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const connections = await prisma.wearableConnection.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true, username: true } },
          },
        },
      },
    });

    res.json({ connections });
  } catch (err) {
    console.error('Admin wearables list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Dashboard Stats ──

// GET /api/admin/stats
router.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const [
      totalUsers,
      totalGoals,
      totalChallenges,
      totalTransactions,
      pendingKyc,
      pendingWithdrawals,
      activeDisputes,
      activeSubscriptions,
      wearableConnections,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.goal.count({ where: { deletedAt: null } }),
      prisma.challenge.count({ where: { deletedAt: null } }),
      prisma.transaction.count(),
      prisma.kYCVerification.count({ where: { status: 'pending' } }),
      prisma.withdrawalRequest.count({ where: { status: 'pending' } }),
      prisma.disputeTicket.count({ where: { status: { in: ['open', 'under_review'] } } }),
      prisma.streakShieldSubscription.count({ where: { status: 'active' } }),
      prisma.wearableConnection.count(),
    ]);

    res.json({
      stats: {
        totalUsers,
        totalGoals,
        totalChallenges,
        totalTransactions,
        pendingKyc,
        pendingWithdrawals,
        activeDisputes,
        activeSubscriptions,
        wearableConnections,
      },
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Withdrawal Management ──

const updateWithdrawalSchema = z.object({
  status: z.enum(['processing', 'completed', 'failed', 'cancelled']),
  gatewayPayoutId: z.string().optional(),
  failureReason: z.string().optional(),
  referenceNumber: z.string().optional(),
});

// GET /api/admin/withdrawals
router.get('/withdrawals', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where = status && ['pending', 'processing', 'completed', 'failed', 'cancelled'].includes(status)
      ? { status: status as any }
      : {};

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawalRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, profile: { select: { displayName: true, username: true } } } },
          bankAccount: { select: { bankName: true, accountNumberLast4: true, ifscCode: true, accountHolderName: true } },
        },
      }),
      prisma.withdrawalRequest.count({ where }),
    ]);

    res.json({ withdrawals, total, page, limit });
  } catch (err) {
    console.error('Admin withdrawals error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/withdrawals/:id
router.patch('/withdrawals/:id', authenticate, validate(updateWithdrawalSchema), async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const data: Record<string, unknown> = { ...req.body };
    if (data.status === 'completed') data.completedAt = new Date();

    const withdrawal = await prisma.withdrawalRequest.update({
      where: { id: req.params.id as string },
      data,
    });

    res.json({ withdrawal });
  } catch (err) {
    console.error('Admin withdrawal update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Dispute Management ──

const updateDisputeSchema = z.object({
  status: z.enum(['under_review', 'resolved_user', 'resolved_system', 'rejected']),
  resolutionNotes: z.string().optional(),
  compensationAmount: z.number().optional(),
  goodwillCredit: z.number().optional(),
});

// GET /api/admin/disputes
router.get('/disputes', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where = status && ['open', 'under_review', 'resolved_user', 'resolved_system', 'rejected'].includes(status)
      ? { status: status as any }
      : {};

    const [disputes, total] = await Promise.all([
      prisma.disputeTicket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, profile: { select: { displayName: true, username: true } } } },
          transaction: { select: { id: true, type: true, amount: true, description: true, createdAt: true } },
        },
      }),
      prisma.disputeTicket.count({ where }),
    ]);

    res.json({ disputes, total, page, limit });
  } catch (err) {
    console.error('Admin disputes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/disputes/:id
router.patch('/disputes/:id', authenticate, validate(updateDisputeSchema), async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const data: Record<string, unknown> = { ...req.body };
    data.resolvedById = req.user!.userId;
    if (['resolved_user', 'resolved_system', 'rejected'].includes(data.status as string)) {
      data.resolvedAt = new Date();
    }

    const dispute = await prisma.disputeTicket.update({
      where: { id: req.params.id as string },
      data,
    });

    res.json({ dispute });
  } catch (err) {
    console.error('Admin dispute update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Audit Logs ──

// GET /api/admin/audit-logs
router.get('/audit-logs', authenticate, async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;
    const action = req.query.action as string | undefined;

    const where = action ? { action } : {};

    const [logs, total] = await Promise.all([
      prisma.systemAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, email: true, profile: { select: { displayName: true, username: true } } } },
        },
      }),
      prisma.systemAuditLog.count({ where }),
    ]);

    res.json({ logs, total, page, limit });
  } catch (err) {
    console.error('Admin audit logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
