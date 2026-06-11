-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('email', 'google', 'apple', 'phone');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'non_binary', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "FitnessLevel" AS ENUM ('beginner', 'intermediate', 'active', 'athlete');

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('public', 'friends', 'private');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('dark', 'light', 'system');

-- CreateEnum
CREATE TYPE "DistanceUnit" AS ENUM ('km', 'miles');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('running', 'walking', 'cycling', 'yoga', 'strength', 'swimming', 'meditation', 'custom');

-- CreateEnum
CREATE TYPE "TargetUnit" AS ENUM ('km', 'miles', 'steps', 'minutes', 'sessions');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('gps', 'wearable', 'photo', 'manual');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('scheduled', 'active', 'completed', 'abandoned', 'expired');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'completed', 'missed', 'shielded', 'rest_day', 'grace_window');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('gps_app', 'healthkit', 'google_fit', 'garmin', 'fitbit', 'samsung_health', 'manual', 'photo');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'passed', 'failed', 'disputed');

-- CreateEnum
CREATE TYPE "ChallengeType" AS ENUM ('public', 'private', 'corporate', 'charity', 'coach_led');

-- CreateEnum
CREATE TYPE "PrizeModel" AS ENUM ('proportional', 'winner_takes_most', 'all_or_nothing');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('draft', 'open', 'full', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('active', 'completed', 'abandoned', 'disqualified');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('deposit', 'withdrawal', 'stake', 'unstake', 'earnback', 'forfeit', 'challenge_prize', 'streak_bonus', 'referral_bonus', 'admin_adjustment', 'shield_purchase');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'completed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('razorpay', 'stripe', 'upi_direct');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('created', 'attempted', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('savings', 'current');

-- CreateEnum
CREATE TYPE "ShieldPlan" AS ENUM ('basic', 'pro', 'elite');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'annual');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "FitCoinTxType" AS ENUM ('earned_streak', 'earned_challenge', 'earned_referral', 'spent_shield_restore', 'spent_challenge_entry', 'admin_grant');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('pending', 'accepted', 'blocked');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('pending', 'signed_up', 'goal_created', 'bonus_paid');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'sticker', 'route_share', 'system');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('task_reminder', 'task_completed', 'task_missed', 'streak_at_risk', 'streak_broken', 'streak_milestone', 'challenge_update', 'challenge_results', 'wallet_credited', 'withdrawal_processed', 'shield_restore_used', 'friend_request', 'referral_bonus');

-- CreateEnum
CREATE TYPE "BadgeCategory" AS ENUM ('streak', 'challenge', 'goal', 'financial', 'special');

-- CreateEnum
CREATE TYPE "BadgeRarity" AS ENUM ('common', 'rare', 'epic', 'legendary');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('streak_days', 'challenges_won', 'goals_completed', 'amount_earned', 'referrals');

-- CreateEnum
CREATE TYPE "KYCStatus" AS ENUM ('not_started', 'pending', 'approved', 'rejected', 're_submit');

-- CreateEnum
CREATE TYPE "WearablePlatform" AS ENUM ('healthkit', 'google_fit', 'garmin', 'fitbit', 'samsung_health', 'whoop', 'polar', 'oura');

-- CreateEnum
CREATE TYPE "LeaderboardScope" AS ENUM ('global', 'friends', 'city', 'challenge');

-- CreateEnum
CREATE TYPE "LeaderboardMetric" AS ENUM ('streak', 'earned', 'completion_rate', 'challenges_won');

-- CreateEnum
CREATE TYPE "LeaderboardPeriod" AS ENUM ('this_week', 'this_month', 'all_time');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('user', 'admin', 'system', 'cron');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'under_review', 'resolved_user', 'resolved_system', 'rejected');

-- CreateEnum
CREATE TYPE "WorkoutTime" AS ENUM ('morning', 'evening', 'flexible');

-- CreateEnum
CREATE TYPE "StorePlatform" AS ENUM ('app_store', 'play_store', 'web');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(20),
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" VARCHAR(255),
    "authProvider" "AuthProvider" NOT NULL DEFAULT 'email',
    "googleId" VARCHAR(128),
    "appleId" VARCHAR(128),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "lastLoginAt" TIMESTAMPTZ,
    "lastLoginIp" INET,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "bio" VARCHAR(300),
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "city" VARCHAR(100),
    "countryCode" CHAR(2),
    "dateOfBirth" DATE,
    "gender" "Gender",
    "fitnessLevel" "FitnessLevel" NOT NULL,
    "primaryGoal" VARCHAR(50),
    "preferredActivities" JSONB,
    "dailyAvailableMinutes" SMALLINT,
    "preferredWorkoutTime" "WorkoutTime",
    "totalEarned" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalStaked" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalChallengesWon" SMALLINT NOT NULL DEFAULT 0,
    "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'public',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "language" CHAR(5) NOT NULL DEFAULT 'en',
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    "theme" "Theme" NOT NULL DEFAULT 'dark',
    "distanceUnit" "DistanceUnit" NOT NULL DEFAULT 'km',
    "notifTaskReminder" BOOLEAN NOT NULL DEFAULT true,
    "notifStreakAlert" BOOLEAN NOT NULL DEFAULT true,
    "notifChallengeUpdate" BOOLEAN NOT NULL DEFAULT true,
    "notifWallet" BOOLEAN NOT NULL DEFAULT true,
    "notifMarketing" BOOLEAN NOT NULL DEFAULT false,
    "reminderTime" TIME,
    "biometricAuthEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareActivityPublicly" BOOLEAN NOT NULL DEFAULT true,
    "showGoalsOnProfile" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "platform" VARCHAR(10) NOT NULL,
    "deviceModel" VARCHAR(100),
    "osVersion" VARCHAR(20),
    "appVersion" VARCHAR(20),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "taskDescription" TEXT NOT NULL,
    "targetValue" DECIMAL(8,2) NOT NULL,
    "targetUnit" "TargetUnit" NOT NULL,
    "verificationMethod" "VerificationMethod" NOT NULL,
    "earnbackRate" DECIMAL(5,4) NOT NULL DEFAULT 1.0,
    "durationDays" SMALLINT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "stakeAmount" DECIMAL(12,2) NOT NULL,
    "dailyEarnback" DECIMAL(12,2) NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'scheduled',
    "completionPct" DECIMAL(5,2) DEFAULT 0,
    "totalEarned" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalForfeited" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "restDaysEnabled" BOOLEAN NOT NULL DEFAULT false,
    "restDayOfWeek" SMALLINT[],
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_task_logs" (
    "id" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "taskDate" DATE NOT NULL,
    "status" "TaskStatus" NOT NULL,
    "activitySessionId" UUID,
    "verificationType" "VerificationMethod",
    "verificationScore" DECIMAL(5,4),
    "earnedAmount" DECIMAL(12,2),
    "forfeitedAmount" DECIMAL(12,2),
    "streakDay" SMALLINT,
    "streakBonusEarned" DECIMAL(12,2) DEFAULT 0,
    "notes" TEXT,
    "completedAt" TIMESTAMPTZ,
    "graceExpiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "daily_task_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" UUID,
    "source" "ActivitySource" NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "startedAt" TIMESTAMPTZ NOT NULL,
    "endedAt" TIMESTAMPTZ NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "distanceMeters" DECIMAL(10,2),
    "steps" INTEGER,
    "caloriesBurned" DECIMAL(8,2),
    "avgHeartRate" SMALLINT,
    "maxHeartRate" SMALLINT,
    "avgPaceSecsPerKm" INTEGER,
    "elevationGainMeters" DECIMAL(8,2),
    "gpsAccuracyMeters" DECIMAL(6,2),
    "antiSpoofPassed" BOOLEAN,
    "antiSpoofFlags" JSONB,
    "photoUrl" TEXT,
    "photoExifData" JSONB,
    "deviceMetadata" JSONB,
    "rawDataUrl" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_points" (
    "id" BIGSERIAL NOT NULL,
    "sessionId" UUID NOT NULL,
    "pointIndex" INTEGER NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "altitudeMeters" DECIMAL(8,2),
    "speedMps" DECIMAL(6,3),
    "accuracyMeters" DECIMAL(6,2),
    "recordedAt" TIMESTAMPTZ NOT NULL,
    "heartRate" SMALLINT,

    CONSTRAINT "route_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "activityType" "ActivityType" NOT NULL,
    "challengeType" "ChallengeType" NOT NULL,
    "prizeModel" "PrizeModel" NOT NULL DEFAULT 'proportional',
    "dailyTaskDesc" TEXT NOT NULL,
    "targetValue" DECIMAL(8,2) NOT NULL,
    "targetUnit" "TargetUnit" NOT NULL,
    "verificationMethod" "VerificationMethod" NOT NULL,
    "entryStake" DECIMAL(12,2) NOT NULL,
    "minParticipants" SMALLINT NOT NULL DEFAULT 2,
    "maxParticipants" SMALLINT NOT NULL DEFAULT 50,
    "currentParticipants" SMALLINT NOT NULL DEFAULT 0,
    "durationDays" SMALLINT NOT NULL,
    "registrationStart" TIMESTAMPTZ NOT NULL,
    "registrationEnd" TIMESTAMPTZ NOT NULL,
    "challengeStart" DATE NOT NULL,
    "challengeEnd" DATE NOT NULL,
    "prizePool" DECIMAL(14,2) NOT NULL,
    "platformFeePct" DECIMAL(4,3) NOT NULL DEFAULT 0.08,
    "coverImageUrl" TEXT,
    "inviteCode" VARCHAR(12),
    "status" "ChallengeStatus" NOT NULL DEFAULT 'draft',
    "corporateName" VARCHAR(120),
    "charityName" VARCHAR(120),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_participants" (
    "id" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stakePaid" DECIMAL(12,2) NOT NULL,
    "tasksCompleted" SMALLINT NOT NULL DEFAULT 0,
    "tasksMissed" SMALLINT NOT NULL DEFAULT 0,
    "completionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "currentRank" SMALLINT,
    "finalRank" SMALLINT,
    "estimatedEarnings" DECIMAL(12,2),
    "actualEarnings" DECIMAL(12,2),
    "amountForfeited" DECIMAL(12,2),
    "status" "ParticipantStatus" NOT NULL DEFAULT 'active',
    "disqualReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "challenge_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "availableBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "escrowBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalEarnedAllTime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalForfeitedAllTime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalStakedAllTime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalWithdrawnAllTime" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "version" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceBefore" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "referenceId" UUID,
    "referenceType" VARCHAR(50),
    "idempotencyKey" VARCHAR(128),
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "gatewayOrderId" VARCHAR(128) NOT NULL,
    "gatewayPaymentId" VARCHAR(128),
    "gatewaySignature" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'created',
    "failureReason" TEXT,
    "webhookEvents" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "bankAccountId" UUID NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "gatewayPayoutId" VARCHAR(128),
    "gatewayResponse" JSONB,
    "failureReason" TEXT,
    "referenceNumber" VARCHAR(64),
    "expectedDate" DATE,
    "completedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_bank_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountHolderName" VARCHAR(120) NOT NULL,
    "accountNumberEncrypted" TEXT NOT NULL,
    "accountNumberLast4" CHAR(4) NOT NULL,
    "ifscCode" CHAR(11) NOT NULL,
    "bankName" VARCHAR(80) NOT NULL,
    "bankBranch" VARCHAR(120),
    "accountType" "BankAccountType" NOT NULL DEFAULT 'savings',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "user_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streaks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" UUID,
    "currentStreak" SMALLINT NOT NULL DEFAULT 0,
    "bestStreak" SMALLINT NOT NULL DEFAULT 0,
    "totalDaysCompleted" SMALLINT NOT NULL DEFAULT 0,
    "lastActivityDate" DATE,
    "streakStartedAt" DATE,
    "shieldRestoresUsed" SMALLINT NOT NULL DEFAULT 0,
    "shieldRestoresLimit" SMALLINT NOT NULL,
    "fitcoinsFromStreaks" INTEGER NOT NULL DEFAULT 0,
    "milestone7At" TIMESTAMPTZ,
    "milestone30At" TIMESTAMPTZ,
    "milestone100At" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streak_shield_subscriptions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "plan" "ShieldPlan" NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "pricePaid" DECIMAL(8,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "restoresPerMonth" SMALLINT NOT NULL,
    "graceWindowHours" SMALLINT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "currentPeriodStart" DATE NOT NULL,
    "currentPeriodEnd" DATE NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMPTZ,
    "revenueCatProductId" VARCHAR(100),
    "revenueCatSubscriptionId" VARCHAR(200),
    "storePlatform" "StorePlatform",
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "streak_shield_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitcoin_ledger" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "FitCoinTxType" NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "referenceId" UUID,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fitcoin_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "addresseeId" UUID NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "referrerId" UUID NOT NULL,
    "referredId" UUID,
    "referralCode" VARCHAR(12) NOT NULL,
    "referralLink" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'pending',
    "referrerBonus" DECIMAL(8,2),
    "referredBonus" DECIMAL(8,2),
    "signedUpAt" TIMESTAMPTZ,
    "goalCreatedAt" TIMESTAMPTZ,
    "bonusPaidAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_chat_messages" (
    "id" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "messageType" "MessageType" NOT NULL DEFAULT 'text',
    "content" TEXT,
    "stickerId" VARCHAR(50),
    "routeSessionId" UUID,
    "systemEvent" VARCHAR(100),
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMPTZ,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reactions" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emoji" VARCHAR(8) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "deepLinkScreen" VARCHAR(100),
    "deepLinkParams" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMPTZ,
    "pushSent" BOOLEAN NOT NULL DEFAULT false,
    "pushSentAt" TIMESTAMPTZ,
    "pushDeliveryStatus" VARCHAR(20),
    "referenceId" UUID,
    "referenceType" VARCHAR(50),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_definitions" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "BadgeCategory" NOT NULL,
    "iconUrl" TEXT NOT NULL,
    "colorHex" CHAR(6),
    "rarity" "BadgeRarity" NOT NULL,
    "requirementType" "RequirementType" NOT NULL,
    "requirementValue" INTEGER NOT NULL,
    "fitcoinReward" SMALLINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badge_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "badgeId" UUID NOT NULL,
    "earnedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceId" UUID,
    "referenceType" VARCHAR(50),

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_cache" (
    "id" UUID NOT NULL,
    "scope" "LeaderboardScope" NOT NULL,
    "metric" "LeaderboardMetric" NOT NULL,
    "period" "LeaderboardPeriod" NOT NULL,
    "userId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "city" VARCHAR(100),
    "challengeId" UUID,
    "snapshotAt" TIMESTAMPTZ NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "leaderboard_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_verifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fullLegalName" VARCHAR(200) NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "panNumberEncrypted" VARCHAR(512) NOT NULL,
    "panLast4" CHAR(4) NOT NULL,
    "aadhaarNumberEncrypted" VARCHAR(512),
    "documentType" VARCHAR(30),
    "documentFrontUrl" TEXT,
    "documentBackUrl" TEXT,
    "selfieUrl" TEXT,
    "status" "KYCStatus" NOT NULL DEFAULT 'not_started',
    "rejectionReason" TEXT,
    "kycProvider" VARCHAR(50),
    "providerReferenceId" VARCHAR(200),
    "approvedAt" TIMESTAMPTZ,
    "reviewedById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "kyc_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wearable_connections" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "WearablePlatform" NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMPTZ,
    "scopes" TEXT[],
    "platformUserId" VARCHAR(200),
    "lastSyncedAt" TIMESTAMPTZ,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "errorCount" SMALLINT NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wearable_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actorId" UUID,
    "actorType" "AuditActorType" NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "resourceType" VARCHAR(50) NOT NULL,
    "resourceId" UUID,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" INET,
    "userAgent" TEXT,
    "requestId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_tickets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "dailyTaskLogId" UUID,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolutionNotes" TEXT,
    "resolvedById" UUID,
    "compensationAmount" DECIMAL(12,2),
    "goodwillCredit" DECIMAL(8,2),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ,
    "slaDeadline" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dispute_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "users_lastLoginAt_idx" ON "users"("lastLoginAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_username_key" ON "user_profiles"("username");

-- CreateIndex
CREATE INDEX "user_profiles_username_idx" ON "user_profiles"("username");

-- CreateIndex
CREATE INDEX "user_profiles_city_idx" ON "user_profiles"("city");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_deviceToken_key" ON "user_devices"("deviceToken");

-- CreateIndex
CREATE INDEX "user_devices_userId_isActive_idx" ON "user_devices"("userId", "isActive");

-- CreateIndex
CREATE INDEX "user_devices_deviceToken_idx" ON "user_devices"("deviceToken");

-- CreateIndex
CREATE INDEX "goals_userId_status_idx" ON "goals"("userId", "status");

-- CreateIndex
CREATE INDEX "goals_userId_startDate_idx" ON "goals"("userId", "startDate" DESC);

-- CreateIndex
CREATE INDEX "goals_status_endDate_idx" ON "goals"("status", "endDate");

-- CreateIndex
CREATE INDEX "daily_task_logs_userId_taskDate_idx" ON "daily_task_logs"("userId", "taskDate" DESC);

-- CreateIndex
CREATE INDEX "daily_task_logs_goalId_taskDate_idx" ON "daily_task_logs"("goalId", "taskDate");

-- CreateIndex
CREATE INDEX "daily_task_logs_status_taskDate_idx" ON "daily_task_logs"("status", "taskDate");

-- CreateIndex
CREATE UNIQUE INDEX "daily_task_logs_goalId_taskDate_key" ON "daily_task_logs"("goalId", "taskDate");

-- CreateIndex
CREATE INDEX "activity_sessions_userId_startedAt_idx" ON "activity_sessions"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "activity_sessions_goalId_idx" ON "activity_sessions"("goalId");

-- CreateIndex
CREATE INDEX "activity_sessions_verificationStatus_idx" ON "activity_sessions"("verificationStatus");

-- CreateIndex
CREATE INDEX "route_points_sessionId_pointIndex_idx" ON "route_points"("sessionId", "pointIndex");

-- CreateIndex
CREATE UNIQUE INDEX "route_points_sessionId_pointIndex_key" ON "route_points"("sessionId", "pointIndex");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_inviteCode_key" ON "challenges"("inviteCode");

-- CreateIndex
CREATE INDEX "challenges_status_idx" ON "challenges"("status");

-- CreateIndex
CREATE INDEX "challenges_creatorId_idx" ON "challenges"("creatorId");

-- CreateIndex
CREATE INDEX "challenges_challengeStart_idx" ON "challenges"("challengeStart");

-- CreateIndex
CREATE INDEX "challenges_inviteCode_idx" ON "challenges"("inviteCode");

-- CreateIndex
CREATE INDEX "challenge_participants_challengeId_completionPct_idx" ON "challenge_participants"("challengeId", "completionPct" DESC);

-- CreateIndex
CREATE INDEX "challenge_participants_userId_status_idx" ON "challenge_participants"("userId", "status");

-- CreateIndex
CREATE INDEX "challenge_participants_challengeId_currentRank_idx" ON "challenge_participants"("challengeId", "currentRank");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_participants_challengeId_userId_key" ON "challenge_participants"("challengeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_idempotencyKey_key" ON "transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "transactions_userId_createdAt_idx" ON "transactions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "transactions_walletId_createdAt_idx" ON "transactions"("walletId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "transactions_referenceId_referenceType_idx" ON "transactions"("referenceId", "referenceType");

-- CreateIndex
CREATE INDEX "transactions_status_idx" ON "transactions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_gatewayOrderId_key" ON "payment_orders"("gatewayOrderId");

-- CreateIndex
CREATE INDEX "payment_orders_userId_createdAt_idx" ON "payment_orders"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "payment_orders_status_idx" ON "payment_orders"("status");

-- CreateIndex
CREATE INDEX "withdrawal_requests_userId_status_idx" ON "withdrawal_requests"("userId", "status");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_idx" ON "withdrawal_requests"("status");

-- CreateIndex
CREATE INDEX "withdrawal_requests_createdAt_idx" ON "withdrawal_requests"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "user_bank_accounts_userId_isPrimary_idx" ON "user_bank_accounts"("userId", "isPrimary");

-- CreateIndex
CREATE INDEX "user_bank_accounts_userId_idx" ON "user_bank_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "streaks_goalId_key" ON "streaks"("goalId");

-- CreateIndex
CREATE INDEX "streaks_userId_currentStreak_idx" ON "streaks"("userId", "currentStreak" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "streaks_userId_goalId_key" ON "streaks"("userId", "goalId");

-- CreateIndex
CREATE INDEX "streak_shield_subscriptions_userId_status_idx" ON "streak_shield_subscriptions"("userId", "status");

-- CreateIndex
CREATE INDEX "streak_shield_subscriptions_status_currentPeriodEnd_idx" ON "streak_shield_subscriptions"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "fitcoin_ledger_userId_createdAt_idx" ON "fitcoin_ledger"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "friendships_addresseeId_status_idx" ON "friendships"("addresseeId", "status");

-- CreateIndex
CREATE INDEX "friendships_status_idx" ON "friendships"("status");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_requesterId_addresseeId_key" ON "friendships"("requesterId", "addresseeId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referredId_key" ON "referrals"("referredId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referralCode_key" ON "referrals"("referralCode");

-- CreateIndex
CREATE INDEX "referrals_referralCode_idx" ON "referrals"("referralCode");

-- CreateIndex
CREATE INDEX "referrals_referrerId_idx" ON "referrals"("referrerId");

-- CreateIndex
CREATE INDEX "referrals_referredId_idx" ON "referrals"("referredId");

-- CreateIndex
CREATE INDEX "group_chat_messages_challengeId_createdAt_idx" ON "group_chat_messages"("challengeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "group_chat_messages_senderId_idx" ON "group_chat_messages"("senderId");

-- CreateIndex
CREATE INDEX "group_chat_messages_isPinned_idx" ON "group_chat_messages"("isPinned");

-- CreateIndex
CREATE INDEX "message_reactions_messageId_idx" ON "message_reactions"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "message_reactions_messageId_userId_emoji_key" ON "message_reactions"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_type_createdAt_idx" ON "notifications"("userId", "type", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_pushSent_idx" ON "notifications"("pushSent");

-- CreateIndex
CREATE UNIQUE INDEX "badge_definitions_slug_key" ON "badge_definitions"("slug");

-- CreateIndex
CREATE INDEX "badge_definitions_slug_idx" ON "badge_definitions"("slug");

-- CreateIndex
CREATE INDEX "badge_definitions_category_idx" ON "badge_definitions"("category");

-- CreateIndex
CREATE INDEX "user_achievements_badgeId_idx" ON "user_achievements"("badgeId");

-- CreateIndex
CREATE INDEX "user_achievements_earnedAt_idx" ON "user_achievements"("earnedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "user_achievements_userId_badgeId_key" ON "user_achievements"("userId", "badgeId");

-- CreateIndex
CREATE INDEX "leaderboard_cache_scope_metric_period_rank_idx" ON "leaderboard_cache"("scope", "metric", "period", "rank");

-- CreateIndex
CREATE INDEX "leaderboard_cache_userId_scope_metric_period_idx" ON "leaderboard_cache"("userId", "scope", "metric", "period");

-- CreateIndex
CREATE INDEX "leaderboard_cache_expiresAt_idx" ON "leaderboard_cache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_verifications_userId_key" ON "kyc_verifications"("userId");

-- CreateIndex
CREATE INDEX "kyc_verifications_status_idx" ON "kyc_verifications"("status");

-- CreateIndex
CREATE INDEX "wearable_connections_tokenExpiresAt_idx" ON "wearable_connections"("tokenExpiresAt");

-- CreateIndex
CREATE INDEX "wearable_connections_lastSyncedAt_idx" ON "wearable_connections"("lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "wearable_connections_userId_platform_key" ON "wearable_connections"("userId", "platform");

-- CreateIndex
CREATE INDEX "system_audit_logs_actorId_createdAt_idx" ON "system_audit_logs"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "system_audit_logs_resourceType_resourceId_createdAt_idx" ON "system_audit_logs"("resourceType", "resourceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "system_audit_logs_action_createdAt_idx" ON "system_audit_logs"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "dispute_tickets_userId_status_idx" ON "dispute_tickets"("userId", "status");

-- CreateIndex
CREATE INDEX "dispute_tickets_status_slaDeadline_idx" ON "dispute_tickets"("status", "slaDeadline");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_task_logs" ADD CONSTRAINT "daily_task_logs_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_task_logs" ADD CONSTRAINT "daily_task_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_task_logs" ADD CONSTRAINT "daily_task_logs_activitySessionId_fkey" FOREIGN KEY ("activitySessionId") REFERENCES "activity_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_points" ADD CONSTRAINT "route_points_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "activity_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "user_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_bank_accounts" ADD CONSTRAINT "user_bank_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streak_shield_subscriptions" ADD CONSTRAINT "streak_shield_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitcoin_ledger" ADD CONSTRAINT "fitcoin_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chat_messages" ADD CONSTRAINT "group_chat_messages_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chat_messages" ADD CONSTRAINT "group_chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "group_chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "badge_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_cache" ADD CONSTRAINT "leaderboard_cache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wearable_connections" ADD CONSTRAINT "wearable_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_audit_logs" ADD CONSTRAINT "system_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_tickets" ADD CONSTRAINT "dispute_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_tickets" ADD CONSTRAINT "dispute_tickets_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
