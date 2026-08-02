import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deployed with --no-verify-jwt: клиентский портал публичный, JWT нет.
// Безопасность: portalId — UUID v4, угадать невозможно; сумма берётся из БД,
// не из запроса — клиент не может изменить сумму на стороне браузера.

const cors = {
  "Access-Control-Allow-Origin": "https://app.adervis.ru",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors, status: 204 });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Ключи сервиса — фолбэк ТОЛЬКО для агентства самого владельца (см. ниже).
  // Для всех остальных платёж создаётся ключами их собственного магазина,
  // иначе чужой аванс приходил бы на счёт владельца сервиса.
  const ownerShopId = Deno.env.get("YOOKASSA_SHOP_ID") ?? "";
  const ownerSecret = Deno.env.get("YOOKASSA_SECRET_KEY") ?? "";
  const ownerAgencyId = Deno.env.get("OWNER_AGENCY_ID") ?? "";
  const appUrl = Deno.env.get("APP_URL")!;

  if (!appUrl) {
    return json({ error: "Server misconfigured" }, 500);
  }

  let body: { portalId?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }

  const { portalId } = body;
  if (!portalId || !/^[0-9a-f-]{36}$/i.test(portalId)) {
    return json({ error: "Invalid portalId" }, 400);
  }

  // Service role — читаем данные портала (RLS не пропустит без auth)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: portal, error: dbErr } = await supabase
    .from("client_portals")
    .select("deal_name, total_price, advance_amount, advance_paid_at, agency_id, pay_method")
    .eq("id", portalId)
    .maybeSingle();

  if (dbErr || !portal) {
    return json({ error: "Portal not found" }, 404);
  }
  if (!portal.advance_amount || portal.advance_amount <= 0) {
    return json({ error: "Advance not configured for this portal" }, 400);
  }
  if (portal.advance_paid_at) {
    return json({ error: "Advance already paid" }, 409);
  }
  // Онлайн-платёж создаётся только если агентство выбрало именно этот способ.
  // «link» и «requisites» деньги через сервис не проводят вовсе.
  if (portal.pay_method && portal.pay_method !== "yookassa") {
    return json({ error: "Online payment is not enabled for this proposal" }, 400);
  }

  // Ключи магазина того агентства, чьё это КП.
  let shopId = "";
  let secret = "";
  if (portal.agency_id) {
    const { data: keys } = await supabase
      .from("agency_payment_keys")
      .select("shop_id, secret_key")
      .eq("agency_id", portal.agency_id)
      .maybeSingle();
    if (keys?.shop_id && keys?.secret_key) {
      shopId = keys.shop_id;
      secret = keys.secret_key;
    }
  }
  // Фолбэк на магазин сервиса допустим ТОЛЬКО для агентства владельца: это его
  // собственные деньги. Для любого другого агентства без своих ключей платёж
  // не создаётся — иначе выручка чужой студии уходила бы владельцу сервиса.
  if (!shopId && ownerAgencyId && portal.agency_id === ownerAgencyId) {
    shopId = ownerShopId;
    secret = ownerSecret;
  }
  if (!shopId || !secret) {
    return json({ error: "Payment is not configured for this agency" }, 409);
  }

  const amount = portal.advance_amount;
  const description = `Аванс по проекту «${portal.deal_name || "КП"}»`;

  const ykResp = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "Idempotence-Key": crypto.randomUUID(),
      "Authorization":   "Basic " + btoa(`${shopId}:${secret}`),
    },
    body: JSON.stringify({
      amount: { value: amount.toFixed(2), currency: "RUB" },
      confirmation: {
        type:       "redirect",
        return_url: `${appUrl}?portal=${portalId}&advance=paid`,
      },
      capture:     true,
      description,
      metadata: {
        type:     "portal_advance",
        portalId,
      },
    }),
  });

  if (!ykResp.ok) {
    const txt = await ykResp.text();
    console.error("YooKassa error:", ykResp.status, txt);
    return json({ error: "Ошибка платёжной системы" }, 502);
  }

  const payment = await ykResp.json();
  return json({ paymentUrl: payment.confirmation.confirmation_url });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
