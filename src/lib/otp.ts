import { Resend } from 'resend';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

const devLog = process.env.NODE_ENV !== 'production' ? console.log : (..._args: unknown[]) => {};

const resend = new Resend(process.env.RESEND_API_KEY);

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 60;

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendEmailOtp(email: string): Promise<{ success: boolean; error?: string; cooldown?: number }> {
  // Check cooldown
  const recentOtp = await prisma.otpVerification.findFirst({
    where: {
      identifier: email,
      identifierType: 'email',
      createdAt: { gte: new Date(Date.now() - COOLDOWN_SECONDS * 1000) },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recentOtp) {
    const elapsed = Math.floor((Date.now() - recentOtp.createdAt.getTime()) / 1000);
    const remaining = COOLDOWN_SECONDS - elapsed;
    if (remaining > 0) {
      return { success: false, error: `Please wait ${remaining} seconds before requesting a new code`, cooldown: remaining };
    }
  }

  // Invalidate any existing unverified OTPs for this email
  await prisma.otpVerification.deleteMany({
    where: { identifier: email, identifierType: 'email', verified: false },
  });

  // Generate and hash OTP
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Store in DB
  await prisma.otpVerification.create({
    data: {
      identifier: email,
      identifierType: 'email',
      otpHash,
      expiresAt,
      maxAttempts: MAX_ATTEMPTS,
    },
  });

  // Send email via Resend
  try {
    const fromEmail = process.env.OTP_FROM_EMAIL || 'FitStake <otp@fitstake.com>';
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Your FitStake Verification Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="margin:0;padding:0;background:#0A0A18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
          <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
            <div style="text-align:center;margin-bottom:32px;">
              <div style="display:inline-block;width:56px;height:56px;background:linear-gradient(135deg,#0F4C75,#FF6B35);border-radius:14px;line-height:56px;font-size:28px;">🏃</div>
            </div>
            <h1 style="color:#F0F0FF;font-size:22px;font-weight:700;text-align:center;margin:0 0 8px;">Verify your email</h1>
            <p style="color:#9090B8;font-size:15px;text-align:center;margin:0 0 32px;line-height:1.6;">Use the code below to verify your FitStake account. It expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
            <div style="background:#12122A;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:32px;">
              <div style="font-size:36px;font-weight:800;letter-spacing:12px;color:#FF6B35;font-family:'Courier New',monospace;">${otp}</div>
            </div>
            <p style="color:#5A5A80;font-size:13px;text-align:center;margin:0;line-height:1.6;">If you didn't request this, you can safely ignore this email.<br>FitStake Technologies Pvt. Ltd.</p>
          </div>
        </body>
        </html>
      `,
    });

    devLog(`[OTP] Email sent to ${email}`);
    return { success: true };
  } catch (err) {
    devLog(`[OTP] Failed to send email to ${email}:`, err);
    // In dev mode, log the OTP so testing is possible
    if (process.env.NODE_ENV !== 'production') {
      devLog(`[OTP] DEV MODE — Code for ${email}: ${otp}`);
    }
    return { success: false, error: 'Failed to send verification email. Please try again.' };
  }
}

export async function verifyEmailOtp(email: string, otp: string): Promise<{ success: boolean; error?: string }> {
  const record = await prisma.otpVerification.findFirst({
    where: {
      identifier: email,
      identifierType: 'email',
      verified: false,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    return { success: false, error: 'No valid code found. Please request a new one.' };
  }

  // Check attempt limit
  if (record.attempts >= record.maxAttempts) {
    return { success: false, error: 'Too many attempts. Please request a new code.' };
  }

  // Increment attempts
  await prisma.otpVerification.update({
    where: { id: record.id },
    data: { attempts: { increment: 1 } },
  });

  // Verify OTP
  const valid = await bcrypt.compare(otp, record.otpHash);
  if (!valid) {
    const remaining = record.maxAttempts - record.attempts - 1;
    return { success: false, error: remaining > 0 ? `Invalid code. ${remaining} attempts remaining.` : 'Too many failed attempts. Please request a new code.' };
  }

  // Mark as verified
  await prisma.otpVerification.update({
    where: { id: record.id },
    data: { verified: true, usedAt: new Date() },
  });

  devLog(`[OTP] Email ${email} verified successfully`);
  return { success: true };
}
