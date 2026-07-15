import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Бесплатный тариф Gemini API (Google AI Studio, ключ без привязки карты):
// gemini-2.5-flash-lite — 15 запросов/мин, 1000 запросов/день, этого с запасом
// хватает на генерацию КП в рамках одного агентства.
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Лимит генераций на пробном тарифе. Продублирован в app.js
// (AI_PROPOSAL_TRIAL_LIMIT) — там он бережёт лишний запрос, решает же он здесь.
const TRIAL_LIMIT = 5;
const SUPER_ADMIN_EMAIL = "adervis.digital@gmail.com";

const cors = {
  "Access-Control-Allow-Origin": "https://app.adervis.ru",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STAGE_LABELS: Record<string, string> = {
  pre: "Подготовка и концепция",
  shoot: "Съёмочный процесс",
  post: "Постпродакшн",
  management: "Управление проектом",
  marketing: "Дистрибуция",
};

const SYSTEM_PROMPT = `Ты — копирайтер digital-агентства Adervis, которое производит видеоконтент полного цикла (стратегия, съёмка, монтаж, дистрибуция).
Тебе передают данные сделки (клиент, выбранные услуги, этапы производства, итоговая стоимость), и ты должен сгенерировать текст для коммерческого предложения (КП).

Отвечай СТРОГО валидным JSON без markdown-обрамления (без \`\`\`), ровно с тремя полями:
{
  "includedText": "список того, что входит в стоимость — каждый пункт с новой строки, начинается с «— »",
  "excludedText": "список того, что НЕ входит в стоимость — каждый пункт с новой строки, начинается с «— »",
  "proposalNote": "2-3 абзаца текста о подходе агентства к проекту, плюс отдельным абзацем итоговая стоимость и условия оплаты (50% предоплата, 50% после сдачи финального материала)"
}

Пиши по-русски, по делу, без воды и канцеляризмов. Не придумывай услуги, которых нет в переданном списке.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // service_role: и подписку, и счётчик читаем в обход RLS — пользователь не
    // должен иметь возможности править ни то, ни другое.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;
    let trialCount = 0;
    let onTrial = false;

    if (!isSuperAdmin) {
      const { data: profile, error: profileErr } = await admin
        .from("profiles")
        .select("subscription_status, subscription_expires_at")
        .eq("id", user.id)
        .single();
      if (profileErr || !profile) return json({ error: "Профиль не найден" }, 403);

      // Зеркалит isSubscriptionActive() в app.js: у "active" срок намеренно не
      // проверяется (см. заметку про истечение платной подписки), у "trial" — да.
      const expiresAt = profile.subscription_expires_at
        ? new Date(profile.subscription_expires_at)
        : null;
      onTrial = profile.subscription_status === "trial" &&
        (!expiresAt || expiresAt > new Date());
      const paid = profile.subscription_status === "active";

      if (!paid && !onTrial) {
        return json({ error: "Подписка неактивна — генерация КП недоступна" }, 403);
      }

      if (onTrial) {
        const { data: usage } = await admin
          .from("ai_usage")
          .select("proposal_count")
          .eq("user_id", user.id)
          .maybeSingle();
        trialCount = usage?.proposal_count ?? 0;
        if (trialCount >= TRIAL_LIMIT) {
          return json({
            error: `На пробном тарифе доступно ${TRIAL_LIMIT} генераций КП — лимит исчерпан. Перейдите на платный тариф.`,
            aiProposalCount: trialCount,
          }, 403);
        }
      }
    }

    const body = await req.json();
    const clientName: string = (body.clientName || "Заказчик").toString().slice(0, 200);
    const total: number = Number(body.total) || 0;
    const services: string[] = Array.isArray(body.services) ? body.services.slice(0, 12).map(String) : [];
    const stages: string[] = Array.isArray(body.stages) ? body.stages.slice(0, 8).map(String) : [];
    const stagesText = stages.map((s) => STAGE_LABELS[s] || s).join(", ");

    const userMessage = [
      `Клиент: ${clientName}`,
      services.length ? `Выбранные услуги: ${services.join(", ")}` : null,
      stagesText ? `Этапы производства: ${stagesText}` : null,
      `Итоговая стоимость: ${total.toLocaleString("ru-RU")} ₽`,
    ].filter(Boolean).join("\n");

    const geminiResp = await fetch(`${GEMINI_URL}?key=${Deno.env.get("GEMINI_API_KEY")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 1500,
        },
      }),
    });

    if (!geminiResp.ok) {
      const txt = await geminiResp.text();
      console.error("Gemini API error:", geminiResp.status, txt);
      return json({ error: "Ошибка сервиса генерации текста" }, 502);
    }

    const geminiData = await geminiResp.json();
    const text: string | undefined = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("ai-proposal: empty Gemini response:", JSON.stringify(geminiData));
      return json({ error: "Пустой ответ от модели" }, 502);
    }

    let parsed: { includedText?: string; excludedText?: string; proposalNote?: string };
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      console.error("ai-proposal: failed to parse model output:", text);
      return json({ error: "Не удалось разобрать ответ модели" }, 502);
    }

    if (!parsed.includedText || !parsed.excludedText || !parsed.proposalNote) {
      return json({ error: "Модель вернула неполный ответ" }, 502);
    }

    // Считаем только состоявшиеся генерации: ошибка Gemini не должна съедать попытку.
    if (onTrial) {
      const { data: newCount, error: incErr } = await admin
        .rpc("increment_ai_proposal_count", { p_user_id: user.id });
      if (incErr) console.error("ai-proposal: increment failed:", incErr);
      else if (typeof newCount === "number") trialCount = newCount;
    }

    return json({
      includedText: parsed.includedText,
      excludedText: parsed.excludedText,
      proposalNote: parsed.proposalNote,
      aiProposalCount: trialCount,
    });
  } catch (e) {
    console.error("ai-proposal:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
