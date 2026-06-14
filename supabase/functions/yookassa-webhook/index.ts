import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// How many days each plan adds to the subscription
const PLAN_DAYS: Record<string, number> = {
  month1: 30,
  month3: 90,
  month6: 180,
  year:   365,
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // We only care about successful payments
  if (body.event !== "payment.succeeded") {
    return new Response("ok", { status: 200 });
  }

  const notifiedPayment = body.object as Record<string, unknown>;
  const paymentId = notifiedPayment?.id as string | undefined;
  if (!paymentId) {
    return new Response("Missing payment id", { status: 400 });
  }

  // SECURITY: never trust the webhook body directly — this endpoint is public
  // and unauthenticated (YooKassa can't send a Supabase JWT). Anyone could POST
  // a forged "payment.succeeded" event with arbitrary metadata.userId/planId and
  // get a free subscription. Re-fetch the payment from YooKassa's API using our
  // shop secret — only YooKassa can produce a "succeeded" response for a real
  // payment id, so this can't be spoofed.
  const shopId = Deno.env.get("YOOKASSA_SHOP_ID")!;
  const secret = Deno.env.get("YOOKASSA_SECRET_KEY")!;
  const verifyResp = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    headers: { "Authorization": "Basic " + btoa(`${shopId}:${secret}`) },
  });
  if (!verifyResp.ok) {
    console.error("Webhook: failed to verify payment with YooKassa", paymentId, verifyResp.status);
    return new Response("Verification failed", { status: 502 });
  }
  const payment = await verifyResp.json() as Record<string, unknown>;
  if (payment.status !== "succeeded") {
    console.error("Webhook: YooKassa says payment is not succeeded", paymentId, payment.status);
    return new Response("ok", { status: 200 });
  }

  const metadata = (payment.metadata ?? {}) as Record<string, string>;

  // Use service role to bypass RLS
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Аванс клиента через клиентский портал ──────────────────────────────
  if (metadata.type === "portal_advance") {
    const { portalId } = metadata;
    if (!portalId) {
      console.error("Webhook: portal_advance missing portalId", metadata);
      return new Response("Missing portalId", { status: 400 });
    }
    const { error: advErr } = await supabase.rpc("mark_portal_advance_paid", {
      p_portal_id:  portalId,
      p_payment_id: paymentId,
    });
    if (advErr) {
      console.error("Webhook: mark_portal_advance_paid error", advErr);
      return new Response("DB error", { status: 500 });
    }
    console.log(`Portal advance paid: portal=${portalId} payment=${paymentId}`);
    return new Response("ok", { status: 200 });
  }

  // ── Подписка агентства ──────────────────────────────────────────────────
  const { userId, planId, promoCode } = metadata;
  const discountPercent = Number(metadata.discountPercent) || 0;

  if (!userId || !planId) {
    console.error("Webhook: missing metadata userId/planId", metadata);
    return new Response("Missing metadata", { status: 400 });
  }

  const days = PLAN_DAYS[planId];
  if (!days) {
    console.error("Webhook: unknown planId", planId);
    return new Response("Unknown plan", { status: 400 });
  }

  // Load current profile to know if we should extend or start fresh
  const { data: profile, error: fetchErr } = await supabase
    .from("profiles")
    .select("subscription_expires_at, subscription_status, yookassa_last_payment_id")
    .eq("id", userId)
    .single();

  if (fetchErr) {
    console.error("Webhook: profile fetch error", fetchErr);
    return new Response("Profile not found", { status: 404 });
  }

  // Idempotency — YooKassa may redeliver the same notification; don't extend twice
  if (profile.yookassa_last_payment_id === paymentId) {
    return new Response("Already processed", { status: 200 });
  }

  const now = new Date();
  let base = now;

  // If subscription is still active, extend from its current end date
  if (profile.subscription_status === "active" && profile.subscription_expires_at) {
    const existing = new Date(profile.subscription_expires_at);
    if (existing > now) base = existing;
  }

  const newExpiry = new Date(base);
  newExpiry.setDate(newExpiry.getDate() + days);

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      subscription_status:      "active",
      subscription_plan:        planId,
      subscription_expires_at:  newExpiry.toISOString(),
      yookassa_last_payment_id: paymentId,
    })
    .eq("id", userId);

  if (updateErr) {
    console.error("Webhook: profile update error", updateErr);
    return new Response("DB error", { status: 500 });
  }

  // Count the promo use only now that the payment has actually succeeded —
  // counting at payment creation (old behavior in create-payment) let abandoned
  // checkouts burn through a limited-use code without anyone actually paying.
  if (promoCode && discountPercent > 0) {
    const { error: promoErr } = await supabase.rpc("increment_promo_uses", { p_code: promoCode });
    if (promoErr) console.error("Webhook: promo increment error", promoErr);
  }

  // Реферальный бонус — 30 дней реферреру при первой оплате реферала
  // grant_referral_bonus сама проверяет referred_by_agency_id и идемпотентность
  const { error: refErr } = await supabase.rpc("grant_referral_bonus", {
    p_referred_user_id: userId,
    p_bonus_days:       30,
  });
  if (refErr) console.error("Webhook: grant_referral_bonus error", refErr);

  console.log(`Subscription activated: user=${userId} plan=${planId} expires=${newExpiry.toISOString()}`);
  return new Response("ok", { status: 200 });
});
