-- ═══════════════════════════════════════════════════════════════════════
-- Фикс race condition в telegram-webhook: read-modify-write без транзакции
-- Было: Edge Function делала SELECT state_json → мутация в памяти Deno →
-- UPSERT всего blob'а. Между SELECT и UPSERT мог вклиниться параллельный
-- запрос (второе сообщение в Telegram, или сохранение из веб-CRM того же
-- agency_state) — его изменения тихо терялись (lost update) на ВСЁМ state_json,
-- не только на _botSessions.
-- Стало: 4 RPC-функции делают SELECT ... FOR UPDATE + мутация + UPDATE внутри
-- одного вызова — Postgres держит row lock на всё время функции, конкурентные
-- вызовы сериализуются самой БД. Edge Function теперь не читает state_json
-- вообще для записи — только передаёт параметры.
-- Доступ только для service_role (вызывается исключительно из Edge Function
-- с SUPABASE_SERVICE_ROLE_KEY) — явный REVOKE от anon/authenticated, иначе
-- можно было бы дёргать bot_add_deal с чужим p_agency_id (cross-tenant запись).
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Установить/обновить сессию бота для чата ──────────────────────────
CREATE OR REPLACE FUNCTION bot_session_set(p_agency_id uuid, p_chat_id text, p_session jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  st jsonb;
BEGIN
  SELECT state_json INTO st FROM agency_state WHERE id = p_agency_id FOR UPDATE;
  IF st IS NULL THEN st := '{}'::jsonb; END IF;
  st := jsonb_set(st, ARRAY['_botSessions', p_chat_id], p_session, true);
  UPDATE agency_state SET state_json = st, updated_at = now() WHERE id = p_agency_id;
END;
$$;

-- ─── Очистить сессию бота для чата ──────────────────────────────────────
CREATE OR REPLACE FUNCTION bot_session_clear(p_agency_id uuid, p_chat_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  st jsonb;
BEGIN
  SELECT state_json INTO st FROM agency_state WHERE id = p_agency_id FOR UPDATE;
  IF st IS NULL THEN RETURN; END IF;
  st := st #- ARRAY['_botSessions', p_chat_id];
  UPDATE agency_state SET state_json = st, updated_at = now() WHERE id = p_agency_id;
END;
$$;

-- ─── Добавить сделку, созданную через Telegram ──────────────────────────
CREATE OR REPLACE FUNCTION bot_add_deal(p_agency_id uuid, p_chat_id text, p_deal jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  st jsonb;
BEGIN
  SELECT state_json INTO st FROM agency_state WHERE id = p_agency_id FOR UPDATE;
  IF st IS NULL THEN st := '{}'::jsonb; END IF;
  st := st #- ARRAY['_botSessions', p_chat_id];
  st := jsonb_set(st, ARRAY['savedProjects'], jsonb_build_array(p_deal) || COALESCE(st->'savedProjects', '[]'::jsonb), true);
  UPDATE agency_state SET state_json = st, updated_at = now() WHERE id = p_agency_id;
END;
$$;

-- ─── Записать поступление/расход через Telegram ─────────────────────────
CREATE OR REPLACE FUNCTION bot_add_transaction(
  p_agency_id uuid, p_chat_id text, p_tx_type text, p_tx jsonb, p_project_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  st jsonb;
  proj jsonb;
  new_projects jsonb := '[]'::jsonb;
BEGIN
  SELECT state_json INTO st FROM agency_state WHERE id = p_agency_id FOR UPDATE;
  IF st IS NULL THEN st := '{}'::jsonb; END IF;
  st := st #- ARRAY['_botSessions', p_chat_id];

  IF p_project_id IS NOT NULL THEN
    FOR proj IN SELECT * FROM jsonb_array_elements(COALESCE(st->'savedProjects', '[]'::jsonb))
    LOOP
      IF proj->>'id' = p_project_id THEN
        IF jsonb_typeof(proj->'snapshot') IS DISTINCT FROM 'object' THEN
          proj := jsonb_set(proj, ARRAY['snapshot'], '{}'::jsonb, true);
        END IF;
        IF p_tx_type = 'income' THEN
          proj := jsonb_set(proj, ARRAY['snapshot','payments'],
                    jsonb_build_array(p_tx) || COALESCE(proj #> ARRAY['snapshot','payments'], '[]'::jsonb), true);
          proj := jsonb_set(proj, ARRAY['paid'],
                    to_jsonb(COALESCE((proj->>'paid')::numeric, 0) + COALESCE((p_tx->>'amount')::numeric, 0)), true);
        ELSE
          proj := jsonb_set(proj, ARRAY['snapshot','expenses'],
                    jsonb_build_array(p_tx) || COALESCE(proj #> ARRAY['snapshot','expenses'], '[]'::jsonb), true);
          proj := jsonb_set(proj, ARRAY['expensesTotal'],
                    to_jsonb(COALESCE((proj->>'expensesTotal')::numeric, 0) + COALESCE((p_tx->>'amount')::numeric, 0)), true);
        END IF;
        proj := jsonb_set(proj, ARRAY['updatedAt'], to_jsonb(now()), true);
      END IF;
      new_projects := new_projects || jsonb_build_array(proj);
    END LOOP;
    st := jsonb_set(st, ARRAY['savedProjects'], new_projects, true);
  ELSE
    IF p_tx_type = 'income' THEN
      st := jsonb_set(st, ARRAY['payments'], jsonb_build_array(p_tx) || COALESCE(st->'payments', '[]'::jsonb), true);
    ELSE
      st := jsonb_set(st, ARRAY['expenses'], jsonb_build_array(p_tx) || COALESCE(st->'expenses', '[]'::jsonb), true);
    END IF;
  END IF;

  UPDATE agency_state SET state_json = st, updated_at = now() WHERE id = p_agency_id;
END;
$$;

-- ─── Сменить статус сделки через Telegram ───────────────────────────────
CREATE OR REPLACE FUNCTION bot_update_deal_status(
  p_agency_id uuid, p_chat_id text, p_deal_id text, p_new_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  st jsonb;
  proj jsonb;
  new_projects jsonb := '[]'::jsonb;
BEGIN
  SELECT state_json INTO st FROM agency_state WHERE id = p_agency_id FOR UPDATE;
  IF st IS NULL THEN st := '{}'::jsonb; END IF;
  st := st #- ARRAY['_botSessions', p_chat_id];

  FOR proj IN SELECT * FROM jsonb_array_elements(COALESCE(st->'savedProjects', '[]'::jsonb))
  LOOP
    IF proj->>'id' = p_deal_id THEN
      proj := jsonb_set(proj, ARRAY['crmStatus'], to_jsonb(p_new_status), true);
      proj := jsonb_set(proj, ARRAY['updatedAt'], to_jsonb(now()), true);
    END IF;
    new_projects := new_projects || jsonb_build_array(proj);
  END LOOP;
  st := jsonb_set(st, ARRAY['savedProjects'], new_projects, true);

  UPDATE agency_state SET state_json = st, updated_at = now() WHERE id = p_agency_id;
END;
$$;

-- Только service_role (Edge Function). REVOKE явно — default privileges
-- в Supabase иногда открывают новые функции anon/authenticated.
REVOKE ALL ON FUNCTION bot_session_set(uuid,text,jsonb)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bot_session_clear(uuid,text)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bot_add_deal(uuid,text,jsonb)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bot_add_transaction(uuid,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bot_update_deal_status(uuid,text,text,text)    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION bot_session_set(uuid,text,jsonb)          TO service_role;
GRANT EXECUTE ON FUNCTION bot_session_clear(uuid,text)              TO service_role;
GRANT EXECUTE ON FUNCTION bot_add_deal(uuid,text,jsonb)             TO service_role;
GRANT EXECUTE ON FUNCTION bot_add_transaction(uuid,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION bot_update_deal_status(uuid,text,text,text)    TO service_role;
