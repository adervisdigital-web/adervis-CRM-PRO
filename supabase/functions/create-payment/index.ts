import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://app.adervis.ru",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* Суммы платежа = цена месяца из PLANS в app.js × число месяцев. Цены подняты
   08.08.2026: 890 / 690 / 590 / 490 ₽ за месяц соответственно.

   Здесь ЧИСЛА, а не расчёт: касса не должна зависеть от того, что прислал клиент.
   Обратная сторона — два файла, которые расходятся молча, поэтому цену правим
   всегда парой (app.js PLANS ↔ этот список), и функцию после правки НУЖНО
   ЗАДЕПЛОИТЬ: без деплоя витрина покажет новую цену, а счёт придёт на старую. */
const PLANS: Record<string, { amount: number; days: number; label: string }> = {
  month1: { amount: 890,  days: 30,  label: "ADERVIS CRM — 1 месяц"   },
  month3: { amount: 2070, days: 90,  label: "ADERVIS CRM — 3 месяца"  },
  month6: { amount: 3540, days: 180, label: "ADERVIS CRM — 6 месяцев" },
  year:   { amount: 5880, days: 365, label: "ADERVIS CRM — 1 год"     },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    // User client — verifies JWT
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // Service client — needed to increment promo uses_count (bypasses RLS)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const planId: string = body.planId;
    const promoCode: string | undefined = body.promoCode?.trim().toUpperCase();

    const plan = PLANS[planId];
    if (!plan) return json({ error: "Unknown plan: " + planId }, 400);

    // Validate promo code server-side (client-side check is just UX, not security)
    let discountPercent = 0;
    if (promoCode) {
      const { data: promo } = await admin
        .from("promo_codes")
        .select("discount_percent,max_uses,uses_count,expires_at,is_active")
        .eq("code", promoCode)
        .single();

      if (
        promo &&
        promo.is_active &&
        (promo.max_uses === null || promo.uses_count < promo.max_uses) &&
        (!promo.expires_at || new Date(promo.expires_at) > new Date())
      ) {
        discountPercent = promo.discount_percent;
      }
    }

    const originalAmount = plan.amount;
    const finalAmount = discountPercent > 0
      ? Math.round(originalAmount * (1 - discountPercent / 100))
      : originalAmount;

    /* Промокод на 100% схема разрешает (CHECK BETWEEN 1 AND 100), и это
       осмысленно — «бесплатно амбассадору». Но счёт на ноль ЮKassa отклоняет, и
       человек получал невнятное «Ошибка платёжной системы: {...}» вместо
       доступа: отказ приходил от чужого сервиса, и понять, что дело в промокоде,
       было нельзя.

       Бесплатный доступ выдаётся не через кассу, а подпиской из админки —
       говорим это прямо, чтобы владелец не искал ошибку в платёжной системе. */
    if (finalAmount <= 0) {
      console.warn("create-payment: 100% promo cannot be charged", { promoCode, planId });
      return json({
        error: "Промокод даёт скидку 100% — счёт на ноль касса не принимает. "
             + "Бесплатный доступ выдаётся в админке: Пользователи → Активировать подписку.",
      }, 400);
    }

    const shopId  = Deno.env.get("YOOKASSA_SHOP_ID")!;
    const secret  = Deno.env.get("YOOKASSA_SECRET_KEY")!;
    const appUrl  = Deno.env.get("APP_URL")!;

    const description = discountPercent > 0
      ? `${plan.label} (промокод ${promoCode}, скидка ${discountPercent}%)`
      : plan.label;

    const ykResp = await fetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "Idempotence-Key": crypto.randomUUID(),
        "Authorization":   "Basic " + btoa(`${shopId}:${secret}`),
      },
      body: JSON.stringify({
        amount: { value: finalAmount.toFixed(2), currency: "RUB" },
        confirmation: {
          type: "redirect",
          return_url: `${appUrl}?payment=success&plan=${planId}`,
        },
        capture:     true,
        description,
        metadata: {
          userId: user.id,
          email:  user.email ?? "",
          planId,
          promoCode: promoCode ?? "",
          discountPercent,
        },
      }),
    });

    if (!ykResp.ok) {
      const txt = await ykResp.text();
      console.error("YooKassa error:", ykResp.status, txt);
      return json({ error: "Ошибка платёжной системы: " + txt }, 502);
    }

    const payment = await ykResp.json();

    // NOTE: promo uses_count is incremented in yookassa-webhook on confirmed
    // payment success, not here — counting at creation would let abandoned
    // checkouts burn through a limited-use code without anyone actually paying.

    return json({
      paymentUrl: payment.confirmation.confirmation_url,
      paymentId:  payment.id,
      discountPercent,
      finalAmount,
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
