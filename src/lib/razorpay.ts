import Razorpay from 'razorpay';
import crypto from 'crypto';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function createRazorpayOrder(amountPaise: number, receipt: string) {
  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    notes: { app: 'fitstake' },
  });
  return order;
}

export function verifyRazorpayPayment(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest('hex');
  return expectedSignature === signature;
}

export function verifyWebhookSignature(
  body: string,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex');
  return expectedSignature === signature;
}

// ──────────────────────────────────────────────
// RAZORPAY PAYOUTS (for withdrawals) - via RazorpayX API
// ──────────────────────────────────────────────

const RAZORPAYX_BASE_URL = 'https://api.razorpay.com/v1';

interface RazorpayXContact {
  name: string;
  email: string;
  contact: string;
  type: 'self' | 'vendor' | 'customer' | 'employee' | 'other';
  reference_id?: string;
  notes?: Record<string, string>;
}

interface RazorpayXFundAccount {
  contact_id: string;
  account_type: 'bank_account' | 'vpa' | 'card';
  bank_account?: {
    name: string;
    ifsc: string;
    account_number: string;
  };
  vpa?: {
    address: string;
  };
}

interface RazorpayXPayoutRequest {
  account_number: string;
  fund_account_id: string;
  amount: number;
  currency: 'INR';
  mode: 'IMPS' | 'NEFT' | 'RTGS' | 'UPI';
  purpose: 'refund' | 'payout' | 'salary' | 'utility_bill' | 'vendor_bill' | 'other';
  queue_if_low_balance: boolean;
  reference_id: string;
  narration?: string;
  notes?: Record<string, string>;
}

interface RazorpayXResponse<T> {
  id: string;
  entity: string;
  status?: string;
  [key: string]: any;
}

async function razorpayXRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<RazorpayXResponse<T>> {
  const keyId = process.env.RAZORPAY_KEY_ID!;
  const keySecret = process.env.RAZORPAY_KEY_SECRET!;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const res = await fetch(`${RAZORPAYX_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.description || `RazorpayX API error: ${res.status}`);
  }
  return data as RazorpayXResponse<T>;
}

export async function createPayoutContact(contact: RazorpayXContact) {
  return razorpayXRequest('POST', '/contacts', contact);
}

export async function createPayoutFundAccount(fundAccount: RazorpayXFundAccount) {
  return razorpayXRequest('POST', '/fund_accounts', fundAccount);
}

export async function createPayout(payout: RazorpayXPayoutRequest) {
  return razorpayXRequest('POST', '/payouts', payout);
}

export async function getPayout(payoutId: string) {
  return razorpayXRequest('GET', `/payouts/${payoutId}`);
}

export function verifyPayoutWebhookSignature(
  body: string,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex');
  return expectedSignature === signature;
}

export { razorpay };