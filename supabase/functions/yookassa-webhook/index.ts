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

  const payment = body.object as Record<string, unknown>;
  if (payment.status !== "succeeded") {
    return new Response("ok", { status: 200 });
  }

  const metadata = (payment.metadata ?? {}) as Record<string, string>;
  const { userId, planId } = metadata;

  if (!userId || !planId) {
    console.error("Webhook: missing metadata userId/planId", metadata);
    return new Response("Missing metadata", { status: 400 });
  }

  const days = PLAN_DAYS[planId];
  if (!days) {
    console.error("Webhook: unknown planId", planId);
    return new Response("Unknown plan", { status: 400 });
  }

  // Use service role to bypass RLS and update the profile
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Load current profile to know if we should extend or start fresh
  const { data: profile, error: fetchErr } = await supabase
    .from("profiles")
    .select("subscription_expires_at, subscription_status")
    .eq("id", userId)
    .single();

  if (fetchErr) {
    console.error("Webhook: profile fetch error", fetchErr);
    return new Response("Profile not found", { status: 404 });
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
      yookassa_last_payment_id: payment.id as string,
    })
    .eq("id", userId);

  if (updateErr) {
    console.error("Webhook: profile update error", updateErr);
    return new Response("DB error", { status: 500 });
  }

  console.log(`Subscription activated: user=${userId} plan=${planId} expires=${newExpiry.toISOString()}`);
  return new Response("ok", { status: 200 });
});
