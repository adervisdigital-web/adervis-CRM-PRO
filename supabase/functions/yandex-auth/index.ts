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

const YANDEX_USER_INFO_URL = 'https://login.yandex.ru/info?format=json';

interface YandexUserInfo {
  id?: string;
  login?: string;
  default_email?: string;
  emails?: string[];
  first_name?: string;
  last_name?: string;
  display_name?: string;
  real_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { access_token } = await req.json();
    if (!access_token) return json({ error: 'Missing access_token' }, 400);

    // Единственный источник личности — ответ Яндекса на реальный access_token
    // (та же схема, что и vk-auth): Яндекс сам валидирует токен, подделать нельзя.
    const infoResp = await fetch(YANDEX_USER_INFO_URL, {
      headers: { Authorization: `OAuth ${access_token}` },
    });

    const info = await infoResp.json().catch(() => null) as (YandexUserInfo & { error?: string }) | null;

    if (!infoResp.ok || !info || info.error) {
      console.error('yandex-auth: user_info rejected token', infoResp.status, JSON.stringify(info));
      return json({ error: 'Яндекс не подтвердил токен' }, 401);
    }

    const yandexId = String(info.id ?? '');
    if (!yandexId) {
      console.error('yandex-auth: user_info без id', JSON.stringify(info));
      return json({ error: 'Яндекс не вернул идентификатор пользователя' }, 401);
    }

    const email = info.default_email || (info.emails && info.emails[0])
      ? (info.default_email || info.emails![0])
      : `ya${yandexId}@yandex.adervis`;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // perPage:1000 без пагинации молча терял всех, кто не попал на первую страницу:
    // с 1001-го аккаунта существующий пользователь выглядел бы новым, createUser падал
    // на занятом email — и вход переставал работать без единого понятного сообщения.
    const users = [] as { id: string; email?: string; user_metadata?: Record<string, unknown> }[];
    for (let page = 1; page <= 50; page++) {
      const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr) return json({ error: listErr.message }, 500);
      const batch = listData.users ?? [];
      users.push(...batch);
      if (batch.length < 1000) break;
    }

    // Личность — это Яндекс ID, а не email (та же причина, что в vk-auth): смена
    // основного адреса в Яндексе не находила существующий аккаунт и заводила пустой,
    // что со стороны выглядит как «пропали все сделки».
    const existing = users.find(u => u.user_metadata?.yandex_id === yandexId)
                  ?? users.find(u => u.email === email);
    const loginEmail = existing?.email ?? email;
    if (!existing) {
      const name = info.display_name || info.real_name || `${info.first_name ?? ''} ${info.last_name ?? ''}`.trim() || 'Yandex User';
      const { error: createErr } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name, provider: 'yandex', yandex_id: yandexId },
      });
      if (createErr) return json({ error: createErr.message }, 500);
    }

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: loginEmail,
    });
    if (linkErr) return json({ error: linkErr.message }, 500);

    const tokenHash = linkData?.properties?.hashed_token;
    if (!tokenHash) return json({ error: 'Не удалось сгенерировать токен входа' }, 500);

    return json({ token: tokenHash });
  } catch (e) {
    console.error('yandex-auth error:', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
