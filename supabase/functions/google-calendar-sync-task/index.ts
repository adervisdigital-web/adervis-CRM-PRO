import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://app.adervis.ru",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Connection {
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  calendar_id: string;
}

// Идентично google-calendar-events/index.ts — нет общего _shared модуля в проекте,
// каждая Edge Function самодостаточна (см. остальные supabase/functions/*).
async function getValidAccessToken(
  admin: SupabaseClient, userId: string
): Promise<{ accessToken: string; calendarId: string } | { needsReconnect: true } | null> {
  const { data: row } = await admin
    .from("google_calendar_connections")
    .select("refresh_token, access_token, access_token_expires_at, calendar_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) return null;
  const conn = row as Connection;

  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;
  if (conn.access_token && expiresAt - Date.now() > 60_000) {
    return { accessToken: conn.access_token, calendarId: conn.calendar_id || "primary" };
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: conn.refresh_token,
      client_id: Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")!,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    console.error("google-calendar: refresh_token exchange failed", await resp.text());
    await admin.from("google_calendar_connections").delete().eq("user_id", userId);
    return { needsReconnect: true };
  }

  const data = await resp.json();
  const accessToken: string = data.access_token;
  const expiresIn: number = Number(data.expires_in) || 3600;

  await admin.from("google_calendar_connections").update({
    access_token: accessToken,
    access_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  return { accessToken, calendarId: conn.calendar_id || "primary" };
}

// YYYY-MM-DD → следующий день (DTEND для all-day события, как в calendar-feed)
function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

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
    const action: string = body.action;
    const task = body.task as { id?: string; title?: string; deadline?: string; googleEventId?: string } | undefined;

    if (!task?.id || (action !== "upsert" && action !== "delete")) {
      return json({ error: "Некорректный запрос" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const tokenResult = await getValidAccessToken(admin, user.id);
    if (tokenResult === null) return json({ error: "Google Calendar не подключён" }, 409);
    if ("needsReconnect" in tokenResult) return json({ needsReconnect: true }, 409);

    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(tokenResult.calendarId)}/events`;
    const authHeaders = { Authorization: `Bearer ${tokenResult.accessToken}`, "Content-Type": "application/json" };

    if (action === "delete") {
      if (!task.googleEventId) return json({ ok: true });
      const resp = await fetch(`${baseUrl}/${encodeURIComponent(task.googleEventId)}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!resp.ok && resp.status !== 404 && resp.status !== 410) {
        console.error("google-calendar-sync-task: delete failed", await resp.text());
        return json({ error: "Не удалось удалить событие в Google Calendar" }, 502);
      }
      return json({ ok: true });
    }

    // action === "upsert"
    if (!task.deadline) return json({ error: "У задачи нет дедлайна" }, 400);

    const eventBody = {
      summary: `✅ ${task.title || "Задача"}`,
      description: "Синхронизировано из ADERVIS CRM",
      start: { date: task.deadline },
      end: { date: nextDay(task.deadline) },
      extendedProperties: { private: { crmTaskId: task.id } },
    };

    let resp: Response;
    if (task.googleEventId) {
      resp = await fetch(`${baseUrl}/${encodeURIComponent(task.googleEventId)}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify(eventBody),
      });
      // Событие могло быть удалено на стороне Google (вручную, или отменённое
      // CRM-удаление задачи с undo уже успело стереть старую связку) — в этом
      // случае создаём новое вместо жёсткой ошибки.
      if (resp.status === 404 || resp.status === 410) {
        resp = await fetch(baseUrl, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(eventBody),
        });
      }
    } else {
      resp = await fetch(baseUrl, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(eventBody),
      });
    }

    if (!resp.ok) {
      console.error("google-calendar-sync-task: upsert failed", await resp.text());
      return json({ error: "Не удалось сохранить событие в Google Calendar" }, 502);
    }

    const eventData = await resp.json();
    return json({ googleEventId: eventData.id as string });
  } catch (e) {
    console.error("google-calendar-sync-task:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
