-- Store user avatar (base64, max ~20KB after 80px resize) for cross-device sync
alter table public.profiles
  add column if not exists avatar_url text;
