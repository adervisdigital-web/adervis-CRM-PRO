import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_FROM = "ADERVIS CRM <noreply@app.adervis.ru>";

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

  // Verify user JWT
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return new Response("Unauthorized", { status: 401 });

  let body: { clientEmail?: string; clientName?: string; dealName?: string; portalUrl?: string; totalPrice?: number; agencyName?: string };
  try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }

  const { clientEmail, clientName, dealName, portalUrl, totalPrice, agencyName } = body;
  if (!clientEmail || !portalUrl) {
    return new Response(JSON.stringify({ error: "clientEmail and portalUrl required" }), {
      status: 400, headers: { "Content-Type": "application/json", ...cors },
    });
  }

  const agency = agencyName || "Adervis";
  const subject = `КП от ${agency}${dealName ? ` — ${dealName}` : ""}`;

  const priceStr = totalPrice
    ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(totalPrice)
    : "";

  const greeting = clientName ? `Здравствуйте, ${clientName}!` : "Здравствуйте!";

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:560px;width:100%">

        <!-- Header -->
        <tr><td style="background:#0f172a;padding:32px 40px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">${agency}</div>
          <div style="font-size:13px;color:#94a3b8;margin-top:4px">Коммерческое предложение</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px 40px 32px">
          <p style="margin:0 0 16px;font-size:16px;color:#1e293b;line-height:1.5">${greeting}</p>
          <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6">
            Мы подготовили для вас коммерческое предложение${dealName ? ` по проекту <strong style="color:#1e293b">${dealName}</strong>` : ""}.
            Нажмите кнопку ниже, чтобы посмотреть состав, сроки и стоимость работ.
          </p>

          ${priceStr ? `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:28px;display:inline-block;width:100%;box-sizing:border-box">
            <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Предварительная стоимость</div>
            <div style="font-size:26px;font-weight:700;color:#0f172a">${priceStr}</div>
          </div>` : ""}

          <!-- CTA Button -->
          <div style="text-align:center;margin:8px 0 32px">
            <a href="${portalUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;letter-spacing:-0.2px">
              Открыть коммерческое предложение →
            </a>
          </div>

          <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5">
            Если кнопка не открывается — скопируйте ссылку в браузер:<br>
            <a href="${portalUrl}" style="color:#2563eb;word-break:break-all">${portalUrl}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">
            Письмо отправлено через платформу <strong>ADERVIS CRM</strong>.
            Если вы получили его по ошибке — просто проигнорируйте.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const sendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM, to: clientEmail, subject, html }),
  });

  if (!sendResp.ok) {
    const errText = await sendResp.text();
    console.error("send-portal-email: Resend error", sendResp.status, errText);
    return new Response(JSON.stringify({ error: errText }), {
      status: 502, headers: { "Content-Type": "application/json", ...cors },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", ...cors },
  });
});
