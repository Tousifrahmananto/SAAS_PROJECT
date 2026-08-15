import { env } from "../config/env.js";

interface CheckoutInput {
  transactionId: string;
  amount: string;
  invoiceNo: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerAddress?: string;
}

interface SessionResponse {
  status?: string;
  failedreason?: string;
  sessionkey?: string;
  GatewayPageURL?: string;
  BQRPaymentURL?: string;
  desc?: Array<{ name?: string; gw?: string; redirectGatewayURL?: string }>;
}

interface ValidationResponse {
  status?: string;
  tran_id?: string;
  val_id?: string;
  amount?: string;
  currency?: string;
  bank_tran_id?: string;
  card_type?: string;
  risk_level?: string;
  APIConnect?: string;
}

function gatewayBase() {
  return env.SSLCOMMERZ_SANDBOX ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
}

export function sslCommerzConfigured() {
  return Boolean(env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWORD);
}

export async function createSslCommerzSession(input: CheckoutInput) {
  if (!env.SSLCOMMERZ_STORE_ID || !env.SSLCOMMERZ_STORE_PASSWORD) throw new Error("SSLCOMMERZ is not configured");
  const form = new URLSearchParams({
    store_id: env.SSLCOMMERZ_STORE_ID,
    store_passwd: env.SSLCOMMERZ_STORE_PASSWORD,
    total_amount: input.amount,
    currency: "BDT",
    tran_id: input.transactionId,
    success_url: `${env.SERVER_URL}/api/payments/sslcommerz/success`,
    fail_url: `${env.SERVER_URL}/api/payments/sslcommerz/fail`,
    cancel_url: `${env.SERVER_URL}/api/payments/sslcommerz/cancel`,
    ipn_url: `${env.SERVER_URL}/api/payments/sslcommerz/ipn`,
    cus_name: input.customerName,
    cus_email: input.customerEmail,
    cus_add1: input.customerAddress || "Dhaka",
    cus_city: "Dhaka",
    cus_country: "Bangladesh",
    cus_phone: input.customerPhone || "01700000000",
    shipping_method: "NO",
    product_name: `Hospital invoice ${input.invoiceNo}`,
    product_category: "Healthcare",
    product_profile: "general",
    value_a: input.invoiceNo
  });
  const response = await fetch(`${gatewayBase()}/gwprocess/v4/api.php`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form
  });
  if (!response.ok) throw new Error(`SSLCOMMERZ session request returned ${response.status}`);
  const payload = await response.json() as SessionResponse;
  if (payload.status !== "SUCCESS" || !payload.GatewayPageURL || !payload.sessionkey) {
    throw new Error(payload.failedreason || "SSLCOMMERZ session creation failed");
  }
  return {
    sessionKey: payload.sessionkey,
    checkoutUrl: payload.GatewayPageURL,
    banglaQrUrl: payload.BQRPaymentURL || payload.desc?.find((gateway) => /bangla\s*qr|bqr/i.test(`${gateway.name ?? ""} ${gateway.gw ?? ""}`))?.redirectGatewayURL || ""
  };
}

export async function validateSslCommerzPayment(validationId: string) {
  if (!env.SSLCOMMERZ_STORE_ID || !env.SSLCOMMERZ_STORE_PASSWORD) throw new Error("SSLCOMMERZ is not configured");
  const query = new URLSearchParams({
    val_id: validationId,
    store_id: env.SSLCOMMERZ_STORE_ID,
    store_passwd: env.SSLCOMMERZ_STORE_PASSWORD,
    v: "1",
    format: "json"
  });
  const response = await fetch(`${gatewayBase()}/validator/api/validationserverAPI.php?${query}`);
  if (!response.ok) throw new Error(`SSLCOMMERZ validation returned ${response.status}`);
  return response.json() as Promise<ValidationResponse>;
}

export async function initiateSslCommerzRefund(input: { bankTransactionId: string; refundId: string; amount: string; reason: string }) {
  if (!env.SSLCOMMERZ_STORE_ID || !env.SSLCOMMERZ_STORE_PASSWORD) throw new Error("SSLCOMMERZ is not configured");
  const query = new URLSearchParams({
    bank_tran_id: input.bankTransactionId,
    refund_trans_id: input.refundId,
    refund_amount: input.amount,
    refund_remarks: input.reason,
    store_id: env.SSLCOMMERZ_STORE_ID,
    store_passwd: env.SSLCOMMERZ_STORE_PASSWORD,
    v: "1",
    format: "json"
  });
  const response = await fetch(`${gatewayBase()}/validator/api/merchantTransIDvalidationAPI.php?${query}`);
  if (!response.ok) throw new Error(`SSLCOMMERZ refund returned ${response.status}`);
  return response.json() as Promise<{ APIConnect?: string; status?: string; refund_ref_id?: string; errorReason?: string }>;
}
