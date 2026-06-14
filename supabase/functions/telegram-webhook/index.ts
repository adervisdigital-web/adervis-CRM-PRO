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

  const isCallback = !!update.callback_query;
  const chatId: number = isCallback
    ? update.callback_query.message.chat.id
    : update.message?.chat?.id;
  const rawText: string = isCallback
    ? update.callback_query.data
    : (update.message?.text || "");
  const firstName: string = isCallback
    ? (update.callback_query.from?.first_name || "")
    : (update.message?.chat?.first_name || "");

  if (!chatId) return new Response("ok", { status: 200 });
  const text = rawText.trim();
  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Telegram helpers ────────────────────────────────────────────────────────

  async function send(msg: string, keyboard?: any) {
    const body: any = { chat_id: chatId, text: msg, parse_mode: "HTML", disable_web_page_preview: true };
    if (keyboard) body.reply_markup = keyboard;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }

  async function answerCallback() {
    if (!isCallback) return;
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: update.callback_query.id }),
    });
  }

  async function setMyCommands() {
    await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "today",  description: "📅 Дедлайны на неделю" },
          { command: "deals",  description: "🗂 Активные сделки" },
          { command: "stats",  description: "📊 Финансовая сводка" },
          { command: "help",   description: "❓ Помощь и команды" },
        ],
      }),
    });
  }

  // ── Formatters ──────────────────────────────────────────────────────────────

  function money(n: number) {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 0 }).format(n || 0);
  }
  function todayIso() { return new Date().toISOString().split("T")[0]; }
  function daysUntil(d: string) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((new Date(d).getTime() - now.getTime()) / 86400000);
  }
  function uid(prefix = "x") {
    return prefix + "_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }

  // ── Keyboards ───────────────────────────────────────────────────────────────

  const mainKeyboard = {
    inline_keyboard: [
      [{ text: "📅 Дедлайны",     callback_data: "today" },
       { text: "🗂 Сделки",        callback_data: "deals" }],
      [{ text: "📊 Сводка",        callback_data: "stats" },
       { text: "➕ Новая сделка",  callback_data: "new_deal" }],
      [{ text: "💰 Поступление",   callback_data: "new_income" },
       { text: "📤 Расход",        callback_data: "new_expense" }],
      [{ text: "❓ Помощь",        callback_data: "help" }],
    ],
  };

  function cancelKb(action: string) {
    return { inline_keyboard: [[{ text: "❌ Отмена", callback_data: `${action}_cancel` }]] };
  }
  function skipCancelKb(action: string) {
    return {
      inline_keyboard: [
        [{ text: "Пропустить →", callback_data: `${action}_skip` }],
        [{ text: "❌ Отмена",    callback_data: `${action}_cancel` }],
      ],
    };
  }
  function dealSelectKb(projects: any[], noneLabel: string, prefix: string) {
    const active = projects
      .filter(p => !["Завершённые", "Сдано"].includes(p.crmStatus || ""))
      .slice(0, 6);
    const rows = active.map(p => [{
      text: `${p.name}${p.client ? " · " + p.client : ""}`,
      callback_data: `${prefix}_proj_${p.id}`,
    }]);
    rows.push([{ text: noneLabel, callback_data: `${prefix}_proj_none` }]);
    rows.push([{ text: "❌ Отмена", callback_data: `${prefix}_cancel` }]);
    return { inline_keyboard: rows };
  }

  // ── Agency lookup ───────────────────────────────────────────────────────────

  async function findAgencyRow(): Promise<{ id: string; state_json: any } | null> {
    const chatIdStr = String(chatId);
    const { data } = await supabase.from("agency_state").select("id, state_json");
    if (!data) return null;
    return data.find((row: any) =>
      (row.state_json?.telegramChatIds || []).some((r: any) => String(r.chatId) === chatIdStr)
    ) || null;
  }

  // ── Session management ──────────────────────────────────────────────────────

  function readSession(stateJson: any): any {
    const s = stateJson?._botSessions?.[String(chatId)];
    if (s && Date.now() - (s.ts || 0) > 600_000) return null; // 10 min expire
    return s || null;
  }

  async function writeSession(agencyId: string, session: any | null): Promise<void> {
    const { data } = await supabase.from("agency_state").select("state_json").eq("id", agencyId).single();
    const st: any = { ...(data?.state_json || {}) };
    if (!st._botSessions) st._botSessions = {};
    if (session === null) delete st._botSessions[String(chatId)];
    else st._botSessions[String(chatId)] = { ...session, ts: Date.now() };
    await supabase.from("agency_state").upsert({ id: agencyId, state_json: st, updated_at: new Date().toISOString() });
  }

  // ── State writers ───────────────────────────────────────────────────────────

  async function addDeal(agencyId: string, deal: any): Promise<void> {
    const { data } = await supabase.from("agency_state").select("state_json").eq("id", agencyId).single();
    const st: any = { ...(data?.state_json || {}) };
    if (!st._botSessions) st._botSessions = {};
    delete st._botSessions[String(chatId)];
    st.savedProjects = [deal, ...(st.savedProjects || [])];
    await supabase.from("agency_state").upsert({ id: agencyId, state_json: st, updated_at: new Date().toISOString() });
  }

  async function addTransaction(agencyId: string, txType: "income" | "expense", tx: any, projectId: string | null): Promise<void> {
    const { data } = await supabase.from("agency_state").select("state_json").eq("id", agencyId).single();
    const st: any = { ...(data?.state_json || {}) };
    if (!st._botSessions) st._botSessions = {};
    delete st._botSessions[String(chatId)];

    if (projectId) {
      const proj = (st.savedProjects || []).find((p: any) => p.id === projectId);
      if (proj) {
        if (!proj.snapshot) proj.snapshot = {};
        if (txType === "income") {
          proj.snapshot.payments = [tx, ...(proj.snapshot.payments || [])];
          proj.paid = (proj.paid || 0) + tx.amount;
        } else {
          proj.snapshot.expenses = [tx, ...(proj.snapshot.expenses || [])];
          proj.expensesTotal = (proj.expensesTotal || 0) + tx.amount;
        }
        proj.updatedAt = new Date().toISOString();
      }
    } else {
      if (txType === "income") st.payments = [tx, ...(st.payments || [])];
      else st.expenses = [tx, ...(st.expenses || [])];
    }

    await supabase.from("agency_state").upsert({ id: agencyId, state_json: st, updated_at: new Date().toISOString() });
  }

  // ── Collect all transactions for stats ──────────────────────────────────────

  function collectTx(stateJson: any): any[] {
    const seen = new Set<string>();
    const txs: any[] = [];
    function push(arr: any[], type: string) {
      (arr || []).forEach((t: any) => {
        if (t.id && seen.has(t.id)) return;
        if (t.id) seen.add(t.id);
        txs.push({ ...t, _type: type });
      });
    }
    push(stateJson.payments || [], "income");
    push(stateJson.expenses || [], "expense");
    (stateJson.savedProjects || []).forEach((p: any) => {
      push(p.snapshot?.payments || [], "income");
      push(p.snapshot?.expenses || [], "expense");
    });
    return txs;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEAL CREATION FLOW
  // ══════════════════════════════════════════════════════════════════════════

  function dealSummary(d: any) {
    return `📋 <b>${d.name || "—"}</b>\n` +
      `👤 Клиент: ${d.client || "<i>не указан</i>"}\n` +
      `💰 Бюджет: ${d.budget ? money(d.budget) : "<i>не указан</i>"}`;
  }

  function dealConfirmKb() {
    return {
      inline_keyboard: [
        [{ text: "✅ Создать сделку",    callback_data: "deal_confirm" }],
        [{ text: "✏ Название",           callback_data: "deal_edit_name" },
         { text: "✏ Клиент",             callback_data: "deal_edit_client" }],
        [{ text: "✏ Бюджет",             callback_data: "deal_edit_budget" },
         { text: "❌ Отмена",            callback_data: "deal_cancel" }],
      ],
    };
  }

  async function startDealFlow(agencyId: string) {
    await writeSession(agencyId, { action: "create_deal", step: "name", data: {} });
    await send(
      "➕ <b>Новая сделка</b>\n\nШаг 1 из 3\n\n<b>Название:</b>\nНапример: «Корпоратив Альфа» или «Рекламный ролик Бета»",
      cancelKb("deal"),
    );
  }

  async function handleDealStep(agencyId: string, session: any, input: string, isSkip: boolean) {
    const d = { ...session.data };
    const step = session.step;
    const returning = session.prevStep === "confirm";

    if (step === "name") {
      if (!input.trim()) { await send("Название обязательно.", cancelKb("deal")); return; }
      d.name = input.trim();
      if (returning) {
        await writeSession(agencyId, { ...session, step: "confirm", prevStep: undefined, data: d });
        await send(`<b>Проверьте данные:</b>\n\n${dealSummary(d)}`, dealConfirmKb());
        return;
      }
      await writeSession(agencyId, { ...session, step: "client", data: d });
      await send(`✅ Название: <b>${d.name}</b>\n\nШаг 2 из 3\n\n<b>Клиент</b> — имя или компания:\n<i>(необязательно)</i>`, skipCancelKb("deal"));
      return;
    }
    if (step === "client") {
      if (!isSkip && input.trim()) d.client = input.trim();
      if (returning) {
        await writeSession(agencyId, { ...session, step: "confirm", prevStep: undefined, data: d });
        await send(`<b>Проверьте данные:</b>\n\n${dealSummary(d)}`, dealConfirmKb());
        return;
      }
      await writeSession(agencyId, { ...session, step: "budget", data: d });
      await send(
        (d.client ? `✅ Клиент: <b>${d.client}</b>\n\n` : "") +
        `Шаг 3 из 3\n\n<b>Бюджет</b> в рублях:\n<i>(необязательно)</i>`,
        skipCancelKb("deal"),
      );
      return;
    }
    if (step === "budget") {
      if (!isSkip && input.trim()) {
        const n = parseFloat(input.replace(/\D/g, ""));
        if (!isNaN(n) && n > 0) d.budget = n;
      }
      await writeSession(agencyId, { ...session, step: "confirm", data: d });
      await send(`<b>Проверьте данные:</b>\n\n${dealSummary(d)}\n\n<i>Нажмите «Создать» или исправьте поле.</i>`, dealConfirmKb());
      return;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRANSACTION FLOW (income / expense)
  // ══════════════════════════════════════════════════════════════════════════

  function txSummary(d: any, txType: string) {
    const sign = txType === "income" ? "+" : "−";
    const icon = txType === "income" ? "💰" : "📤";
    return `${icon} <b>${sign}${money(d.amount)}</b>\n` +
      `📝 ${d.desc || "<i>без описания</i>"}\n` +
      `📋 ${d.projectName || "<i>без привязки к сделке</i>"}`;
  }

  function txConfirmKb(txType: string) {
    return {
      inline_keyboard: [
        [{ text: txType === "income" ? "✅ Записать поступление" : "✅ Записать расход", callback_data: "tx_confirm" }],
        [{ text: "❌ Отмена", callback_data: "tx_cancel" }],
      ],
    };
  }

  async function startTxFlow(agencyId: string, txType: "income" | "expense") {
    await writeSession(agencyId, { action: "add_transaction", txType, step: "amount", data: {} });
    const icon = txType === "income" ? "💰" : "📤";
    const label = txType === "income" ? "Поступление" : "Расход";
    await send(
      `${icon} <b>${label}</b>\n\nШаг 1 из 3\n\n<b>Сумма</b> в рублях:`,
      cancelKb("tx"),
    );
  }

  async function handleTxStep(agencyId: string, session: any, projects: any[], input: string, isSkip: boolean) {
    const d = { ...session.data };
    const step = session.step;
    const txType = session.txType as "income" | "expense";
    const icon = txType === "income" ? "💰" : "📤";

    if (step === "amount") {
      const n = parseFloat(input.replace(/\D/g, ""));
      if (!n || n <= 0) { await send("Введите сумму больше нуля.", cancelKb("tx")); return; }
      d.amount = n;
      await writeSession(agencyId, { ...session, step: "desc", data: d });
      await send(
        `${icon} Сумма: <b>${money(n)}</b>\n\nШаг 2 из 3\n\n<b>Описание</b>:\nНапример: «Аванс за съёмку» или «Аренда студии»\n<i>(необязательно)</i>`,
        skipCancelKb("tx"),
      );
      return;
    }

    if (step === "desc") {
      if (!isSkip && input.trim()) d.desc = input.trim();
      await writeSession(agencyId, { ...session, step: "project", data: d });
      await send(
        `Шаг 3 из 3\n\n<b>К какой сделке привязать?</b>`,
        dealSelectKb(projects, "Без привязки (общая)", "tx"),
      );
      return;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ENTRY POINT
  // ══════════════════════════════════════════════════════════════════════════

  if (text.startsWith("/start")) {
    await setMyCommands();
    await send(
      `👋 Привет${firstName ? `, ${firstName}` : ""}!\n\n` +
      `Это AI-помощник <b>Adervis CRM</b>.\n\n` +
      `Ваш Chat ID:\n<code>${chatId}</code>\n\n` +
      `Скопируйте его в профиль Adervis CRM → «Уведомления».\n` +
      `После этого я буду знать ваши сделки, финансы и дедлайны.`,
      mainKeyboard,
    );
    return new Response("ok", { status: 200 });
  }

  await answerCallback();

  const agencyRow = await findAgencyRow();
  if (!agencyRow) {
    await send(
      `❌ Chat ID не найден в системе.\n\nВаш Chat ID: <code>${chatId}</code>\n\n` +
      `Добавьте его в <b>Профиль → Уведомления (Telegram)</b>.`,
    );
    return new Response("ok", { status: 200 });
  }

  const agencyId = agencyRow.id;
  const stateJson = agencyRow.state_json || {};
  const projects: any[] = stateJson.savedProjects || [];
  const today = todayIso();
  const session = readSession(stateJson);

  // ── Active session routing ─────────────────────────────────────────────────

  if (session?.action === "create_deal") {
    // Cancel
    if (text === "deal_cancel") {
      await writeSession(agencyId, null);
      await send("❌ Создание сделки отменено.", mainKeyboard);
      return new Response("ok", { status: 200 });
    }
    // Skip step
    if (text === "deal_skip") {
      await handleDealStep(agencyId, session, "", true);
      return new Response("ok", { status: 200 });
    }
    // Confirm → create deal
    if (text === "deal_confirm" && session.step === "confirm") {
      const d = session.data || {};
      if (!d.name) { await send("Название не заполнено.", dealConfirmKb()); return new Response("ok", { status: 200 }); }
      const deal = {
        id: uid("proj"), name: d.name, client: d.client || "", clientId: "",
        crmStatus: "Лид", total: d.budget || 0, paid: 0,
        deadline: "", lines: [], payments: [], expenses: [], tasks: [], team: [],
        notes: `Создано через Telegram (${new Date().toLocaleDateString("ru-RU")})`,
        createdAt: new Date().toISOString(),
      };
      await addDeal(agencyId, deal);
      await send(`🎉 <b>Сделка создана!</b>\n\n${dealSummary(d)}\n📌 Статус: Лид\n\nОткройте CRM чтобы добавить услуги.`, mainKeyboard);
      return new Response("ok", { status: 200 });
    }
    // Edit fields
    if (text === "deal_edit_name")   { await writeSession(agencyId, { ...session, step: "name",   prevStep: "confirm" }); await send("Введите новое <b>название</b>:", cancelKb("deal")); return new Response("ok", { status: 200 }); }
    if (text === "deal_edit_client") { await writeSession(agencyId, { ...session, step: "client", prevStep: "confirm" }); await send("Введите нового <b>клиента</b>:", skipCancelKb("deal")); return new Response("ok", { status: 200 }); }
    if (text === "deal_edit_budget") { await writeSession(agencyId, { ...session, step: "budget", prevStep: "confirm" }); await send("Введите новый <b>бюджет</b> (₽):", skipCancelKb("deal")); return new Response("ok", { status: 200 }); }
    // Text input for current step
    if (!isCallback && !text.startsWith("/")) {
      await handleDealStep(agencyId, session, text, false);
      return new Response("ok", { status: 200 });
    }
  }

  if (session?.action === "add_transaction") {
    const txType = session.txType as "income" | "expense";

    // Cancel
    if (text === "tx_cancel") {
      await writeSession(agencyId, null);
      await send("❌ Отменено.", mainKeyboard);
      return new Response("ok", { status: 200 });
    }
    // Skip desc
    if (text === "tx_skip" && session.step === "desc") {
      await handleTxStep(agencyId, session, projects, "", true);
      return new Response("ok", { status: 200 });
    }
    // Project selected via button
    if (isCallback && text.startsWith("tx_proj_") && session.step === "project") {
      const d = { ...session.data };
      if (text === "tx_proj_none") {
        d.projectId = null; d.projectName = null;
      } else {
        const projId = text.replace("tx_proj_", "");
        const proj = projects.find(p => p.id === projId);
        d.projectId = projId;
        d.projectName = proj ? (proj.name + (proj.client ? " · " + proj.client : "")) : projId;
      }
      await writeSession(agencyId, { ...session, step: "confirm", data: d });
      await send(
        `<b>Проверьте запись:</b>\n\n${txSummary(d, txType)}\n\n<i>Подтвердите или отмените.</i>`,
        txConfirmKb(txType),
      );
      return new Response("ok", { status: 200 });
    }
    // Confirm → save transaction
    if (text === "tx_confirm" && session.step === "confirm") {
      const d = session.data || {};
      const isIncome = txType === "income";
      const tx = isIncome
        ? { id: uid("payment"), title: d.desc || "Поступление", amount: d.amount, date: today, method: "Telegram", note: "" }
        : { id: uid("expense"), title: d.desc || "Расход",      amount: d.amount, date: today, category: "Прочее",   note: "" };
      await addTransaction(agencyId, txType, tx, d.projectId || null);
      const icon = isIncome ? "💰" : "📤";
      const sign = isIncome ? "+" : "−";
      await send(
        `${icon} <b>Записано!</b>\n\n${sign}${money(d.amount)}` +
        (d.desc ? `\n📝 ${d.desc}` : "") +
        (d.projectName ? `\n📋 ${d.projectName}` : "\n📋 Без привязки"),
        mainKeyboard,
      );
      return new Response("ok", { status: 200 });
    }
    // Text input for current step
    if (!isCallback && !text.startsWith("/")) {
      await handleTxStep(agencyId, session, projects, text, false);
      return new Response("ok", { status: 200 });
    }
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  const command = text.startsWith("/")
    ? text.split(" ")[0].slice(1).split("@")[0].toLowerCase()
    : text.toLowerCase();

  if (command === "new_deal"   || command === "deal"   || command === "сделка")     { await startDealFlow(agencyId); return new Response("ok", { status: 200 }); }
  if (command === "new_income" || command === "доход"  || command === "поступление") { await startTxFlow(agencyId, "income");  return new Response("ok", { status: 200 }); }
  if (command === "new_expense"|| command === "расход") { await startTxFlow(agencyId, "expense"); return new Response("ok", { status: 200 }); }

  // ── /today ─────────────────────────────────────────────────────────────────

  if (command === "today" || command === "сегодня") {
    const active = projects.filter(p => !["Сдано", "Завершённые"].includes(p.crmStatus || ""));
    const deadlines = active
      .filter(p => p.deadline)
      .map(p => ({ ...p, days: daysUntil(p.deadline) }))
      .filter(p => p.days <= 7)
      .sort((a, b) => a.days - b.days);
    if (!deadlines.length) {
      await send(`✅ <b>Горящих дедлайнов нет</b>\nАктивных сделок: ${active.length}`, mainKeyboard);
    } else {
      const lines = deadlines.map(p => {
        const icon = p.days < 0 ? "🔴" : p.days === 0 ? "🔥" : p.days <= 2 ? "⚡" : "📅";
        const when = p.days < 0 ? `просрочено ${Math.abs(p.days)} дн.` : p.days === 0 ? "сегодня!" : `через ${p.days} дн.`;
        return `${icon} <b>${p.name}</b> — ${when}${p.client ? `\n   👤 ${p.client}` : ""}`;
      });
      await send(`📅 <b>Дедлайны — 7 дней:</b>\n\n${lines.join("\n\n")}`, mainKeyboard);
    }
    return new Response("ok", { status: 200 });
  }

  // ── /deals ─────────────────────────────────────────────────────────────────

  if (command === "deals" || command === "сделки") {
    const active = projects.filter(p => p.crmStatus !== "Завершённые");
    if (!active.length) {
      await send(`📭 Активных сделок нет.`, mainKeyboard);
    } else {
      const byStatus: Record<string, any[]> = {};
      active.forEach(p => { const s = p.crmStatus || "Лид"; (byStatus[s] = byStatus[s] || []).push(p); });
      const lines = Object.entries(byStatus).map(([status, items]) => {
        const total = items.reduce((s, p) => s + (p.total || 0), 0);
        return `<b>${status}</b> · ${items.length} шт.${total ? " · " + money(total) : ""}\n` +
          items.map(p => `  • ${p.name}${p.client ? " · " + p.client : ""}`).join("\n");
      });
      await send(`🗂 <b>Сделки (${active.length}):</b>\n\n${lines.join("\n\n")}`, mainKeyboard);
    }
    return new Response("ok", { status: 200 });
  }

  // ── /stats ─────────────────────────────────────────────────────────────────

  if (command === "stats" || command === "сводка") {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const txs = collectTx(stateJson);
    const monthIncome  = txs.filter(t => t._type === "income"  && (t.date || "") >= monthStart).reduce((s, t) => s + (t.amount || 0), 0);
    const monthExpense = txs.filter(t => t._type === "expense" && (t.date || "") >= monthStart).reduce((s, t) => s + (t.amount || 0), 0);
    const active = projects.filter(p => !["Сдано", "Завершённые"].includes(p.crmStatus || ""));
    const pipeline = active.reduce((s, p) => s + (p.total || 0), 0);
    const debt = projects.reduce((s, p) => s + Math.max(0, (p.total || 0) - (p.paid || 0)), 0);
    const overdue = active.filter(p => p.deadline && daysUntil(p.deadline) < 0).length;
    const monthName = now.toLocaleDateString("ru-RU", { month: "long" });
    await send(
      `📊 <b>Сводка за ${monthName}:</b>\n\n` +
      `💰 Выручка:  <b>${money(monthIncome)}</b>\n` +
      `📤 Расходы:  <b>${money(monthExpense)}</b>\n` +
      `📈 Прибыль:  <b>${money(monthIncome - monthExpense)}</b>\n\n` +
      `🗂 Воронка:  <b>${money(pipeline)}</b> · ${active.length} сделок\n` +
      `⏳ Долг клиентов: <b>${money(debt)}</b>\n` +
      (overdue ? `🔴 Просрочено: <b>${overdue}</b>` : `✅ Просроченных нет`),
      mainKeyboard,
    );
    return new Response("ok", { status: 200 });
  }

  // ── /help ──────────────────────────────────────────────────────────────────

  if (command === "help" || command === "помощь") {
    await send(
      `<b>Adervis CRM — AI-помощник</b>\n\n` +
      `<b>Кнопки меню:</b>\n` +
      `📅 Дедлайны — горящие на 7 дней\n` +
      `🗂 Сделки — активные по статусам\n` +
      `📊 Сводка — деньги за месяц\n` +
      `➕ Новая сделка — пошаговое создание\n` +
      `💰 Поступление — записать приход\n` +
      `📤 Расход — записать расход\n\n` +
      `<b>Или напишите вопрос:</b>\n` +
      `«Что просрочено?»\n` +
      `«Сколько должен клиент Альфа?»\n` +
      `«Сколько я заработал в этом месяце?»`,
      mainKeyboard,
    );
    return new Response("ok", { status: 200 });
  }

  // ── AI free-form ───────────────────────────────────────────────────────────

  if (!text.startsWith("/") && geminiKey) {
    const active = projects.filter(p => !["Завершённые"].includes(p.crmStatus || ""));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const txs = collectTx(stateJson);
    const context = {
      сегодня: today,
      сделки: active.map(p => ({
        название: p.name, клиент: p.client || null, статус: p.crmStatus || "Лид",
        бюджет: p.total || 0, оплачено: p.paid || 0,
        долг: Math.max(0, (p.total || 0) - (p.paid || 0)),
        дедлайн: p.deadline || null, дней_до_дедлайна: p.deadline ? daysUntil(p.deadline) : null,
      })),
      финансы_месяц: {
        поступления: txs.filter(t => t._type === "income"  && (t.date || "") >= monthStart).reduce((s, t) => s + (t.amount || 0), 0),
        расходы:     txs.filter(t => t._type === "expense" && (t.date || "") >= monthStart).reduce((s, t) => s + (t.amount || 0), 0),
      },
    };
    const prompt =
      `Ты AI-помощник CRM для видеопродакшн-агентства. Отвечай кратко, по делу, на русском. ` +
      `HTML: только <b>жирный</b>. Без вводных фраз.\n\nДанные:\n${JSON.stringify(context, null, 2)}\n\nВопрос: ${text}`;
    try {
      const gr = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 600, temperature: 0.2 } }) },
      );
      const gd = await gr.json();
      const aiText = gd?.candidates?.[0]?.content?.parts?.[0]?.text || "Не смог ответить.";
      await send(aiText, mainKeyboard);
    } catch {
      await send("❌ Ошибка AI. Попробуйте позже.", mainKeyboard);
    }
    return new Response("ok", { status: 200 });
  }

  await send(`Не понял запрос. Нажмите кнопку или напишите /help.`, mainKeyboard);
  return new Response("ok", { status: 200 });
});
