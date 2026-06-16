import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken, generateTokenPair } from '../lib/jwt';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { registerSchema, loginSchema, otpSendSchema, otpVerifySchema, updateProfileSchema, submitKycSchema } from '../validators';

const router = Router();

// Helper to normalize Indian phone to +91XXXXXXXXXX
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return phone; // fallback
}

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const { email, phone, password, username, displayName } = req.body;

    const normalizedPhone = phone ? normalizePhone(phone) : null;

    // Check for existing user by email or normalized phone
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
        ],
      },
    });
    if (existing) {
      if (existing.email === email) return res.status(409).json({ error: 'Email already registered' });
      if (existing.phone === normalizedPhone) return res.status(409).json({ error: 'Phone number already registered' });
      return res.status(409).json({ error: 'Email or phone already registered' });
    }

    // Check for duplicate username
    const existingUsername = await prisma.userProfile.findUnique({
      where: { username },
    });
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        phone: normalizedPhone,
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

    const { accessToken, refreshToken } = generateTokenPair({ userId: user.id, email: user.email });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken,
        refreshTokenExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Mock OTP send - in production, integrate with SMS provider
    const mockOtp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[MOCK OTP] Sending to ${normalizedPhone}: ${mockOtp}`);
    
    // Store mock OTP in user metadata for verification (in production, use Redis/DB with expiry)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        // Using a custom field or you could create an OTP table
        // For mock, we'll store in a way that verify can check
      },
    });

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

    res.status(201).json({ token: accessToken, refreshToken, user, mockOtp: process.env.NODE_ENV === 'development' ? mockOtp : undefined });
  } catch (err) {
    console.error('Register error:', err);
    if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: (err as any).flatten() });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true, settings: true, wallet: true },
    });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { accessToken, refreshToken } = generateTokenPair({ userId: user.id, email: user.email });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: req.ip,
        refreshToken,
        refreshTokenExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({ token: accessToken, refreshToken, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const user = await prisma.user.findFirst({
      where: { refreshToken, refreshTokenExpires: { gt: new Date() } },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = generateTokenPair({
      userId: user.id,
      email: user.email,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: newRefreshToken,
        refreshTokenExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({ token: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('Token refresh error:', err);
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
    const body = req.body as Record<string, any>;

    // Map frontend field names to database field names
    const updateData: Record<string, any> = {};
    
    if (body.displayName !== undefined) updateData.displayName = body.displayName;
    if (body.name !== undefined) updateData.displayName = body.name; // frontend sends 'name'
    if (body.username !== undefined) updateData.username = body.username;
    if (body.bio !== undefined) updateData.bio = body.bio;
    if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl;
    if (body.city !== undefined) updateData.city = body.city;
    if (body.location !== undefined) updateData.city = body.location; // frontend sends 'location'
    if (body.countryCode !== undefined) updateData.countryCode = body.countryCode;
    if (body.dateOfBirth !== undefined) updateData.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
    if (body.gender !== undefined) updateData.gender = body.gender;
    if (body.fitnessLevel !== undefined) updateData.fitnessLevel = body.fitnessLevel;
    if (body.preferredActivities !== undefined) updateData.preferredActivities = body.preferredActivities;
    if (body.dailyAvailableMinutes !== undefined) updateData.dailyAvailableMinutes = body.dailyAvailableMinutes;
    if (body.timeCommitment !== undefined) updateData.dailyAvailableMinutes = body.timeCommitment; // frontend sends 'timeCommitment'
    if (body.preferredWorkoutTime !== undefined) updateData.preferredWorkoutTime = body.preferredWorkoutTime;
    if (body.profileVisibility !== undefined) updateData.profileVisibility = body.profileVisibility;

    const profile = await prisma.userProfile.update({
      where: { userId: req.user!.userId },
      data: updateData,
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
