import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Форматирует YYYY-MM-DD → YYYYMMDD для iCal
function toIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

// Следующий день для DTEND (iCal all-day events — DTEND = day after)
function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// Экранирование текста для iCal
function icsEscape(s: string): string {
  return (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// Перенос длинных строк по RFC 5545 (75 символов)
function foldLine(line: string): string {
  const out: string[] = [];
  while (line.length > 75) {
    out.push(line.slice(0, 75));
    line = " " + line.slice(75);
  }
  out.push(line);
  return out.join("\r\n");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const portalId = url.searchParams.get("portal");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Два режима: ?token=<calendar_token> — весь агентский фид (Настройки, для команды),
  // либо ?portal=<portal_id> — публичный read-only фид ровно одной сделки для клиента
  // портала КП (без OAuth/логина — клиент просто подписывается на ссылку в календаре).
  //
  // SECURITY: token — это profiles.calendar_token, НЕ agency_id. Раньше сюда шёл
  // напрямую agency_id, а он публичен: get_client_portal отдаёт его анониму, и
  // страница КП печатает его в ссылку ?ref=<agency_id>. То есть любой заказчик,
  // получивший ссылку на своё КП, вытаскивал agency_id и читал здесь задачи,
  // дедлайны и внутренние заметки по ВСЕМ сделкам агентства. Токен из profiles
  // не покидает личный кабинет и отзывается через rotate_calendar_token().
  // См. миграцию 20260730000001_calendar_feed_token.sql.
  let agencyId: string;
  let onlyProjectId: string | null = null;
  // Имя календаря собирается ПОСЛЕ чтения состояния агентства: клиент студии
  // подписывается на эту ссылку из своего КП, и календарь навсегда поселяется у
  // него в телефоне. Называться он обязан студией, а не сервисом — до 19.08.2026
  // там стояло «ADERVIS CRM — <сделка>», то есть имя чужой компании и прямого
  // конкурента в календаре заказчика.
  let dealNameForCal = "";

  if (portalId) {
    if (!/^[0-9a-f-]{36}$/i.test(portalId)) return new Response("Bad token", { status: 400 });
    const { data: portal, error: portalError } = await supabase
      .from("client_portals")
      .select("agency_id, project_id, deal_name")
      .eq("id", portalId)
      .maybeSingle();
    if (portalError || !portal || !portal.agency_id) return new Response("Not found", { status: 404 });
    agencyId = portal.agency_id as string;
    onlyProjectId = (portal.project_id as string) || null;
    dealNameForCal = (portal.deal_name as string) || "Проект";
  } else if (token && /^[0-9a-f-]{36}$/i.test(token)) {
    // Резолвим агентство по токену. Для участника команды agency_id берётся из
    // его профиля, поэтому фид у владельца и у сотрудника одинаково агентский.
    const { data: owner, error: ownerError } = await supabase
      .from("profiles")
      .select("agency_id")
      .eq("calendar_token", token)
      .maybeSingle();
    // 404, а не 403: чужой/отозванный токен не должен отличаться по ответу от
    // несуществующего — иначе перебором можно подтверждать живые токены.
    if (ownerError || !owner || !owner.agency_id) return new Response("Not found", { status: 404 });
    agencyId = owner.agency_id as string;
  } else {
    return new Response("Bad token", { status: 400 });
  }

  // Читаем state агентства
  const { data, error } = await supabase
    .from("agency_state")
    .select("state_json")
    .eq("id", agencyId)
    .single();

  if (error || !data) {
    return new Response("Not found", { status: 404 });
  }

  const state = data.state_json as Record<string, unknown>;
  const agencyName = String(
    ((state.company as Record<string, unknown> | undefined)?.name as string) || ""
  ).trim();
  // Нет имени студии — называем документом, а не сервисом: лучше без имени, чем с
  // чужим (то же правило, что в портале КП и в письме со ссылкой на него).
  const calName = portalId
    ? (agencyName ? `${agencyName} — ${dealNameForCal}` : dealNameForCal)
    : (agencyName ? `${agencyName} — задачи` : "ADERVIS CRM — Задачи");
  const savedProjects = (state.savedProjects as Array<Record<string, unknown>>) || [];
  // SECURITY: для клиентского портала (portalId) показываем СТРОГО одну сделку.
  // Раньше при отсутствующем project_id (все существующие порталы созданы ДО
  // миграции 20260704000002, project_id у них NULL) код падал на "показать все
  // savedProjects" — клиент со своей ссылкой на портал видел дедлайны и названия
  // ВСЕХ сделок агентства, включая чужие. По замыслу самой миграции (см. её
  // комментарий) отсутствие project_id должно означать "фид пуст", не "показать всё".
  const projectsToShow = portalId
    ? (onlyProjectId ? savedProjects.filter(p => p.id === onlyProjectId) : [])
    : savedProjects;

  // Собираем события: задачи из всех проектов + дедлайны самих проектов.
  // Для клиентского портала (portalId) задачи агентства — внутренние, не показываем,
  // только дедлайн самой сделки.
  type IcsEvent = {
    uid: string;
    date: string;
    summary: string;
    description: string;
    status: string;
  };

  const events: IcsEvent[] = [];

  for (const proj of projectsToShow) {
    const projName = (proj.name as string) || "Проект";
    const projId = (proj.id as string) || "";

    // Дедлайн проекта
    const projDeadline = (proj.deadline as string) || "";
    if (projDeadline) {
      events.push({
        uid: `deadline-${projId}@adervis.crm`,
        date: projDeadline,
        summary: `📁 Дедлайн: ${projName}`,
        description: portalId ? "" : `Сделка: ${projName}\nСтатус: ${(proj.crmStatus as string) || ""}`,
        status: "NEEDS-ACTION",
      });
    }

    if (portalId) continue;

    // Задачи проекта (только для агентского agency-wide фида)
    const snapshot = (proj.snapshot as Record<string, unknown>) || {};
    const tasks = (snapshot.tasks as Array<Record<string, unknown>>) || [];
    for (const task of tasks) {
      const deadline = (task.deadline as string) || "";
      const taskStatus = (task.status as string) || "";
      if (!deadline || taskStatus === "Готово") continue;

      const icsStatus = taskStatus === "В работе" ? "IN-PROCESS" : "NEEDS-ACTION";
      const assignee = (task.assignee as string) || "";
      const note = (task.note as string) || "";
      const priority = (task.priority as string) || "";

      events.push({
        uid: `task-${task.id as string}@adervis.crm`,
        date: deadline,
        summary: `✅ ${(task.title as string) || "Задача"}`,
        description: [
          `Проект: ${projName}`,
          assignee ? `Ответственный: ${assignee}` : "",
          priority ? `Приоритет: ${priority}` : "",
          note ? `Заметка: ${note}` : "",
        ].filter(Boolean).join("\n"),
        status: icsStatus,
      });
    }
  }

  // Сортируем по дате
  events.sort((a, b) => a.date.localeCompare(b.date));

  // Генерируем .ics
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ADERVIS CRM//ADERVIS CRM//RU",
    foldLine(`X-WR-CALNAME:${icsEscape(calName)}`),
    "X-WR-TIMEZONE:Europe/Moscow",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const ev of events) {
    const start = toIcsDate(ev.date);
    const end = nextDay(ev.date);
    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:${ev.uid}`));
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${end}`);
    lines.push(foldLine(`SUMMARY:${icsEscape(ev.summary)}`));
    if (ev.description) {
      lines.push(foldLine(`DESCRIPTION:${icsEscape(ev.description)}`));
    }
    lines.push(`STATUS:${ev.status}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="adervis-crm.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
});
