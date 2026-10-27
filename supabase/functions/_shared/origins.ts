// Адреса, с которых CRM ходит в функции. Переезд app.adervis.ru → crm.adervis.ru:
// пока живут оба адреса, ответ получает тот Allow-Origin, с которого пришёл запрос.
export const ALLOWED_ORIGINS = ["https://crm.adervis.ru", "https://app.adervis.ru"];

type Handler = (req: Request, info: Deno.ServeHandlerInfo) => Response | Promise<Response>;

// Обёртка над Deno.serve: функции оставляют свои cors-заголовки как есть,
// а здесь Allow-Origin подменяется на адрес запроса, если он наш.
export function serveOrigins(handler: Handler) {
  return Deno.serve(async (req, info) => {
    const res = await handler(req, info);
    const origin = req.headers.get("origin");
    if (!origin || !ALLOWED_ORIGINS.includes(origin)) return res;
    try {
      res.headers.set("Access-Control-Allow-Origin", origin);
      res.headers.append("Vary", "Origin");
      return res;
    } catch {
      // у некоторых ответов заголовки неизменяемые — пересобираем ответ
      const headers = new Headers(res.headers);
      headers.set("Access-Control-Allow-Origin", origin);
      headers.append("Vary", "Origin");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
  });
}
