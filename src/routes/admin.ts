import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { submitKycSchema } from '../validators';

const router = Router();

// ── KYC ──

// GET /api/admin/kyc
router.get('/kyc', authenticate, async (req: Request, res: Response) => {
  try {
    const kyc = await prisma.kYCVerification.findUnique({
      where: { userId: req.user!.userId },
    });
    res.json({ kyc });
  } catch (err) {
    console.error('KYC get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/kyc
router.post('/kyc', authenticate, validate(submitKycSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = req.body;

    const existing = await prisma.kYCVerification.findUnique({ where: { userId } });
    if (existing) return res.status(409).json({ error: 'KYC already submitted' });

    const kyc = await prisma.kYCVerification.create({
      data: {
        userId,
        fullLegalName: data.fullLegalName,
        dateOfBirth: new Date(data.dateOfBirth),
        panNumberEncrypted: data.panNumber,
        panLast4: data.panNumber.slice(-4),
        aadhaarNumberEncrypted: data.aadhaarNumber,
        status: 'pending',
      },
    });

    res.status(201).json({ kyc });
  } catch (err) {
    console.error('KYC submit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Wearable Connections ──

// GET /api/admin/wearables
router.get('/wearables', authenticate, async (req: Request, res: Response) => {
  try {
    const connections = await prisma.wearableConnection.findMany({
      where: { userId: req.user!.userId },
    });
    res.json({ wearableConnections: connections });
  } catch (err) {
    console.error('Wearables error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Activity Sessions ──

// POST /api/admin/activity-sessions
router.post('/activity-sessions', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = req.body;

    const session = await prisma.activitySession.create({
      data: {
        userId,
        goalId: data.goalId,
        source: data.source || 'gps_app',
        activityType: data.activityType,
        startedAt: new Date(data.startedAt),
        endedAt: new Date(data.endedAt),
        durationSeconds: data.durationSeconds,
        distanceMeters: data.distanceMeters,
        steps: data.steps,
        caloriesBurned: data.caloriesBurned,
        avgHeartRate: data.avgHeartRate,
        avgPaceSecsPerKm: data.avgPaceSecsPerKm,
        gpsAccuracyMeters: data.gpsAccuracyMeters,
        antiSpoofPassed: data.antiSpoofPassed,
        verificationStatus: 'pending',
      },
    });

    if (data.coordinates?.length) {
      await prisma.routePoint.createMany({
        data: data.coordinates.map((c: any, i: number) => ({
          sessionId: session.id,
          pointIndex: i,
          latitude: c.lat,
          longitude: c.lng,
          altitudeMeters: c.altitude,
          speedMps: c.speed,
          recordedAt: new Date(c.timestamp || Date.now()),
        })),
      });
    }

    res.status(201).json({ session });
  } catch (err) {
    console.error('Activity session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
