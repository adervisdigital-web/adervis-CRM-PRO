import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': 'https://app.adervis.ru',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// VK App ID (client_id) — публичное значение, не секрет. Можно переопределить env.
const VK_APP_ID = Deno.env.get('VK_APP_ID') ?? '54626328';
const VK_USER_INFO_URL = 'https://id.vk.com/oauth2/user_info';

interface VKUserInfo {
  user_id?:    string | number;
  first_name?: string;
  last_name?:  string;
  email?:      string;
  phone?:      string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { access_token } = await req.json();
    if (!access_token) return json({ error: 'Missing access_token' }, 400);

    // SECURITY: этот эндпоинт публичный (--no-verify-jwt) и раньше декодировал
    // присланный id_token БЕЗ проверки подписи — кто угодно мог прислать
    // самодельный токен с чужим email и получить magiclink к любому аккаунту
    // (вплоть до super-admin). Теперь единственный источник личности — ответ VK
    // на реальный access_token: VK сам валидирует токен, подделать нельзя.
    // (Проверки подписи id_token через JWKS у VK ID нет — публичный ключ не
    // публикуется; серверная валидация делается именно через user_info.)
    const infoResp = await fetch(VK_USER_INFO_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ client_id: VK_APP_ID, access_token }).toString(),
    });

    const infoData = await infoResp.json().catch(() => null) as
      | { user?: VKUserInfo; error?: string; error_description?: string }
      | VKUserInfo
      | null;

    if (!infoData || (infoData as { error?: string }).error) {
      console.error('vk-auth: user_info rejected token', infoResp.status,
        JSON.stringify(infoData));
      return json({ error: 'VK не подтвердил токен' }, 401);
    }

    // VK может вернуть данные плоско либо во вложенном user
    const info: VKUserInfo = (infoData as { user?: VKUserInfo }).user ?? (infoData as VKUserInfo);
    const firstName = info.first_name ?? '';
    const lastName  = info.last_name  ?? '';
    const vkUserId  = String(info.user_id ?? '');

    if (!vkUserId) {
      console.error('vk-auth: user_info без user_id', JSON.stringify(infoData));
      return json({ error: 'VK не вернул идентификатор пользователя' }, 401);
    }
    // Используем email из user_info или создаём синтетический по VK User ID
    const email = info.email
      ? info.email
      : `vk${vkUserId}@vk.adervis`;

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
