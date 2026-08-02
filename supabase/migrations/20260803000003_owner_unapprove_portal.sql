-- ═══════════════════════════════════════════════════════════════════════
-- Снять согласование КП.
--
-- Клиент утверждает КП кнопкой на портале (approve_client_portal). Обратной
-- операции не было вовсе: если клиент нажал по ошибке или условия
-- пересматриваются, «Согласовано» висело навсегда, а окно правки КП
-- предупреждало «правки увидит именно он» без возможности вернуть статус.
--
-- Право снять есть только у агентства, которому принадлежит КП: клиент своё
-- согласие отозвать не может (иначе анонимный доступ по ссылке позволял бы
-- дёргать статус туда-сюда).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.owner_unapprove_portal(p_portal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_portals
     set approved_at = null,
         signer_name = null,
         -- Статус в самом КП возвращаем к отправленному; статус сделки в CRM
         -- живёт отдельно и правится вручную — молча менять его нельзя.
         deal_status = 'КП отправлено'
   where id = p_portal_id
     and agency_id = auth.uid();

  if not found then
    raise exception 'Portal not found or not yours';
  end if;
end;
$$;

revoke all on function public.owner_unapprove_portal(uuid) from public;
revoke execute on function public.owner_unapprove_portal(uuid) from anon;
grant execute on function public.owner_unapprove_portal(uuid) to authenticated;
