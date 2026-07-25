import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public endpoint — no JWT required.
// Security: callers must know the portal UUID or agency UUID (both are UUIDs, not guessable).
// Deployed with --no-verify-jwt.

const cors = {
  "Access-Control-Allow-Origin": "https://app.adervis.ru",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!botToken) return new Response("Missing TELEGRAM_BOT_TOKEN", { status: 500 });

  let body: { type: string; portalId?: string; submissionId?: string };
  try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }

  const supabase = createClient(supabaseUrl, serviceKey);

  async function getTelegramIds(agencyId: string): Promise<string[]> {
    const { data } = await supabase
      .from("agency_state")
      .select("state_json")
      .eq("id", agencyId)
      .single();
    return (data?.state_json?.telegramChatIds || [])
      .map((r: any) => String(r.chatId))
      .filter(Boolean);
  }

  // Rate-limit: без JWT (--no-verify-jwt), единственная защита от спама — знание
  // portalId/agencyId, а оба встроены в публичные ссылки (КП-портал, бриф-форма),
  // которые агентство само раздаёт клиентам. Без этого лимита кто угодно, зная
  // ссылку, мог дёргать этот эндпоинт бесконечно и заваливать Telegram агентства
  // фейковыми уведомлениями. Проверка идёт через RPC с SELECT...FOR UPDATE —
  // атомарный check-and-set в Postgres, иначе параллельные запросы читали один
  // и тот же старый timestamp и все проходили throttle разом (TOCTOU). См.
  // migration 20260703000002_agency_notify_throttle_race_fix.sql
  async function isThrottled(agencyId: string, key: string, windowMs: number): Promise<boolean> {
    const { data } = await supabase.rpc("agency_notify_throttled", {
      p_agency_id: agencyId, p_key: key, p_window_ms: windowMs,
    });
    return !!data;
  }

  // parse_mode:"HTML": данные брифа приходят из ПУБЛИЧНОЙ формы (неаутентифиц.
  // клиент), а имена/названия могут содержать & < > — без экранирования Telegram
  // отклоняет сообщение (400) и агентство не получит уведомление, либо в него
  // просочится HTML-разметка/ссылка из пользовательского ввода.
  function esc(s: any) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function sendToAll(chatIds: string[], text: string): Promise<void> {
    for (const chatId of chatIds) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      });
    }
  }

  const ok = (msg = "ok") => new Response(JSON.stringify({ ok: true, msg }), {
    headers: { "Content-Type": "application/json", ...cors },
  });

  // ── Portal view ────────────────────────────────────────────────────────────

  if (body.type === "portal_view" && body.portalId) {
    const { data: portal } = await supabase
      .from("client_portals")
      .select("agency_id, deal_name, client_name")
      .eq("id", body.portalId)
      .maybeSingle();

    if (!portal?.agency_id) return ok("portal not found");

    // Раз в 30 мин на портал — совпадает с намерением клиентского localStorage-гейта
    // в app.js, но применяется на сервере, поэтому не обходится прямым вызовом API.
    if (await isThrottled(portal.agency_id, `portal_${body.portalId}`, 30 * 60 * 1000)) return ok("throttled");

    const chatIds = await getTelegramIds(portal.agency_id);
    if (!chatIds.length) return ok("no recipients");

    const text =
      `👁 <b>Клиент открыл КП</b>\n\n` +
      `📋 ${esc(portal.deal_name) || "КП"}\n` +
      `👤 ${esc(portal.client_name) || "Клиент"}\n\n` +
      `<i>Хороший момент позвонить!</i>`;

    await sendToAll(chatIds, text);
    return ok("sent");
  }

  // ── Brief submitted ────────────────────────────────────────────────────────
  // Раньше agencyId/briefData принимались из тела запроса как есть — зная только
  // agencyId (встроен в публичную ссылку брифа, не секрет), кто угодно мог слать
  // поддельные уведомления с произвольным текстом. Теперь клиент передаёт только
  // submissionId только что созданной строки brief_submissions — все данные для
  // уведомления (включая agency_id, кому слать) берутся из БД, не из запроса.

  if (body.type === "brief_submitted" && body.submissionId) {
    const { data: submission } = await supabase
      .from("brief_submissions")
      .select("agency_id, client_name, client_phone, client_email, project_type, budget")
      .eq("id", body.submissionId)
      .maybeSingle();

    if (!submission?.agency_id) return ok("submission not found");

    const agencyId = submission.agency_id;

    // Раз в 60 сек на агентство — двум настоящим брифам подряд от разных клиентов
    // это не помешает, а скриптовый спам (даже валидными submissionId одного и
    // того же брифа по кругу) душит.
    if (await isThrottled(agencyId, "brief_submitted", 60 * 1000)) return ok("throttled");

    const chatIds = await getTelegramIds(agencyId);
    if (!chatIds.length) return ok("no recipients");

    const text =
      `📥 <b>Новый бриф!</b>\n\n` +
      `👤 <b>${esc(submission.client_name) || "Клиент"}</b>\n` +
      (submission.client_phone ? `📞 ${esc(submission.client_phone)}\n` : "") +
      (submission.client_email ? `✉️ ${esc(submission.client_email)}\n` : "") +
      (submission.project_type ? `🎬 ${esc(submission.project_type)}\n` : "") +
      (submission.budget ? `💰 ${esc(submission.budget)}\n` : "") +
      `\n<i>Откройте CRM → Брифы, чтобы создать сделку.</i>`;

    await sendToAll(chatIds, text);
    return ok("sent");
  }

  return new Response("Unknown type", { status: 400, headers: cors });
});
