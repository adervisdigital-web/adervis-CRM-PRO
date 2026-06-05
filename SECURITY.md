# Security Guide — Adervis PRO

## Supabase Row Level Security (RLS)

### Required RLS Policies

All tables must have RLS enabled. Run in Supabase SQL Editor:

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- profiles: user can only read/update their own row
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Agency data isolation: users access only their agency's data
CREATE POLICY "deals_agency" ON deals
  FOR ALL USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "clients_agency" ON clients
  FOR ALL USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "tasks_agency" ON tasks
  FOR ALL USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "transactions_agency" ON transactions
  FOR ALL USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );
```

### Edge Functions

- **Never** hardcode `YOOKASSA_SHOP_ID` or `YOOKASSA_SECRET_KEY` in code — always use `Deno.env.get()`.
- The `yookassa-webhook` function uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) — keep it secret.
- Set secrets via Supabase CLI: `supabase secrets set YOOKASSA_SHOP_ID=... YOOKASSA_SECRET_KEY=...`
- Set `APP_URL` to your production domain: `supabase secrets set APP_URL=https://app.adervis.ru`

### Webhook Security

YooKassa recommends verifying webhook IP ranges. Add IP allowlist in Supabase or nginx:

```
185.71.76.0/27
185.71.77.0/27
77.75.153.0/25
77.75.156.11
77.75.156.35
```

### Anon Key vs Service Role Key

- `SUPABASE_ANON_KEY` — safe to expose in client-side code (protected by RLS).
- `SUPABASE_SERVICE_ROLE_KEY` — **never** expose to clients. Only used in Edge Functions.

### Avatar Storage

Avatars are stored as base64 in `profiles.avatar_url` (max ~20KB). If images grow larger, migrate to Supabase Storage with signed URLs and add a policy:

```sql
CREATE POLICY "avatars_own" ON storage.objects
  FOR ALL USING (auth.uid()::text = (storage.foldername(name))[1]);
```

### Checklist Before Release

- [ ] RLS enabled on all tables
- [ ] No API keys in client-side JS (check with `grep -r "secret" app.js`)
- [ ] YooKassa webhook IP whitelist configured
- [ ] `YOOKASSA_SECRET_KEY` set via `supabase secrets set`
- [ ] `APP_URL` set to production domain
- [ ] HTTPS enforced (Supabase does this automatically)
- [ ] Auth email confirmations enabled in Supabase dashboard
