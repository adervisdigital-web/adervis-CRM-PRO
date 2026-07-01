import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_FROM = "ADERVIS CRM <noreply@app.adervis.ru>";
const REPLY_TO = "adervis.digital@gmail.com";
const APP_URL = "https://app.adervis.ru";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors, status: 204 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return new Response("Missing RESEND_API_KEY", { status: 500 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user || !user.email) return new Response("Unauthorized", { status: 401 });

  const name = user.user_metadata?.name || user.user_metadata?.full_name || user.email.split("@")[0];

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Добро пожаловать в ADERVIS CRM</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:560px;width:100%">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#6c00ff,#2563eb);padding:36px 40px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">ADERVIS CRM</div>
          <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:6px">CRM для видеопродакшн-студий</div>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:36px 40px 8px">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3">
            Привет, ${name}! 👋
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6">
            Вы зарегистрировались в ADERVIS CRM. У вас есть <strong style="color:#6c00ff">7 дней бесплатного пробного периода</strong> — без привязки карты.
          </p>
        </td></tr>

        <!-- Steps -->
        <tr><td style="padding:0 40px 32px">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
            <div style="font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:16px">С чего начать</div>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:32px;vertical-align:top;padding-bottom:16px">
                  <div style="width:28px;height:28px;border-radius:50%;background:#6c00ff;color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:28px">1</div>
                </td>
                <td style="padding-left:12px;padding-bottom:16px;vertical-align:top">
                  <div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:2px">Создайте первую сделку</div>
                  <div style="font-size:13px;color:#64748b">Нажмите «+ Новая сделка» и добавьте клиента — займёт 30 секунд</div>
                </td>
              </tr>
              <tr>
                <td style="width:32px;vertical-align:top;padding-bottom:16px">
                  <div style="width:28px;height:28px;border-radius:50%;background:#2563eb;color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:28px">2</div>
                </td>
                <td style="padding-left:12px;padding-bottom:16px;vertical-align:top">
                  <div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:2px">Соберите смету из пакетов</div>
                  <div style="font-size:13px;color:#64748b">Готовые пакеты услуг и каталог позиций — стоимость считается автоматически</div>
                </td>
              </tr>
              <tr>
                <td style="width:32px;vertical-align:top;padding-bottom:16px">
                  <div style="width:28px;height:28px;border-radius:50%;background:#16a34a;color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:28px">3</div>
                </td>
                <td style="padding-left:12px;padding-bottom:16px;vertical-align:top">
                  <div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:2px">Отправьте КП клиенту</div>
                  <div style="font-size:13px;color:#64748b">Онлайн-портал для клиента — он увидит состав, сроки и может одобрить прямо из браузера</div>
                </td>
              </tr>
              <tr>
                <td style="width:32px;vertical-align:top">
                  <div style="width:28px;height:28px;border-radius:50%;background:#0891b2;color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:28px">4</div>
                </td>
                <td style="padding-left:12px;vertical-align:top">
                  <div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:2px">Подключите Telegram-бота</div>
                  <div style="font-size:13px;color:#64748b">Управляйте сделками, записывайте доходы и получайте уведомления прямо в Telegram</div>
                </td>
              </tr>
            </table>
          </div>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 40px 36px;text-align:center">
          <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#6c00ff,#2563eb);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 36px;border-radius:10px;letter-spacing:-0.2px">
            Открыть ADERVIS CRM →
          </a>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">
            Все данные сохраняются в облаке — работайте с любого устройства
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6">
            Есть вопросы? Ответьте на это письмо — мы поможем.<br>
            <strong>ADERVIS CRM</strong> · <a href="${APP_URL}" style="color:#6c00ff;text-decoration:none">app.adervis.ru</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: user.email,
      subject: "Добро пожаловать в ADERVIS CRM — ваши 7 дней начались",
      html,
      reply_to: REPLY_TO,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("welcome-email: Resend error", resp.status, errText);
    return new Response(JSON.stringify({ error: errText }), {
      status: 502, headers: { "Content-Type": "application/json", ...cors },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", ...cors },
  });
});
