import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

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

// PATCH /api/notifications/read/:id
router.patch('/read/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const notif = await prisma.notification.updateMany({
      where: { id: req.params.id as string, userId: req.user!.userId },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ updated: notif.count });
  } catch (err) {
    console.error('Notification read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ updated: result.count });
  } catch (err) {
    console.error('Read all error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
