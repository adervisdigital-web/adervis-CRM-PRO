// Регресс инвариантов Фазы G (скорость/безопасность первого впечатления).
// Чистые статические проверки index.html/style.css — браузер не нужен.
const fs = require("fs");
const path = require("path");
const { assert, REPO_ROOT } = require("../harness");

module.exports = async function ({ test }) {
  const index = fs.readFileSync(path.join(REPO_ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(REPO_ROOT, "style.css"), "utf8");
  const app = fs.readFileSync(path.join(REPO_ROOT, "app.js"), "utf8");
  const head = index.slice(0, index.indexOf("</head>"));

  await test("нет Google Fonts (шрифты self-hosted)", () => {
    assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(index), "остался линк Google Fonts в index.html");
    assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(css), "остался @import Google Fonts в style.css");
  });

  await test("@font-face ссылается на локальные fonts/*.woff2", () => {
    assert(/@font-face/.test(css), "нет @font-face в style.css");
    assert(/url\(\s*["']?fonts\/[^)]*\.woff2/.test(css), "нет ссылки на локальный fonts/*.woff2");
  });

  await test("supabase-js self-hosted; vkid SDK — self-hosted и грузится лениво", () => {
    // Раньше оба грузились с jsdelivr (внешний CDN = точка отказа + утечка приватности).
    assert(/<script\b[^>]*\bsrc="vendor\/supabase\.min\.js"/.test(index), "supabase-js не self-hosted (vendor/supabase.min.js)");
    assert(fs.existsSync(path.join(REPO_ROOT, "vendor/supabase.min.js")), "нет файла vendor/supabase.min.js");
    // vkid SDK убран из статических <script> — грузится лениво из app.js только на экране входа.
    assert(!/<script\b[^>]*\bsrc="vendor\/vkid-sdk\.min\.js"/.test(index), "vkid SDK не должен быть статическим <script> — он ленивый");
    assert(fs.existsSync(path.join(REPO_ROOT, "vendor/vkid-sdk.min.js")), "нет файла vendor/vkid-sdk.min.js");
    assert(/_ensureVKIDSDK[\s\S]*vendor\/vkid-sdk\.min\.js/.test(app), "app.js не грузит vkid SDK лениво через _ensureVKIDSDK");
    // В <head> не должно остаться всегда-загружаемых внешних скриптов (xlsx грузится лениво).
    const externalInHead = [...head.matchAll(/<script\b[^>]*\bsrc="https?:\/\/[^"]+"[^>]*>/g)].map((m) => m[0])
      .filter((s) => !/mc\.yandex\.ru|metrika/.test(s)); // Метрика — легитимный внешний скрипт
    assert(externalInHead.length === 0, "в <head> остались внешние CDN-скрипты:\n" + externalInHead.join("\n"));
  });

  await test("xlsx не в статичном <head> (ленивая загрузка)", () => {
    assert(!/<script[^>]*xlsx/i.test(head), "xlsx-скрипт найден в <head> — должен грузиться лениво");
  });

  await test("defer на статических скриптах (app.js / supabase / metrika)", () => {
    // vkid здесь нет намеренно — он грузится лениво из app.js, а не статическим тегом.
    for (const name of ["app\\.js", "supabase", "metrika"]) {
      const m = index.match(new RegExp("<script\\b[^>]*" + name + "[^>]*>"));
      assert(m, "нет скрипта " + name);
      assert(/\bdefer\b/.test(m[0]), name + ": тег без defer → " + m[0]);
    }
  });

  await test("CSP: font-src 'self' без Google Fonts, script-src пиннит cdn.jsdelivr", () => {
    const csp = (index.match(/Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || "";
    assert(csp, "нет CSP meta");
    // generativelanguage.googleapis.com в connect-src — легитимен (Gemini), проверяем
    // именно отсутствие Google Fonts и что font-src ограничен 'self'.
    assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(csp), "Google Fonts остался в CSP");
    const fontSrc = (csp.match(/font-src([^;]*)/) || [])[1] || "";
    assert(/'self'/.test(fontSrc) && !/https?:/.test(fontSrc), "font-src не ограничен 'self': " + fontSrc);
    assert(/script-src[^;]*cdn\.jsdelivr\.net/.test(csp), "script-src не пиннит cdn.jsdelivr.net");
  });

  // Метрика выбирает домен по гео посетителя: из России — mc.yandex.ru, из-за рубежа —
  // mc.yandex.com. Разрешён был только .ru, поэтому у зарубежных посетителей счётчик
  // молча блокировался CSP (нашлось прогоном в CI на американском раннере). Пара
  // домен-к-домену должна оставаться полной, иначе аналитика опять частично ослепнет.
  await test("CSP: Метрика разрешена на обоих своих доменах (.ru и .com)", () => {
    const csp = (index.match(/Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || "";
    for (const dir of ["script-src", "connect-src"]) {
      const val = (csp.match(new RegExp(dir + "([^;]*)")) || [])[1] || "";
      if (!/mc\.yandex\.ru/.test(val)) continue; // Метрика в этой директиве не используется
      assert(/mc\.yandex\.com/.test(val), `${dir} разрешает mc.yandex.ru, но не mc.yandex.com`);
    }
  });

  // ── iCal-фид: agency_id не должен снова стать токеном ──────────────────────
  //
  // Эта утечка возвращалась дважды. 26.07 закрыли режим ?portal= (клиент видел
  // дедлайны всех сделок агентства), но ?token=<agency_id> остался. К 30.07
  // agency_id стал публичным — get_client_portal отдаёт его анониму, а страница
  // КП печатает его в ссылку ?ref=<agency_id>. Итог: любой заказчик со ссылкой
  // на своё КП читал задачи, ответственных и внутренние заметки по ВСЕМ сделкам.
  //
  // Инвариант простой и его легко нарушить обратно одной строкой: то, что уходит
  // в ?token=, обязано быть отдельным отзываемым секретом, а не идентификатором
  // агентства.
  const feed = fs.readFileSync(path.join(REPO_ROOT, "supabase/functions/calendar-feed/index.ts"), "utf8");

  await test("iCal-фид: ссылка строится из calendar_token, а не из agency_id", () => {
    const m = app.match(/calendar-feed\?token=\$\{([^}]+)\}/);
    assert(m, "в app.js не нашлась ссылка на calendar-feed?token=");
    assert(
      !/agencyId|agency_id|getAgencyId/.test(m[1]),
      "ссылка на фид снова строится из agency_id — он публичен (реф-код в КП): " + m[1]
    );
    assert(/calToken|calendar_token/.test(m[1]), "ссылка на фид не использует calendar_token: " + m[1]);
  });

  await test("calendar-feed: token резолвится через profiles, а не берётся как agency_id", () => {
    assert(
      !/agencyId\s*=\s*token\s*;/.test(feed),
      "calendar-feed снова присваивает agencyId = token напрямую"
    );
    assert(
      /from\("profiles"\)[\s\S]{0,200}eq\("calendar_token"/.test(feed),
      "calendar-feed не ищет агентство по profiles.calendar_token"
    );
  });

  await test("calendar_token нельзя переписать клиентским UPDATE профиля", () => {
    // profiles_update_own разрешает менять любые колонки своего профиля. Без пина
    // в триггере пользователь выставил бы себе токен чужого агентства — та же
    // утечка, только уже с авторизацией.
    const mig = fs.readFileSync(
      path.join(REPO_ROOT, "supabase/migrations/20260730000001_calendar_feed_token.sql"),
      "utf8"
    );
    assert(
      /new\.calendar_token\s*:=\s*old\.calendar_token/i.test(mig),
      "триггер protect_subscription_fields не пинит calendar_token"
    );
    assert(
      /create or replace function rotate_calendar_token[\s\S]*security definer/i.test(mig),
      "нет SECURITY DEFINER функции ротации rotate_calendar_token"
    );
  });
};
