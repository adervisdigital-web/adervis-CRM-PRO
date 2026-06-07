-- Fix critical cross-tenant data isolation bugs found during RLS audit (2026-06-07)
--
-- 1) agency_state had TWO redundant "allow everyone" policies
--    (using: auth.uid() IS NOT NULL, cmd: ALL) sitting alongside the correctly
--    scoped "state: read/insert/update agency" policies. Postgres RLS policies
--    are OR'd together, so the broad ones completely nullified the scoped ones:
--    ANY signed-up user (including a free trial signup) could read, overwrite or
--    delete ANY OTHER agency's full CRM state (state_json = deals, clients,
--    finances, prices — everything). The scoped policies already cover every
--    legitimate case, including team members (via profiles.agency_id), so the
--    broad ones are pure leftover risk — drop them.
drop policy if exists "allow all for auth users" on agency_state;
drop policy if exists "team all access" on agency_state;

-- 2) client_portals "anon_approve" UPDATE policy: using (true) + with_check
--    (agency_id IS DISTINCT FROM agency_id) — that check compares a column to
--    itself (RLS has no OLD/NEW), so it's always true, i.e. no check at all.
--    Combined with using(true), ANY anonymous visitor could rewrite ANY column
--    of ANY portal (price, services_list, agency_id, ...), not just the
--    deal_status/approved_at the app intends to set. Replace direct anon UPDATE
--    with a narrow SECURITY DEFINER function that can only ever touch those two
--    columns, and remove anon's UPDATE access to the table entirely.
drop policy if exists "anon_approve" on client_portals;

create or replace function approve_client_portal(p_portal_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update client_portals
  set deal_status = 'Согласовано', approved_at = now()
  where id = p_portal_id;
$$;

grant execute on function approve_client_portal(uuid) to anon, authenticated;

-- 3) client_portals "anon_read_by_id" SELECT policy: using (true). RLS USING
--    expressions apply per-row regardless of the client's WHERE filter, so
--    anyone holding the public anon key could run `select * from client_portals`
--    with no filter and dump every agency's deal names, prices, proposals and
--    services lists — not just look up the one portal they have a link to.
--    Replace direct anon SELECT with a narrow lookup-by-id function.
drop policy if exists "anon_read_by_id" on client_portals;

create or replace function get_client_portal(p_portal_id uuid)
returns table (
  id uuid,
  deal_name text,
  deal_status text,
  total_price numeric,
  included_text text,
  excluded_text text,
  proposal_note text,
  services_list jsonb,
  approved_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select id, deal_name, deal_status, total_price, included_text, excluded_text,
         proposal_note, services_list, approved_at
  from client_portals
  where id = p_portal_id;
$$;

grant execute on function get_client_portal(uuid) to anon, authenticated;
