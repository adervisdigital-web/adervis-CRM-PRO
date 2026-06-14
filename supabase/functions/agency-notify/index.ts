import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public endpoint — no JWT required.
// Security: callers must know the portal UUID or agency UUID (both are UUIDs, not guessable).
// Deployed with --no-verify-jwt.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!botToken) return new Response("Missing TELEGRAM_BOT_TOKEN", { status: 500 });

  let body: { type: string; portalId?: string; agencyId?: string; briefData?: any };
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

    const chatIds = await getTelegramIds(portal.agency_id);
    if (!chatIds.length) return ok("no recipients");

    const text =
      `👁 <b>Клиент открыл КП</b>\n\n` +
      `📋 ${portal.deal_name || "КП"}\n` +
      `👤 ${portal.client_name || "Клиент"}\n\n` +
      `<i>Хороший момент позвонить!</i>`;

    await sendToAll(chatIds, text);
    return ok("sent");
  }

  // ── Brief submitted ────────────────────────────────────────────────────────

  if (body.type === "brief_submitted" && body.agencyId && body.briefData) {
    const d = body.briefData;
    const chatIds = await getTelegramIds(body.agencyId);
    if (!chatIds.length) return ok("no recipients");

    const text =
      `📥 <b>Новый бриф!</b>\n\n` +
      `👤 <b>${d.name || "Клиент"}</b>\n` +
      (d.phone ? `📞 ${d.phone}\n` : "") +
      (d.email ? `✉️ ${d.email}\n` : "") +
      (d.type ? `🎬 ${d.type}\n` : "") +
      (d.budget ? `💰 ${d.budget}\n` : "") +
      `\n<i>Откройте CRM → Брифы, чтобы создать сделку.</i>`;

    await sendToAll(chatIds, text);
    return ok("sent");
  }

  return new Response("Unknown type", { status: 400, headers: cors });
});
