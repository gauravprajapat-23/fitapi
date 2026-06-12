import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { registerSchema, loginSchema, otpSendSchema, otpVerifySchema, updateProfileSchema, submitKycSchema } from '../validators';

const router = Router();

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const { email, phone, password, username, displayName } = req.body;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone: phone ?? '' }] },
    });
    if (existing) {
      return res.status(409).json({ error: 'Email or phone already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        phone,
        passwordHash,
        authProvider: 'email',
        profile: {
          create: { username, displayName, fitnessLevel: 'beginner' },
        },
        settings: { create: {} },
        wallet: { create: {} },
      },
      include: { profile: true, settings: true, wallet: true },
    });

    const token = signToken({ userId: user.id, email: user.email });

    
    // Handle referral code during signup
    const refCode = (req.query.ref || req.body.ref) as string | undefined;
    if (refCode) {
      const referral = await prisma.referral.findUnique({ where: { referralCode: refCode } });
      if (referral && !referral.referredId) {
        await prisma.referral.update({
          where: { id: referral.id },
          data: { referredId: user.id, status: 'signed_up', signedUpAt: new Date() },
        });
      }
    }

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: req.ip },
    });

    const token = signToken({ userId: user.id, email: user.email });
    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: {
        profile: true,
        settings: true,
        wallet: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/auth/profile
router.patch('/profile', authenticate, validate(updateProfileSchema), async (req: Request, res: Response) => {
  try {
    const profile = await prisma.userProfile.update({
      where: { userId: req.user!.userId },
      data: req.body,
    });
    res.json({ profile });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/kyc
router.post('/kyc', authenticate, validate(submitKycSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { fullLegalName, dateOfBirth, panNumber, aadhaarNumber } = req.body;

    const existing = await prisma.kYCVerification.findUnique({
      where: { userId },
    });

    if (existing && existing.status === 'approved') {
      return res.status(400).json({ error: 'KYC already verified' });
    }

    const kyc = await prisma.kYCVerification.upsert({
      where: { userId },
      create: {
        userId,
        fullLegalName,
        dateOfBirth: new Date(dateOfBirth),
        panNumberEncrypted: panNumber,
        panLast4: panNumber.slice(-4),
        aadhaarNumberEncrypted: aadhaarNumber,
        status: 'pending',
      },
      update: {
        fullLegalName,
        dateOfBirth: new Date(dateOfBirth),
        panNumberEncrypted: panNumber,
        panLast4: panNumber.slice(-4),
        aadhaarNumberEncrypted: aadhaarNumber,
        status: 'pending',
        rejectionReason: null,
      },
    });

    res.status(201).json({ kyc, message: 'KYC submitted for review' });
  } catch (err) {
    console.error('KYC submission error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/kyc
router.get('/kyc', authenticate, async (req: Request, res: Response) => {
  try {
    const kyc = await prisma.kYCVerification.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!kyc) {
      return res.json({ kyc: null, status: 'not_started' });
    }

    res.json({
      kyc: {
        status: kyc.status,
        fullLegalName: kyc.fullLegalName,
        panLast4: kyc.panLast4,
        rejectionReason: kyc.rejectionReason,
        createdAt: kyc.createdAt,
        updatedAt: kyc.updatedAt,
      },
    });
  } catch (err) {
    console.error('KYC get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/settings
router.get('/settings', authenticate, async (req: Request, res: Response) => {
  try {
    const settings = await prisma.userSetting.findUnique({
      where: { userId: req.user!.userId },
    });
    res.json({ settings });
  } catch (err) {
    console.error('Settings get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/auth/settings
router.patch('/settings', authenticate, async (req: Request, res: Response) => {
  try {
    const allowed = ['currency', 'language', 'timezone', 'theme', 'distanceUnit', 'notifTaskReminder', 'notifStreakAlert', 'notifChallengeUpdate', 'notifWallet', 'notifMarketing', 'reminderTime', 'biometricAuthEnabled', 'shareActivityPublicly', 'showGoalsOnProfile'];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    const settings = await prisma.userSetting.update({
      where: { userId: req.user!.userId },
      data,
    });
    res.json({ settings });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
