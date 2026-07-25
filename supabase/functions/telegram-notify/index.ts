import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://app.adervis.ru",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors, status: 204 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) return new Response("Missing TELEGRAM_BOT_TOKEN", { status: 500 });

  // Verify user JWT
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return new Response("Unauthorized", { status: 401 });

  let body: { chatId?: string | number; text?: string };
  try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }

  const { chatId, text } = body;
  if (!chatId || !text) {
    return new Response(JSON.stringify({ error: "chatId and text required" }), {
      status: 400, headers: { "Content-Type": "application/json", ...cors },
    });
  }

  // SECURITY: chatId — произвольный, не проверяется на принадлежность агентству
  // (нужно для кнопки «Тест» — проверка ещё не сохранённого получателя). Без
  // лимита частоты любой аутентифицированный аккаунт (даже бесплатный триал)
  // мог использовать бота как открытый релей на произвольные Telegram chat_id.
  // Счётчик — не простой gate: sendTelegramNotification() легитимно шлёт
  // несколько сообщений подряд (по одному на получателя), gate заблокировал бы
  // всех, кроме первого. См. миграцию 20260726000001_telegram_notify_rate_limit.
  const { data: allowed, error: rateErr } = await supabase.rpc("telegram_notify_rate_limit");
  if (rateErr) {
    console.error("telegram-notify: rate limit check failed", rateErr);
    return new Response("Rate limit check failed", { status: 500 });
  }
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Слишком много сообщений — попробуйте через минуту" }), {
      status: 429, headers: { "Content-Type": "application/json", ...cors },
    });
  }

  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error("telegram-notify: send failed", resp.status, err);
    return new Response(JSON.stringify({ error: err }), {
      status: 502, headers: { "Content-Type": "application/json", ...cors },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", ...cors },
  });
});
