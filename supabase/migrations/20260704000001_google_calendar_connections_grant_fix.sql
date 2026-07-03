-- Фикс: RLS-политика на google_calendar_connections сверяет user_id в USING(),
-- но роль authenticated не имела SELECT-права на сам столбец user_id — Postgres
-- требует привилегию на КАЖДЫЙ столбец, участвующий в вычислении политики или
-- WHERE-фильтра, даже если он не возвращается в выборке. Без этого гранта весь
-- запрос падал с 403 Forbidden, а не просто скрывал лишние поля.
GRANT SELECT (user_id) ON google_calendar_connections TO authenticated;
