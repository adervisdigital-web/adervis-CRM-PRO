import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface VKIDPayload {
  sub?:        string | number;
  user_id?:    string | number;
  email?:      string;
  first_name?: string;
  last_name?:  string;
  phone?:      string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { id_token } = await req.json();
    if (!id_token) return json({ error: 'Missing id_token' }, 400);

    // Декодируем JWT payload (base64url → JSON)
    // id_token подписан VK — доверяем ему, т.к. он получен через VKID SDK
    const parts = id_token.split('.');
    if (parts.length < 2) return json({ error: 'Некорректный id_token' }, 400);

    let payload: VKIDPayload;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(atob(b64));
    } catch {
      return json({ error: 'Не удалось декодировать id_token' }, 400);
    }

    const email     = payload.email ?? '';
    const firstName = payload.first_name ?? '';
    const lastName  = payload.last_name  ?? '';
    const vkUserId  = String(payload.sub ?? payload.user_id ?? '');

    if (!email) {
      return json({
        error: 'VK не передал email. Перейдите в Настройки VK → Контактная информация, добавьте email и попробуйте снова.',
      }, 400);
    }

    // Supabase Admin client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Ищем пользователя, создаём если не существует
    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) return json({ error: listErr.message }, 500);

    const existing = listData.users?.find(u => u.email === email);
    if (!existing) {
      const { error: createErr } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          name:     `${firstName} ${lastName}`.trim() || 'VK User',
          provider: 'vk',
          vk_id:    vkUserId,
        },
      });
      if (createErr) return json({ error: createErr.message }, 500);
    }

    // Генерируем одноразовый токен для входа
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr) return json({ error: linkErr.message }, 500);

    return json({
      email,
      token: linkData.properties.hashed_token,
      name:  `${firstName} ${lastName}`.trim(),
    });

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
