import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Badge definitions
  const badges = [
    { slug: 'first-goal', name: 'First Step', description: 'Complete your first goal', category: 'goal' as const, iconUrl: '/badges/first-goal.png', rarity: 'common' as const, requirementType: 'goals_completed' as const, requirementValue: 1, fitcoinReward: 10 },
    { slug: 'streak-7', name: 'Week Warrior', description: 'Maintain a 7-day streak', category: 'streak' as const, iconUrl: '/badges/streak-7.png', rarity: 'common' as const, requirementType: 'streak_days' as const, requirementValue: 7, fitcoinReward: 25 },
    { slug: 'streak-30', name: 'Monthly Master', description: 'Maintain a 30-day streak', category: 'streak' as const, iconUrl: '/badges/streak-30.png', rarity: 'rare' as const, requirementType: 'streak_days' as const, requirementValue: 30, fitcoinReward: 100 },
    { slug: 'streak-100', name: 'Century Club', description: 'Maintain a 100-day streak', category: 'streak' as const, iconUrl: '/badges/streak-100.png', rarity: 'epic' as const, requirementType: 'streak_days' as const, requirementValue: 100, fitcoinReward: 500 },
    { slug: 'challenge-winner', name: 'Challenge Champ', description: 'Win a challenge', category: 'challenge' as const, iconUrl: '/badges/challenge-winner.png', rarity: 'rare' as const, requirementType: 'challenges_won' as const, requirementValue: 1, fitcoinReward: 50 },
    { slug: 'earn-100', name: 'Hundred Club', description: 'Earn ₹100 total', category: 'financial' as const, iconUrl: '/badges/earn-100.png', rarity: 'common' as const, requirementType: 'amount_earned' as const, requirementValue: 10000, fitcoinReward: 15 },
    { slug: 'earn-1000', name: 'Serious Saver', description: 'Earn ₹1,000 total', category: 'financial' as const, iconUrl: '/badges/earn-1000.png', rarity: 'rare' as const, requirementType: 'amount_earned' as const, requirementValue: 100000, fitcoinReward: 75 },
  ];

  for (const badge of badges) {
    await prisma.badgeDefinition.upsert({
      where: { slug: badge.slug },
      create: badge,
      update: {},
    });
  }
  console.log(`  ✓ ${badges.length} badge definitions`);

  // Goal templates
  const templates = [
    { activityType: 'running' as const, title: 'Run 5K Daily', taskDescription: 'Run 5 kilometers', targetValue: 5, targetUnit: 'km' as const, verificationMethod: 'gps' as const, durationDays: 30, earnbackRate: 1.0 },
    { activityType: 'walking' as const, title: 'Walk 10K Steps', taskDescription: 'Walk 10,000 steps', targetValue: 10000, targetUnit: 'steps' as const, verificationMethod: 'gps' as const, durationDays: 30, earnbackRate: 1.0 },
    { activityType: 'yoga' as const, title: 'Yoga Session', taskDescription: 'Complete a 30-minute yoga session', targetValue: 30, targetUnit: 'minutes' as const, verificationMethod: 'manual' as const, durationDays: 30, earnbackRate: 1.0 },
    { activityType: 'meditation' as const, title: 'Daily Meditation', taskDescription: 'Meditate for 15 minutes', targetValue: 15, targetUnit: 'minutes' as const, verificationMethod: 'manual' as const, durationDays: 30, earnbackRate: 1.0 },
    { activityType: 'strength' as const, title: 'Strength Training', taskDescription: 'Complete a strength workout session', targetValue: 1, targetUnit: 'sessions' as const, verificationMethod: 'photo' as const, durationDays: 30, earnbackRate: 1.0 },
    { activityType: 'cycling' as const, title: 'Cycle 15K', taskDescription: 'Cycle 15 kilometers', targetValue: 15, targetUnit: 'km' as const, verificationMethod: 'gps' as const, durationDays: 30, earnbackRate: 1.0 },
  ];

  console.log(`  ✓ ${templates.length} goal templates ready (not stored in DB)`);

  // Sample challenges
  const challenges = [
    {
      title: 'Weekend Warrior 5K',
      description: 'Run 5K every day for a week',
      activityType: 'running' as const,
      challengeType: 'public' as const,
      prizeModel: 'proportional' as const,
      dailyTaskDesc: 'Run 5 kilometers',
      targetValue: 5,
      targetUnit: 'km' as const,
      verificationMethod: 'gps' as const,
      entryStake: 50,
      minParticipants: 2,
      maxParticipants: 50,
      durationDays: 7,
      prizePool: 0,
      platformFeePct: 0.08,
      inviteCode: 'WARRIOR5K',
      status: 'open' as const,
      registrationStart: new Date(),
      registrationEnd: new Date(Date.now() + 7 * 86400000),
      challengeStart: new Date(Date.now() + 7 * 86400000 + 86400000),
      challengeEnd: new Date(Date.now() + 14 * 86400000 + 86400000),
    },
    {
      title: '10K Steps Daily',
      description: 'Walk 10,000 steps every day for 2 weeks',
      activityType: 'walking' as const,
      challengeType: 'public' as const,
      prizeModel: 'proportional' as const,
      dailyTaskDesc: 'Walk 10,000 steps',
      targetValue: 10000,
      targetUnit: 'steps' as const,
      verificationMethod: 'gps' as const,
      entryStake: 100,
      minParticipants: 2,
      maxParticipants: 100,
      durationDays: 14,
      prizePool: 0,
      platformFeePct: 0.08,
      inviteCode: 'STEPS10K',
      status: 'open' as const,
      registrationStart: new Date(),
      registrationEnd: new Date(Date.now() + 7 * 86400000),
      challengeStart: new Date(Date.now() + 7 * 86400000 + 86400000),
      challengeEnd: new Date(Date.now() + 21 * 86400000 + 86400000),
    },
  ];

  // Challenges need a creator user — skip if no users exist
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    const firstUser = await prisma.user.findFirst();
    for (const challenge of challenges) {
      await prisma.challenge.upsert({
        where: { inviteCode: challenge.inviteCode },
        create: { ...challenge, creatorId: firstUser!.id },
        update: {},
      });
    }
    console.log(`  ✓ ${challenges.length} sample challenges`);
  } else {
    console.log(`  - Skipped challenges (no users exist yet)`);
  }

  console.log('Seed complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
