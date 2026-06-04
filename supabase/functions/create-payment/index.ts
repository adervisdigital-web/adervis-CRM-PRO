import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLANS: Record<string, { amount: string; days: number; label: string }> = {
  month1: { amount: "890.00",  days: 30,  label: "Adervis PRO — 1 месяц"   },
  month3: { amount: "2220.00", days: 90,  label: "Adervis PRO — 3 месяца"  },
  month6: { amount: "3840.00", days: 180, label: "Adervis PRO — 6 месяцев" },
  year:   { amount: "6240.00", days: 365, label: "Adervis PRO — 1 год"     },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Verify JWT — creates a client acting as the calling user
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const planId: string = body.planId;
    const plan = PLANS[planId];
    if (!plan) return json({ error: "Unknown plan: " + planId }, 400);

    const shopId  = Deno.env.get("YOOKASSA_SHOP_ID")!;
    const secret  = Deno.env.get("YOOKASSA_SECRET_KEY")!;
    const appUrl  = Deno.env.get("APP_URL")!;

    const ykResp = await fetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "Idempotence-Key": crypto.randomUUID(),
        "Authorization":   "Basic " + btoa(`${shopId}:${secret}`),
      },
      body: JSON.stringify({
        amount: { value: plan.amount, currency: "RUB" },
        confirmation: {
          type: "redirect",
          return_url: `${appUrl}?payment=success&plan=${planId}`,
        },
        capture:     true,
        description: plan.label,
        metadata: {
          userId: user.id,
          email:  user.email ?? "",
          planId,
        },
      }),
    });

    if (!ykResp.ok) {
      const txt = await ykResp.text();
      console.error("YooKassa error:", ykResp.status, txt);
      return json({ error: "Ошибка платёжной системы: " + txt }, 502);
    }

    const payment = await ykResp.json();
    return json({
      paymentUrl: payment.confirmation.confirmation_url,
      paymentId:  payment.id,
    });
  } catch (e) {
    console.error("create-payment:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
