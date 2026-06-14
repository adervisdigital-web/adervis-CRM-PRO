import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Deployed with --no-verify-jwt because Telegram sends updates without a user JWT.
// Security: Telegram sends to this exact URL which only we know; no secret is required
// beyond the URL obscurity (standard Telegram webhook pattern).

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) return new Response("Missing TELEGRAM_BOT_TOKEN", { status: 500 });

  let update: { message?: { chat?: { id?: number; first_name?: string }; text?: string } };
  try { update = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }

  const msg = update.message;
  if (!msg?.chat?.id) return new Response("ok", { status: 200 });

  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const firstName = msg.chat.first_name || "";

  let reply = "";
  if (text.startsWith("/start")) {
    reply =
      `👋 Привет${firstName ? `, ${firstName}` : ""}!\n\n` +
      `Это бот уведомлений <b>Adervis CRM</b>.\n\n` +
      `Ваш Chat ID:\n<code>${chatId}</code>\n\n` +
      `Скопируйте его и вставьте в профиль Adervis CRM → раздел «Уведомления».`;
  } else {
    reply =
      `Ваш Chat ID: <code>${chatId}</code>\n\n` +
      `Вставьте его в профиль Adervis CRM → раздел «Уведомления».`;
  }

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: reply, parse_mode: "HTML" }),
  });

  return new Response("ok", { status: 200 });
});
