// Регресс инвариантов Фазы G (скорость/безопасность первого впечатления).
// Чистые статические проверки index.html/style.css — браузер не нужен.
const fs = require("fs");
const path = require("path");
const { assert, assertEqual, REPO_ROOT } = require("../harness");

// Читаем с нормализацией переводов строк. Git хранит LF, но в рабочей копии на
// Windows файл легко оказывается в CRLF (достаточно одного git stash/pop) — и тогда
// КАЖДЫЙ сторож, чей якорь содержит \n, падает на ровном месте, хотя код не менялся.
// На линуксовом раннере те же тесты при этом зелёные, то есть поломка видна только
// у одного разработчика и выглядит мистикой. Один раз потеряли на этом полчаса.
const readSrc = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8").split("\r\n").join("\n");

module.exports = async function ({ test }) {
  const index = readSrc("index.html");
  const css = readSrc("style.css");
  const app = readSrc("app.js");
  const head = index.slice(0, index.indexOf("</head>"));

  await test("скругления: только токены шкалы, без пиксельных литералов", () => {
    // Шкала сводилась дважды и оба раза не до конца: d898f53 заявил «18 значений →
    // 5», но в файле осталось 28 штук 14px (значения в шкале нет вовсе) и легаси
    // --radius, дублирующий --r-xl. Значения расползаются молча — глазом 14px от
    // 16px не отличить, а через полгода их снова два десятка.
    // Разрешено: var(--r-*), 50% (круг) и 0. Всё остальное — обратно в DESIGN.md §5.
    const bad = [];
    css.split("\n").forEach((line, i) => {
      const m = line.match(/border-radius:\s*([^;}]+)/);
      if (!m) return;
      const value = m[1].trim();
      const ok = value.split(/\s+/).every(part => /^var\(--r-[a-z0-9]+\)$/.test(part) || part === "50%" || part === "0");
      if (!ok) bad.push(`style.css:${i + 1}: ${value}`);
    });
    assert(bad.length === 0,
      "border-radius мимо шкалы токенов (DESIGN.md §5):\n" + bad.join("\n"));
  });

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
    // Срез по имени БЕЗ скобок: у функции появился параметр (publicCalcUrl(forSharing)),
    // и поиск по «publicCalcUrl()» перестал её находить — тест молча брал кусок с
    // начала файла и падал на регекспе, хотя код был исправен.
    const urlFn = app.slice(app.indexOf("function publicCalcUrl("), app.indexOf("function togglePublicCalc"));
    assert(urlFn.length > 0 && urlFn.length < 2000, "не удалось выделить publicCalcUrl — разбор сломался");
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

  await test("встроенный калькулятор сообщает высоту содержимого, а не окна", () => {
    // documentElement.scrollHeight НИКОГДА не меньше окна iframe, а размер окна
    // задаёт хост (в pro.css стартовые 1400px) — плюс body.calc-mode .app растянут
    // min-height:100vh. Высота могла только расти: замер показал, что старая
    // формула отдавала ровно 1400 при содержимом в 982, то есть на странице
    // студии под калькулятором висело 418px пустоты (на заглушке — почти экран).
    const fn = app.slice(app.indexOf("function _calcPostHeight"), app.indexOf("function _maybeImportCalcDraft"));
    assert(fn.length > 200, "не удалось вырезать тело _calcPostHeight");
    assert(/getElementById\("appContent"\)/.test(fn), "высота снова меряется не по содержимому");
    assert(/getBoundingClientRect\(\)\.bottom/.test(fn), "высота считается не от низа содержимого");
    // scrollHeight допустим только как запасной вариант, если контейнера нет.
    const primary = fn.slice(0, fn.indexOf("postMessage"));
    assert(/root\s*\n?\s*\?/.test(primary) || /root\s*$/m.test(primary) || /: document/.test(primary),
      "scrollHeight перестал быть запасным вариантом и снова считает основным");
  });

  await test("подпись калькулятора не врёт про размер каталога", () => {
    // Стояло «90+ позиций» при 105 в BASE_ITEMS: цифру вписали руками и она
    // разошлась с каталогом. Число теперь считается из самого каталога и
    // разойтись не может — сторож следит, чтобы его не вернули в текст руками.
    const foot = app.slice(app.indexOf("function _calcRenderFoot"), app.indexOf("function _calcRenderFoot") + 700);
    assert(/\$\{BASE_ITEMS\.length\} позиций/.test(foot),
      "размер каталога в подписи снова записан числом — он разойдётся с BASE_ITEMS");
    assert(!/9[05]\+ позиций/.test(foot), "в подписи осталась захардкоженная цифра каталога");
  });

  await test("синхронизация: снимок коллеги не стирает правки молча", () => {
    // Снимок заменяет состояние целиком. На старте конфликт разбирается вопросом,
    // а realtime-путь применял облако безусловно — правки, ещё не ушедшие в
    // облако, исчезали посреди работы с тостом «Обновление от коллеги».
    const fn = app.slice(app.indexOf("async function _applyRemoteStateSync"), app.indexOf("function broadcastState") > 0
      ? app.indexOf("function broadcastState")
      : app.indexOf("function _broadcastCloudUpdated"));
    assert(fn.length > 300, "не удалось вырезать тело _applyRemoteStateSync");
    const mark = fn.indexOf("_getCloudSyncMark()");
    const apply = fn.indexOf("_applyCloudState(");
    assert(mark > 0, "realtime-путь снова не проверяет несинхронизированные правки");
    assert(apply > mark, "состояние применяется РАНЬШЕ проверки конфликта — правки уже потеряны");
    assert(/confirmDialog\(/.test(fn.slice(mark, apply)), "конфликт разрешается без вопроса пользователю");
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

  await test("мобильное меню содержит ВСЕ разделы из SIDEBAR_NAV_DEFS", () => {
    /* Список разделов задан один раз в SIDEBAR_NAV_DEFS. Меню на телефоне когда-то
       было написано руками и разошлось с ним: «Все КП» и «Команда» в него не
       попали, то есть с телефона в эти разделы было не попасть вовсе. Тогда
       расхождение чинили этим сторожем — сверкой идентификаторов.

       12.08.2026 лечим причину, а не симптом: копии списка больше нет, лист на
       телефоне рисует ту же renderNavListHtml(), что и боковое меню, а она берёт
       состав из getSidebarNavConfig() поверх SIDEBAR_NAV_DEFS. Поэтому сверяем не
       разметку меню, а то, что у КАЖДОГО раздела есть отрисовщик в общей таблице:
       разойтись после этого можно только забыв отрисовщик. */
    const defsBlock = app.slice(app.indexOf("const SIDEBAR_NAV_DEFS = ["), app.indexOf("];", app.indexOf("const SIDEBAR_NAV_DEFS = [")));
    const ids = [...defsBlock.matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1]);
    assert(ids.length >= 10, `в SIDEBAR_NAV_DEFS нашлось всего ${ids.length} разделов — регексп сломался`);

    const fn = app.slice(app.indexOf("function renderNavListHtml"), app.indexOf("МОБИЛЬНЫЙ ЛИСТ РАЗДЕЛОВ"));
    assert(fn.length > 500, "не удалось вырезать тело renderNavListHtml");
    const renderers = fn.slice(fn.indexOf("const navRenderers = {"));
    const missing = ids.filter(id => !new RegExp(`(^|[\\s{,])"?${id.replace(/[-]/g, "\\-")}"?\\s*:`, "m").test(renderers));
    assert(missing.length === 0,
      "разделы есть в SIDEBAR_NAV_DEFS, но их нечем нарисовать в меню: " + missing.join(", "));

    // И сам лист обязан брать список отсюда, а не собирать свой.
    const sheet = app.slice(app.indexOf("function _mobileSheetBodyHtml"), app.indexOf("function toggleSidebar"));
    assert(/renderNavListHtml\(\)/.test(sheet), "лист разделов снова рисует свой список — он разойдётся с SIDEBAR_NAV_DEFS");
  });

  await test("разделы на телефоне живут в ОДНОМ месте — в листе нижней панели", () => {
    /* Решение владельца от 12.08.2026, заменяет прежнее «логотип = разделы, кнопка
       панели = настройка». Причина замены: тех меню было ДВА, и второе (по
       логотипу) держало собственный захардкоженный список — оно не читало
       «Настроить меню», поэтому показывало скрытые разделы, не показывало свои и
       игнорировало порядок. Ровно то расхождение, от которого предостерегает
       комментарий у renderSidebarNavPopover.

       Теперь разделы одни: лист на кнопке нижней панели, разметка — общая с
       боковым меню (renderNavListHtml). Настройка осталась, но строкой в конце
       листа: сначала «куда пойти», потом «что показывать». */
    const more = index.slice(index.indexOf('id="mbnMore"'), index.indexOf("</button>", index.indexOf('id="mbnMore"')));
    assert(/toggleMobileNavSheet/.test(more), "кнопка нижней панели больше не открывает разделы");
    assert(/Разделы/.test(more), "подпись кнопки не называет то, что она открывает");

    // Второго меню разделов быть не должно ни в одном виде.
    assert(!/openMainMenu/.test(index) && !/openMainMenu/.test(app),
      "вернулось второе меню разделов (openMainMenu) — оно жило своим списком и расходилось с настройкой меню");
    assert(!/main-menu-item/.test(css), "остались стили удалённого меню разделов");

    const logo = index.slice(index.indexOf('<div class="logo"'), index.indexOf(">", index.indexOf('<div class="logo"')));
    assert(/role="button"/.test(logo) && /tabindex/.test(logo),
      "логотип кликабелен, но не объявлен кнопкой — с клавиатуры и скринридером до него не добраться");
    assert(/app\.go\('home'\)/.test(logo), "логотип перестал вести на «Проекты»");

    // Лист обязан строиться из ОБЩЕЙ разметки, иначе он повторит судьбу меню логотипа.
    const sheet = app.slice(app.indexOf("function _mobileSheetBodyHtml"), app.indexOf("function toggleSidebar"));
    assert(sheet.length > 200, "не удалось вырезать тело _mobileSheetBodyHtml");
    assert(/renderNavListHtml\(\)/.test(sheet), "лист разделов снова рисует свой список вместо общего");
  });

  await test("настройка меню строится из одной разметки на десктоп и телефон", () => {
    // На десктопе якорь — кнопка в сайдбаре, на телефоне сайдбара нет и якорем
    // служит кнопка нижней панели. Разметка списка при этом ОДНА: вторая копия
    // неизбежно разъедется, как уже разъехалось мобильное меню с SIDEBAR_NAV_DEFS.
    const fn = app.slice(app.indexOf("function renderSidebarNavPopover"), app.indexOf("// Свой раздел = ссылка"));
    assert(fn.length > 300, "не удалось вырезать тело renderSidebarNavPopover");
    assert(/getElementById\("sidebarNavEditBtn"\)/.test(fn) && /getElementById\("mbnMore"\)/.test(fn),
      "поповер настройки знает только про один якорь — на втором экране он не откроется");
    // Выбор ИМЕННО по видимости. Через `||` (по наличию) панель ломалась в проде:
    // при живой сессии сайдбар отрисован и лишь скрыт CSS, поэтому кнопка
    // находилась, а её getBoundingClientRect() давал нули.
    assert(/getBoundingClientRect/.test(fn) && /width > 0/.test(fn),
      "якорь снова выбирается по наличию элемента, а не по его видимости");
    assert(!/getElementById\("sidebarNavEditBtn"\)\s*\|\|/.test(fn),
      "вернулся выбор якоря через ||: скрытый сайдбар снова победит кнопку панели");
  });

  await test("нижняя панель: активный пункт без точки-индикатора", () => {
    // Цвета подписи и подсветки иконки достаточно; точка была третьим сигналом об
    // одном и том же и читалась как мусор под подписью.
    assert(!/\.mbn-item\.active::after/.test(css), "точка-индикатор под активным пунктом вернулась");
  });

  await test("меню разделов не дублирует меню профиля", () => {
    // По аватару в шапке уже лежат Профиль, Настройки, Поддержка, Тарифный план и
    // Выйти. Второй вход в те же вещи из списка РАЗДЕЛОВ — то самое дублирование,
    // из-за которого пришлось разводить логотип с кнопкой «Ещё». Выход вдобавок
    // опасно держать среди разделов: лишний способ случайно закрыть себе сессию.
    // «Настройки» — исключение: это полноценный раздел приложения, а не действие
    // над аккаунтом, и он остаётся в обоих местах намеренно.
    assert(!/app\.closeMainMenu\(\);app\.adminLogout\(\)/.test(app),
      "«Выйти» снова в мобильном меню разделов");
    for (const [view, name] of [["profile", "Профиль"], ["support", "Поддержка"], ["plans", "Тарифы"]]) {
      assert(!new RegExp(`app\\.closeMainMenu\\(\\);app\\.go\\('${view}'\\)`).test(app),
        `«${name}» снова в мобильном меню разделов — он уже есть по аватару в шапке`);
    }
    // Но убранное обязано остаться достижимым — проверяем, что выпадашка профиля
    // по-прежнему их содержит, иначе мы просто потеряли функции.
    for (const [view, name] of [["profile", "Профиль"], ["support", "Поддержка"]]) {
      assert(new RegExp(`app\\.go\\('${view}'\\);app\\.toggleProfileDd\\(false\\)`).test(app),
        `«${name}» пропал и из меню профиля — раздел стал недостижим`);
    }
    assert(/app\.adminLogout\(\);app\.toggleProfileDd\(false\)/.test(app),
      "выход пропал из меню профиля — выйти стало нечем");
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

  await test("запись в Supabase: результат upsert/update/delete/rpc проверяется везде", () => {
    // supabase-js v2 не бросает исключение — ошибка приходит полем `error` в
    // результате. Поэтому `try { await _supabase...upsert(x) } catch` НИКОГДА не
    // срабатывает, и отказ (RLS, сеть, размер строки) неотличим от успеха.
    // 11.08 таких мест нашлось девять. Самое дорогое — кнопка «Сохранить в облако»:
    // на отказе она рапортовала «Данные сохранены» И гасила _cloudDirty вместе с
    // меткой синхронизации, то есть снимала единственную защиту от потери правок
    // ровно там, где человек страхуется вручную. Рядом: профиль «создавался» без
    // строки в базе (с целями registration/trial_started и welcome-письмом), бриф
    // помечался сконвертированным только на экране и конвертировался повторно.
    //
    // Сторож статический — в браузерных прогонах местного режима _supabase нет
    // вовсе, путь записи не исполняется ни одной строкой.
    const lines = app.split("\n");
    const MUTATION = /\.(upsert|insert|update|delete)\s*\(/;
    const offenders = [];
    lines.forEach((line, i) => {
      const at = line.indexOf("await _supabase");
      if (at < 0) return;
      const stmt = lines.slice(i, i + 10).join("\n");
      const isRpc = /await _supabase\s*\.\s*rpc\(/.test(line);
      // Чтение (.select) правится отдельными сторожами выше — здесь только запись.
      if (!isRpc && !MUTATION.test(stmt.slice(0, (stmt.indexOf(";") + 1) || stmt.length))) return;
      const prefix = line.slice(0, at);
      // Результат может не проверяться здесь, а уходить вызывающему: `return await …`
      // или тело стрелки (`const runWrite = async () => await …`). Так сделано в
      // createClientPortal, где обе ветки тернарника отдают результат наружу и там
      // разбираются подробно — включая повторную запись без непринятых колонок.
      const carrier = /(=>|\breturn\b)\s*$/;
      const cont = prefix.trim();
      const escapes = carrier.test(prefix.trim())
        || ((cont === "?" || cont === ":") && lines.slice(Math.max(0, i - 3), i).some(l => carrier.test(l.trimEnd()) || /=>\s*\w/.test(l)));
      if (escapes) return;
      const bound = prefix.match(/\berror(?:\s*:\s*([A-Za-z_$][\w$]*))?\b/);
      if (!bound) {
        offenders.push(`app.js:${i + 1}: error не извлечён — ${line.trim().slice(0, 80)}`);
        return;
      }
      // Извлечь мало: `const { error } = ...` без последующей проверки так же нем.
      const name = bound[1] || "error";
      const near = lines.slice(i, i + 12).join("\n");
      const hits = (near.match(new RegExp(`\\b${name}\\b`, "g")) || []).length;
      if (hits < 2) offenders.push(`app.js:${i + 1}: ${name} извлечён, но нигде не проверен`);
    });
    assert(
      offenders.length === 0,
      "результат записи в Supabase не проверяется — отказ выглядит как успех:\n" + offenders.join("\n")
    );
  });

  await test("чтение из Supabase: результат select проверяется везде", () => {
    // Парный сторож к проверке записи выше и та же причина: ошибка приходит полем
    // `error`, а не исключением. Разница в последствиях. Неудачная ЗАПИСЬ врёт об
    // успехе; неудачное ЧТЕНИЕ отдаёт null или [] — то есть выглядит как правдивый
    // ответ «ничего нет», и код спокойно идёт в ветку «раз ничего нет, создадим».
    // 12.08 таких мест нашлось шесть. Самое дорогое — поиск уже существующего КП
    // сделки: при отказе чтения он возвращал null, вызывающий код делал insert и
    // рождалось ВТОРОЕ КП с другой ссылкой, а у клиента на руках оставалась первая —
    // ровно тот дубль, ради устранения которого поиск и написан. Рядом: разделы
    // «Все КП» и «Онлайн-брифы» рисовали пустой список вместо отказа связи.
    //
    // Сторож статический: в местном режиме _supabase нет вовсе, ни одна из этих
    // строк в браузерных прогонах не исполняется.
    const lines = app.split("\n");
    const MUTATION = /\.(upsert|insert|update|delete)\s*\(/;
    const offenders = [];
    lines.forEach((line, i) => {
      const at = line.indexOf("await _supabase");
      if (at < 0) return;
      const stmt = lines.slice(i, i + 10).join("\n");
      const head = stmt.slice(0, (stmt.indexOf(";") + 1) || stmt.length);
      if (!/\.select\s*\(/.test(head)) return;
      // `.insert(row).select('id')` — это запись, её разбирает сторож выше.
      if (MUTATION.test(head)) return;
      const bound = line.slice(0, at).match(/\berror(?:\s*:\s*([A-Za-z_$][\w$]*))?\b/);
      if (!bound) {
        offenders.push(`app.js:${i + 1}: error не извлечён — ${line.trim().slice(0, 78)}`);
        return;
      }
      const name = bound[1] || "error";
      const near = lines.slice(i, i + 12).join("\n");
      const hits = (near.match(new RegExp(`\\b${name}\\b`, "g")) || []).length;
      if (hits < 2) offenders.push(`app.js:${i + 1}: ${name} извлечён, но нигде не проверен`);
    });
    assert(
      offenders.length === 0,
      "результат чтения из Supabase не проверяется — отказ выглядит как «данных нет»:\n" + offenders.join("\n")
    );
  });

  await test("КП: при неудачной проверке существующего КП второе не создаётся", () => {
    // «Не нашли» и «не смогли посмотреть» обязаны остаться разными ответами: на
    // втором insert создаёт дубль с новой ссылкой, а клиент держит старую — его
    // согласование и оплата аванса перестают быть видны в сделке.
    const fn = app.slice(app.indexOf("async function _findPortalForProject"));
    const body = fn.slice(0, fn.indexOf("\n      /*"));
    assert(body.length > 200, "не удалось вырезать тело _findPortalForProject");
    assert(/ok:\s*false/.test(body), "_findPortalForProject больше не отличает отказ чтения от «КП нет»");
    assert(!/^\s*return null;\s*$/m.test(body), "_findPortalForProject снова отдаёт голый null");

    const caller = app.slice(app.indexOf("async function createClientPortal"));
    const callIdx = caller.indexOf("_findPortalForProject(");
    const insertIdx = caller.indexOf(".insert(row)");
    assert(callIdx > 0 && insertIdx > 0, "не нашлись вызов поиска и вставка КП");
    const between = caller.slice(callIdx, insertIdx);
    assert(/!\s*lookup\.ok/.test(between), "между проверкой и insert нет выхода по неудачному чтению");
    assert(/return;/.test(between.slice(between.indexOf("lookup.ok"))), "неудачное чтение не прерывает создание КП");
  });

  await test("места в команде: лимит считает база, а не клиент под RLS", () => {
    // Клиентская проверка читала ЧУЖИЕ строки profiles, а единственная SELECT-политика
    // на проде — `profiles: read own`. Лимит не срабатывал никогда, и серверной
    // проверки не было ни в одной Edge Function: «до 3 пользователей» не ограничивало
    // ничего. Тест держит три вещи разом — что счёт ушёл в RPC, что имя RPC совпадает
    // с миграцией и что права на неё сняты у anon (код приглашения = agency_id, иначе
    // им можно перебирать существующие агентства).
    assert(/rpc\("agency_seat_info"/.test(app), "app.js больше не зовёт agency_seat_info — лимит мест снова на клиенте");
    assert(
      !/from\("profiles"\)\s*\.select\([^)]*\)\s*\.eq\("agency_id"/.test(app.replace(/\s+/g, " ")),
      "вернулся прямой подсчёт коллег через profiles — под RLS он всегда даёт 0"
    );
    const mig = readSrc("supabase/migrations/20260812000001_agency_seat_info.sql");
    assert(/create or replace function public\.agency_seat_info/.test(mig), "в миграции нет функции agency_seat_info");
    assert(/security definer/.test(mig), "agency_seat_info без SECURITY DEFINER не увидит чужие строки и смысла не имеет");
    assert(/revoke all on function public\.agency_seat_info\(uuid, int\) from anon/.test(mig), "нет revoke от anon");
    assert(/revoke all on function public\.agency_seat_info\(uuid, int\) from public/.test(mig), "нет revoke от public");
    // Наружу уходят только числа: ни email, ни id, ни имён.
    const payload = (mig.match(/return json_build_object\(\s*'exists', true([\s\S]*?)\);/) || [])[1] || "";
    assert(payload, "не удалось разобрать состав ответа — проверка приватности не выполнена");
    const leaky = ["email", "'id'", "name", "state_json"].filter((k) => payload.includes(k));
    assertEqual(leaky.length, 0, "в ответ agency_seat_info попали не-числовые поля: " + leaky.join(", "));
  });

  await test("даты-дни собираются в местном времени, а не в UTC", () => {
    // <input type="date"> и <input type="month"> живут в часовом поясе человека,
    // а toISOString() возвращает UTC: в МСК с 00:00 до 03:00 это ВЧЕРА, а в ночь
    // на 1-е число — ещё и прошлый месяц. Для этого в app.js есть localIso()
    // с подробным комментарием; сторож держит, чтобы соседний код не писал по-своему.
    const offenders = [];
    app.split("\n").forEach((line, i) => {
      if (/toISOString\(\)\s*\.\s*(slice|split|substring)\s*\(/.test(line)) {
        offenders.push(`app.js:${i + 1}: ${line.trim().slice(0, 80)}`);
      }
    });
    assert(
      offenders.length === 0,
      "дата-день обрезана из UTC-строки вместо localIso()/todayIso():\n" + offenders.join("\n")
    );
    assert(/function localIso/.test(app) && /function todayIso/.test(app), "исчезли localIso/todayIso — обрезать станет нечем");
  });

  await test("вкладка по умолчанию существует среди вкладок", () => {
    /* Админка открывалась со значением "stats", которого среди её вкладок НЕТ —
       там users / promos / errors. Ни одна кнопка не подсвечена, ни один блок не
       отрисован, и под плитками зияла пустая половина экрана, пока не ткнёшь во
       вкладку руками. Владелец прислал ровно такой скриншот.

       Сторож статический: панель требует прав супер-админа и в местном режиме не
       рисуется вовсе, живьём этот экран тестами не покрыт. */
    const decl = app.match(/let _adminPanelTab\s*=\s*"([^"]+)"/);
    assert(decl, "не нашлось объявление вкладки админки по умолчанию");

    // Идентификаторы вкладок берём из самой разметки, а не переписываем сюда.
    // Якорь — сам массив вкладок, а НЕ класс контейнера: класса могло ещё не быть,
    // и тогда сторож падал бы с «не удалось разобрать список» вместо настоящей
    // причины «вкладки по умолчанию нет среди вкладок».
    const rowAt = app.indexOf('[["users",icon(');
    const row = rowAt > 0 ? app.slice(rowAt, rowAt + 400) : "";
    const ids = [...row.matchAll(/\["(\w+)",\s*icon\(/g)].map((m) => m[1]);
    assert(ids.length >= 3, "не удалось разобрать список вкладок админки: " + JSON.stringify(ids));
    assert(ids.includes(decl[1]),
      `вкладка по умолчанию «${decl[1]}» не входит в список ${JSON.stringify(ids)} — панель откроется пустой`);

    // И каждая вкладка обязана иметь свой блок содержимого.
    const missing = ids.filter((id) => !app.includes(`_adminPanelTab === "${id}"`));
    assertEqual(missing.length, 0, "у вкладок нет блока содержимого: " + missing.join(", "));
  });

  await test("значки-бейджи одного размера: iconBadge и плитки KPI", () => {
    /* В приложении есть домашний размер значка-бейджа — iconBadge() по умолчанию
       даёт кружок 26px со значком 14px (0.54 от кружка). Плитка KPI на главной
       была единственным местом мимо стандарта: 20/11, то есть символ МЕЛЬЧЕ
       соседней подписи (12px) — на таком размере он читается не как знак, а как
       цветное пятнышко.

       Проверяем не «красиво ли», а согласованность с собственным стандартом:
       значок в бейдже не должен быть мельче подписи, рядом с которой стоит. */
    const badge = app.slice(app.indexOf("function iconBadge"), app.indexOf("function iconBadge") + 600);
    const def = badge.match(/const s = size \|\| (\d+)/);
    assert(def, "не удалось прочитать размер iconBadge по умолчанию");
    assertEqual(Number(def[1]), 26, "домашний размер бейджа изменился — сверь с ним плитки KPI");

    const box = css.match(/\.db-stat-icon\s*\{[^}]*width:\s*(\d+)px/);
    const glyph = css.match(/\.db-stat-icon svg\s*\{[^}]*width:\s*(\d+)px/);
    assert(box && glyph, "не удалось прочитать размеры значка плитки KPI");
    assertEqual(Number(box[1]), 26, "кружок значка в плитке KPI разошёлся с домашним размером бейджа");
    assert(Number(glyph[1]) >= 12,
      `значок в плитке ${glyph[1]}px — мельче подписи рядом (12px), он перестаёт читаться знаком`);
  });

  await test("нет ссылок на несуществующие CSS-переменные", () => {
    /* `background: var(--card)` при отсутствующей --card — это не ошибка и не
       предупреждение: браузер молча ОТБРАСЫВАЕТ объявление целиком. В этом
       приложении так уже случалось — всплывашка онбординг-тура рисовалась
       ПРОЗРАЧНОЙ поверх затемнения, и то же было у кнопки переключателя сделок.

       Ссылка с запасным значением — `var(--kanban-cols, 4)` — законна: такие
       переменные ставятся инлайном из JS, и запасное значение как раз для случая
       «ещё не поставили». Придираемся только к ссылкам БЕЗ запасного значения. */
    const defined = new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
    // Инлайновые: то, что JS кладёт прямо в style="--x: …" или setProperty.
    const inline = new Set([
      ...app.matchAll(/setProperty\(\s*["'`](--[a-zA-Z0-9-]+)/g),
      ...app.matchAll(/style="[^"]*?(--[a-zA-Z0-9-]+)\s*:/g),
      ...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g),
    ].map((m) => m[1]));

    const bad = [];
    // Комментарии вырезаем, но длину сохраняем — иначе номера строк в отчёте
    // поедут. Без этого сторож ловил САМ СЕБЯ: в style.css есть комментарий
    // «Было var(--card) — такой переменной нет…», описывающий уже исправленный
    // баг, и он выглядел как живая ссылка.
    const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    const scan = (raw, where) => {
      const src = stripComments(raw);
      // var(--x) без запятой внутри — то есть без запасного значения.
      for (const m of src.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g)) {
        const name = m[1];
        if (defined.has(name) || inline.has(name)) continue;
        const line = src.slice(0, m.index).split("\n").length;
        bad.push(`${where}:${line} — var(${name}) без запасного значения, а переменная нигде не объявлена`);
      }
    };
    scan(css, "style.css");
    scan(app, "app.js");
    assert(bad.length === 0, "объявления будут молча отброшены:\n" + bad.slice(0, 8).join("\n"));
  });

  await test("двойное нажатие не создаёт вторую запись", () => {
    /* Класс: async-действие по кнопке, которое ВСТАВЛЯЕТ запись, без защиты от
       повторного входа. Два быстрых тапа входят в функцию оба; первая вставка ещё
       не закончилась, поэтому проверка «а нет ли уже такого?» у обоих отвечает
       «нет» — и вставок получается две.

       Самое дорогое место — «КП-ссылка» (зовётся из четырёх мест): выходили два
       КП с РАЗНЫМИ ссылками, клиент держал первую, сделка показывала вторую, и
       его согласование с оплатой аванса переставали быть видны. Отличить такие
       дубли кодом нельзя, их удаляют руками.

       Обход всех 28 async-действий по кнопке, которые пишут на сервер: вставок
       среди них пять. Три уже защищены собственными флагами (submitBrief гасит
       кнопку на время отправки, buyPlan держит _buyingPlan, adminCreatePromo —
       свой), две не были защищены ничем.

       Сторож статический: в местном режиме _supabase нет вовсе, и ни одна из этих
       строк в браузерных прогонах не исполняется. */
    assert(/const _actionsInFlight = new Set\(\)/.test(app), "исчез общий предохранитель от повторного нажатия");

    const once = app.slice(app.indexOf("async function _once("), app.indexOf("async function createClientPortal"));
    assert(once.length > 60, "не удалось вырезать тело _once");
    assert(/finally\s*\{[\s\S]*?_actionsInFlight\.delete/.test(once),
      "ключ снимается не в finally — одна ошибка запрёт кнопку до перезагрузки страницы");

    // Каждое действие, создающее НОВУЮ сущность, обязано идти через предохранитель.
    for (const [fn, key] of [
      ["createClientPortal", "portal:"],
      ["convertBriefToDeal", "brief2deal:"],
      ["rotateCalendarToken", "calToken"],
    ]) {
      const body = app.slice(app.indexOf(`async function ${fn}(`), app.indexOf(`async function _${fn.charAt(0).toUpperCase()}${fn.slice(1)}Impl(`) + 1);
      const head = app.slice(app.indexOf(`async function ${fn}(`)).slice(0, 600);
      assert(new RegExp(`_once\\(\\s*["'\`]${key.replace(/[:]/g, "[:]")}`).test(head),
        `${fn} больше не идёт через _once — двойное нажатие снова создаст дубль`);
    }

    // Кнопка «КП-ссылка» действительно зовётся из нескольких мест: защита обязана
    // жить в самой функции, а не в разметке одной из кнопок.
    const callSites = (app.match(/app\.createClientPortal\(/g) || []).length;
    assert(callSites >= 3, `вызовов createClientPortal ${callSites} — проверка потеряла смысл, перепроверь класс`);
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

  /* Скругления держим на шкале токенов. Замер по живому DOM 08.08.2026: на экранах
     встречалось ДЕСЯТЬ разных радиусов, в файле — восемнадцать значений от 2 до
     999px, включая пары 6/7/9 и 10/11 — различить их глазом нельзя, а несобранность
     интерфейса они дают. Свели 189 объявлений к пяти токенам.

     Исключения (14/18/20/24) перечислены поимённо: они подобраны под вложенность
     (внутренний радиус = внешний − отступ), и сведение дало бы видимый нотч на
     скруглении. Новое значение мимо шкалы придётся либо привести к токену, либо
     осознанно добавить в этот список — что и есть цель сторожа. */
  await test("оформление: скругления берутся из шкалы токенов", () => {
    const css = readSrc("style.css");
    const ALLOWED = [14, 18, 20, 24];
    const bad = [];
    const re = /border-radius:\s*(\d+)px\s*;/g;
    let m;
    while ((m = re.exec(css))) {
      const px = Number(m[1]);
      if (!ALLOWED.includes(px)) {
        const line = css.slice(0, m.index).split("\n").length;
        bad.push(`${px}px (строка ${line})`);
      }
    }
    assertEqual(bad.length, 0,
      "радиусы мимо шкалы — используйте var(--r-xs…--r-pill):\n  " + bad.slice(0, 12).join("\n  "));

    for (const t of ["--r-xs", "--r-sm", "--r-md", "--r-lg", "--r-xl", "--r-pill"]) {
      assert(new RegExp("\\" + t + ":\\s*\\d+px").test(css), "в :root нет токена " + t);
    }

    /* Фокус-кольцо — одно состояние, значит и вид один. До сведения кольцо
       рисовалось двумя цветами: глобальное правило брало --primary, семь локальных
       (календарь, калькулятор) — --primary2, и при переходе табом по одной странице
       подсветка меняла оттенок. */
    const rings = css.match(/outline:\s*[^;]*solid[^;]*;/g) || [];
    const offScale = rings.filter((r) => !/var\(--ring-w\)\s+solid\s+var\(--ring\)/.test(r));
    assertEqual(offScale.length, 0,
      "фокус-кольцо мимо токена --ring:\n  " + offScale.slice(0, 6).join("\n  "));
  });

  // Активность аккаунта в админке ходит в SECURITY DEFINER-функцию: она обходит RLS
  // и читает чужое состояние. Живьём это тестами не покрыть (прогон идёт в local
  // mode, где _supabase нет вовсе), поэтому сторож статический — но проверяет ровно
  // то, что нельзя сломать незаметно: защиту, оба revoke и приватность ответа.
  await test("админка: активность аккаунта закрыта админом и не отдаёт чужие данные", () => {
    // Читаем ДЕЙСТВУЮЩУЮ версию функции: первая (20260808000001) падала на
    // «operator does not exist: text = uuid» и заменена целиком.
    const mig = readSrc("supabase/migrations/20260808000002_admin_agency_activity_text_id.sql");
    const app = readSrc("app.js");

    assert(/_is_super_admin\(\)/.test(mig), "функция активности не проверяет супер-админа — её сможет позвать любой вошедший");
    assert(/security definer/i.test(mig), "функция не SECURITY DEFINER — она не прочитает чужое состояние из-под RLS");
    assert(/set search_path\s*=\s*public/i.test(mig), "search_path не запинен у SECURITY DEFINER-функции");

    /* agency_id живёт в проекте РАЗНЫМИ типами: agency_state.id — текст,
       client_portals.agency_id — uuid. Первая версия функции принимала uuid и
       сравнивала его с текстовой колонкой — PostgreSQL отказался, и панель падала
       у владельца на первом клике. Требуем приведение обеих сторон к тексту:
       такое сравнение переживает любой тип колонки. */
    const bodyCmp = mig.match(/=\s*p_agency_id/g) || [];
    const safeCmp = mig.match(/::text\s*=\s*p_agency_id/g) || [];
    assert(bodyCmp.length > 0, "в функции нет ни одного сравнения с p_agency_id — разбор сломался");
    assertEqual(safeCmp.length, bodyCmp.length,
      `сравнение с p_agency_id без ::text (${bodyCmp.length - safeCmp.length} шт.) — вернётся «operator does not exist: text = uuid»`);
    assert(/admin_get_agency_activity\(p_agency_id text\)/.test(mig),
      "параметр функции снова не text — клиент шлёт agency_id строкой");
    assert(/drop function if exists public\.admin_get_agency_activity\(uuid\)/i.test(mig),
      "старая перегрузка (uuid) не удалена — PostgREST не выберет между двумя одноимёнными функциями");

    // Нужны ОБА revoke: право приходит и от PUBLIC (PostgreSQL), и от default
    // privileges Supabase — по отдельности ни один не снимает доступ анониму.
    assert(/revoke execute on function public\.admin_get_agency_activity\(text\) from public/i.test(mig),
      "нет revoke ... from public");
    assert(/revoke execute on function public\.admin_get_agency_activity\(text\) from anon/i.test(mig),
      "нет revoke ... from anon");
    assert(/grant\s+execute on function public\.admin_get_agency_activity\(text\) to authenticated/i.test(mig),
      "право не выдано authenticated — админ не сможет позвать функцию");

    // Наружу — только числа. Имя сделки или контакт клиента в ответе означал бы,
    // что админка читает чужую переписку, а не смотрит за использованием продукта.
    const payload = (mig.match(/json_build_object\(([\s\S]*?)\n  \) into res/) || [])[1] || "";
    assert(payload, "не удалось разобрать состав ответа — проверка приватности не выполнена");
    const leaky = ["'name'", "'client'", "'phone'", "'email'", "'deal_name'", "'title'"].filter((k) => payload.includes(k));
    assertEqual(leaky.length, 0, "в ответ попали не-числовые поля: " + leaky.join(", "));

    // Имя RPC в клиенте должно совпадать с именем функции: опечатка здесь молча
    // превращается в «Не вышло: function does not exist» уже у владельца на экране.
    assert(/rpc\("admin_get_agency_activity"/.test(app), "app.js зовёт другую RPC — имя разошлось с миграцией");
  });

  // Цена лежит в ДВУХ файлах: витрина (PLANS в app.js, цена месяца) и касса (PLANS в
  // Edge Function create-payment, где считается сумма счёта). Разъезжаются они молча
  // и в самом дорогом месте: человек видит одну цену, а ЮKassa просит другую. Именно
  // это и грозило 08.08.2026, когда цены поднимали с 490 до 890 ₽ — файлов два, правка
  // одна. Заодно сверяем подписи «Экономия N%»: их тоже пишут руками.
  await test("цены: витрина и касса сходятся, скидки посчитаны верно", () => {
    const app = readSrc("app.js");
    const ef = readSrc("supabase/functions/create-payment/index.ts");

    const shop = {};
    const planRe = /\{\s*id:\s*"(month\d+|year)",[^}]*?price:\s*(\d+)[^}]*?save:\s*"([^"]*)"[^}]*?months:\s*(\d+)/g;
    let m;
    while ((m = planRe.exec(app))) shop[m[1]] = { price: Number(m[2]), save: m[3], months: Number(m[4]) };
    // Если разметку PLANS изменят, тест обязан упасть здесь, а не «пройти на нуле».
    assertEqual(Object.keys(shop).length, 4, "в PLANS (app.js) распознаны не все платные тарифы: " + JSON.stringify(shop));

    const cash = {};
    const efRe = /(month\d+|year):\s*\{\s*amount:\s*(\d+),\s*days:\s*(\d+)/g;
    while ((m = efRe.exec(ef))) cash[m[1]] = { amount: Number(m[2]), days: Number(m[3]) };
    assertEqual(Object.keys(cash).length, 4, "в кассе (create-payment) распознаны не все тарифы: " + JSON.stringify(cash));

    const base = shop.month1 ? shop.month1.price : 0;
    assert(base > 0, "в PLANS нет тарифа month1 — не от чего считать скидку");

    const bad = [];
    for (const id of Object.keys(shop)) {
      const p = shop[id];
      if (!cash[id]) { bad.push(`${id}: есть на витрине, нет в кассе`); continue; }

      const want = p.price * p.months;
      if (cash[id].amount !== want) {
        bad.push(`${id}: витрина ${p.price} ₽ × ${p.months} мес = ${want} ₽, а счёт на ${cash[id].amount} ₽`);
      }
      const wantDays = p.months === 12 ? 365 : p.months * 30;
      if (cash[id].days !== wantDays) bad.push(`${id}: касса открывает доступ на ${cash[id].days} дн. вместо ${wantDays}`);

      // Длинный период не может стоить дороже месяца — иначе лесенка перевёрнута.
      if (p.months > 1 && p.price >= base) bad.push(`${id}: ${p.price} ₽/мес не дешевле месяца (${base} ₽)`);

      if (p.months > 1) {
        const wantPct = Math.round((1 - p.price / base) * 100);
        const shown = p.save.match(/(\d+)/);
        if (!shown || Number(shown[1]) !== wantPct) bad.push(`${id}: подпись «${p.save}» вместо «Экономия ${wantPct}%»`);
      }
    }
    assertEqual(bad.length, 0, "тарифы разошлись:\n  " + bad.join("\n  "));
  });

  await test("каталог: ни одной позиции-двойника — ни по id, ни по названию", () => {
    /* Каталог правится вручную и растёт годами: при добавлении легко не заметить,
       что «нарезки для соцсетей» или «базовая ретушь» там уже есть — названия
       разные, смысл один. Двойник в каталоге дороже опечатки: в сметах он даёт
       две строки за одну работу, а в поиске — два одинаковых ответа. */
    const start = app.indexOf("const BASE_ITEMS = [");
    assert(start > 0, "не нашёлся BASE_ITEMS");
    const block = app.slice(start, app.indexOf("\n      ];", start));
    const items = [...block.matchAll(/item\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g)]
      .map((m) => ({ id: m[1], cat: m[2], name: m[3] }));
    assert(items.length > 100, "разбор каталога дал подозрительно мало позиций: " + items.length);

    const seenId = new Map();
    const seenName = new Map();
    const dupes = [];
    for (const it of items) {
      if (seenId.has(it.id)) dupes.push(`id «${it.id}» уже занят (${seenId.get(it.id)})`);
      else seenId.set(it.id, it.name);
      // Сравниваем без регистра и лишних пробелов: «Монтаж  ролика» и «монтаж ролика» —
      // для человека в списке это одна и та же строка.
      const key = it.name.toLowerCase().replace(/\s+/g, " ").trim();
      if (seenName.has(key)) dupes.push(`название «${it.name}» повторяется (${seenName.get(key)} и ${it.id})`);
      else seenName.set(key, it.id);
    }
    assert(!dupes.length, "в каталоге завелись двойники:\n  " + dupes.join("\n  "));
  });

  await test("каталог: у каждой позиции есть цена, единица и описание", () => {
    const start = app.indexOf("const BASE_ITEMS = [");
    const block = app.slice(start, app.indexOf("\n      ];", start));
    // Полная сигнатура: id, категория, название, описание, модель расчёта, цена, единица.
    const full = [...block.matchAll(/item\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]*)",\s*"([^"]+)",\s*(\d+),\s*"([^"]*)"/g)];
    const ids = [...block.matchAll(/item\("([^"]+)"/g)].map((m) => m[1]);
    assertEqual(full.length, ids.length,
      "часть позиций записана не по общей форме (id, категория, название, описание, модель, цена, единица) — их не разобрать");
    const broken = full
      .filter((m) => !m[4].trim() || !m[7].trim())
      .map((m) => m[1] + (m[4].trim() ? " без единицы" : " без описания"));
    assert(!broken.length, "позиции без описания или единицы измерения: " + broken.join(", "));
    // Ноль допустим ровно одному — «Прочий расход», куда вписывают сумму руками.
    const freebies = full.filter((m) => Number(m[6]) === 0).map((m) => m[1]);
    assert(freebies.length <= 1, "позиций с нулевой ценой больше одной: " + freebies.join(", "));
  });

};
