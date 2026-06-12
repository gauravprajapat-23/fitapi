import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const router = Router();

const connectWearableSchema = z.object({
  platform: z.enum(['healthkit', 'google_fit', 'garmin', 'fitbit', 'samsung_health', 'whoop', 'polar', 'oura']),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.string().optional(),
  scopes: z.array(z.string()).default([]),
  platformUserId: z.string().optional(),
});

const updateWearableSchema = z.object({
  syncEnabled: z.boolean().optional(),
});

// GET /api/wearables
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const connections = await prisma.wearableConnection.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
    });
    // Strip sensitive tokens from response
    const safe = connections.map(c => ({
      id: c.id,
      platform: c.platform,
      scopes: c.scopes,
      platformUserId: c.platformUserId,
      lastSyncedAt: c.lastSyncedAt,
      syncEnabled: c.syncEnabled,
      errorCount: c.errorCount,
      lastError: c.lastError,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      tokenExpiresAt: c.tokenExpiresAt,
    }));
    res.json({ connections: safe });
  } catch (err) {
    console.error('Wearables list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/wearables/connect
router.post('/connect', authenticate, validate(connectWearableSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { platform, accessToken, refreshToken, tokenExpiresAt, scopes, platformUserId } = req.body;

    const connection = await prisma.wearableConnection.upsert({
      where: { userId_platform: { userId, platform } },
      create: {
        userId,
        platform,
        accessTokenEncrypted: accessToken,
        refreshTokenEncrypted: refreshToken,
        tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null,
        scopes,
        platformUserId,
      },
      update: {
        accessTokenEncrypted: accessToken,
        refreshTokenEncrypted: refreshToken,
        tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null,
        scopes,
        platformUserId,
        syncEnabled: true,
        errorCount: 0,
        lastError: null,
      },
    });

    res.status(201).json({
      connection: {
        id: connection.id,
        platform: connection.platform,
        scopes: connection.scopes,
        platformUserId: connection.platformUserId,
        syncEnabled: connection.syncEnabled,
        createdAt: connection.createdAt,
      },
    });
  } catch (err) {
    console.error('Wearable connect error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/wearables/:id
router.patch('/:id', authenticate, validate(updateWearableSchema), async (req: Request, res: Response) => {
  try {
    const connection = await prisma.wearableConnection.updateMany({
      where: { id: req.params.id as string, userId: req.user!.userId },
      data: req.body,
    });
    if (connection.count === 0) return res.status(404).json({ error: 'Connection not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Wearable update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/wearables/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    await prisma.wearableConnection.deleteMany({
      where: { id: req.params.id as string, userId: req.user!.userId },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Wearable disconnect error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
