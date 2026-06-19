import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { sendPushToUser } from '../lib/fcm';

const router = Router();

// Helper: create in-app notification + send push
export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  deepLinkScreen?: string;
  deepLinkParams?: Record<string, unknown>;
  referenceId?: string;
  referenceType?: string;
  sendPush?: boolean;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type as any,
      title: params.title,
      body: params.body,
      deepLinkScreen: params.deepLinkScreen,
      deepLinkParams: params.deepLinkParams as any,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
    },
  });

  if (params.sendPush !== false) {
    const result = await sendPushToUser(
      params.userId,
      { title: params.title, body: params.body },
      {
        screen: params.deepLinkScreen ?? 'notifications',
        params: JSON.stringify(params.deepLinkParams ?? {}),
        notificationId: notification.id,
      },
    );

    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        pushSent: true,
        pushSentAt: new Date(),
        pushDeliveryStatus: result.successCount > 0 ? 'sent' : 'failed',
      },
    });
  }

  return notification;
}

// GET /api/notifications
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;

    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    });
    const unread = await prisma.notification.count({
      where: { userId: req.user!.userId, isRead: false },
    });
    const total = await prisma.notification.count({ where: { userId: req.user!.userId } });

    res.json({ notifications, unread, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Notifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authenticate, async (req: Request, res: Response) => {
  try {
    const notif = await prisma.notification.updateMany({
      where: { id: req.params.id as string, userId: req.user!.userId },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ notification: notif.count });
  } catch (err) {
    console.error('Notification read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notifications/read-all
router.post('/read-all', authenticate, async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Read all error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notifications/test-push — Send a test push notification
router.post('/test-push', authenticate, async (req: Request, res: Response) => {
  try {
    const notification = await createNotification({
      userId: req.user!.userId,
      type: 'wallet_credited',
      title: 'FitStake Test',
      body: 'Push notifications are working!',
      deepLinkScreen: 'notifications',
      sendPush: true,
    });

    res.json({ message: 'Test push sent', notification });
  } catch (err) {
    console.error('Test push error:', err);
    res.status(500).json({ error: 'Failed to send test push' });
  }
});

export default router;
