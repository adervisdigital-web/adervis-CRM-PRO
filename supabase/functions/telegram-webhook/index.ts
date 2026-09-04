import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deployed with --no-verify-jwt because Telegram sends updates without a user JWT.

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Verify Telegram webhook secret token (set via TELEGRAM_WEBHOOK_SECRET secret).
  // To activate: supabase secrets set TELEGRAM_WEBHOOK_SECRET=<random-string>
  // Then re-register the webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=...&secret_token=<same-string>
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (webhookSecret) {
    const incoming = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (incoming !== webhookSecret) return new Response("Unauthorized", { status: 401 });
  }

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
  // parse_mode:"HTML" — пользовательские названия/имена с & < > ломают разбор,
  // и Telegram отклоняет всё сообщение (400): бот молча не отвечает. Экранируем.
  function esc(s: any) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
      [{ text: "❓ Помощь",        callback_data: "help" },
       { text: "📌 Статус",        callback_data: "change_status" }],
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
      .filter(p => p.crmStatus !== "Сдано" && p.crmStatus !== "Оплата" && !isDealInactive(p.crmStatus || ""))
      .slice(0, 6);
    const rows = active.map(p => [{
      text: `${p.name}${p.client ? " · " + p.client : ""}`,
      callback_data: `${prefix}_proj_${p.id}`,
    }]);
    rows.push([{ text: noneLabel, callback_data: `${prefix}_proj_none` }]);
    rows.push([{ text: "❌ Отмена", callback_data: `${prefix}_cancel` }]);
    return { inline_keyboard: rows };
  }

  // Синхронизирован с app.js: «Оплата» между «Сдано» и «Завершёнными» — по договору
  // 50/50 остаток приходит после сдачи работы (добавлено 27.07.2026).
  const CRM_STATUSES = ["Лид", "Бриф", "КП отправлено", "Согласование", "Договор", "Предоплата", "В работе", "Сдано", "Оплата", "Завершённые"];
  // Терминальный статус вне CRM_STATUSES (синхронизирован с app.js CRM_ARCHIVED) — исключается
  // из активных, долга и воронки, иначе цифры расходятся с CRM ("Финансы").
  const CRM_ARCHIVED = "Архив";
  const isDealInactive = (status: string) => status === "Завершённые" || status === CRM_ARCHIVED;

  function statusKb() {
    return {
      inline_keyboard: [
        ...CRM_STATUSES.map((s, i) => [{ text: s, callback_data: `cs_st_${i}` }]),
        [{ text: "❌ Отмена", callback_data: "cs_cancel" }],
      ],
    };
  }

  // ── Agency lookup ───────────────────────────────────────────────────────────

  async function findAgencyRow(): Promise<{ id: string; state_json: any } | null> {
    const chatIdStr = String(chatId);
    // Phase 1: load only telegramChatIds to avoid pulling full state for every agency
    const { data: index } = await supabase
      .from("agency_state")
      .select("id, state_json->telegramChatIds");
    if (!index) return null;
    const match = (index as any[]).find((row) => {
      const ids = row.telegramChatIds ?? [];
      return Array.isArray(ids) && ids.some((r: any) => String(r.chatId) === chatIdStr);
    });
    if (!match) return null;
    // Phase 2: load full state only for the matched agency
    const { data: full } = await supabase
      .from("agency_state")
      .select("id, state_json")
      .eq("id", match.id)
      .single();
    return full || null;
  }

  // ── Session management ──────────────────────────────────────────────────────

  function readSession(stateJson: any): any {
    const s = stateJson?._botSessions?.[String(chatId)];
    if (s && Date.now() - (s.ts || 0) > 600_000) return null; // 10 min expire
    return s || null;
  }

  // Все 4 функции ниже пишут через RPC (atomic SELECT...FOR UPDATE внутри Postgres),
  // а не через select+upsert из Deno — иначе параллельный запрос (второе сообщение
  // в Telegram или сохранение из веб-CRM того же agency_state) мог затереть чужие
  // изменения между чтением и записью (lost update). См. migration
  // 20260703000001_telegram_state_race_fix.sql
  async function writeSession(agencyId: string, session: any | null): Promise<void> {
    if (session === null) {
      await supabase.rpc("bot_session_clear", { p_agency_id: agencyId, p_chat_id: String(chatId) });
    } else {
      await supabase.rpc("bot_session_set", {
        p_agency_id: agencyId, p_chat_id: String(chatId), p_session: { ...session, ts: Date.now() },
      });
    }
  }

  // ── State writers ───────────────────────────────────────────────────────────

  async function addDeal(agencyId: string, deal: any): Promise<void> {
    await supabase.rpc("bot_add_deal", { p_agency_id: agencyId, p_chat_id: String(chatId), p_deal: deal });
  }

  async function addTransaction(agencyId: string, txType: "income" | "expense", tx: any, projectId: string | null): Promise<void> {
    await supabase.rpc("bot_add_transaction", {
      p_agency_id: agencyId, p_chat_id: String(chatId), p_tx_type: txType, p_tx: tx, p_project_id: projectId,
    });
  }

  async function updateDealStatus(agencyId: string, dealId: string, newStatus: string): Promise<void> {
    await supabase.rpc("bot_update_deal_status", {
      p_agency_id: agencyId, p_chat_id: String(chatId), p_deal_id: dealId, p_new_status: newStatus,
    });
  }

  async function startChangeStatusFlow(agencyId: string, projs: any[]) {
    const active = projs.filter(p => !isDealInactive(p.crmStatus || ""));
    if (!active.length) { await send("📭 Активных сделок нет.", mainKeyboard); return; }
    await writeSession(agencyId, { action: "change_status", step: "select_deal" });
    await send("📌 <b>Изменить статус сделки</b>\n\nВыберите сделку:", dealSelectKb(active, "❌ Отмена", "cs"));
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
    return `📋 <b>${esc(d.name) || "—"}</b>\n` +
      `👤 Клиент: ${d.client ? esc(d.client) : "<i>не указан</i>"}\n` +
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

  /* ── Смета из свободного текста ──────────────────────────────────────────
     Признак сметы: минимум две строки, и хотя бы в двух из них есть сумма.
     Одиночный вопрос («сколько должен Альфа?») сюда не попадает и уходит в
     общий AI-ответ, как раньше. */
  function looksLikeEstimate(t: string) {
    const rows = t.split("\n").map(s => s.trim()).filter(Boolean);
    if (rows.length < 2) return false;
    /* Деньги пишут по-разному: «50 000 ₽», «10,000₽», «20000р», «135 000 руб».
       Первая версия требовала «₽», «руб» или «р.» С ТОЧКОЙ — и смета вида
       «Монтаж 20000р» не распознавалась вовсе: бот молча отвечал на неё как на
       обычный вопрос, а человек не понимал, почему сделка не создалась.

       `р` без точки берём только если следом НЕ буква: иначе «20000 рабочих
       часов» сошло бы за деньги. «руб» стоит в переборе раньше `р`, чтобы
       «рублей» ловилось целиком. */
    const money = /\d[\d\s.,]{2,}\s*(₽|руб|р(?![а-яё]))/i;
    return rows.filter(r => money.test(r)).length >= 2;
  }

  async function parseEstimate(t: string) {
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/parse-estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ text: t }),
      });
      const d = await r.json();
      if (!r.ok) return { error: d?.error || "Не удалось разобрать смету" };
      return d;
    } catch (e) {
      console.error("parseEstimate:", e);
      return null;
    }
  }

  function estimateSummary(p: any) {
    const rows = (p.lines || []).map((l: any, i: number) =>
      `${i + 1}. ${esc(l.name)}${l.qty > 1 ? ` × ${l.qty}` : ""}${l.note ? ` <i>(${esc(l.note)})</i>` : ""} — <b>${money(l.price * l.qty)}</b>`
    ).join("\n");

    let out = `🧾 <b>Разобрал смету</b>\n\n${rows}\n\n` +
      `Позиций: ${p.lines.length} · Сумма: <b>${money(p.sum)}</b>`;

    /* Сверка с «Итого», которое написал человек. Это единственная защита от
       того, что модель потеряла или удвоила строку: расхождение показываем
       ЧИСЛОМ и не даём создать сделку одной кнопкой. */
    if (p.mismatch) {
      out += `\n\n⚠️ <b>Не сходится с «Итого»</b>\n` +
        `Вы написали ${money(p.statedTotal)}, по позициям выходит ${money(p.sum)} ` +
        `(разница ${money(Math.abs(p.mismatch))}).\n` +
        `<i>Проверьте — возможно, я потерял строку.</i>`;
    } else if (p.statedTotal) {
      out += ` ✅ сходится с «Итого»`;
    }

    if ((p.openItems || []).length) {
      out += `\n\n❓ Без суммы: ${p.openItems.map((x: string) => esc(x)).join(", ")}\n` +
        `<i>В смету не попадёт — допишите в CRM.</i>`;
    }

    out += `\n\n📋 Название: ${p.dealName ? esc(p.dealName) : "<i>не нашёл</i>"}\n` +
      `👤 Клиент: ${p.client ? esc(p.client) : "<i>не указан</i>"}`;
    return out;
  }

  function estimateConfirmKb(p: any) {
    const rows: any[] = [];
    // При расхождении «Создать» не первой кнопкой и с оговоркой: подтверждение
    // должно стоить одного лишнего взгляда, а не одного случайного тапа.
    rows.push([{ text: p.mismatch ? "Всё равно создать" : "✅ Создать сделку", callback_data: "est_confirm" }]);
    rows.push([
      { text: "✏ Название", callback_data: "est_edit_name" },
      { text: "✏ Клиент",   callback_data: "est_edit_client" },
    ]);
    rows.push([{ text: "❌ Отмена", callback_data: "est_cancel" }]);
    return { inline_keyboard: rows };
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
      await send(`✅ Название: <b>${esc(d.name)}</b>\n\nШаг 2 из 3\n\n<b>Клиент</b> — имя или компания:\n<i>(необязательно)</i>`, skipCancelKb("deal"));
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
        (d.client ? `✅ Клиент: <b>${esc(d.client)}</b>\n\n` : "") +
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
      `📝 ${d.desc ? esc(d.desc) : "<i>без описания</i>"}\n` +
      `📋 ${d.projectName ? esc(d.projectName) : "<i>без привязки к сделке</i>"}`;
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
      `👋 Привет${firstName ? `, ${esc(firstName)}` : ""}!\n\n` +
      `Это AI-помощник <b>ADERVIS</b>.\n\n` +
      `Ваш Chat ID:\n<code>${chatId}</code>\n\n` +
      `Скопируйте его в профиль ADERVIS → «Уведомления».\n` +
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

  /* ── Подтверждение разобранной сметы ─────────────────────────────────────
     Правки ровно двух полей: название и клиент. Суммы позиций правятся в CRM,
     а не в переписке: менять деньги вслепую, без сметы перед глазами, — самый
     дорогой способ ошибиться. */
  if (session?.action === "estimate_confirm") {
    const p = session.data || {};

    if (text === "est_cancel") {
      await writeSession(agencyId, null);
      await send("Отменено. Смета не создана.", mainKeyboard);
      return new Response("ok", { status: 200 });
    }

    if (text === "est_edit_name" || text === "est_edit_client") {
      await writeSession(agencyId, { ...session, step: text === "est_edit_name" ? "name" : "client" });
      await send(text === "est_edit_name" ? "Введите <b>название</b> сделки:" : "Введите <b>клиента</b>:", cancelKb("est"));
      return new Response("ok", { status: 200 });
    }

    if (!isCallback && (session.step === "name" || session.step === "client")) {
      const next = { ...p, [session.step === "name" ? "dealName" : "client"]: text.trim().slice(0, 120) };
      await writeSession(agencyId, { ...session, step: "confirm", data: next });
      await send(estimateSummary(next), estimateConfirmKb(next));
      return new Response("ok", { status: 200 });
    }

    if (text === "est_confirm" && session.step === "confirm") {
      const name = (p.dealName || "").trim() || `Смета из Telegram ${new Date().toLocaleDateString("ru-RU")}`;
      /* Сумма сделки — та, что ПОСЧИТАНА по позициям, а не «Итого» из текста:
         в CRM бюджет обязан совпадать с составом сметы. Если человек всё же
         создал сделку с расхождением, оно уходит в заметку, а не теряется. */
      const deal = {
        id: uid("proj"),
        name, client: (p.client || "").trim(), clientId: "",
        crmStatus: "Лид", total: p.sum, paid: 0,
        deadline: "", lines: [], payments: [], expenses: [], tasks: [], team: [],
        /* Позиции кладём отдельным полем, а НЕ собираем строку сметы здесь.
           У строки сметы 35 полей и своя математика (defaultLineForItem в
           app.js); повторить её в Edge Function — значит завести вторую
           реализацию, которая разойдётся с первой молча. Приложение развернёт
           этот черновик своим же кодом при открытии сделки. */
        botEstimate: {
          source: "telegram",
          createdAt: new Date().toISOString(),
          lines: p.lines,
          statedTotal: p.statedTotal || 0,
          mismatch: p.mismatch || 0,
          openItems: p.openItems || [],
        },
        notes: [
          `Создано из сметы в Telegram (${new Date().toLocaleDateString("ru-RU")})`,
          p.mismatch ? `Расхождение с «Итого»: ${p.statedTotal} вместо ${p.sum}` : "",
          (p.openItems || []).length ? `Без суммы: ${(p.openItems || []).join(", ")}` : "",
        ].filter(Boolean).join("\n"),
        createdAt: new Date().toISOString(),
      };
      await addDeal(agencyId, deal);
      await send(
        `🎉 <b>Сделка создана</b>\n\n📋 ${esc(name)}\n` +
        `${p.client ? `👤 ${esc(p.client)}\n` : ""}` +
        `💰 ${money(p.sum)} · ${p.lines.length} ${p.lines.length === 1 ? "позиция" : "позиций"}\n\n` +
        `Откройте сделку в CRM — там кнопка «Развернуть смету».`,
        mainKeyboard,
      );
      return new Response("ok", { status: 200 });
    }

    if (!isCallback && !text.startsWith("/")) {
      await send("Нажмите кнопку под сметой: создать, поправить или отменить.", estimateConfirmKb(p));
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
        (d.desc ? `\n📝 ${esc(d.desc)}` : "") +
        (d.projectName ? `\n📋 ${esc(d.projectName)}` : "\n📋 Без привязки"),
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

  if (session?.action === "change_status") {
    if (text === "cs_cancel" || text === "cs_proj_none") {
      await writeSession(agencyId, null);
      await send("❌ Отменено.", mainKeyboard);
      return new Response("ok", { status: 200 });
    }
    // Сделка выбрана — показать выбор статуса
    if (isCallback && text.startsWith("cs_proj_") && session.step === "select_deal") {
      const dealId = text.replace("cs_proj_", "");
      const proj = projects.find((p: any) => p.id === dealId);
      if (!proj) { await writeSession(agencyId, null); await send("Сделка не найдена.", mainKeyboard); return new Response("ok", { status: 200 }); }
      await writeSession(agencyId, { ...session, step: "select_status", dealId, dealName: proj.name });
      await send(
        `📋 <b>${esc(proj.name)}</b>${proj.client ? `\n👤 ${esc(proj.client)}` : ""}\nСтатус: <b>${esc(proj.crmStatus) || "Лид"}</b>\n\nВыберите новый статус:`,
        statusKb(),
      );
      return new Response("ok", { status: 200 });
    }
    // Статус выбран
    if (isCallback && text.startsWith("cs_st_") && session.step === "select_status") {
      const idx = parseInt(text.replace("cs_st_", ""), 10);
      const newStatus = CRM_STATUSES[idx];
      if (!newStatus || !session.dealId) { await send("Ошибка. Попробуйте снова.", mainKeyboard); return new Response("ok", { status: 200 }); }
      await updateDealStatus(agencyId, session.dealId, newStatus);
      await send(`✅ <b>${session.dealName || "Сделка"}</b>\nСтатус изменён → <b>${newStatus}</b>`, mainKeyboard);
      return new Response("ok", { status: 200 });
    }
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  const command = text.startsWith("/")
    ? text.split(" ")[0].slice(1).split("@")[0].toLowerCase()
    : text.toLowerCase();

  if (command === "new_deal"      || command === "deal"   || command === "сделка")     { await startDealFlow(agencyId); return new Response("ok", { status: 200 }); }
  if (command === "new_income"    || command === "доход"  || command === "поступление") { await startTxFlow(agencyId, "income");  return new Response("ok", { status: 200 }); }
  if (command === "new_expense"   || command === "расход") { await startTxFlow(agencyId, "expense"); return new Response("ok", { status: 200 }); }
  if (command === "change_status" || command === "статус") { await startChangeStatusFlow(agencyId, projects); return new Response("ok", { status: 200 }); }

  // ── /today ─────────────────────────────────────────────────────────────────

  if (command === "today" || command === "сегодня") {
    const active = projects.filter(p => p.crmStatus !== "Сдано" && p.crmStatus !== "Оплата" && !isDealInactive(p.crmStatus || ""));
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
        return `${icon} <b>${esc(p.name)}</b> — ${when}${p.client ? `\n   👤 ${esc(p.client)}` : ""}`;
      });
      await send(`📅 <b>Дедлайны — 7 дней:</b>\n\n${lines.join("\n\n")}`, mainKeyboard);
    }
    return new Response("ok", { status: 200 });
  }

  // ── /deals ─────────────────────────────────────────────────────────────────

  if (command === "deals" || command === "сделки") {
    const active = projects.filter(p => !isDealInactive(p.crmStatus || ""));
    if (!active.length) {
      await send(`📭 Активных сделок нет.`, mainKeyboard);
    } else {
      const byStatus: Record<string, any[]> = {};
      active.forEach(p => { const s = p.crmStatus || "Лид"; (byStatus[s] = byStatus[s] || []).push(p); });
      const lines = Object.entries(byStatus).map(([status, items]) => {
        const total = items.reduce((s, p) => s + (p.total || 0), 0);
        return `<b>${status}</b> · ${items.length} шт.${total ? " · " + money(total) : ""}\n` +
          items.map(p => `  • ${esc(p.name)}${p.client ? " · " + esc(p.client) : ""}`).join("\n");
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
    const active = projects.filter(p => p.crmStatus !== "Сдано" && p.crmStatus !== "Оплата" && !isDealInactive(p.crmStatus || ""));
    const pipeline = active.reduce((s, p) => s + (p.total || 0), 0);
    // Долг считаем только по неархивным/незавершённым сделкам — та же формула, что в CRM
    // ("Финансы" → «Общий долг»), иначе цифры на двух площадках расходятся.
    const debt = projects.filter(p => !isDealInactive(p.crmStatus || "")).reduce((s, p) => s + Math.max(0, (p.total || 0) - (p.paid || 0)), 0);
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
      `<b>ADERVIS — AI-помощник</b>\n\n` +
      `<b>Кнопки меню:</b>\n` +
      `📅 Дедлайны — горящие на 7 дней\n` +
      `🗂 Сделки — активные по статусам\n` +
      `📊 Сводка — деньги за месяц\n` +
      `➕ Новая сделка — пошаговое создание\n` +
      `💰 Поступление — записать приход\n` +
      `📤 Расход — записать расход\n` +
      `📌 Статус — изменить статус сделки\n\n` +
      `<b>Или напишите вопрос:</b>\n` +
      `«Что просрочено?»\n` +
      `«Сколько должен клиент Альфа?»\n` +
      `«Сколько я заработал в этом месяце?»`,
      mainKeyboard,
    );
    return new Response("ok", { status: 200 });
  }

  // ── Смета из свободного текста ─────────────────────────────────────────────
  /* Владелец присылает боту то, что и так пишет клиенту руками — список услуг с
     ценами и «Итого». Раньше такое сообщение уходило в общий AI-ответ: бот
     пересказывал его словами и ничего не создавал.

     Стоит ВЫШЕ свободного AI-ответа: сообщение со сметой должно разбираться, а
     не обсуждаться. Признак — несколько строк, в каждой сумма; одиночный вопрос
     «сколько должен Альфа» под него не попадает.

     Сделку не создаём молча: сначала показываем разбор и сверку с «Итого».
     Ошибка разбора — это неправильная сумма в договоре, поэтому последнее слово
     за человеком. */
  if (!text.startsWith("/") && !isCallback && looksLikeEstimate(text)) {
    const parsed = await parseEstimate(text);
    if (!parsed) {
      await send("Не смог разобрать смету — попробуйте ещё раз или создайте сделку кнопкой.", mainKeyboard);
      return new Response("ok", { status: 200 });
    }
    if (parsed.error) {
      await send(`❌ ${esc(parsed.error)}`, mainKeyboard);
      return new Response("ok", { status: 200 });
    }

    await writeSession(agencyId, {
      action: "estimate_confirm",
      step: "confirm",
      data: parsed,
      ts: Date.now(),
    });
    await send(estimateSummary(parsed), estimateConfirmKb(parsed));
    return new Response("ok", { status: 200 });
  }

  // ── AI free-form ───────────────────────────────────────────────────────────

  if (!text.startsWith("/") && geminiKey) {
    const active = projects.filter(p => !isDealInactive(p.crmStatus || ""));
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
