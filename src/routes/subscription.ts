import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { requireCronSecret } from '../middleware/rateLimit';
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
      return res.json({ subscription: null, plan: null, status: 'none' });
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
    if (__DEV__) console.error('Subscription get error:', err);
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
    if (__DEV__) console.error('Subscription create error:', err);
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
        ...(reason ? { cancelReason: reason } : {}),
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
    if (__DEV__) console.error('Subscription cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/subscription/resume
router.post('/resume', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const subscription = await prisma.streakShieldSubscription.findFirst({
      where: { userId, status: { in: ['active', 'trialing'] }, cancelAtPeriodEnd: true },
      orderBy: { currentPeriodEnd: 'desc' },
    });

    if (!subscription) {
      return res.status(400).json({ error: 'No cancelled subscription to resume' });
    }

    const updated = await prisma.streakShieldSubscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: false, cancelledAt: null, cancelReason: null },
    });

    res.json({
      message: 'Subscription resumed',
      subscription: {
        id: updated.id,
        plan: updated.plan,
        status: updated.status,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        currentPeriodEnd: updated.currentPeriodEnd,
      },
    });
  } catch (err) {
    if (__DEV__) console.error('Subscription resume error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/subscription/webhook — RevenueCat webhook
router.post('/webhook', requireCronSecret, async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const eventType = event?.type;
    const appUserId = event?.app_user_id;
    const entitlement = event?.entitlement_id;
    const productId = event?.product_id;
    const subscriptionId = event?.subscription_id;
    const expiresAt = event?.expires_at ? new Date(event.expires_at * 1000) : null;
    const purchasedAt = event?.purchased_at ? new Date(event.purchased_at * 1000) : null;

    if (!appUserId) {
      return res.status(400).json({ error: 'Missing app_user_id' });
    }

    const user = await prisma.user.findFirst({ where: { email: appUserId } });
    if (!user) {
      if (__DEV__) console.warn('[RevenueCat] User not found for:', appUserId);
      return res.json({ received: true });
    }

    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL': {
        const plan = mapRevenueCatProduct(productId);
        const details = PLAN_DETAILS[plan];
        if (!details) break;

        await prisma.streakShieldSubscription.updateMany({
          where: { userId: user.id, status: { in: ['active', 'trialing'] } },
          data: { status: 'cancelled', cancelledAt: new Date() },
        });

        const now = new Date();
        const periodEnd = expiresAt || new Date(now);
        if (!expiresAt) periodEnd.setMonth(periodEnd.getMonth() + 1);

        await prisma.streakShieldSubscription.create({
          data: {
            userId: user.id,
            plan,
            billingCycle: 'monthly',
            pricePaid: details.priceMonthly / 100,
            restoresPerMonth: details.restoresPerMonth,
            graceWindowHours: details.graceWindowHours,
            status: 'active',
            currentPeriodStart: purchasedAt || now,
            currentPeriodEnd: periodEnd,
            revenueCatProductId: productId,
            revenueCatSubscriptionId: subscriptionId,
            storePlatform: 'app_store',
          },
        });
        break;
      }

      case 'CANCELLATION': {
        const sub = await prisma.streakShieldSubscription.findFirst({
          where: { userId: user.id, revenueCatSubscriptionId: subscriptionId, status: 'active' },
        });
        if (sub) {
          await prisma.streakShieldSubscription.update({
            where: { id: sub.id },
            data: { cancelAtPeriodEnd: true, cancelledAt: new Date(), cancelReason: 'RevenueCat cancellation' },
          });
        }
        break;
      }

      case 'UNCANCELLATION': {
        const sub = await prisma.streakShieldSubscription.findFirst({
          where: { userId: user.id, revenueCatSubscriptionId: subscriptionId, cancelAtPeriodEnd: true },
        });
        if (sub) {
          await prisma.streakShieldSubscription.update({
            where: { id: sub.id },
            data: { cancelAtPeriodEnd: false, cancelledAt: null, cancelReason: null },
          });
        }
        break;
      }

      case 'EXPIRATION': {
        const sub = await prisma.streakShieldSubscription.findFirst({
          where: { userId: user.id, revenueCatSubscriptionId: subscriptionId },
        });
        if (sub) {
          await prisma.streakShieldSubscription.update({
            where: { id: sub.id },
            data: { status: 'expired' },
          });
        }
        break;
      }

      case 'BILLING_ISSUE': {
        const sub = await prisma.streakShieldSubscription.findFirst({
          where: { userId: user.id, revenueCatSubscriptionId: subscriptionId, status: 'active' },
        });
        if (sub) {
          await prisma.streakShieldSubscription.update({
            where: { id: sub.id },
            data: { status: 'past_due' },
          });
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    if (__DEV__) console.error('RevenueCat webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapRevenueCatProduct(productId?: string): 'basic' | 'pro' | 'elite' {
  if (!productId) return 'basic';
  const lower = productId.toLowerCase();
  if (lower.includes('elite')) return 'elite';
  if (lower.includes('pro')) return 'pro';
  return 'basic';
}

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
