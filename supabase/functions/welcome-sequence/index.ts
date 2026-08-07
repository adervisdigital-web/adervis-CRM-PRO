import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Онбординг-цепочка писем day-1/3/6 для триальных пользователей.
// Дёргается ежедневным pg_cron (welcome-sequence-daily) через pg_net с x-cron-secret.
// Развёрнута с --no-verify-jwt: cron не шлёт Supabase JWT, гейт — общий секрет CRON_SECRET.
// Идемпотентность: колонки profiles.welcome_d{1,3,6}_at (не шлём повторно).
// «День с регистрации» = (subscription_expires_at - 7 дней), триал всегда 7 дней.

const RESEND_FROM = "ADERVIS CRM <noreply@app.adervis.ru>";
const REPLY_TO = "adervis.digital@gmail.com";
const DAY = 86400000;

type Mail = { subject: string; heading: string; intro: string; steps: [string, string][]; cta: string; href: string; note: string };

function buildMail(appUrl: string, name: string, m: Mail): string {
  const stepsHtml = m.steps.map(([title, desc], i) => {
    const colors = ["#6c00ff", "#2563eb", "#16a34a", "#0891b2"];
    return `
      <tr>
        <td style="width:32px;vertical-align:top;padding-bottom:14px">
          <div style="width:28px;height:28px;border-radius:50%;background:${colors[i % 4]};color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:28px">${i + 1}</div>
        </td>
        <td style="padding-left:12px;padding-bottom:14px;vertical-align:top">
          <div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:2px">${title}</div>
          <div style="font-size:13px;color:#64748b;line-height:1.5">${desc}</div>
        </td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:560px;width:100%">
      <tr><td style="background:linear-gradient(135deg,#6c00ff,#2563eb);padding:32px 40px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">ADERVIS CRM</div>
        <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:6px">CRM для видеопродакшн-студий</div>
      </td></tr>
      <tr><td style="padding:34px 40px 8px">
        <p style="margin:0 0 8px;font-size:21px;font-weight:700;color:#0f172a;line-height:1.3">${m.heading}</p>
        <p style="margin:0 0 22px;font-size:15px;color:#475569;line-height:1.6">Привет, ${name}! ${m.intro}</p>
      </td></tr>
      ${m.steps.length ? `<tr><td style="padding:0 40px 28px">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:22px">
          <table width="100%" cellpadding="0" cellspacing="0">${stepsHtml}</table>
        </div>
      </td></tr>` : ""}
      <tr><td style="padding:0 40px 34px;text-align:center">
        <a href="${m.href}" style="display:inline-block;background:linear-gradient(135deg,#6c00ff,#2563eb);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 36px;border-radius:10px">${m.cta} →</a>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">${m.note}</p>
      </td></tr>
      <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
        <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6">Есть вопросы? Просто ответьте на это письмо.<br>
        <strong>ADERVIS CRM</strong> · <a href="${appUrl}" style="color:#6c00ff;text-decoration:none">app.adervis.ru</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function mailFor(stage: 1 | 3 | 6, appUrl: string): Mail {
  if (stage === 1) return {
    subject: "Соберите первую смету в ADERVIS CRM за 5 минут",
    heading: "Смета за минуты, а не за вечер 📋",
    intro: "После регистрации мы уже завели демо-сделку с готовой сметой — откройте её, чтобы за минуту понять, как всё устроено, а потом соберите свою.",
    steps: [
      ["Откройте демо-сделку", "На главной уже лежит «Демо: рекламный ролик» — посмотрите, как выглядит заполненная смета и финансы"],
      ["Создайте свою сделку", "Кнопка «+ Новая сделка», добавьте клиента — займёт полминуты"],
      ["Соберите смету из пакетов", "Готовые пакеты услуг и каталог позиций — сумма считается сама"],
    ],
    cta: "Открыть ADERVIS CRM",
    href: appUrl,
    note: "Все данные в облаке — работайте с любого устройства",
  };
  if (stage === 3) return {
    subject: "Покажите клиенту КП онлайн — он одобрит в один клик",
    heading: "Клиентский портал — ваше КП выглядит дорого 💼",
    intro: "Самое сильное в ADERVIS — онлайн-портал КП. Клиент открывает ссылку, видит состав, сроки и сумму, и одобряет прямо из браузера. Никаких PDF по почте.",
    steps: [
      ["Откройте любую сделку", "Перейдите в смету и нажмите «Ссылка КП» или «КП на почту клиента»"],
      ["Отправьте ссылку клиенту", "Он увидит красивый портал с вашим предложением и сможет одобрить"],
      ["Принимайте аванс онлайн", "Клиент может оплатить аванс картой или СБП прямо на портале"],
    ],
    cta: "Создать КП клиенту",
    href: appUrl,
    note: "Одобрение и оплата аванса — не выходя из браузера",
  };
  return {
    subject: "Завтра заканчивается пробный период ADERVIS CRM",
    heading: "Остался один день пробного периода ⏳",
    // «от 490 ₽/мес» — это годовая оплата. С подъёмом цен 08.08.2026 месяц стоит
    // 890 ₽, и «от 490» без уточнения периода читалось бы как цена месяца: человек
    // пришёл бы на страницу тарифов за другой суммой.
    intro: "Завтра пробный период заканчивается. Чтобы не потерять доступ к сделкам, сметам и клиентским КП, оформите подписку — 890 ₽/мес, это дешевле одного часа монтажа.",
    steps: [
      ["Все данные сохранятся", "Сделки, клиенты, сметы и настройки никуда не денутся — продолжите с того же места"],
      ["890 ₽/мес, от 490 ₽ при оплате за год", "Помесячно, на 3/6 месяцев или год — чем длиннее, тем выгоднее"],
    ],
    cta: "Выбрать тариф",
    href: appUrl,
    note: "Оплата картой или СБП, доступ открывается сразу",
  };
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return new Response("Missing RESEND_API_KEY", { status: 500 });
  const appUrl = Deno.env.get("APP_URL") ?? "https://app.adervis.ru";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Все триальные пользователи; окно по дню считаем в коде
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, subscription_status, subscription_expires_at, welcome_d1_at, welcome_d3_at, welcome_d6_at")
    .eq("subscription_status", "trial");

  if (error) {
    console.error("welcome-sequence: fetch error", error);
    return new Response("DB error", { status: 500 });
  }

  const now = Date.now();
  let sent = 0;

  for (const p of profiles ?? []) {
    if (!p.email || !p.subscription_expires_at) continue;
    const registeredAt = new Date(p.subscription_expires_at).getTime() - 7 * DAY;
    const daysSince = (now - registeredAt) / DAY;
    if (daysSince < 1 || daysSince >= 8) continue; // до дня 1 или уже истёк — пропускаем

    // Одно письмо за прогон, приоритет — самое позднее просроченное неотправленное (catch-up)
    let stage: 1 | 3 | 6 | 0 = 0;
    if (daysSince >= 6 && !p.welcome_d6_at) stage = 6;
    else if (daysSince >= 3 && !p.welcome_d3_at) stage = 3;
    else if (daysSince >= 1 && !p.welcome_d1_at) stage = 1;
    if (!stage) continue;

    const m = mailFor(stage, appUrl);
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: RESEND_FROM, to: p.email, subject: m.subject, html: buildMail(appUrl, p.email.split("@")[0], m), reply_to: REPLY_TO }),
      });
      if (!resp.ok) { console.error("welcome-sequence: Resend", stage, resp.status, await resp.text()); continue; }
      const col = stage === 6 ? "welcome_d6_at" : stage === 3 ? "welcome_d3_at" : "welcome_d1_at";
      await supabase.from("profiles").update({ [col]: new Date().toISOString() }).eq("id", p.id);
      sent++;
    } catch (e) {
      console.error("welcome-sequence: send failed", stage, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
