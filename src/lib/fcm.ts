import { initializeApp, cert, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { prisma } from './prisma.js';

let app: App | null = null;
let messaging: Messaging | null = null;

function getFirebaseApp(): App {
  if (app) return app;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    try {
      app = initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
    } catch (err) {
      console.error('[FCM] Failed to initialize with service account:', err);
    }
  } else {
    try {
      app = initializeApp();
      console.warn('[FCM] Initialized without credentials — push notifications will not work until FIREBASE_SERVICE_ACCOUNT is set');
    } catch {
      // Already initialized
    }
  }

  return app!;
}

function getMessagingService(): Messaging | null {
  if (messaging) return messaging;
  try {
    const fApp = getFirebaseApp();
    messaging = getMessaging(fApp);
    return messaging;
  } catch {
    return null;
  }
}

export async function sendPushNotification(
  tokens: string[],
  notification: { title: string; body: string },
  data?: Record<string, string>,
): Promise<{ successCount: number; failureCount: number }> {
  if (!tokens.length) return { successCount: 0, failureCount: 0 };

  const msg = getMessagingService();
  if (!msg) {
    console.warn('[FCM] Messaging not initialized — skipping push');
    return { successCount: 0, failureCount: tokens.length };
  }

  try {
    const response = await msg.sendEachForMulticast({
      tokens,
      notification,
      data,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (err) {
    console.error('[FCM] sendPushNotification error:', err);
    return { successCount: 0, failureCount: tokens.length };
  }
}

export async function sendPushToUser(
  userId: string,
  notification: { title: string; body: string },
  data?: Record<string, string>,
): Promise<{ successCount: number; failureCount: number }> {
  const devices = await prisma.userDevice.findMany({
    where: { userId, isActive: true },
    select: { deviceToken: true },
  });

  const tokens = devices.map((d: { deviceToken: string }) => d.deviceToken);
  return sendPushNotification(tokens, notification, data);
}
