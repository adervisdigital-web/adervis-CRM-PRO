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

// Возвращает валидный access_token, при необходимости обновляя его через
// refresh_token. Если Google отвергает refresh_token (протух — обычное дело
// в Testing-режиме consent screen, срок жизни 7 дней), коннект удаляется и
// вызывающая функция должна сообщить фронтенду needsReconnect:true.
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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const tokenResult = await getValidAccessToken(admin, user.id);
    if (tokenResult === null) return json({ connected: false, events: [] });
    if ("needsReconnect" in tokenResult) return json({ connected: false, needsReconnect: true, events: [] });

    const timeMin = new Date(Date.now() - 7 * 86400000).toISOString();
    const timeMax = new Date(Date.now() + 90 * 86400000).toISOString();

    const eventsUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(tokenResult.calendarId)}/events`
    );
    eventsUrl.searchParams.set("timeMin", timeMin);
    eventsUrl.searchParams.set("timeMax", timeMax);
    eventsUrl.searchParams.set("singleEvents", "true");
    eventsUrl.searchParams.set("orderBy", "startTime");
    eventsUrl.searchParams.set("maxResults", "250");

    const eventsResp = await fetch(eventsUrl, {
      headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
    });

    if (!eventsResp.ok) {
      console.error("google-calendar-events: list failed", await eventsResp.text());
      return json({ error: "Не удалось получить события Google Calendar" }, 502);
    }

    const eventsData = await eventsResp.json();
    const items: Array<Record<string, unknown>> = eventsData.items || [];

    const events = items
      .filter((ev) => !ev.status || ev.status !== "cancelled")
      .map((ev) => {
        const start = ev.start as { date?: string; dateTime?: string } | undefined;
        const date = start?.date || (start?.dateTime ? start.dateTime.slice(0, 10) : "");
        return {
          id: ev.id as string,
          title: (ev.summary as string) || "(без названия)",
          date,
          htmlLink: (ev.htmlLink as string) || "",
        };
      })
      .filter((ev) => ev.date);

    return json({ connected: true, events });
  } catch (e) {
    console.error("google-calendar-events:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
