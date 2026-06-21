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

  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    return new Response("Bad token", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Читаем state агентства по agency_id = token
  const { data, error } = await supabase
    .from("agency_state")
    .select("state_json")
    .eq("id", token)
    .single();

  if (error || !data) {
    return new Response("Not found", { status: 404 });
  }

  const state = data.state_json as Record<string, unknown>;
  const savedProjects = (state.savedProjects as Array<Record<string, unknown>>) || [];

  // Собираем события: задачи из всех проектов + дедлайны самих проектов
  type IcsEvent = {
    uid: string;
    date: string;
    summary: string;
    description: string;
    status: string;
  };

  const events: IcsEvent[] = [];

  for (const proj of savedProjects) {
    const projName = (proj.name as string) || "Проект";
    const projId = (proj.id as string) || "";

    // Дедлайн проекта
    const projDeadline = (proj.deadline as string) || "";
    if (projDeadline) {
      events.push({
        uid: `deadline-${projId}@adervis.crm`,
        date: projDeadline,
        summary: `📁 Дедлайн: ${projName}`,
        description: `Сделка: ${projName}\nСтатус: ${(proj.crmStatus as string) || ""}`,
        status: "NEEDS-ACTION",
      });
    }

    // Задачи проекта
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
    "X-WR-CALNAME:ADERVIS CRM — Задачи",
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
