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

  await test("xlsx: self-hosted в vendor/ и грузится лениво", () => {
    assert(!/<script[^>]*xlsx/i.test(head), "xlsx-скрипт найден в <head> — должен грузиться лениво");
    // Пока библиотека тянулась с cdn.jsdelivr.net, выгрузка в Excel отваливалась на
    // каждую икоту CDN, и это был ЕДИНСТВЕННЫЙ тест во всём наборе, ходивший в сеть
    // (05.08 он и упал на обрыве). Теперь файл свой — и прод, и тесты не зависят от CDN.
    assert(fs.existsSync(path.join(REPO_ROOT, "vendor/xlsx-js-style.min.js")), "нет файла vendor/xlsx-js-style.min.js");
    const body = app.slice(app.indexOf("function _ensureXLSX()"), app.indexOf("async function exportCatalogXlsx"));
    assert(body.length > 100, "не удалось вырезать тело _ensureXLSX");
    assert(/s\.src\s*=\s*"\.\/vendor\/xlsx-js-style\.min\.js"/.test(body), "_ensureXLSX грузит xlsx не из vendor/");
    // Ищем присваивание, а не упоминание: в комментарии рядом слово integrity стоит
    // законно — там объясняется, по какому sha384 сверен положенный в vendor/ файл.
    assert(!/s\.(integrity|crossOrigin)\s*=/.test(body), "у своего файла остался SRI/crossOrigin — они нужны только внешнему хосту");
    assert(!/cdn\.jsdelivr\.net/.test(app.replace(/\/\/[^\n]*/g, "")), "в коде снова остался вызов к cdn.jsdelivr.net");
  });

  await test("xlsx: не в прекэше Service Worker (425 КБ ради немногих)", () => {
    // Прекэш замедлил бы установку ВСЕМ ради тех, кто выгружает. SW и так кладёт в
    // кэш любой успешный свой запрос, поэтому офлайн работает после первой выгрузки.
    const sw = fs.readFileSync(path.join(REPO_ROOT, "sw.js"), "utf8");
    const list = (sw.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || "";
    assert(list, "не нашёлся STATIC_ASSETS в sw.js");
    assert(!/xlsx/i.test(list), "xlsx попал в прекэш SW — установка потяжелела на 425 КБ");
  });

  await test("defer на статических скриптах (app.js / supabase / metrika)", () => {
    // vkid здесь нет намеренно — он грузится лениво из app.js, а не статическим тегом.
    for (const name of ["app\\.js", "supabase", "metrika"]) {
      const m = index.match(new RegExp("<script\\b[^>]*" + name + "[^>]*>"));
      assert(m, "нет скрипта " + name);
      assert(/\bdefer\b/.test(m[0]), name + ": тег без defer → " + m[0]);
    }
  });

  await test("публичный каталог: функция не отдаёт state_json целиком", () => {
    // Утечка календарного фида выросла ровно из широкой выдачи, и случилась ДВАЖДЫ.
    // Здесь наружу смотрит анонимный посетитель, а в state_json лежат сделки,
    // клиенты, финансы и команда — цена ошибки максимальная.
    const mig = fs.readFileSync(
      path.join(REPO_ROOT, "supabase/migrations/20260805000001_public_calc_catalog.sql"), "utf8");
    assert(/security definer/i.test(mig), "функция не SECURITY DEFINER — RLS её не пропустит");
    assert(/set search_path = public/i.test(mig), "не запинён search_path");
    // Ни одной выдачи state_json как единого значения: только точечные ключи.
    const wide = mig.split(/\r?\n/).filter(l =>
      /state_json/.test(l) && !/state_json\s*(->|->>)/.test(l) && !/^\s*--/.test(l));
    assert(wide.length === 0, "state_json отдаётся целиком:\n" + wide.join("\n"));
    // Ключи со сделками и деньгами не должны упоминаться вовсе.
    for (const k of ["savedProjects", "clients", "companyTeam", "finance", "transactions", "contracts"]) {
      assert(!new RegExp(`'${k}'`).test(mig), `публичная функция отдаёт ${k} — это данные агентства, а не прайс`);
    }
    assert(/publicCalcEnabled/.test(mig), "нет опт-ина: каталог любой студии стал бы читаем по её agency_id");
    // Нужны ОБА revoke — иначе право остаётся через роль public.
    assert(/revoke all on function public\.get_public_catalog\(text\) from public/i.test(mig), "нет revoke ... from public");
    assert(/revoke all on function public\.get_public_catalog\(text\) from anon/i.test(mig), "нет revoke ... from anon");
  });

  await test("публичный калькулятор закрыт по умолчанию и включается владельцем", () => {
    assert(/publicCalcEnabled:\s*false/.test(app), "в defaultState калькулятор не выключен");
    assert(/publicCalcEnabled:\s*old\.publicCalcEnabled === true/.test(app),
      "миграция состояния включила бы калькулятор от undefined у старых аккаунтов");
    assert(/function renderSettingsPublicCalc/.test(app), "нет панели управления калькулятором в настройках");
    assert(/togglePublicCalc/.test(app) && /copyPublicCalcLink/.test(app), "нет переключателя или копирования ссылки");
    // Ссылка обязана нести агентство — без этого калькулятор снова покажет чужие цены.
    const urlFn = app.slice(app.indexOf("function publicCalcUrl()"), app.indexOf("function togglePublicCalc"));
    assert(/\?calc=1&a=/.test(urlFn), "ссылка на калькулятор строится без идентификатора агентства");
    assert(/encodeURIComponent\(getAgencyId\(\)\)/.test(urlFn), "agency_id не экранируется в ссылке");
  });

  await test("калькулятор: каталог агентства грузится ДО позиций из ссылки", () => {
    // Ссылка-шеринг содержит идентификаторы позиций, часть из них — свои позиции
    // агентства. Применённая раньше каталога, она молча выбросит их через findItem.
    const boot = app.slice(app.indexOf("if (_calcMode) {\n        // Намеренно НЕ load()"));
    const block = boot.slice(0, 2000);
    const load = block.indexOf("_loadPublicCatalog");
    const apply = block.indexOf("_calcApplyShared(_calcInitialEncoded);\n              render();");
    assert(load > 0, "каталог агентства не загружается на старте калькулятора");
    assert(apply > load, "позиции из ссылки применяются раньше каталога агентства");
    // Пока каталог едет — скелет, а не встроенные цены ADERVIS.
    assert(/_calcCatalogLoading \? renderCalcCatalogSkeleton\(\)/.test(app),
      "во время загрузки каталога показываются встроенные цены — посетитель увидит чужой прайс");
  });

  await test("калькулятор: не отдался каталог — не показываем чужой прайс", () => {
    // Найдено пробником: на ответе `{}` (сбой сервера, обрезанный ответ, чужой
    // прокси) проверка `!data` не срабатывала, загрузка рапортовала успех — и
    // посетитель студии видел встроенный прайс ADERVIS как прайс этой студии.
    // Признак настоящего каталога — поле company: функция строит его всегда,
    // когда каталог вообще отдаётся.
    const start = app.indexOf("async function _loadPublicCatalog");
    const fn = app.slice(start, app.indexOf("function _calcEncodeLines", start));
    assert(fn.length > 200, "не удалось вырезать тело _loadPublicCatalog");
    assert(/if \(!data\.company/.test(fn), "успех загрузки снова определяется по «ответ непустой», а не по форме каталога");
    // И при неудаче должен показываться честный экран, а не встроенный калькулятор.
    assert(/function renderCalcUnavailable/.test(app), "нет экрана «калькулятор недоступен»");
    assert(/_calcCatalogFailed \? renderCalcUnavailable\(\)/.test(app),
      "при неудачной загрузке каталога снова рисуется обычный калькулятор со встроенными ценами");
  });

  await test("калькулятор: шапка называет агентство, а не сервис", () => {
    // Тот же дефект уже чинили в онлайн-брифе 03.08: у владельца всё выглядит верно —
    // он и есть ADERVIS, а чужая студия представлялась своим посетителям конкурентом.
    const hero = app.slice(app.indexOf('<div class="calc-badge">') - 600, app.indexOf('<div class="calc-badge">') + 200);
    assert(/_calcAgencyName \|\|/.test(hero), "шапка калькулятора снова жёстко подписана ADERVIS");
    assert(/escapeHtml\(brand\)/.test(hero), "имя агентства подставляется в разметку без экранирования");
  });

  await test("QR брифа строится своей библиотекой, а не чужим сервисом", () => {
    // Картинка запрашивалась у api.qrserver.com — ссылка на бриф вместе с agency_id
    // уходила третьей стороне при каждом показе. Для сервиса, собирающего ПД клиентов
    // агентства, это лишний получатель в цепочке.
    assert(fs.existsSync(path.join(REPO_ROOT, "vendor/qrcode.min.js")), "нет файла vendor/qrcode.min.js");
    // Без строк-комментариев: рядом с кодом объяснено, ПОЧЕМУ ушли от qrserver, и
    // упоминание там законно — ловим обращение, а не слово.
    const appCode = app.replace(/^\s*\/\/[^\n]*$/gm, "");
    assert(!/api\.qrserver\.com/.test(appCode), "QR снова строится через api.qrserver.com");
    assert(!/api\.qrserver\.com/.test(index), "api.qrserver.com остался в CSP");
    const body = app.slice(app.indexOf("async function showBriefQR"), app.indexOf("function copyBriefLink"));
    assert(body.length > 100, "не удалось вырезать тело showBriefQR");
    assert(/createSvgTag/.test(body), "QR рисуется не в SVG — картинка мылится и не берёт цвета темы");
    // Библиотека рисует только чёрные модули без фона: на тёмной теме без явной
    // белой подложки код не читается сканером вовсе.
    assert(/background:#fff/.test(body), "у QR нет явной белой подложки — в тёмной теме он не сканируется");
  });

  await test("CSP: убраны разрешения, которыми никто не пользуется", () => {
    const csp = (index.match(/Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || "";
    const connect = (csp.match(/connect-src([^;]*)/) || [])[1] || "";
    // Gemini зовётся из Edge Functions (сервер, Deno) — браузер туда не ходит вовсе;
    // Telegram — тоже, через свою функцию telegram-notify.
    assert(!/generativelanguage/.test(connect), "generativelanguage вернулся в connect-src, хотя браузер туда не ходит");
    assert(!/api\.telegram\.org/.test(connect), "api.telegram.org вернулся в connect-src — браузер зовёт telegram-notify, а не Telegram напрямую");
    // А вот api.vk.com убирать НЕЛЬЗЯ: SDK ВКонтакте собирает хосты динамически
    // (в минифицированном файле лежит кусок "api."), поэтому статикой это не доказать.
    assert(/api\.vk\.com/.test(connect), "из connect-src убран api.vk.com — SDK строит хост динамически, вход сломается");
  });

  await test("истёкшая подписка не стирает несохранённую работу", () => {
    const body = app.slice(app.indexOf("function save()"), app.indexOf("function setTheme("));
    assert(body.length > 200, "не удалось вырезать тело save()");
    const gate = body.indexOf("if (!isSubscriptionActive())");
    assert(gate > 0, "не нашлась проверка подписки в save()");
    // Ровно тело ветки: дальше начинается обычный путь сохранения, и он, конечно,
    // пишет в облако — окно «на глазок» захватывало его и роняло проверку.
    const normalPath = body.indexOf("_needsNormalize = true", gate);
    assert(normalPath > gate, "не нашлось начало обычного пути сохранения");
    // Комментарии вырезаем: внутри ветки объяснено, что saveToCloud() тут НЕ зовётся,
    // и это упоминание само роняло проверку.
    const branch = body.slice(gate, normalPath).replace(/^\s*\/\/[^\n]*$/gm, "");
    assert(/lsSet\(STORAGE_KEY/.test(branch), "при истёкшей подписке снова не пишется даже локальная копия — работа умрёт при перезагрузке");
    assert(!/saveToCloud\(\)/.test(branch), "при истёкшей подписке пошла запись в облако — это платный ресурс");
    assert(/return;/.test(branch), "ветка не завершается return — выполнение уйдёт в обычный путь");
  });

  await test("CSP: шрифты и скрипты только свои, без внешних CDN", () => {
    const csp = (index.match(/Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || "";
    assert(csp, "нет CSP meta");
    assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(csp), "Google Fonts остался в CSP");
    const fontSrc = (csp.match(/font-src([^;]*)/) || [])[1] || "";
    assert(/'self'/.test(fontSrc) && !/https?:/.test(fontSrc), "font-src не ограничен 'self': " + fontSrc);
    // Все три библиотеки (supabase, vkid, xlsx) лежат в vendor/, поэтому чужим хостам
    // в script-src делать нечего. Метрика — единственное исключение, она внешняя по сути.
    const scriptSrc = (csp.match(/script-src([^;]*)/) || [])[1] || "";
    const foreign = scriptSrc.split(/\s+/).filter(t => t && !/^'/.test(t) && !/mc\.yandex\.(ru|com)/.test(t));
    assert(foreign.length === 0, "в script-src появились чужие хосты: " + foreign.join(", "));
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

  // Колонка client_portals.project_id была заведена как UUID, а идентификатор
  // проекта UUID никогда не был: uid("project") даёт «project_<32 hex>», импорт из
  // O!task — «proj_otask_18924». Postgres отвечал «invalid input syntax for type
  // uuid», INSERT падал целиком, и КП не создавалось НИ ДЛЯ ОДНОЙ сделки — то есть
  // главная функция продукта была сломана с 04.07 по 03.08.2026.
  //
  // Прогоны в браузере этого не видят: тесты идут в local mode, где _supabase нет и
  // до записи в базу дело не доходит. Поэтому сторож статический — он сверяет ровно
  // те два факта, чьё расхождение и было багом, и поймал бы его в день заведения
  // колонки.
  await test("client_portals.project_id хранит id проекта, а не uuid", () => {
    assert(
      /function uid\(prefix[\s\S]{0,160}\$\{prefix\}_\$\{crypto\.randomUUID\(\)/.test(app),
      "uid() перестал добавлять префикс — проверку формата id нужно пересмотреть"
    );

    const migDir = path.join(REPO_ROOT, "supabase/migrations");
    const sql = fs.readdirSync(migDir)
      .filter(f => f.endsWith(".sql"))
      .sort()
      .map(f => fs.readFileSync(path.join(migDir, f), "utf8"))
      .join("\n");

    // Последнее слово о типе должно быть за text: колонку заводили как uuid, потом
    // чинили ALTER-ом, и порядок файлов здесь важен.
    const decls = [...sql.matchAll(/client_portals[\s\S]{0,200}?project_id\s+(uuid|text)/gi)]
      .map(m => m[1].toLowerCase());
    const alters = [...sql.matchAll(/alter column project_id type\s+(uuid|text)/gi)]
      .map(m => m[1].toLowerCase());
    const finalType = alters.length ? alters[alters.length - 1] : (decls.length ? decls[decls.length - 1] : null);

    assert(finalType, "в миграциях не найдено объявление client_portals.project_id");
    assert(
      finalType === "text",
      "client_portals.project_id остаётся " + finalType + ", а id проекта — строка с префиксом: INSERT будет падать"
    );
  });

  // ── Иконки вместо эмодзи ────────────────────────────────────────────────────
  // Эмодзи рисуются шрифтом ОС: у каждого пользователя свой набор, они не
  // наследуют цвет текста и в тёмной теме выглядят разнокалиберными наклейками.
  // Единственный источник пиктограмм — ICON_PATHS. Сторож нужен потому, что
  // эмодзи возвращаются незаметно: одна строка `toast("✅ Готово")` — и снова.
  await test("иконки: в интерфейсе нет эмодзи (кроме разметки печатных бланков)", () => {
    const lines = app.split(/\r?\n/);
    // Шаблоны договоров пропускаем: там ☐ — это чекбокс печатного бланка,
    // а ─ — линейка раздела. Убрать их значило бы испортить сам документ.
    const t0 = lines.findIndex((l) => l.includes("const CONTRACT_TEMPLATES"));
    let t1 = lines.length;
    for (let i = t0; i < lines.length; i++) {
      if (/^\s{6}\];\s*$/.test(lines[i])) { t1 = i; break; }
    }
    // Граница проходит не по «символ не из латиницы», а по способу отрисовки.
    // Запрещены ЦВЕТНЫЕ эмодзи: их рисует шрифт ОС, они игнорируют color и
    // выглядят наклейками. Разрешены монохромные типографские знаки — ✓ (U+2713)
    // и ✔ (U+2714): это глифы текстового шрифта, они наследуют цвет и кегль,
    // и «✓ сохранено» в индикаторе не заменить на <svg> (там textContent).
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2701}-\u{2712}\u{2715}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
    const bad = [];
    lines.forEach((l, i) => {
      if (i >= t0 && i <= t1) return;
      if (EMOJI.test(l)) bad.push(`app.js:${i + 1} ${l.trim().slice(0, 80)}`);
    });
    assert(bad.length === 0, "эмодзи вернулись в интерфейс — добавьте иконку в ICON_PATHS:\n" + bad.slice(0, 12).join("\n"));
  });

  await test("иконки: база ICON_PATHS не пустеет и icon() ей пользуется", () => {
    const m = app.match(/const ICON_PATHS\s*=\s*\{([\s\S]*?)\n      \};/);
    assert(m, "не найден ICON_PATHS — база иконок пропала");
    const names = [...m[1].matchAll(/^\s{8}([a-zA-Z0-9_]+)\s*:/gm)].map((x) => x[1]);
    assert(names.length >= 50, "иконок в базе стало меньше пятидесяти: " + names.length);
    for (const need of ["film", "camera", "palette", "robot", "clipboard", "plus", "trash", "link", "eye", "pencil"]) {
      assert(names.includes(need), "в базе нет иконки " + need);
    }
    assert(/function icon\(name, size\)[\s\S]{0,200}ICON_PATHS\[name\]/.test(app), "icon() больше не читает ICON_PATHS");
  });

  // PLAN.md §2: витрина продаёт смету и КП, а не «ещё одну CRM» — на слове CRM
  // посетитель сравнивает нас с Bitrix24/amoCRM. Имя продукта наружу — «ADERVIS»;
  // «CRM» остаётся внутри как название раздела и в оферте как юр. наименование.
  await test("позиционирование: витрина продаёт смету и КП, а не «ещё одну CRM»", () => {
    assert(/<title>ADERVIS — сметы и КП/.test(head), "заголовок вкладки перестал продавать смету и КП");
    assert(!/ADERVIS CRM/.test(head), "«ADERVIS CRM» вернулось в <head> (title/og/JSON-LD)");

    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "manifest.json"), "utf8"));
    assert(!/ADERVIS CRM/.test(manifest.name), "«ADERVIS CRM» вернулось в имя PWA: " + manifest.name);

    // Экран входа и подпись на клиентском портале — две самые внешние поверхности.
    assert(/Смета и КП за 15 минут/.test(app), "с экрана входа пропал заголовок про смету и КП");
    assert(/Сделано в <strong[^>]*>ADERVIS<\/strong>/.test(app), "подпись на клиентском КП снова называет продукт «ADERVIS CRM»");

    // В самом app.js «ADERVIS CRM» допустимо только в юр. документах (оферта,
    // политика) — там это наименование сервиса в договоре.
    const offerStart = app.indexOf("DOCS_PRIVACY_HTML");
    const offerEnd = app.indexOf("function renderDocsModal");
    const bad = [];
    app.split(/\r?\n/).forEach((line, i) => {
      if (!/ADERVIS CRM|Adervis CRM/.test(line)) return;
      const pos = app.indexOf(line);
      if (offerStart > 0 && pos > offerStart && pos < offerEnd) return; // юр. тексты
      bad.push(`app.js:${i + 1} ${line.trim().slice(0, 80)}`);
    });
    assert(bad.length === 0, "«ADERVIS CRM» вне юр. документов:\n" + bad.slice(0, 8).join("\n"));
  });

  // ── Вход и синхронизация ───────────────────────────────────────────────────
  // Всё ниже — сторожа статические: путь записи в Supabase тестами не покрыт в
  // принципе (прогон идёт в local mode, где _supabase нет вовсе), а цена ошибки
  // здесь — чужие или потерянные данные живого пользователя.

  await test("вход: сбой чтения профиля не уводит в ветку «новый пользователь»", () => {
    // Ветка «первый вход» делает upsert профиля с subscription_status:"trial" и
    // agency_id = собственный userId. Раньше ошибка SELECT'а отбрасывалась
    // (`const { data } = ...`), поэтому один обрыв связи превращал оплаченную
    // подписку в 7-дневный триал, а члена команды выкидывал из агентства —
    // дальше _onUserLoggedIn видел смену agencyId и стирал локальные данные.
    const fn = app.slice(app.indexOf("async function _loadUserProfile"));
    const body = fn.slice(0, fn.indexOf("\n      // ── Web Push"));
    assert(body.length > 200, "не удалось вырезать тело _loadUserProfile");
    assert(
      /maybeSingle\(\)/.test(body),
      "_loadUserProfile снова читает профиль через single(): отсутствие строки станет неотличимо от отказа сети"
    );
    assert(
      !/const\s*\{\s*data\s*\}\s*=\s*await\s+_supabase\s*\.?\s*\n?\s*\.from\("profiles"\)/.test(body.replace(/\s+/g, " ")) &&
      !/const \{ data \} = await _supabase\.from\("profiles"\)/.test(body),
      "_loadUserProfile снова отбрасывает error при чтении профиля"
    );
    const errIdx = body.indexOf("_profileLoadFailed = true");
    const createIdx = body.indexOf('subscription_status: "trial"');
    assert(errIdx > 0, "нет отметки о неудачном чтении профиля");
    assert(createIdx > 0, "не нашлась ветка создания профиля — проверка потеряла смысл");
    assert(errIdx < createIdx, "выход по ошибке стоит ПОСЛЕ создания профиля — он уже не спасает");
  });

  await test("вход: «нет связи» и «подписка истекла» — разные экраны", () => {
    assert(/function renderProfileErrorGate/.test(app), "нет отдельного экрана для неудачного чтения профиля");
    const gateIdx = app.indexOf("renderProfileErrorGate();");
    const subIdx = app.indexOf("renderSubscriptionGate();");
    assert(gateIdx > 0 && subIdx > 0, "не нашлись обе заглушки в render()");
    assert(gateIdx < subIdx, "проверка подписки идёт раньше проверки связи — оплативший увидит «Подписка истекла»");
  });

  await test("realtime: в канал уходит «пинок», а не всё состояние", () => {
    // Замер на боевом проекте: send() возвращает "ok" на любом размере, но
    // сообщения больше ~256 КБ до получателя не доходят вовсе. Состояние весит
    // ~6 КБ на сделку — примерно с 40-й сделки командная синхронизация умирала молча.
    const m = app.match(/event: "state-sync",\s*\n?\s*payload: \{([^}]*)\}/);
    assert(m, "не нашлась отправка state-sync в broadcast");
    assert(
      !/\bdata\b/.test(m[1]),
      "в broadcast state-sync снова кладут состояние целиком: " + m[1].trim()
    );
    // Пинок обязан уходить ПОСЛЕ подтверждённой записи в облако, иначе получатель
    // заберёт из agency_state предыдущую версию.
    const cloudFn = app.slice(app.indexOf("function saveToCloud()"));
    const upsertIdx = cloudFn.indexOf('from("agency_state").upsert');
    const pokeIdx = cloudFn.indexOf("_broadcastCloudUpdated()");
    assert(upsertIdx > 0 && pokeIdx > 0, "пинок не привязан к записи в agency_state");
    assert(upsertIdx < pokeIdx, "пинок шлётся раньше записи в облако — коллега заберёт старый снапшот");
  });

  await test("соц-вход: пользователь ищется по id провайдера, а не только по email", () => {
    // Раньше искали строго по email. Один и тот же человек получал РАЗНЫЕ аккаунты
    // в зависимости от того, отдал ли провайдер почту: первый вход без scope email
    // заводил vk<id>@vk.adervis, следующий (уже с почтой) не находил его и создавал
    // пустой — со стороны это «пропали все сделки». Смена почты у провайдера — то же.
    for (const [file, idKey] of [["vk-auth", "vk_id"], ["yandex-auth", "yandex_id"]]) {
      const src = fs.readFileSync(path.join(REPO_ROOT, `supabase/functions/${file}/index.ts`), "utf8");
      assert(
        new RegExp(`user_metadata\\?\\.${idKey}`).test(src),
        `${file}: пользователь снова ищется только по email, без ${idKey}`
      );
      assert(
        /loginEmail/.test(src) && /email: loginEmail/.test(src),
        `${file}: magiclink шлётся не на адрес найденного аккаунта — вход заведёт второй`
      );
      assert(
        /for \(let page = 1/.test(src),
        `${file}: listUsers снова без пагинации — с 1001-го аккаунта вход сломается`
      );
    }
  });

};
