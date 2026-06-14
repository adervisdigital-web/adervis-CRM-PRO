import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deployed with --no-verify-jwt because Telegram sends updates without a user JWT.

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!botToken) return new Response("Missing TELEGRAM_BOT_TOKEN", { status: 500 });

  let update: any;
  try { update = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }

  // Handle both regular messages and inline keyboard callbacks
  const isCallback = !!update.callback_query;
  const msg = isCallback ? update.callback_query.message : update.message;
  const chatId: number = isCallback ? update.callback_query.message.chat.id : update.message?.chat?.id;
  const rawText: string = isCallback ? update.callback_query.data : (update.message?.text || "");
  const firstName: string = isCallback
    ? (update.callback_query.from?.first_name || "")
    : (update.message?.chat?.first_name || "");

  if (!chatId) return new Response("ok", { status: 200 });

  const text = rawText.trim();

  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function send(replyText: string, keyboard?: any) {
    const body: any = {
      chat_id: chatId,
      text: replyText,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (keyboard) body.reply_markup = keyboard;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // Acknowledge callback so button stops spinning
  async function answerCallback() {
    if (!isCallback) return;
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: update.callback_query.id }),
    });
  }

  async function setMyCommands() {
    await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "today", description: "📅 Дедлайны на неделю" },
          { command: "deals", description: "🗂 Активные сделки" },
          { command: "stats", description: "📊 Финансовая сводка" },
          { command: "help", description: "❓ Помощь и команды" },
        ],
      }),
    });
  }

  function money(n: number): string {
    if (!n) return "0 ₽";
    return new Intl.NumberFormat("ru-RU", {
      style: "currency", currency: "RUB", minimumFractionDigits: 0,
    }).format(n);
  }

  function todayIso(): string {
    return new Date().toISOString().split("T")[0];
  }

  function daysUntil(dateStr: string): number {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(dateStr).getTime() - today.getTime()) / 86400000);
  }

  // ── Find agency by chat_id ─────────────────────────────────────────────────

  async function findAgency(): Promise<{ agency_id: string; state: any } | null> {
    const chatIdStr = String(chatId);
    const { data, error } = await supabase
      .from("agency_state")
      .select("id, state_json");
    if (error || !data) return null;
    const row = data.find((row: any) => {
      const ids: any[] = row.state_json?.telegramChatIds || [];
      return ids.some((r: any) => String(r.chatId) === chatIdStr);
    });
    if (!row) return null;
    return { agency_id: row.id, state: row.state_json };
  }

  // ── Inline keyboard ────────────────────────────────────────────────────────

  const mainKeyboard = {
    inline_keyboard: [
      [
        { text: "📅 Дедлайны", callback_data: "today" },
        { text: "🗂 Сделки", callback_data: "deals" },
      ],
      [
        { text: "📊 Сводка", callback_data: "stats" },
        { text: "❓ Помощь", callback_data: "help" },
      ],
    ],
  };

  // ── /start ─────────────────────────────────────────────────────────────────

  if (text.startsWith("/start")) {
    await setMyCommands();
    await send(
      `👋 Привет${firstName ? `, ${firstName}` : ""}!\n\n` +
      `Это AI-помощник <b>Adervis CRM</b>.\n\n` +
      `Ваш Chat ID:\n<code>${chatId}</code>\n\n` +
      `Скопируйте его в профиль Adervis CRM → раздел «Уведомления».\n\n` +
      `После этого я буду знать ваши сделки, финансы и дедлайны — ` +
      `и смогу отвечать на вопросы или присылать уведомления.`,
      mainKeyboard,
    );
    return new Response("ok", { status: 200 });
  }

  // Acknowledge callback before any heavy work
  await answerCallback();

  // ── Find agency ────────────────────────────────────────────────────────────

  const agency = await findAgency();

  if (!agency) {
    await send(
      `❌ Не нашёл ваш Chat ID в системе.\n\n` +
      `Ваш Chat ID: <code>${chatId}</code>\n\n` +
      `Добавьте его в <b>Профиль → Уведомления (Telegram)</b> в Adervis CRM.`,
    );
    return new Response("ok", { status: 200 });
  }

  const state = agency.state || {};
  const projects: any[] = state.savedProjects || [];
  const today = todayIso();

  // ── Extract command ────────────────────────────────────────────────────────

  const command = text.startsWith("/")
    ? text.split(" ")[0].slice(1).split("@")[0].toLowerCase()
    : text.toLowerCase();

  // ── /today ─────────────────────────────────────────────────────────────────

  if (command === "today" || command === "сегодня") {
    const active = projects.filter(
      (p) => !["Сдано", "Завершённые"].includes(p.crmStatus || ""),
    );
    const deadlines = active
      .filter((p) => p.deadline)
      .map((p) => ({ ...p, days: daysUntil(p.deadline) }))
      .filter((p) => p.days <= 7)
      .sort((a, b) => a.days - b.days);

    if (!deadlines.length) {
      await send(
        `✅ <b>Горящих дедлайнов нет</b>\n\nАктивных сделок: ${active.length}`,
        mainKeyboard,
      );
    } else {
      const lines = deadlines.map((p) => {
        const icon = p.days < 0 ? "🔴" : p.days === 0 ? "🔥" : p.days <= 2 ? "⚡" : "📅";
        const when = p.days < 0
          ? `просрочено на ${Math.abs(p.days)} дн.`
          : p.days === 0 ? "сегодня!"
          : `через ${p.days} дн.`;
        return `${icon} <b>${p.name}</b> — ${when}${p.client ? `\n   👤 ${p.client}` : ""}`;
      });
      await send(`📅 <b>Дедлайны на 7 дней:</b>\n\n${lines.join("\n\n")}`, mainKeyboard);
    }
    return new Response("ok", { status: 200 });
  }

  // ── /deals ─────────────────────────────────────────────────────────────────

  if (command === "deals" || command === "сделки") {
    const active = projects.filter((p) => p.crmStatus !== "Завершённые");
    if (!active.length) {
      await send(`📭 Активных сделок пока нет.`, mainKeyboard);
    } else {
      const byStatus: Record<string, any[]> = {};
      active.forEach((p) => {
        const s = p.crmStatus || "Лид";
        if (!byStatus[s]) byStatus[s] = [];
        byStatus[s].push(p);
      });
      const lines = Object.entries(byStatus).map(([status, items]) => {
        const total = items.reduce((s, p) => s + (p.total || 0), 0);
        const header = `<b>${status}</b> · ${items.length} шт.${total ? " · " + money(total) : ""}`;
        const rows = items
          .map((p) => `  • ${p.name}${p.client ? " · " + p.client : ""}`)
          .join("\n");
        return `${header}\n${rows}`;
      });
      await send(
        `🗂 <b>Сделки (${active.length}):</b>\n\n${lines.join("\n\n")}`,
        mainKeyboard,
      );
    }
    return new Response("ok", { status: 200 });
  }

  // ── /stats ─────────────────────────────────────────────────────────────────

  if (command === "stats" || command === "сводка") {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString().split("T")[0];
    const txs: any[] = state.globalTransactions || [];
    const monthIncome = txs
      .filter((t) => t.type === "income" && t.date >= monthStart)
      .reduce((s, t) => s + (t.amount || 0), 0);
    const monthExpense = txs
      .filter((t) => t.type === "expense" && t.date >= monthStart)
      .reduce((s, t) => s + (t.amount || 0), 0);

    const active = projects.filter(
      (p) => !["Сдано", "Завершённые"].includes(p.crmStatus || ""),
    );
    const pipeline = active.reduce((s, p) => s + (p.total || 0), 0);
    const debt = projects.reduce(
      (s, p) => s + Math.max(0, (p.total || 0) - (p.paid || 0)),
      0,
    );
    const overdue = active.filter(
      (p) => p.deadline && daysUntil(p.deadline) < 0,
    ).length;

    const monthName = now.toLocaleDateString("ru-RU", { month: "long" });
    await send(
      `📊 <b>Сводка за ${monthName}:</b>\n\n` +
      `💰 Выручка:  <b>${money(monthIncome)}</b>\n` +
      `📤 Расходы:  <b>${money(monthExpense)}</b>\n` +
      `📈 Прибыль:  <b>${money(monthIncome - monthExpense)}</b>\n\n` +
      `🗂 Воронка:  <b>${money(pipeline)}</b> · ${active.length} сделок\n` +
      `⏳ Долг клиентов: <b>${money(debt)}</b>\n` +
      (overdue
        ? `🔴 Просрочено: <b>${overdue}</b>`
        : `✅ Просроченных нет`),
      mainKeyboard,
    );
    return new Response("ok", { status: 200 });
  }

  // ── /help ──────────────────────────────────────────────────────────────────

  if (command === "help" || command === "помощь") {
    await send(
      `<b>Adervis CRM — AI-помощник</b>\n\n` +
      `<b>Кнопки меню или команды:</b>\n` +
      `/today — дедлайны на 7 дней\n` +
      `/deals — активные сделки по статусам\n` +
      `/stats — финансовая сводка за месяц\n\n` +
      `<b>Или просто напишите вопрос:</b>\n` +
      `«Что просрочено?»\n` +
      `«Сколько должен клиент Альфа?»\n` +
      `«Какие сделки на стадии Монтаж?»\n` +
      `«Сколько я заработал в этом месяце?»`,
      mainKeyboard,
    );
    return new Response("ok", { status: 200 });
  }

  // ── AI assistant (free-form text) ──────────────────────────────────────────

  if (!text.startsWith("/") && geminiKey) {
    const active = projects.filter(
      (p) => !["Завершённые"].includes(p.crmStatus || ""),
    );
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString().split("T")[0];
    const txs: any[] = state.globalTransactions || [];

    const context = {
      сегодня: today,
      сделки: active.map((p) => ({
        название: p.name,
        клиент: p.client || null,
        статус: p.crmStatus || "Лид",
        бюджет: p.total || 0,
        оплачено: p.paid || 0,
        долг: Math.max(0, (p.total || 0) - (p.paid || 0)),
        дедлайн: p.deadline || null,
        дней_до_дедлайна: p.deadline ? daysUntil(p.deadline) : null,
      })),
      финансы_за_месяц: {
        поступления: txs
          .filter((t) => t.type === "income" && t.date >= monthStart)
          .reduce((s, t) => s + (t.amount || 0), 0),
        расходы: txs
          .filter((t) => t.type === "expense" && t.date >= monthStart)
          .reduce((s, t) => s + (t.amount || 0), 0),
      },
    };

    const prompt =
      `Ты AI-помощник CRM для видеопродакшн-агентства. ` +
      `Отвечай кратко и по делу на русском. ` +
      `Используй HTML: <b>жирный</b>. Без вводных фраз типа "Конечно!" или "Вот ответ:".\n\n` +
      `Данные агентства:\n${JSON.stringify(context, null, 2)}\n\n` +
      `Вопрос: ${text}`;

    try {
      const gr = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 600, temperature: 0.2 },
          }),
        },
      );
      const gd = await gr.json();
      const aiText: string =
        gd?.candidates?.[0]?.content?.parts?.[0]?.text || "Не смог ответить.";
      await send(aiText, mainKeyboard);
    } catch {
      await send("❌ Ошибка AI. Попробуйте позже или используйте команды меню.", mainKeyboard);
    }
    return new Response("ok", { status: 200 });
  }

  // ── Fallback ───────────────────────────────────────────────────────────────

  await send(
    `Не понял запрос. Нажмите кнопку меню или напишите /help.`,
    mainKeyboard,
  );
  return new Response("ok", { status: 200 });
});
