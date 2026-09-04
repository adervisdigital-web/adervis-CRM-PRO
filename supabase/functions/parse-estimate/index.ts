import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* Разбор сметы из свободного текста.

   Владелец присылает в Telegram то, что и так пишет клиенту руками:

     Создание сценария / работа со сценарием - 10,000₽
     Съемка - 50,000₽ (2 оператора)
     Монтаж (работа со звуком / цветокоррекция) - 20,000₽
     Графика 2D (логотип, текст на видео, пекшот и плашки) - 35,000₽
     Аренда оборудования - 20,000₽

     Итого: 135,000₽ + трансфер

   Здесь этот текст превращается в позиции. Функция НИЧЕГО не записывает в базу:
   она только разбирает и проверяет. Решение о создании сделки принимает бот
   после подтверждения человеком — деньги не заводятся молча.

   ── Почему нельзя доверять модели считать деньги ──────────────────────────
   Ошибка разбора здесь — это неправильная сумма в смете, то есть в договоре и
   в счёте. Поэтому сумма НЕ берётся у модели: позиции складываются здесь, в
   коде, и сверяются со строкой «Итого», которую написал человек. Не сошлось —
   отдаём расхождение, а не догадку. Строку «Итого» модель обязана вернуть
   отдельным полем именно ради этой сверки.

   Модель отвечает только за то, что она умеет: разбить текст на строки, вынуть
   название и число, заметить приписки вроде «+ трансфер», у которых суммы нет.
*/

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const cors = {
  "Access-Control-Allow-Origin": "https://app.adervis.ru",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Ты разбираешь смету видеопродакшна, написанную человеком в свободной форме.

Верни СТРОГО валидный JSON без markdown-обрамления, ровно с этими полями:
{
  "dealName": "короткое название проекта, если его видно в тексте, иначе пустая строка",
  "client": "имя клиента или компании, если оно есть в тексте, иначе пустая строка",
  "lines": [
    { "name": "название услуги как в тексте, без цены", "price": число_рублей, "qty": число, "note": "уточнение в скобках, например «2 оператора», иначе пустая строка" }
  ],
  "statedTotal": число_из_строки_«Итого»_или_null,
  "openItems": ["позиции, названные без суммы — например «+ трансфер»"]
}

Правила:
- price — ЦЕЛОЕ число рублей. «10,000₽», «10 000 руб», «10.000" — это 10000.
- qty ставь 1, если в тексте явно не указано другое количество. «2 оператора» — это НЕ qty, это note.
- Позицию без суммы НЕ выдумывай ценой: положи её название в openItems.
- Строку «Итого» в lines НЕ включай — только в statedTotal.
- Ничего не добавляй от себя: сколько строк в тексте, столько и в lines.
- Пиши по-русски, названия оставляй как у человека.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    /* Зовёт эту функцию бот (service_role) и, в будущем, приложение (токен
       пользователя). В обоих случаях наружу уходит только разбор присланного
       текста — чужих данных функция не читает, поэтому достаточно факта
       авторизации. */
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isService = authHeader === `Bearer ${serviceKey}`;
    if (!isService) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const text = String(body.text || "").trim();
    if (!text) return json({ error: "Пустой текст" }, 400);
    if (text.length > 4000) return json({ error: "Слишком длинный текст" }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "Разбор смет не настроен: нет ключа" }, 503);

    const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("parse-estimate: Gemini", resp.status, t.slice(0, 300));
      return json({ error: "Не удалось разобрать текст, попробуйте ещё раз" }, 502);
    }

    const data = await resp.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("parse-estimate: не JSON", raw.slice(0, 300));
      return json({ error: "Не удалось разобрать текст, попробуйте ещё раз" }, 502);
    }

    // ── Дальше модели не верим: чистим и считаем сами ──────────────────────
    const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
    const lines = rawLines
      .map((l) => {
        const o = (l || {}) as Record<string, unknown>;
        return {
          name: String(o.name || "").trim().slice(0, 120),
          price: intOf(o.price),
          qty: Math.max(1, intOf(o.qty) || 1),
          note: String(o.note || "").trim().slice(0, 80),
        };
      })
      .filter((l) => l.name && l.price > 0);

    if (!lines.length) {
      return json({ error: "В тексте не нашлось ни одной позиции с суммой" }, 422);
    }

    const sum = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const statedTotal = intOf(parsed.statedTotal);
    // Расхождение считаем ЗДЕСЬ и отдаём наружу числом: бот покажет его человеку
    // и не станет создавать сделку молча.
    const mismatch = statedTotal > 0 && statedTotal !== sum ? statedTotal - sum : 0;

    const openItems = (Array.isArray(parsed.openItems) ? parsed.openItems : [])
      .map((x) => String(x || "").trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 5);

    return json({
      dealName: String(parsed.dealName || "").trim().slice(0, 120),
      client: String(parsed.client || "").trim().slice(0, 120),
      lines,
      sum,
      statedTotal,
      mismatch,
      openItems,
    });
  } catch (e) {
    console.error("parse-estimate:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

/* «135 000», «135,000», «135.000», «135000 ₽» — всё это одно число.
   Точку и запятую в роли разделителя тысяч убираем, но дробную часть в рублях
   не выдумываем: смета в копейках не считается.

   Берём ПЕРВОЕ число строки, а не все цифры подряд. Первая версия вычищала
   из строки всё, кроме цифр, и на настоящей строке владельца
   «Съемка - 50,000₽ (2 оператора)» модель, вернувшая price строкой целиком,
   давала 500002 вместо 50000 — цена вырастала в десять раз от двойки в
   «2 оператора». Сверка с «Итого» такую смету отбила бы, но человек увидел бы
   расхождение вместо готовой сметы и не понял, откуда оно.

   Модель ОБЯЗАНА класть «2 оператора» в note и возвращать price числом, но
   разбор денег не должен зависеть от того, послушалась ли она. */
function intOf(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  const m = String(v ?? "").match(/-?\d[\d\s.,]*/);
  if (!m) return 0;
  const s = m[0].replace(/\s+/g, "").replace(/[.,](?=\d{3}\b)/g, "");
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
