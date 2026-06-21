import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Бесплатный тариф Gemini API (Google AI Studio, ключ без привязки карты):
// gemini-2.5-flash-lite — 15 запросов/мин, 1000 запросов/день, этого с запасом
// хватает на генерацию КП в рамках одного агентства.
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const cors = {
  "Access-Control-Allow-Origin": "*",
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

    return json({
      includedText: parsed.includedText,
      excludedText: parsed.excludedText,
      proposalNote: parsed.proposalNote,
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
