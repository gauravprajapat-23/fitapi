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

const syncWearableSchema = z.object({
  platform: z.enum(['healthkit', 'google_fit', 'garmin', 'fitbit', 'samsung_health', 'whoop', 'polar', 'oura']),
  activityType: z.enum(['running', 'walking', 'cycling', 'yoga', 'strength', 'swimming', 'meditation', 'hiit', 'custom']),
  startedAt: z.string(),
  endedAt: z.string(),
  durationSeconds: z.number().int().positive(),
  steps: z.number().int().positive().optional(),
  heartRate: z.array(z.number()).optional(),
  distanceMeters: z.number().positive().optional(),
  caloriesBurned: z.number().positive().optional(),
  goalId: z.string().uuid().optional(),
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

// POST /api/wearables/sync — Sync wearable data and create activity session
router.post('/sync', authenticate, validate(syncWearableSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const {
      platform,
      activityType,
      startedAt,
      endedAt,
      durationSeconds,
      steps,
      heartRate,
      distanceMeters,
      caloriesBurned,
      goalId,
    } = req.body;

    // Verify platform connection exists
    const connection = await prisma.wearableConnection.findFirst({
      where: { userId, platform, syncEnabled: true },
    });
    if (!connection) {
      return res.status(400).json({ error: 'Wearable not connected. Please connect first.' });
    }

    // Map platform to ActivitySource
    const sourceMap: Record<string, string> = {
      healthkit: 'healthkit',
      google_fit: 'google_fit',
      garmin: 'garmin',
      fitbit: 'fitbit',
      samsung_health: 'samsung_health',
      whoop: 'manual',
      polar: 'manual',
      oura: 'manual',
    };

    // Calculate heart rate stats
    let avgHeartRate: number | undefined;
    let maxHeartRate: number | undefined;
    if (heartRate && heartRate.length > 0) {
      avgHeartRate = Math.round(heartRate.reduce((a: number, b: number) => a + b, 0) / heartRate.length);
      maxHeartRate = Math.max(...heartRate);
    }

    // Create activity session
    const session = await prisma.activitySession.create({
      data: {
        userId,
        goalId: goalId || null,
        source: sourceMap[platform] as any,
        activityType,
        startedAt: new Date(startedAt),
        endedAt: new Date(endedAt),
        durationSeconds,
        steps: steps || null,
        distanceMeters: distanceMeters || null,
        caloriesBurned: caloriesBurned || null,
        avgHeartRate: avgHeartRate || null,
        maxHeartRate: maxHeartRate || null,
        verificationStatus: 'pending',
      },
    });

    // Update last synced time
    await prisma.wearableConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });

    res.status(201).json({ session });
  } catch (err) {
    console.error('Wearable sync error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
