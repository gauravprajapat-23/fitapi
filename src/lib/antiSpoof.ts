// Anti-spoofing validation utilities for GPS tracking and activity sessions

const MAX_RUNNING_SPEED_KMH = 25;
const MAX_CYCLING_SPEED_KMH = 45;
const MAX_WALKING_SPEED_KMH = 10;
const MAX_YOGA_STRENGTH_SPEED_KMH = 5;
const TELEPORT_DISTANCE_KM = 5;
const MAX_GPS_ACCURACY_METERS = 50;
const MIN_ROUTE_POINTS = 2;
const DURATION_TOLERANCE = 0.15; // 15% tolerance
const DISTANCE_TOLERANCE = 0.25; // 25% tolerance

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getMaxSpeedForActivity(activityType: string): number {
  switch (activityType) {
    case 'running': return MAX_RUNNING_SPEED_KMH;
    case 'cycling': return MAX_CYCLING_SPEED_KMH;
    case 'walking': return MAX_WALKING_SPEED_KMH;
    case 'yoga':
    case 'strength':
    case 'meditation': return MAX_YOGA_STRENGTH_SPEED_KMH;
    default: return MAX_RUNNING_SPEED_KMH;
  }
}

export interface AntiSpoofResult {
  passed: boolean;
  flags: string[];
  score: number; // 0-100, higher is more suspicious
}

export function validateRoutePoints(
  routePoints: Array<{ latitude: number; longitude: number; speedMps?: number; accuracyMeters?: number; recordedAt: string }>,
  activityType: string,
  claimedDistanceMeters: number,
  durationSeconds: number,
): AntiSpoofResult {
  const flags: string[] = [];
  let score = 0;

  if (routePoints.length < MIN_ROUTE_POINTS) {
    flags.push('INSUFFICIENT_ROUTE_POINTS');
    score += 40;
  }

  let totalDistance = 0;
  let maxSpeed = 0;
  let lowAccuracyCount = 0;
  let teleportDetected = false;
  let timestampOrderValid = true;

  for (let i = 1; i < routePoints.length; i++) {
    const prev = routePoints[i - 1];
    const curr = routePoints[i];

    const dist = haversineDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    totalDistance += dist;

    if (dist > TELEPORT_DISTANCE_KM) {
      teleportDetected = true;
      flags.push(`TELEPORT_DETECTED_BETWEEN_POINTS_${i - 1}_${i}`);
      score += 30;
    }

    if (curr.speedMps !== undefined) {
      const speedKmh = curr.speedMps * 3.6;
      if (speedKmh > maxSpeed) maxSpeed = speedKmh;
    }

    if (curr.accuracyMeters !== undefined && curr.accuracyMeters > MAX_GPS_ACCURACY_METERS) {
      lowAccuracyCount++;
    }

    const prevTime = new Date(prev.recordedAt).getTime();
    const currTime = new Date(curr.recordedAt).getTime();
    if (currTime <= prevTime) {
      timestampOrderValid = false;
      flags.push('NON_MONOTONIC_TIMESTAMPS');
      score += 20;
    }
  }

  if (!teleportDetected) {
    flags.push('NO_TELEPORT');
  }

  const maxAllowedSpeed = getMaxSpeedForActivity(activityType);
  if (maxSpeed > maxAllowedSpeed * 1.5) {
    flags.push(`IMPOSSIBLE_SPEED_${maxSpeed.toFixed(1)}_KMH`);
    score += 25;
  } else if (maxSpeed > maxAllowedSpeed) {
    flags.push(`SPEED_WARNING_${maxSpeed.toFixed(1)}_KMH`);
    score += 10;
  }

  if (lowAccuracyCount > routePoints.length * 0.5) {
    flags.push('LOW_GPS_ACCURACY');
    score += 15;
  }

  if (claimedDistanceMeters > 0 && totalDistance > 0) {
    const claimedKm = claimedDistanceMeters / 1000;
    const calculatedKm = totalDistance;
    const deviation = Math.abs(claimedKm - calculatedKm) / calculatedKm;
    if (deviation > DISTANCE_TOLERANCE) {
      flags.push(`DISTANCE_MISMATCH_CLAIMED_${claimedKm.toFixed(2)}_CALCULATED_${calculatedKm.toFixed(2)}`);
      score += 20;
    }
  }

  if (durationSeconds > 0) {
    const avgSpeedKmh = (totalDistance / (durationSeconds / 3600));
    if (avgSpeedKmh > maxAllowedSpeed * 1.5) {
      flags.push('IMPOSSIBLE_AVG_SPEED');
      score += 20;
    }
  }

  const passed = score < 30;

  return { passed, flags, score: Math.min(100, score) };
}

export function validateSessionTimestamps(
  startedAt: string,
  endedAt: string,
  durationSeconds: number,
): AntiSpoofResult {
  const flags: string[] = [];
  let score = 0;

  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const now = Date.now();

  if (end > now + 60000) {
    flags.push('FUTURE_TIMESTAMP');
    score += 30;
  }

  if (start > end) {
    flags.push('START_AFTER_END');
    score += 40;
  }

  const actualDuration = (end - start) / 1000;
  if (durationSeconds > 0 && actualDuration > 0) {
    const deviation = Math.abs(actualDuration - durationSeconds) / actualDuration;
    if (deviation > DURATION_TOLERANCE) {
      flags.push(`DURATION_MISMATCH_CLAIMED_${durationSeconds}_ACTUAL_${Math.round(actualDuration)}`);
      score += 20;
    }
  }

  if (actualDuration > 24 * 3600) {
    flags.push('SESSION_LONGER_THAN_24H');
    score += 25;
  }

  const passed = score < 30;

  return { passed, flags, score: Math.min(100, score) };
}

export function validateActivitySession(params: {
  activityType: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  distanceMeters?: number;
  routePoints?: Array<{ latitude: number; longitude: number; speedMps?: number; accuracyMeters?: number; recordedAt: string }>;
  goalActivityType?: string;
  challengeActivityType?: string;
  goalStartDate?: string;
  goalEndDate?: string;
  challengeStartDate?: string;
  challengeEndDate?: string;
}): AntiSpoofResult {
  const allFlags: string[] = [];
  let totalScore = 0;

  const tsResult = validateSessionTimestamps(params.startedAt, params.endedAt, params.durationSeconds);
  allFlags.push(...tsResult.flags);
  totalScore += tsResult.score;

  if (params.routePoints && params.routePoints.length > 0 && params.distanceMeters) {
    const routeResult = validateRoutePoints(
      params.routePoints,
      params.activityType,
      params.distanceMeters,
      params.durationSeconds,
    );
    allFlags.push(...routeResult.flags);
    totalScore += routeResult.score;
  } else if (params.activityType !== 'yoga' && params.activityType !== 'strength' && params.activityType !== 'meditation') {
    if (!params.routePoints || params.routePoints.length === 0) {
      allFlags.push('NO_ROUTE_POINTS_FOR_GPS_ACTIVITY');
      totalScore += 30;
    }
  }

  if (params.goalActivityType && params.activityType !== params.goalActivityType) {
    allFlags.push(`ACTIVITY_TYPE_MISMATCH_SESSION_${params.activityType}_GOAL_${params.goalActivityType}`);
    totalScore += 15;
  }

  if (params.challengeActivityType && params.activityType !== params.challengeActivityType) {
    allFlags.push(`ACTIVITY_TYPE_MISMATCH_SESSION_${params.activityType}_CHALLENGE_${params.challengeActivityType}`);
    totalScore += 15;
  }

  const avgPace = params.distanceMeters && params.durationSeconds
    ? (params.durationSeconds / (params.distanceMeters / 1000))
    : 0;
  if (avgPace > 0 && avgPace < 120) {
    allFlags.push('IMPOSSIBLE_PACE');
    totalScore += 25;
  }

  const sessionStart = new Date(params.startedAt).getTime();
  const sessionEnd = new Date(params.endedAt).getTime();

  if (params.goalStartDate) {
    const goalStart = new Date(params.goalStartDate).getTime();
    if (sessionEnd < goalStart) {
      allFlags.push('SESSION_BEFORE_GOAL_START');
      totalScore += 20;
    }
  }
  if (params.goalEndDate) {
    const goalEnd = new Date(params.goalEndDate);
    goalEnd.setHours(23, 59, 59, 999);
    if (sessionStart > goalEnd.getTime()) {
      allFlags.push('SESSION_AFTER_GOAL_END');
      totalScore += 20;
    }
  }
  if (params.challengeStartDate) {
    const chStart = new Date(params.challengeStartDate).getTime();
    if (sessionEnd < chStart) {
      allFlags.push('SESSION_BEFORE_CHALLENGE_START');
      totalScore += 20;
    }
  }
  if (params.challengeEndDate) {
    const chEnd = new Date(params.challengeEndDate);
    chEnd.setHours(23, 59, 59, 999);
    if (sessionStart > chEnd.getTime()) {
      allFlags.push('SESSION_AFTER_CHALLENGE_END');
      totalScore += 20;
    }
  }

  if (params.routePoints && params.routePoints.length > 0) {
    const lowAccCount = params.routePoints.filter(
      p => p.accuracyMeters !== undefined && p.accuracyMeters > MAX_GPS_ACCURACY_METERS
    ).length;
    if (lowAccCount > params.routePoints.length * 0.8) {
      allFlags.push('REJECT_LOW_ACCURACY_SESSION');
      totalScore += 25;
    }
  }

  return {
    passed: totalScore < 30,
    flags: allFlags,
    score: Math.min(100, totalScore),
  };
}

export function validatePhotoExif(params: {
  photoExifData?: Record<string, unknown>;
  sessionStartedAt: string;
  sessionEndedAt: string;
  toleranceMinutes?: number;
}): AntiSpoofResult {
  const flags: string[] = [];
  let score = 0;
  const tolerance = (params.toleranceMinutes ?? 30) * 60 * 1000;

  if (!params.photoExifData) {
    return { passed: true, flags: ['NO_EXIF_DATA'], score: 0 };
  }

  const exifDate = params.photoExifData.DateTimeOriginal
    || params.photoExifData.DateTimeDigitized
    || params.photoExifData.DateTime;

  if (!exifDate || typeof exifDate !== 'string') {
    flags.push('NO_EXIF_TIMESTAMP');
    score += 10;
    return { passed: score < 30, flags, score: Math.min(100, score) };
  }

  const parsed = new Date(exifDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
  if (isNaN(parsed.getTime())) {
    flags.push('INVALID_EXIF_TIMESTAMP');
    score += 15;
    return { passed: score < 30, flags, score: Math.min(100, score) };
  }

  const exifTime = parsed.getTime();
  const sessionStart = new Date(params.sessionStartedAt).getTime();
  const sessionEnd = new Date(params.sessionEndedAt).getTime();

  if (exifTime < sessionStart - tolerance) {
    flags.push(`EXIF_BEFORE_SESSION_BY_${Math.round((sessionStart - exifTime) / 60000)}_MIN`);
    score += 25;
  }

  if (exifTime > sessionEnd + tolerance) {
    flags.push(`EXIF_AFTER_SESSION_BY_${Math.round((exifTime - sessionEnd) / 60000)}_MIN`);
    score += 25;
  }

  const now = Date.now();
  if (exifTime > now + 60_000) {
    flags.push('EXIF_FUTURE_TIMESTAMP');
    score += 20;
  }

  const software = params.photoExifData.Software;
  if (typeof software === 'string' && /photo.?edit|photoshop|snapseed|vsco|lightroom/i.test(software)) {
    flags.push(`EDITING_SOFTWARE_DETECTED_${software}`);
    score += 15;
  }

  return { passed: score < 30, flags, score: Math.min(100, score) };
}

export function validateChallengeCompletion(params: {
  tasksCompleted: number;
  completionPct: number;
  durationDays: number;
  existingTasksCompleted: number;
}): AntiSpoofResult {
  const flags: string[] = [];
  let score = 0;

  if (params.tasksCompleted > params.durationDays) {
    flags.push('TASKS_EXCEED_DURATION');
    score += 40;
  }

  if (params.tasksCompleted <= params.existingTasksCompleted) {
    flags.push('NO_PROGRESS_INCREMENT');
    score += 30;
  }

  const dailyIncrement = params.tasksCompleted - params.existingTasksCompleted;
  if (dailyIncrement > 1) {
    flags.push(`MULTIPLE_DAY_INCREMENT_${dailyIncrement}`);
    score += 25;
  }

  const expectedPct = Math.min(100, Math.round((params.tasksCompleted / params.durationDays) * 100));
  if (Math.abs(params.completionPct - expectedPct) > 5) {
    flags.push(`COMPLETION_PCT_MISMATCH_CLIENT_${params.completionPct}_SERVER_${expectedPct}`);
    score += 20;
  }

  const passed = score < 30;

  return { passed, flags, score: Math.min(100, score) };
}
