import { z } from 'zod';

// ── Auth ──

export const registerSchema = z.object({
  email: z.string().email().max(320),
  phone: z.string().regex(/^\+91\d{10}$/, 'Must be +91 followed by 10 digits').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(80),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const otpSendSchema = z.object({
  phone: z.string().regex(/^\+91\d{10}$/),
});

export const otpVerifySchema = z.object({
  phone: z.string().regex(/^\+91\d{10}$/),
  otp: z.string().length(6),
});

export const updateProfileSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/).optional(),
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(300).optional(),
  avatarUrl: z.string().url().optional(),
  city: z.string().max(100).optional(),
  countryCode: z.string().length(2).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'non_binary', 'prefer_not_to_say']).optional(),
  fitnessLevel: z.enum(['beginner', 'intermediate', 'active', 'athlete']).optional(),
  preferredActivities: z.array(z.string()).optional(),
  dailyAvailableMinutes: z.number().int().min(15).max(120).optional(),
  preferredWorkoutTime: z.enum(['morning', 'evening', 'flexible']).optional(),
  profileVisibility: z.enum(['public', 'friends', 'private']).optional(),
});

// ── Goals ──

export const createGoalSchema = z.object({
  activityType: z.enum(['running', 'walking', 'cycling', 'yoga', 'strength', 'swimming', 'meditation', 'custom']),
  title: z.string().min(1).max(120),
  taskDescription: z.string().min(1),
  targetValue: z.number().positive(),
  targetUnit: z.enum(['km', 'miles', 'steps', 'minutes', 'sessions']),
  verificationMethod: z.enum(['gps', 'wearable', 'photo', 'manual']),
  earnbackRate: z.number().min(0.5).max(1.0).default(1.0),
  durationDays: z.number().int().min(7).max(90),
  startDate: z.string(),
  stakeAmount: z.number().min(100),
  restDaysEnabled: z.boolean().default(false),
  restDayOfWeek: z.array(z.number().int().min(1).max(7)).default([]),
});

export const completeTaskSchema = z.object({
  goalId: z.string().uuid(),
  activitySessionId: z.string().uuid(),
});

export const shieldDaySchema = z.object({
  goalId: z.string().uuid(),
  date: z.string(),
});

// ── Wallet ──

export const addMoneySchema = z.object({
  amount: z.number().positive(),
  gateway: z.enum(['razorpay', 'stripe', 'upi_direct']),
  gatewayOrderId: z.string(),
});

export const withdrawSchema = z.object({
  amount: z.number().min(200),
  bankAccountId: z.string().uuid(),
});

export const addBankAccountSchema = z.object({
  accountHolderName: z.string().min(1).max(120),
  accountNumber: z.string().min(9).max(18),
  ifscCode: z.string().length(11),
  bankName: z.string().min(1).max(80),
  accountType: z.enum(['savings', 'current']).default('savings'),
  isPrimary: z.boolean().default(false),
});

// ── Challenges ──

export const createChallengeSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().optional(),
  activityType: z.enum(['running', 'walking', 'cycling', 'yoga', 'strength', 'swimming', 'meditation', 'custom']),
  challengeType: z.enum(['public', 'private', 'corporate', 'charity', 'coach_led']).default('public'),
  prizeModel: z.enum(['proportional', 'winner_takes_most', 'all_or_nothing']).default('proportional'),
  dailyTaskDesc: z.string().min(1),
  targetValue: z.number().positive(),
  targetUnit: z.enum(['km', 'miles', 'steps', 'minutes', 'sessions']),
  verificationMethod: z.enum(['gps', 'wearable', 'photo', 'manual']),
  entryStake: z.number().min(200),
  maxParticipants: z.number().int().min(2).max(500).default(50),
  durationDays: z.number().int().min(3).max(90),
  registrationEnd: z.string(),
  challengeStart: z.string(),
  inviteCode: z.string().length(6).optional(),
});

export const joinChallengeSchema = z.object({
  challengeId: z.string().uuid(),
});

// ── Social ──

export const sendFriendRequestSchema = z.object({
  addresseeId: z.string().uuid(),
});

export const respondFriendRequestSchema = z.object({
  friendshipId: z.string().uuid(),
  action: z.enum(['accept', 'reject']),
});

export const sendMessageSchema = z.object({
  challengeId: z.string().uuid(),
  messageType: z.enum(['text', 'sticker', 'route_share', 'system']).default('text'),
  content: z.string().optional(),
  stickerId: z.string().optional(),
});

// ── KYC ──

export const submitKycSchema = z.object({
  fullLegalName: z.string().min(1).max(200),
  dateOfBirth: z.string(),
  panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'),
  aadhaarNumber: z.string().regex(/^\d{12}$/, 'Invalid Aadhaar format').optional(),
});
