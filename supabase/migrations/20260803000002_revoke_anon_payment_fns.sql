-- ═══════════════════════════════════════════════════════════════════════
-- Отозвать EXECUTE у anon для функций способа оплаты.
--
-- В 20260803000001 стоял `revoke all ... from public` + `grant ... to
-- authenticated`, но в Supabase роль anon получает EXECUTE на новые функции
-- public-схемы через default privileges — revoke от PUBLIC этого не снимает.
-- Советник безопасности поймал их как «Public Can Execute SECURITY DEFINER».
--
-- Данные при этом не утекали: у анонима auth.uid() = null, поэтому
-- has_payment_keys() возвращал false, а owner_mark/unmark_advance_paid не
-- находили строк и падали с исключением. Это гигиена, а не заплатка дыры:
-- функции, работающие «от имени вошедшего», не должны быть в публичном API.
-- ═══════════════════════════════════════════════════════════════════════

revoke execute on function public.has_payment_keys() from anon;
revoke execute on function public.owner_mark_advance_paid(uuid) from anon;
revoke execute on function public.owner_unmark_advance_paid(uuid) from anon;

-- get_client_portal СОЗНАТЕЛЬНО остаётся доступной anon: клиентский портал
-- открывает заказчик студии без входа, ключ доступа — сам UUID ссылки.
