-- ═══════════════════════════════════════════════════════════════════════
-- Ремедиация находок `supabase db advisors --type security` (03.07.2026)
--
-- КРИТИЧНО: несколько SECURITY DEFINER функций, задуманных как
-- "вызывается только из Edge Function через service_role", не имели НИ
-- ОДНОГО явного REVOKE. В Postgres CREATE FUNCTION по умолчанию даёт
-- EXECUTE роли PUBLIC (в которую входят anon и authenticated) — этот
-- грант никуда не девается, даже если позже добавить отдельный
-- GRANT ... TO authenticated. Значит эти функции были реально вызываемы
-- напрямую через /rest/v1/rpc/<name> публичным anon-ключом, который лежит
-- в открытом app.js:
--
--   • grant_referral_bonus(uuid, integer) — p_bonus_days НЕ валидируется,
--     функция не проверяет факт оплаты. Anon/authenticated мог вызвать
--     напрямую и начислить СЕБЕ (как рефёрреру) любое число дней подписки
--     без единой оплаты — полный обход монетизации.
--   • mark_portal_advance_paid(uuid, text) — anon мог пометить ЛЮБОЙ
--     клиентский портал как "аванс оплачен" без реальной оплаты (ложное
--     подтверждение оплаты в CRM агентства).
--   • increment_promo_uses(text) — anon мог сжигать max_uses любого
--     промокода без оплаты (ровно то злоупотребление, ради защиты от
--     которого инкремент специально перенесли в webhook, см. комментарий
--     в yookassa-webhook/index.ts).
--
-- Также у части функций (admin_*, protect_subscription_fields) была та же
-- дыра в грантах, но они защищены изнутри (_is_super_admin() проверка
-- или чисто триггерная функция, не работающая вне контекста триггера) —
-- эксплуатация не давала результата, но экспозиция RPC — чистый шум и
-- лишняя площадь атаки, закрываем по тому же принципу.
--
-- Отдельно: почти все SECURITY DEFINER функции в проекте созданы без
-- `SET search_path` — стандартный Postgres-линтер помечает это как
-- search-path hijacking risk (WARN). Фиксируем через ALTER FUNCTION —
-- не требует пересоздания тела функции.
--
-- Найдено через: supabase db advisors --linked --type security
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Закрыть прямой RPC-доступ — эти функции только для service_role ──

REVOKE ALL ON FUNCTION grant_referral_bonus(uuid, integer)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mark_portal_advance_paid(uuid, text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION increment_promo_uses(text)                  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION grant_referral_bonus(uuid, integer)      TO service_role;
GRANT EXECUTE ON FUNCTION mark_portal_advance_paid(uuid, text)     TO service_role;
GRANT EXECUTE ON FUNCTION increment_promo_uses(text)               TO service_role;

-- ─── 2. Чисто внутренние функции — никакого клиентского доступа вообще ──
-- protect_subscription_fields() — BEFORE UPDATE триггер, вызов вне контекста
-- триггера в любом случае упадёт (NEW/OLD не определены), но лучше не
-- светить эндпоинт вовсе. Firing триггера НЕ зависит от EXECUTE-гранта
-- вызывающей роли — отзыв гранта безопасен и ничего не сломает.
-- _is_super_admin() — внутренний хелпер для других SECURITY DEFINER
-- функций; вызов функцией-владельцем не требует гранта вызывающей роли.
REVOKE ALL ON FUNCTION protect_subscription_fields()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _is_super_admin()                            FROM PUBLIC, anon, authenticated;

-- ─── 3. Самообслуживаемая статистика — только для вошедших, не anon ─────
-- get_referral_stats() сама скоупится через auth.uid(), но anon-доступ
-- (auth.uid() IS NULL) — чистый лишний шум, закрываем.
REVOKE ALL ON FUNCTION get_referral_stats()                         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_referral_stats()                      TO authenticated;

-- ─── 4. Admin Panel — уже защищены _is_super_admin() изнутри, но убираем
-- остаточный anon/PUBLIC грант для defense-in-depth ──────────────────────
-- admin_get_profiles()/admin_create_promo()/admin_toggle_promo() НЕ трогаем —
-- их нет в проде (проверено запросом к pg_proc: живьём есть только
-- admin_get_all_users, admin_get_promo_codes, admin_set_subscription —
-- остальные, видимо, правились вручную через Dashboard в сессии 29.06,
-- файлы миграций разошлись с реальной схемой).
REVOKE ALL ON FUNCTION admin_get_promo_codes()                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_get_all_users()                                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_set_subscription(text,text,text,timestamptz)   FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION admin_get_promo_codes()                           TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_all_users()                             TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_subscription(text,text,text,timestamptz) TO authenticated;

-- ─── 5. get_client_portal / approve_client_portal — anon-доступ ЗАДУМАН
-- (клиентский портал без логина), грант не трогаем, только search_path ───

-- ─── 6. search_path mutable — фикс для всех отмеченных линтером функций ──
ALTER FUNCTION grant_referral_bonus(uuid, integer)                          SET search_path = public;
ALTER FUNCTION mark_portal_advance_paid(uuid, text)                         SET search_path = public;
ALTER FUNCTION get_referral_stats()                                         SET search_path = public;
ALTER FUNCTION protect_subscription_fields()                                SET search_path = public;
ALTER FUNCTION _is_super_admin()                                            SET search_path = public;
ALTER FUNCTION admin_get_promo_codes()                                      SET search_path = public;
ALTER FUNCTION admin_get_all_users()                                        SET search_path = public;
ALTER FUNCTION admin_set_subscription(text,text,text,timestamptz)           SET search_path = public;
ALTER FUNCTION get_client_portal(uuid)                                      SET search_path = public;
ALTER FUNCTION increment_promo_uses(text)                                   SET search_path = public;
-- Функции из сегодняшних более ранних миграций (race-condition фиксы) —
-- сам их тогда не добавил search_path, закрываем заодно.
ALTER FUNCTION bot_session_set(uuid,text,jsonb)                             SET search_path = public;
ALTER FUNCTION bot_session_clear(uuid,text)                                 SET search_path = public;
ALTER FUNCTION bot_add_deal(uuid,text,jsonb)                                SET search_path = public;
ALTER FUNCTION bot_add_transaction(uuid,text,text,jsonb,text)               SET search_path = public;
ALTER FUNCTION bot_update_deal_status(uuid,text,text,text)                  SET search_path = public;
ALTER FUNCTION agency_notify_throttled(uuid,text,bigint)                    SET search_path = public;
