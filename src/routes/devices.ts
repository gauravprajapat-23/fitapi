import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const router = Router();

const registerDeviceSchema = z.object({
  deviceToken: z.string().min(1),
  platform: z.enum(['ios', 'android']),
  deviceModel: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
});

// GET /api/devices
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const devices = await prisma.userDevice.findMany({
      where: { userId: req.user!.userId, isActive: true },
      orderBy: { lastSeenAt: 'desc' },
    });
    res.json({ devices });
  } catch (err) {
    console.error('Devices list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/devices
router.post('/', authenticate, validate(registerDeviceSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { deviceToken, platform, deviceModel, osVersion, appVersion } = req.body;

    // Deactivate existing tokens for this device
    await prisma.userDevice.updateMany({
      where: { deviceToken, userId, isActive: true },
      data: { isActive: false },
    });

    const device = await prisma.userDevice.upsert({
      where: { deviceToken },
      create: { userId, deviceToken, platform, deviceModel, osVersion, appVersion, lastSeenAt: new Date() },
      update: { isActive: true, lastSeenAt: new Date(), platform, deviceModel, osVersion, appVersion },
    });

    res.status(201).json({ device });
  } catch (err) {
    console.error('Device register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/devices/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    await prisma.userDevice.updateMany({
      where: { id: req.params.id as string, userId: req.user!.userId },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Device remove error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
