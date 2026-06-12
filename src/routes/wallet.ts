import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { addMoneySchema, withdrawSchema, addBankAccountSchema } from '../validators';

const router = Router();

// GET /api/wallet
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
    res.json({ wallet });
  } catch (err) {
    console.error('Wallet error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wallet/transactions
router.get('/transactions', authenticate, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const txs = await prisma.transaction.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    });
    const total = await prisma.transaction.count({ where: { userId: req.user!.userId } });
    res.json({ transactions: txs, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Transactions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wallet/transactions/:id
router.get('/transactions/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const tx = await prisma.transaction.findFirst({
      where: { id: req.params.id as string, userId: req.user!.userId },
    });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ transaction: tx });
  } catch (err) {
    console.error('Transaction get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/wallet/add
router.post('/add', authenticate, validate(addMoneySchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    let { amount, gateway } = req.body;
    const gatewayOrderId = req.body.gatewayOrderId ?? crypto.randomUUID();
    const gatewayMap: Record<string, string> = { upi: 'upi_direct', card: 'razorpay', netbanking: 'razorpay' };
    gateway = gatewayMap[gateway] ?? gateway;

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.paymentOrder.create({
        data: { userId, gateway, gatewayOrderId, amount, status: 'paid' },
      });

      const wallet = await tx.wallet.findUnique({ where: { userId } });

      await tx.wallet.update({
        where: { userId },
        data: {
          availableBalance: { increment: amount },
          version: { increment: 1 },
        },
      });

      const txRecord = await tx.transaction.create({
        data: {
          userId,
          walletId: wallet!.id,
          type: 'deposit',
          direction: 'credit',
          amount,
          balanceBefore: wallet!.availableBalance,
          balanceAfter: wallet!.availableBalance + amount,
          status: 'completed',
          referenceId: order.id,
          referenceType: 'payment_order',
          description: `Wallet top-up via ${gateway}`,
          processedAt: new Date(),
        },
      });

      return { order, transaction: txRecord };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Add money error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/wallet/withdraw
router.post('/withdraw', authenticate, validate(withdrawSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { amount, bankAccountId } = req.body;

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.availableBalance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const wd = await tx.withdrawalRequest.create({
        data: { userId, amount, bankAccountId, status: 'pending' },
      });

      await tx.wallet.update({
        where: { userId },
        data: {
          availableBalance: { decrement: amount },
          version: { increment: 1 },
        },
      });

      const txRecord = await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'withdrawal',
          direction: 'debit',
          amount,
          balanceBefore: wallet.availableBalance,
          balanceAfter: Number(wallet.availableBalance) - amount,
          status: 'pending',
          referenceId: wd.id,
          referenceType: 'withdrawal',
          description: `Withdrawal request`,
          processedAt: new Date(),
        },
      });

      return { withdrawal: wd, transaction: txRecord };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Withdraw error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bank accounts
router.get('/bank-accounts', authenticate, async (req: Request, res: Response) => {
  try {
    const accounts = await prisma.userBankAccount.findMany({
      where: { userId: req.user!.userId, deletedAt: null },
    });
    res.json({ accounts });
  } catch (err) {
    console.error('Bank accounts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/bank-accounts', authenticate, validate(addBankAccountSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = req.body;

    const account = await prisma.userBankAccount.create({
      data: {
        userId,
        accountHolderName: data.accountHolderName,
        accountNumberEncrypted: data.accountNumber,
        accountNumberLast4: data.accountNumber.slice(-4),
        ifscCode: data.ifscCode,
        bankName: data.bankName,
        accountType: data.accountType,
        isPrimary: data.isPrimary,
      },
    });

    if (data.isPrimary) {
      await prisma.userBankAccount.updateMany({
        where: { userId, id: { not: account.id } },
        data: { isPrimary: false },
      });
    }

    res.status(201).json({ bankAccount: account });
  } catch (err) {
    console.error('Add bank account error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wallet/analytics
router.get('/analytics', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const period = req.query.period as string || 'this_month';

    let startDate: Date;
    const now = new Date();
    switch (period) {
      case 'this_week':
        startDate = new Date(now.setDate(now.getDate() - now.getDay()));
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'all_time':
        startDate = new Date(0);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const txs = await prisma.transaction.findMany({
      where: { userId, createdAt: { gte: startDate } },
      orderBy: { createdAt: 'desc' },
    });

    const totalEarned = txs.filter(t => t.direction === 'credit').reduce((s, t) => s + Number(t.amount), 0);
    const totalSpent = txs.filter(t => t.direction === 'debit').reduce((s, t) => s + Number(t.amount), 0);

    const byType = txs.reduce((acc: Record<string, number>, t) => {
      acc[t.type] = (acc[t.type] || 0) + Number(t.amount);
      return acc;
    }, {} as Record<string, number>);

    res.json({ analytics: { totalEarned, totalSpent, transactionCount: txs.length, breakdown: byType } });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wallet/fitcoins
router.get('/fitcoins', authenticate, async (req: Request, res: Response) => {
  try {
    const ledger = await prisma.fitCoinLedger.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const balance = ledger.length > 0 ? ledger[0].balanceAfter : 0;
    res.json({ fitcoins: { balance, ledger } });
  } catch (err) {
    console.error('Fitcoin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
