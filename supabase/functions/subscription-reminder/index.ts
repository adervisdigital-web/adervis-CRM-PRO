import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sends a "your subscription/trial ends in 3 days" email so users renew before
// losing access — direct effect on trial→paid conversion and renewal churn.
// Trigger this function on a daily schedule (pg_cron + pg_net, or an external
// cron hitting the function URL with the service role key).

// Sender must be on the domain verified in Resend (app.adervis.ru, not the apex adervis.ru)
const RESEND_FROM = "ADERVIS CRM <noreply@app.adervis.ru>";
const REPLY_TO = "adervis.digital@gmail.com";

serve(async (req) => {
  // SECURITY: deployed with --no-verify-jwt (pg_cron has no Supabase user JWT to send),
  // so we gate it ourselves with a shared secret known only to the cron job and this function.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return new Response("Missing RESEND_API_KEY secret", { status: 500 });

  const appUrl = Deno.env.get("APP_URL") ?? "https://app.adervis.ru";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const windowStart = new Date(now.getTime() + 3 * 86400000);
  const windowEnd = new Date(now.getTime() + 4 * 86400000);

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, subscription_status, subscription_plan, subscription_expires_at, reminder_sent_at")
    .in("subscription_status", ["active", "trial"])
    .gte("subscription_expires_at", windowStart.toISOString())
    .lt("subscription_expires_at", windowEnd.toISOString());

  if (error) {
    console.error("subscription-reminder: fetch error", error);
    return new Response("DB error", { status: 500 });
  }

  let sent = 0;
  for (const p of profiles ?? []) {
    if (!p.email) continue;

    // Don't re-send for the same expiry date (idempotent across daily reruns)
    if (p.reminder_sent_at && p.subscription_expires_at) {
      const lastSent = new Date(p.reminder_sent_at);
      const expires = new Date(p.subscription_expires_at);
      if (expires.getTime() - lastSent.getTime() < 5 * 86400000) continue;
    }

    const isTrial = p.subscription_status === "trial";
    const expiresLabel = new Date(p.subscription_expires_at).toLocaleDateString("ru-RU");
    const subject = isTrial
      ? "Пробный период ADERVIS CRM заканчивается через 3 дня"
      : "Подписка ADERVIS CRM заканчивается через 3 дня";
    const html = `
      <p>Здравствуйте!</p>
      <p>${isTrial ? "Ваш бесплатный пробный период" : "Ваша подписка ADERVIS CRM"}
         заканчивается <strong>${expiresLabel}</strong>.</p>
      <p>Чтобы продолжить работу с CRM, сметами и клиентскими КП без перерыва — продлите тариф:</p>
      <p><a href="${appUrl}">Продлить подписку →</a></p>
      <p style="color:#888;font-size:12px">Все ваши данные сохранены и никуда не денутся, даже если срок закончится — вы продолжите с того же места сразу после оплаты.</p>
    `;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to: p.email, subject, html, reply_to: REPLY_TO }),
    });

    if (resp.ok) {
      sent++;
      await supabase.from("profiles").update({ reminder_sent_at: now.toISOString() }).eq("id", p.id);
    } else {
      console.error("subscription-reminder: send failed for", p.email, resp.status, await resp.text());
    }
  }

  return new Response(`Sent ${sent} reminder(s)`, { status: 200 });
});
