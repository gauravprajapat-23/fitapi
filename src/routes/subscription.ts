import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createSubscriptionSchema, cancelSubscriptionSchema } from '../validators';

const router = Router();

const PLAN_DETAILS = {
  basic: { restoresPerMonth: 1, graceWindowHours: 6, priceMonthly: 29900, priceAnnual: 299000 },
  pro: { restoresPerMonth: 3, graceWindowHours: 12, priceMonthly: 59900, priceAnnual: 599000 },
  elite: { restoresPerMonth: 5, graceWindowHours: 24, priceMonthly: 99900, priceAnnual: 999000 },
} as const;

// GET /api/subscription
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const subscription = await prisma.streakShieldSubscription.findFirst({
      where: { userId, status: { in: ['active', 'trialing'] } },
      orderBy: { currentPeriodEnd: 'desc' },
    });

    if (!subscription) {
      return res.json({
        subscription: null,
        plan: null,
        status: 'none',
      });
    }

    res.json({
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        billingCycle: subscription.billingCycle,
        status: subscription.status,
        restoresPerMonth: subscription.restoresPerMonth,
        graceWindowHours: subscription.graceWindowHours,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        cancelledAt: subscription.cancelledAt,
        createdAt: subscription.createdAt,
      },
      plan: subscription.plan,
      status: subscription.status,
    });
  } catch (err) {
    console.error('Subscription get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/subscription/create
router.post('/create', authenticate, validate(createSubscriptionSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { plan, billingCycle, storePlatform, revenueCatProductId, revenueCatSubscriptionId } = req.body;

    const details = PLAN_DETAILS[plan as keyof typeof PLAN_DETAILS];
    const pricePaid = billingCycle === 'annual' ? details.priceAnnual : details.priceMonthly;

    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'annual') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Deactivate any existing active subscriptions
    await prisma.streakShieldSubscription.updateMany({
      where: { userId, status: { in: ['active', 'trialing'] } },
      data: { status: 'cancelled', cancelledAt: now },
    });

    const subscription = await prisma.streakShieldSubscription.create({
      data: {
        userId,
        plan,
        billingCycle,
        pricePaid,
        restoresPerMonth: details.restoresPerMonth,
        graceWindowHours: details.graceWindowHours,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        storePlatform,
        revenueCatProductId,
        revenueCatSubscriptionId,
      },
    });

    res.status(201).json({
      message: 'Subscription created',
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        billingCycle: subscription.billingCycle,
        status: subscription.status,
        restoresPerMonth: subscription.restoresPerMonth,
        graceWindowHours: subscription.graceWindowHours,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
      },
    });
  } catch (err) {
    console.error('Subscription create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/subscription/cancel
router.post('/cancel', authenticate, validate(cancelSubscriptionSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { reason } = req.body;

    const subscription = await prisma.streakShieldSubscription.findFirst({
      where: { userId, status: { in: ['active', 'trialing'] } },
      orderBy: { currentPeriodEnd: 'desc' },
    });

    if (!subscription) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    const updated = await prisma.streakShieldSubscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
        cancelledAt: new Date(),
        ...(reason ? {} : {}),
      },
    });

    res.json({
      message: 'Subscription will be cancelled at period end',
      subscription: {
        id: updated.id,
        plan: updated.plan,
        status: updated.status,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        currentPeriodEnd: updated.currentPeriodEnd,
      },
    });
  } catch (err) {
    console.error('Subscription cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/subscription/plans
router.get('/plans', async (_req: Request, res: Response) => {
  res.json({
    plans: [
      { tier: 'basic', name: 'Basic Shield', restoresPerMonth: 1, graceWindowHours: 6, priceMonthly: 299, priceAnnual: 2990 },
      { tier: 'pro', name: 'Pro Shield', restoresPerMonth: 3, graceWindowHours: 12, priceMonthly: 599, priceAnnual: 5990 },
      { tier: 'elite', name: 'Elite Shield', restoresPerMonth: 5, graceWindowHours: 24, priceMonthly: 999, priceAnnual: 9990 },
    ],
  });
});

export default router;
