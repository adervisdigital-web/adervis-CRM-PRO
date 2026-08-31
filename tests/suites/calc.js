// Публичный калькулятор (?calc=…) — продающий мастер из трёх шагов, вход без
// регистрации (PLAN.md §4, P0). Это не UI-каталог, а отдельный незалогиненный
// контур со своими рисками:
//   • не должен требовать auth gate / показывать сайдбар обычного приложения;
//   • НЕ должен трогать localStorage обычного приложения (визитёр может быть
//     залогинен в свой настоящий аккаунт в этом же браузере — см. app.js, save()
//     содержит явный guard `if (_calcMode) return;`);
//   • ссылка-шеринг должна кодировать выбор в URL и восстанавливаться из него;
//   • заявка обязана либо уйти хосту, либо честно показать контакты — молчаливой
//     формы «отправили в никуда» на этом экране быть не может.
const { assert, assertEqual, bootLocal } = require("../harness");

async function bootCalc(browser, baseUrl, query = "calc=1") {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${baseUrl}/index.html?${query}`, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const el = document.getElementById("appContent");
    return el && el.innerHTML.trim().length > 0;
  }, { timeout: 10000 });
  return { context, page, errors };
}

// Сумма итога числом: "от 62 000 ₽" → 62000. Пробелы бывают неразрывными.
async function resultSum(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".calc-result-sum");
    if (!el) return null;
    const digits = (el.textContent || "").replace(/[^\d]/g, "");
    return digits ? Number(digits) : null;
  });
}

// Проходит мастер до результата: первая задача → предложенный уровень → шаг 3.
async function walkToResult(page) {
  await page.click(".calc-need");
  await page.waitForSelector(".calc-tier", { timeout: 5000 });
  await page.click(".calc-tier-pick");
  await page.evaluate(() => window.app.calcGoStep(3));
  await page.waitForSelector(".calc-result-sum", { timeout: 5000 });
}

/* Калькулятор с каталогом конкретного агентства (?a=…). Ответ get_public_catalog
   подменяем на маршруте: Supabase в прогоне нет, а проверять надо настоящий путь
   наложения каталога на состояние, а не заглушку. */
async function bootCalcWithCatalog(browser, baseUrl, catalog, agency = "11111111-2222-3333-4444-555555555555") {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await context.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("/rest/v1/rpc/get_public_catalog")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) });
    }
    const own = u.startsWith(baseUrl) || u.startsWith("data:") || u.startsWith("about:") || u.startsWith("blob:");
    return own ? route.continue() : route.fulfill({ status: 204, body: "", headers: { "content-type": "text/plain" } });
  });
  await page.goto(`${baseUrl}/index.html?calc=1&a=${agency}`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  return { context, page, errors };
}

const calcCatalog = (over) => Object.assign({
  company: { name: "Studio Probe", logo: "" },
  customItems: [], catalogOverrides: {}, packages: [],
  catalogPrices: {}, hiddenItems: {}, permanentlyDeleted: {},
}, over);

/* Публичный бриф (?brief=…) — вторая незалогиненная поверхность рядом с
   калькулятором и ПЕРВАЯ точка контакта: студия шлёт ссылку до КП, заполняет её
   человек, который студию ещё не выбрал. Своего шаблона у большинства студий нет,
   поэтому смотрим именно дефолтный набор вопросов — то, что видит заказчик, если
   студия ничего не настраивала. */
async function bootBrief(browser, baseUrl, opts = {}) {
  const { agency = { name: "Студия «Полёт»", logo: "" }, type = "video", width = 390, height = 844 } = opts;
  const context = await browser.newContext(
    width < 700
      ? { viewport: { width, height }, hasTouch: true, isMobile: true }
      : { viewport: { width, height } }
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  // Общая заглушка ПЕРВОЙ: Playwright примеряет маршруты в обратном порядке.
  await context.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(baseUrl) || u.startsWith("data:") || u.includes("supabase.co")) return route.continue();
    return route.fulfill({ status: 204, body: "", headers: { "content-type": "text/plain" } });
  });
  await context.route("**/*.supabase.co/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  // null — «своего шаблона нет»: форма обязана открыться на дефолтных вопросах.
  await context.route("**/rest/v1/rpc/get_brief_template*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await context.route("**/rest/v1/rpc/get_brief_agency*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(agency) }));

  await page.goto(`${baseUrl}/index.html?brief=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&type=${type}`, { waitUntil: "load" });
  await page.waitForFunction(() => (document.getElementById("appContent")?.innerText || "").length > 40, { timeout: 12000 });
  await page.waitForTimeout(700);
  return { context, page, errors };
}

module.exports = async function ({ browser, baseUrl, test, shotDir }) {
  /* Ради чего вся эта витрина и существует: студия ставит калькулятор себе на сайт,
     и посетитель обязан видеть ЕЁ прайс. До 05.08 в адресе не было агентства вовсе,
     и любая студия показывала своим посетителям цены ADERVIS — прямого конкурента.
     Сторож меряет результат: поднимаем цену съёмочных позиций в каталоге агентства
     и требуем, чтобы суммы на экране изменились. Заодно — что имя студии подставлено.

     Проверка «числа изменились», а не «равны N»: конкретные суммы зависят от
     каталога и сценариев мастера, а свойство «витрина следует за прайсом студии»
     переживёт и смену каталога, и переверстку карточек. */
  await test("калькулятор показывает цены агентства, а не встроенный прайс", async () => {
    const sums = async (catalog) => {
      const { context, page, errors } = await bootCalcWithCatalog(browser, baseUrl, catalog);
      const nums = await page.evaluate(() => {
        const t = document.body.innerText.replace(/ /g, " ");
        return (t.match(/[\d][\d\s]{2,}\s*₽/g) || []).map((s) => s.replace(/\D/g, ""));
      });
      const name = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
      await context.close();
      return { nums, name, errors };
    };

    const plain = await sums(calcCatalog({}));
    assert(plain.nums.length >= 3, "на первом экране калькулятора не нашлось сумм: " + plain.nums.join(", "));
    assert(/Studio Probe/i.test(plain.name), "имя студии из каталога не попало на экран");
    assertEqual(plain.errors.length, 0, "ошибки на экране калькулятора: " + plain.errors.join(" | "));

    const raised = await sums(calcCatalog({
      catalogPrices: { camera_operator: 99999, camera_pro: 99999, shoot_plan: 99999 },
    }));
    assert(
      raised.nums.join() !== plain.nums.join(),
      "цены агентства не влияют на витрину — посетитель видит встроенный прайс: " + plain.nums.join(", ")
    );
  });

  /* Ссылка и код для встраивания собирались от адреса ТОГО окна, из которого их
     копируют. Владелец открывает приложение и локально (Live Server), и тогда «Код
     для сайта» уносил на чужой сайт iframe со ссылкой на его собственный
     компьютер — калькулятор не открылся бы ни у одного посетителя, а заметить это
     можно только с чужого экрана. Наружу теперь всегда боевой адрес; кнопка
     «Открыть как посетитель» остаётся на текущем — правки проверяют там, где они
     есть. Заодно проверяем, что панель живёт в «Интеграциях», а не в «Данных». */
  await test("настройки: ссылка на калькулятор — боевая, панель в «Интеграциях»", async () => {
    const { bootLocal } = require("../harness");
    const { context, page } = await bootLocal(browser, baseUrl, { width: 1200, height: 900 });

    await page.evaluate(() => {
      window.app.go("settings");
      window.app._setSettingsTab("integrations");
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      if (!st.publicCalcEnabled) window.app.togglePublicCalc();
    });
    await page.waitForTimeout(300);

    const onIntegrations = await page.evaluate(() => {
      const el = document.getElementById("appContent");
      const link = el.querySelector(".brief-link-url");
      const visitor = [...el.querySelectorAll("a")].find((a) => /посетител/i.test(a.textContent));
      return {
        hasPanel: /Публичный калькулятор/.test(el.innerText),
        link: link ? link.textContent.trim() : "",
        visitorHref: visitor ? visitor.getAttribute("href") : "",
      };
    });
    assert(onIntegrations.hasPanel, "панели калькулятора нет во вкладке «Интеграции»");
    assert(onIntegrations.link, "не отрисована ссылка на калькулятор");
    assert(
      !/localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\./.test(onIntegrations.link),
      "наружу уходит локальный адрес: " + onIntegrations.link
    );
    assert(/^https:\/\//.test(onIntegrations.link), "ссылка не по https: " + onIntegrations.link);
    assert(
      /127\.0\.0\.1|localhost/.test(onIntegrations.visitorHref),
      "«Открыть как посетитель» увело с текущего адреса: " + onIntegrations.visitorHref
    );

    const onData = await page.evaluate(() => {
      window.app._setSettingsTab("data");
      return null;
    });
    await page.waitForTimeout(250);
    const stillOnData = await page.evaluate(() =>
      /Публичный калькулятор/.test(document.getElementById("appContent").innerText));
    assert(!stillOnData, "панель калькулятора осталась и во вкладке «Данные» — она задвоена");

    await context.close();
  });

  await test("?calc=1 рендерит калькулятор без auth gate и без сайдбара", async () => {
    const { context, page, errors } = await bootCalc(browser, baseUrl, "calc=1");
    const state = await page.evaluate(() => ({
      hasCalcPage: !!document.querySelector(".calc-page"),
      needs: document.querySelectorAll(".calc-need").length,
      sidebarEmpty: (document.getElementById("appSidebar") || {}).innerHTML === "",
      authGateEmpty: (document.getElementById("authGateContainer") || {}).innerHTML === "",
      bodyClass: document.body.className,
    }));
    assert(state.hasCalcPage, "не отрисован .calc-page");
    assert(state.needs >= 6, "на первом шаге мало карточек задач: " + state.needs);
    assert(state.sidebarEmpty, "сайдбар обычного приложения виден в публичном калькуляторе");
    assert(state.authGateEmpty, "auth gate показан поверх калькулятора — регистрация не должна требоваться");
    assert(state.bodyClass.includes("calc-mode"), "body не получил класс calc-mode");
    assertEqual(errors.length, 0, "ошибки консоли: " + errors.slice(0, 3).join(" | "));
    await context.close();
  });

  await test("мастер проходит три шага: задача → уровень → цена с составом работ", async () => {
    const { context, page, errors } = await bootCalc(browser, baseUrl, "calc=1");

    await page.click(".calc-need");
    const step2 = await page.evaluate(() => ({
      tiers: document.querySelectorAll(".calc-tier").length,
      preselected: document.querySelectorAll(".calc-tier.on").length,
      onStep: (document.querySelector(".calc-step.on") || {}).textContent || "",
    }));
    assertEqual(step2.tiers, 3, "на шаге «уровень» должно быть три пакета");
    assertEqual(step2.preselected, 1, "средний уровень должен быть выбран заранее — иначе шаг выглядит пустым");
    assert(step2.onStep.includes("Уровень"), "индикатор шагов не перешёл на «Уровень»: " + step2.onStep);

    await page.evaluate(() => window.app.calcGoStep(3));
    await page.waitForSelector(".calc-result-sum", { timeout: 5000 });
    const step3 = await page.evaluate(() => ({
      sum: (document.querySelector(".calc-result-sum") || {}).textContent || "",
      stages: document.querySelectorAll(".calc-inc-col").length,
      hasCta: !!document.querySelector(".calc-result-cta"),
    }));
    assert(/от/.test(step3.sum) && /\d/.test(step3.sum), "итог не выглядит как «от N ₽»: " + step3.sum);
    assert(step3.stages >= 2, "состав работ не разложен по этапам: " + step3.stages);
    assert(step3.hasCta, "нет главного действия «Получить точную смету»");
    assertEqual(errors.length, 0, "ошибки консоли: " + errors.slice(0, 3).join(" | "));
    await context.close();
  });

  await test("цена на карточке уровня равна итогу на шаге результата", async () => {
    // Раньше карточка считала пакет упрощённо (сумма базовых цен позиций), а итог —
    // полной математикой каталога: клиент видел одно число, а на следующем экране
    // другое. Проверяем все три уровня первой задачи разом.
    const { context, page } = await bootCalc(browser, baseUrl, "calc=1");
    await page.click(".calc-need");
    await page.waitForSelector(".calc-tier", { timeout: 5000 });
    const tiers = await page.evaluate(() =>
      [...document.querySelectorAll(".calc-tier")].map(card => ({
        id: ((card.querySelector(".calc-tier-pick").getAttribute("onclick") || "").match(/calcPickPkg\('([^']+)'\)/) || [])[1],
        price: Number((card.querySelector(".calc-tier-price").textContent || "").replace(/[^\d]/g, "")),
      }))
    );
    assertEqual(tiers.length, 3, "ожидалось три уровня");
    for (const tier of tiers) {
      assert(tier.id && tier.price > 0, "не разобрал карточку уровня: " + JSON.stringify(tier));
      await page.evaluate((id) => { window.app.calcPickPkg(id); window.app.calcGoStep(3); }, tier.id);
      await page.waitForSelector(".calc-result-sum", { timeout: 5000 });
      assertEqual(await resultSum(page), tier.price, `уровень ${tier.id}: на карточке ${tier.price}, в итоге другое число`);
      await page.evaluate(() => window.app.calcGoStep(2));
      await page.waitForSelector(".calc-tier", { timeout: 5000 });
    }
    await context.close();
  });

  await test("дни съёмки и доп. опции увеличивают итог", async () => {
    const { context, page } = await bootCalc(browser, baseUrl, "calc=1");
    await walkToResult(page);
    const base = await resultSum(page);
    assert(base > 0, "итог не посчитался: " + base);

    // Опция из каталога — сумма обязана вырасти ровно потому, что позиция добавилась
    // в ту же смету, а не потому что где-то зашит отдельный множитель.
    const extraId = await page.evaluate(() => {
      const btn = document.querySelector(".calc-extra");
      const m = (btn.getAttribute("onclick") || "").match(/calcToggleExtra\('([^']+)'\)/);
      return m ? m[1] : null;
    });
    assert(extraId, "не нашёл кнопку доп. опции");
    await page.evaluate((id) => window.app.calcToggleExtra(id), extraId);
    await page.waitForTimeout(100);
    const withExtra = await resultSum(page);
    assert(withExtra > base, `опция не увеличила итог: было ${base}, стало ${withExtra}`);

    // Два съёмочных дня: дороже смены И аренда техники (rentalDays), иначе дни
    // считались бы только по людям — классическая недосчитанная смета.
    await page.evaluate(() => window.app.calcSetDays(2));
    await page.waitForTimeout(100);
    const twoDays = await resultSum(page);
    assert(twoDays > withExtra, `второй съёмочный день не изменил итог: ${withExtra} → ${twoDays}`);

    // Срочность — отдельной видимой строкой, а не тихой наценкой в общей сумме.
    await page.evaluate(() => window.app.calcSetRush(true));
    await page.waitForTimeout(100);
    const rush = await page.evaluate(() => ({
      sum: (document.querySelector(".calc-result-sum") || {}).textContent || "",
      note: (document.querySelector(".calc-result-rush") || {}).textContent || "",
    }));
    assert(rush.note.includes("срочный"), "надбавка за срочность не показана отдельно: " + rush.note);
    await context.close();
  });

  /* Ссылка на конкретный пакет (?calc=pkg~<id>) — то, что кладут в личное сообщение:
     не общий калькулятор, а расчёт под задачу собеседника. Главное её свойство —
     сумма обязана совпадать с ценой пакета в CRM. Кодировать пакет строками
     «id:кол-во:смен» было нельзя ровно поэтому: у состава бывают свои настройки
     (два оператора, полсмены, своя цена), формат их не выражает, и в сообщение
     уехала бы одна цена, а на витрине у студии стояла другая. */
  await test("ссылка на пакет показывает ту же сумму, что карточка пакета", async () => {
    const { context, page } = await bootLocal(browser, baseUrl);
    // Цену берём С КАРТОЧКИ, а не из внутренней функции: тест обязан мерить то, что
    // видит человек, — иначе он переживёт подмену источника цены и ничего не поймает.
    await page.evaluate(() => window.app.go("packages"));
    await page.waitForSelector(".package-card", { timeout: 8000 });
    const expected = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll(".package-card").forEach((card) => {
        const id = card.dataset.pkgId;
        const priceEl = card.querySelector(".pkg-card-price");
        if (!id || !priceEl) return;
        const digits = (priceEl.textContent || "").replace(/[^0-9]/g, "");
        if (digits) out[id] = Number(digits);
      });
      return out;
    });
    await context.close();

    const ids = Object.keys(expected).slice(0, 4);
    assert(ids.length >= 3,
      "на экране пакетов не нашлось карточек с ценой: " + JSON.stringify(expected).slice(0, 200));

    for (const id of ids) {
      const { context: c2, page: p2 } = await bootCalc(browser, baseUrl, "calc=pkg~" + id);
      await p2.waitForSelector(".calc-result-sum", { timeout: 8000 });
      const shown = await resultSum(p2);
      await c2.close();
      assertEqual(shown, expected[id],
        "пакет " + id + ": в CRM " + expected[id] + " ₽, по ссылке " + shown + " ₽ — в сообщение уйдёт не та цена");
    }
  });

  /* Публичный калькулятор брал состав пакета ТОЛЬКО из встроенного набора, хотя
     каталог агентства приезжает в state.packages. Студия, поправившая состав
     (убрала позицию, добавила свою), показывала посетителю нашу версию пакета — при
     том что цены позиций брались её. Смешанная правда хуже обеих. */
  await test("калькулятор берёт состав пакета агентства, а не встроенный", async () => {
    const trimmed = {
      id: "social_start",
      name: "Соцсети: старт",
      cat: "social",
      desc: "Урезанный студией пакет",
      items: ["director"],
      notes: [],
    };
    const { context, page } = await bootCalcWithCatalog(browser, baseUrl, calcCatalog({ packages: [trimmed] }));
    const base = page.url().split("?")[0];
    await page.goto(base + "?calc=pkg~social_start&a=11111111-2222-3333-4444-555555555555", { waitUntil: "load" });
    await page.waitForTimeout(1800);
    const res = await page.evaluate(() => ({
      sum: (document.querySelector(".calc-result-sum") || {}).textContent || "",
      lines: [...document.querySelectorAll(".calc-inc-list li, .calc-included li")].map((li) => li.textContent.trim()),
      text: document.body.innerText,
    }));
    await context.close();
    assert(res.sum, "расчёт по ссылке на пакет не отрисовался");
    assert(Number(res.sum.replace(/[^0-9]/g, "")) > 0, "сумма нулевая: " + res.sum);
    // Во встроенном social_start есть субтитры и обложка; студия оставила режиссёра.
    assert(!res.text.includes("Субтитры") && !res.text.includes("Обложка"),
      "в составе остались позиции ВСТРОЕННОГО пакета, хотя студия оставила одну: " +
        (res.lines.join(", ") || res.text.slice(0, 200)));
  });

  /* Заявка из калькулятора, открытого ССЫЛКОЙ (а не в iframe на сайте студии).
     Так и задуман главный канал плана: «в сообщении готовая ссылка на расчёт».
     До 19.08 в этом режиме форма не отправляла ничего: расчёт копировался в буфер,
     а на экране показывались контакты ADERVIS — Telegram сервиса, его телефон и
     почта. Посетитель ЧУЖОЙ студии, посчитав смету, получал предложение прислать
     её конкуренту. Это увод лида, а не косметика.

     Проверяем оба конца: заявка уходит агентству (та же анонимная вставка, что у
     публичного брифа) и на экране стоят контакты студии. */
  await test("заявка со ссылки уходит агентству, а не в буфер обмена", async () => {
    const agency = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { context, page, errors } = await bootCalcWithCatalog(browser, baseUrl, calcCatalog({
      company: { name: "Studio Probe", logo: "", phone: "+7 900 111-22-33", email: "hi@studio-probe.ru", site: "" },
    }), agency);

    // Приёмник заявок: ловим тело вставки. Общая заглушка в bootCalcWithCatalog
    // отвечает 204 на всё внешнее, поэтому свой маршрут регистрируем ПОСЛЕ неё —
    // Playwright примеряет маршруты в обратном порядке.
    const inserts = [];
    await context.route("**/rest/v1/brief_submissions*", (route) => {
      inserts.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    });

    await walkToResult(page);
    await page.evaluate(() => {
      window.app.calcOpenLead();
      window.app.calcSetLead("name", "Иван Заказчиков");
      window.app.calcSetLead("contact", "+7 999 000-11-22");
      window.app.calcSetLead("agree", true);
      window.app.calcSubmitLead();
    });
    await page.waitForTimeout(900);

    assertEqual(inserts.length, 1, "заявка не ушла агентству: вставок в brief_submissions " + inserts.length);
    const row = inserts[0];
    assertEqual(row.agency_id, agency, "заявка ушла не тому агентству: " + row.agency_id);
    assertEqual(row.client_name, "Иван Заказчиков", "имя не доехало: " + row.client_name);
    assert(String(row.client_phone || "").includes("999"), "телефон не доехал: " + row.client_phone);
    assert(String(row.description || "").includes("Заявка из калькулятора"),
      "в заявке нет самого расчёта: " + String(row.description).slice(0, 80));
    assert(!String(row.description || "").includes("Имя: "),
      "имя продублировано в описании, хотя для него есть колонка");

    const screen = await page.evaluate(() => document.body.innerText.replace(/s+/g, " "));
    assert(screen.includes("Заявка отправлена"),
      "человеку показали «расчёт скопирован» вместо отправленной заявки: " + screen.slice(0, 160));
    assertEqual(errors.length, 0, "ошибки на экране калькулятора: " + errors.join(" | "));
    await context.close();
  });

  await test("после заявки показаны контакты студии, а не сервиса", async () => {
    const { context, page } = await bootCalcWithCatalog(browser, baseUrl, calcCatalog({
      company: { name: "Studio Probe", logo: "", phone: "+7 900 111-22-33", email: "hi@studio-probe.ru", site: "studio-probe.ru" },
    }), "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    await context.route("**/rest/v1/brief_submissions*", (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: "[]" }));

    await walkToResult(page);
    await page.evaluate(() => {
      window.app.calcOpenLead();
      window.app.calcSetLead("name", "Иван Заказчиков");
      window.app.calcSetLead("contact", "hi@example.com");
      window.app.calcSetLead("agree", true);
      window.app.calcSubmitLead();
    });
    await page.waitForTimeout(900);

    const links = await page.evaluate(() =>
      [...document.querySelectorAll(".calc-lead-contacts a")].map((a) => a.getAttribute("href") || ""));
    assert(links.length, "после заявки не показано ни одного контакта");
    for (const bad of ["Adervis_digital", "79223018880", "adervis.digital@gmail.com"]) {
      assert(!links.join(" ").includes(bad),
        "на экране заявки остались контакты сервиса (" + bad + "): " + links.join(", "));
    }
    assert(links.some((h) => h.includes("hi@studio-probe.ru")), "нет почты студии: " + links.join(", "));
    assert(links.some((h) => h.includes("79001112233")), "нет телефона студии: " + links.join(", "));
    await context.close();
  });

  /* Ссылка, которой делятся, — главный канал из плана: «в сообщении готовая ссылка
     на расчёт, а не приглашение зарегистрироваться». Собиралась она от pathname и
     теряла ?a=<агентство>, то есть открывалась на ВСТРОЕННОМ прайсе ADERVIS. Тот же
     адрес уходит в текст заявки, поэтому студия получала лид, где числа из её
     каталога, а ссылка ведёт на цены конкурента. */
  await test("ссылка на расчёт не теряет агентство", async () => {
    const agency = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { context, page, errors } = await bootCalcWithCatalog(browser, baseUrl, calcCatalog({
      catalogPrices: { camera_operator: 77777 },
    }), agency);
    await walkToResult(page);

    const shared = await page.evaluate(async () => {
      window.__copied = null;
      navigator.clipboard.writeText = (text) => { window.__copied = text; return Promise.resolve(); };
      window.app.calcShare();
      await new Promise((r) => setTimeout(r, 80));
      // Тот же адрес уходит клиенту в тексте заявки — проверяем оба места сразу.
      const lead = document.body.innerHTML;
      return { url: window.__copied, lead };
    });
    assert(shared.url, "ссылка не скопировалась");
    assert(shared.url.includes("a=" + agency),
      "в ссылке на расчёт нет агентства — она откроется на встроенном прайсе: " + shared.url);
    assertEqual(errors.length, 0, "ошибки на экране калькулятора: " + errors.join(" | "));
    await context.close();
  });

  await test("ссылка на расчёт восстанавливает выбор целиком", async () => {
    const { context, page } = await bootCalc(browser, baseUrl, "calc=1");
    await walkToResult(page);
    const extraId = await page.evaluate(() => {
      const btn = document.querySelector(".calc-extra");
      const m = (btn.getAttribute("onclick") || "").match(/calcToggleExtra\('([^']+)'\)/);
      return m ? m[1] : null;
    });
    await page.evaluate((id) => window.app.calcToggleExtra(id), extraId);
    await page.evaluate(() => window.app.calcSetDays(2));
    await page.waitForTimeout(100);
    const expected = await resultSum(page);

    // Подменяем clipboard, чтобы поймать сгенерированную ссылку без реального доступа
    // к системному буферу (в headless Chromium он недоступен без спец-разрешений).
    await page.evaluate(() => {
      window.__copied = null;
      navigator.clipboard.writeText = (text) => { window.__copied = text; return Promise.resolve(); };
    });
    await page.evaluate(() => window.app.calcShare());
    await page.waitForTimeout(80);
    const url = await page.evaluate(() => window.__copied);
    assert(url && url.includes("calc="), "скопированная ссылка не содержит ?calc=: " + url);

    const query = new URL(url).search.slice(1);
    const { context: c2, page: p2 } = await bootCalc(browser, baseUrl, query);
    await p2.waitForSelector(".calc-result-sum", { timeout: 5000 });
    assertEqual(await resultSum(p2), expected, "ссылка открылась с другой суммой — выбор восстановился не полностью");
    await c2.close();
    await context.close();
  });

  await test("калькулятор не трогает состояние обычного приложения в том же браузере", async () => {
    // Сценарий риска: посетитель уже «залогинен» (local mode) в этом браузере,
    // у него есть реальная смета. Открывает ?calc=1, играет с калькулятором,
    // закрывает вкладку. localStorage обычного приложения должен остаться нетронут —
    // это и есть заявленное поведение save()/_flushStateOnUnload в calc-режиме.
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();

    await page.addInitScript(() => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
    });
    await page.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await page.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 10000 });
    await page.evaluate(() => window.app.seedDemoDeal());
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => localStorage.getItem("adervis_pro_381_state"));
    assert(before && before.includes('"savedProjects"'), "не удалось засеять исходное состояние");

    await page.goto(baseUrl + "/index.html?calc=1", { waitUntil: "load" });
    await page.waitForFunction(() => !!document.querySelector(".calc-page"), { timeout: 10000 });
    await walkToResult(page);
    await page.evaluate(() => window.app.calcSetDays(3));
    await page.waitForTimeout(100);

    // Уходим со страницы (триггерит pagehide) и проверяем localStorage.
    await page.goto(baseUrl + "/index.html", { waitUntil: "load" });
    const after = await page.evaluate(() => localStorage.getItem("adervis_pro_381_state"));
    assertEqual(after, before, "состояние обычного приложения изменилось после игры в калькуляторе");

    await context.close();
  });

  await test("форма заявки не отправляется без имени и контакта", async () => {
    const { context, page } = await bootCalc(browser, baseUrl, "calc=1");
    await walkToResult(page);
    await page.evaluate(() => window.app.calcOpenLead());
    await page.waitForSelector("form.calc-lead", { timeout: 5000 });

    await page.evaluate(() => window.app.calcSubmitLead());
    await page.waitForTimeout(80);
    assert(await page.evaluate(() => !!document.querySelector(".calc-lead-err")), "пустая форма ушла без ошибки");

    // Имя и контакт есть, согласия нет — 152-ФЗ, отправлять нельзя.
    await page.evaluate(() => {
      window.app.calcSetLead("name", "Иван");
      window.app.calcSetLead("contact", "+7 900 000-00-00");
      window.app.calcSubmitLead();
    });
    await page.waitForTimeout(80);
    const err = await page.evaluate(() => (document.querySelector(".calc-lead-err") || {}).textContent || "");
    assert(err.includes("согласие"), "форма ушла без согласия на обработку персональных данных: " + err);
    await context.close();
  });

  await test("заявка уходит странице-хосту, а не в никуда", async () => {
    // Лид-прокси сайта принимает POST только с adervis.ru, поэтому встроенный
    // калькулятор передаёт текст заявки родительской странице. Проверяем сам
    // контракт: сообщение уходит, ответ хоста меняет экран на «отправлено».
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await context.newPage();
    const src = encodeURIComponent("/index.html?calc=1");
    await page.goto(`${baseUrl}/tests/fixtures/iframe-host.html?src=${src}`, { waitUntil: "load" });
    const frame = page.frames().find(f => f.url().includes("calc=1"));
    assert(frame, "iframe не создался/не загрузился");
    await frame.waitForFunction(() => !!document.querySelector(".calc-page"), { timeout: 10000 });

    // Хост записывает заявку и отвечает «ок» — как это делает /pro/smeta/.
    await page.evaluate(() => {
      window.__lead = null;
      window.addEventListener("message", (e) => {
        const d = e.data;
        if (!d || d.type !== "adervis-calc-lead") return;
        window.__lead = d;
        e.source.postMessage({ type: "adervis-calc-lead-result", id: d.id, ok: true }, "*");
      });
    });

    await frame.click(".calc-need");
    await frame.waitForSelector(".calc-tier", { timeout: 5000 });
    await frame.evaluate(() => window.app.calcGoStep(3));
    await frame.waitForSelector(".calc-result-cta", { timeout: 5000 });
    await frame.evaluate(() => {
      window.app.calcOpenLead();
      window.app.calcSetLead("name", "Иван");
      window.app.calcSetLead("contact", "@ivan");
      window.app.calcSetLead("agree", true);
      window.app.calcSubmitLead();
    });
    await page.waitForTimeout(200);

    const lead = await page.evaluate(() => window.__lead);
    assert(lead && typeof lead.text === "string", "хост не получил заявку из калькулятора");
    assert(lead.text.includes("Иван") && lead.text.includes("@ivan"), "в заявке нет контактных данных: " + lead.text);
    assert(/от\s*[\d\s ]+/.test(lead.text), "в заявке нет посчитанной суммы: " + lead.text);
    const done = await frame.evaluate(() => (document.querySelector(".calc-lead.done") || {}).textContent || "");
    assert(done.includes("отправлена"), "экран не показал, что заявка отправлена: " + done);
    await context.close();
  });

  await test("без хоста заявка не пропадает молча — показываются контакты", async () => {
    // Калькулятор, открытый напрямую (не в iframe), бэкенда не имеет. Форма,
    // которая делает вид, что отправила, — худший из возможных исходов.
    const { context, page } = await bootCalc(browser, baseUrl, "calc=1");
    await walkToResult(page);
    await page.evaluate(() => {
      window.app.calcOpenLead();
      window.app.calcSetLead("name", "Иван");
      window.app.calcSetLead("contact", "ivan@example.com");
      window.app.calcSetLead("agree", true);
      window.app.calcSubmitLead();
    });
    await page.waitForTimeout(150);
    const fallback = await page.evaluate(() => {
      const el = document.querySelector(".calc-lead.done");
      return {
        text: el ? el.textContent : "",
        links: [...document.querySelectorAll(".calc-lead-contacts a")].map(a => a.getAttribute("href")),
      };
    });
    assert(fallback.text.includes("скопирован"), "не показан честный fallback: " + fallback.text);
    assert(fallback.links.some(h => h && h.startsWith("tel:")), "нет телефона среди контактов: " + fallback.links.join(", "));
    assert(fallback.links.some(h => h && h.includes("t.me")), "нет Telegram среди контактов: " + fallback.links.join(", "));
    await context.close();
  });

  await test("?calc=… грузится в iframe (framebuster исключает только калькулятор)", async () => {
    // theme-init.js бастит фреймы для обычного приложения (защита от кликджекинга
    // сессии), но калькулятор целенаправленно встраивается в iframe на сайте
    // (adervis.ru/pro/smeta/) — у него нет ни сессии, ни данных для угона.
    // Хост — фикстура на реальном http-origin (data:/about:blank не грузят http-iframe).
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const page = await context.newPage();
    const src = encodeURIComponent("/index.html?calc=1");
    await page.goto(`${baseUrl}/tests/fixtures/iframe-host.html?src=${src}`, { waitUntil: "load" });
    const frame = page.frames().find(f => f.url().includes("calc=1"));
    assert(frame, "iframe не создался/не загрузился");
    await frame.waitForFunction(() => !!document.querySelector(".calc-page"), { timeout: 10000 });
    // Если бы фреймбастер сработал, top.location сменился бы на URL приложения —
    // проверяем, что верхняя страница осталась хост-фикстурой.
    const topUrl = page.url();
    assert(topUrl.includes("iframe-host.html"), "framebuster сработал и для калькулятора — верхнее окно перешло на " + topUrl);
    await context.close();
  });

  await test("обычный вход (без ?calc=) framebuster НЕ отключён", async () => {
    // Инвариант в обратную сторону: правка не должна была ослабить защиту для
    // всего остального приложения — только для параметра ?calc=.
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const page = await context.newPage();
    const src = encodeURIComponent("/index.html");
    await page.goto(`${baseUrl}/tests/fixtures/iframe-host.html?src=${src}`, { waitUntil: "load" });
    // Framebuster переводит ВЕРХНЕЕ окно на URL приложения — ждём именно это.
    await page.waitForFunction(() => location.href.includes("index.html"), { timeout: 5000 })
      .catch(() => { throw new Error("framebuster не сработал для обычного входа без ?calc="); });
    await context.close();
  });

  await test("?theme= передаёт тему хоста, недоступную iframe напрямую (кросс-origin)", async () => {
    // Встраивание на adervis.ru/pro/smeta/: localStorage хоста физически недоступен
    // изнутри iframe на другом origin, поэтому тема передаётся явным параметром.
    const { context: c1, page: p1 } = await bootCalc(browser, baseUrl, "calc=1&theme=light");
    assertEqual(await p1.evaluate(() => document.documentElement.getAttribute("data-theme")), "light", "?theme=light не применилась");
    await c1.close();

    const { context: c2, page: p2 } = await bootCalc(browser, baseUrl, "calc=1&theme=dark");
    assertEqual(await p2.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark", "?theme=dark не применилась");
    await c2.close();
  });

  await test("postMessage adervis-set-theme переключает тему уже загруженного калькулятора", async () => {
    // Живая синхронизация: посетитель переключил тему на сайте-хосте ПОСЛЕ того,
    // как iframe уже отрисовался — без этого calc-mode не имеет способа узнать
    // о переключении иначе, чем перезагрузкой (см. app.js: initTheme() читает
    // ?theme= только один раз при старте).
    const { context, page } = await bootCalc(browser, baseUrl, "calc=1&theme=dark");
    assertEqual(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark");
    await page.evaluate(() => window.postMessage({ type: "adervis-set-theme", theme: "light" }, "*"));
    await page.waitForTimeout(80);
    assertEqual(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "light", "тема не переключилась по postMessage");
    // Мусорное сообщение не должно ронять страницу и не должно менять тему.
    await page.evaluate(() => window.postMessage({ type: "something-else" }, "*"));
    await page.waitForTimeout(80);
    assertEqual(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "light", "посторонний postMessage изменил тему");
    await context.close();
  });

  await test("публичный калькулятор проходит замер a11y-минимума на всех трёх шагах", async () => {
    const { context, page } = await bootCalc(browser, baseUrl, "calc=1");
    // Доступным именем считаем и текст обёртывающего <label> — так подписаны поля
    // формы заявки, и это валидный способ, а не обход проверки.
    const nameless = () => page.evaluate(() =>
      [...document.querySelectorAll(".calc-page button, .calc-page input, .calc-page textarea")]
        .filter(el => el.offsetParent !== null)
        .filter(el => {
          const own = (el.textContent || "").trim() || el.getAttribute("aria-label")
            || el.getAttribute("placeholder") || el.getAttribute("title");
          if (own) return false;
          const label = el.closest("label");
          return !(label && (label.textContent || "").trim());
        })
        .map(el => el.outerHTML.slice(0, 60))
    );
    assertEqual((await nameless()).length, 0, "шаг 1: элементы без доступного имени: " + (await nameless()).join(" | "));

    await page.click(".calc-need");
    await page.waitForSelector(".calc-tier", { timeout: 5000 });
    assertEqual((await nameless()).length, 0, "шаг 2: элементы без доступного имени: " + (await nameless()).join(" | "));

    await page.evaluate(() => { window.app.calcGoStep(3); window.app.calcOpenLead(); });
    await page.waitForSelector("form.calc-lead", { timeout: 5000 });
    assertEqual((await nameless()).length, 0, "шаг 3 + форма: элементы без доступного имени: " + (await nameless()).join(" | "));

    // Тач-таргеты: калькулятор живёт на телефоне в iframe, мелкие кнопки там
    // особенно больно — порог WCAG 44×44. Для чекбокса внутри <label> целью
    // является сам label (клик по тексту переключает), поэтому меряем его.
    // Инлайновые ссылки внутри абзаца (.calc-link) — явное исключение WCAG 2.5.8.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll(".calc-page button, .calc-page input, .calc-page textarea")]
        .filter(el => el.offsetParent !== null && !el.classList.contains("calc-link"))
        .map(el => {
          const target = el.tagName === "INPUT" && el.closest("label") ? el.closest("label") : el;
          return { r: target.getBoundingClientRect(), html: el.outerHTML.slice(0, 50) };
        })
        .filter(x => x.r.height > 0 && x.r.height < 40)
        .map(x => Math.round(x.r.height) + "px: " + x.html)
    );
    assertEqual(small.length, 0, "слишком низкие интерактивные элементы: " + small.join(" | "));
    await context.close();
  });

  /* Бриф — публичная поверхность ровно того же класса, что калькулятор, и раньше
     него по времени: его ссылку студия шлёт первой. Проверяем то же, что там:
     контур незалогинен (никакой навигации CRM), помещается в телефон, подписан
     студией и форму видно. Скриншот — чтобы поверхность можно было осмотреть
     глазами, а не только замером. */
  /* Типы перебираем ЦИКЛОМ, а не проверяем один: у брифа их пять, ссылку студия
     шлёт с любым, и однажды уже было, что лента типов показывала 3 из 6 — то есть
     «работает video» ничего не говорит про остальные четыре. */
  for (const type of ["video", "photo", "design", "ai", "general"]) {
    await test(`публичный бриф «${type}»: форма открывается и подписана студией`, async () => {
      const { context, page, errors } = await bootBrief(browser, baseUrl, { type });
      const r = await page.evaluate(() => ({
        fields: document.querySelectorAll("#appContent input,#appContent textarea,#appContent select").length,
        agree: !!document.querySelector(".brief-agree input"),
        submit: [...document.querySelectorAll("#appContent button")]
          .some((b) => b.offsetParent !== null && /Отправить заявку/i.test(b.textContent || "")),
        title: (document.querySelector("#appContent h1")?.textContent || "").trim(),
        signed: /Полёт/.test(document.getElementById("appContent").innerText || ""),
        spill: document.documentElement.scrollWidth > window.innerWidth,
      }));
      assert(r.fields >= 5, `бриф «${type}» открылся почти пустым: полей ${r.fields}`);
      assert(r.title.length > 3, `у брифа «${type}» нет заголовка: «${r.title}»`);
      assert(r.agree, `у брифа «${type}» нет согласия на обработку персональных данных`);
      assert(r.submit, `у брифа «${type}» не видно кнопки отправки`);
      assert(r.signed, `бриф «${type}» не подписан студией, которая его прислала`);
      assert(!r.spill, `бриф «${type}» уезжает вбок на 390px`);
      assert(errors.length === 0, `ошибки на брифе «${type}»: ` + errors.join(" | "));
      await context.close();
    });
  }

  /* Подпись сервиса на брифе — то же, что «Сделано в ADERVIS» на портале КП:
     бесплатный канал, который оплаченный тариф вправе снять. До 23.08.2026 флаг
     туда не доезжал вовсе (get_brief_agency отдавал только name и logo), и
     студия, купившая снятие подписи, видела её на своей публичной форме.

     Флаг считает СЕРВЕР: форма анонимна и о тарифе студии знать не может, а
     снимка, как у КП, тут нет — ссылка одна и живая. Проверяем обе стороны и
     отдельно то, что строка про обработку данных НЕ уехала вместе с подписью:
     она адресована человеку, который эти данные вводит. */
  await test("бриф: подпись сервиса снимается флагом, а строка про данные остаётся", async () => {
    const shown = await bootBrief(browser, baseUrl, {
      agency: { name: "Студия «Полёт»", logo: "", hide_branding: false },
    });
    const withSign = await shown.page.evaluate(() => (document.getElementById("appContent").innerText || "").replace(/\s+/g, " "));
    // Подпись по-русски, как в клиентском портале: «Powered by» была единственной
    // английской строкой на странице, которую студия показывает своему заказчику.
    assert(/Сделано в ADERVIS/i.test(withSign), "на бесплатном тарифе пропала подпись сервиса — бесплатный канал распространения");
    await shown.context.close();

    const hidden = await bootBrief(browser, baseUrl, {
      agency: { name: "Студия «Полёт»", logo: "", hide_branding: true },
    });
    const noSign = await hidden.page.evaluate(() => (document.getElementById("appContent").innerText || "").replace(/\s+/g, " "));
    assert(!/Сделано в ADERVIS/i.test(noSign), "оплаченный тариф снял подпись в КП, но на брифе она осталась");
    assert(
      /Данные используются только для связи с вами/.test(noSign),
      "вместе с подписью пропала строка про обработку данных — она не про брендирование"
    );
    await hidden.context.close();
  });

  await test("публичный бриф: контур заказчика, а не окно CRM", async () => {
    const { context, page, errors } = await bootBrief(browser, baseUrl);
    const r = await page.evaluate(() => {
      const doc = document.documentElement;
      const sidebar = document.getElementById("appSidebar");
      return {
        fields: document.querySelectorAll("#appContent input,#appContent textarea,#appContent select").length,
        submit: [...document.querySelectorAll("#appContent button")]
          .filter((b) => b.offsetParent !== null && /Отправить|Оставить заявку/i.test(b.textContent || "")).length,
        /* Наличие узла в разметке ничего не доказывает: оболочка приложения лежит
           в index.html всегда, а brief-режим её гасит. Меряем ВИДИМОСТЬ — иначе
           проверка падает на исправном экране (уже наступали на это сегодня с
           «клиентом примера»). */
        crmNav: [sidebar, document.querySelector(".mobile-bottom-nav"), document.querySelector(".mobile-nav-fab")]
          .filter(Boolean)
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return b.width > 2 && b.height > 2 && getComputedStyle(el).visibility !== "hidden";
          })
          .map((el) => el.id || el.className)
          .join(", "),
        spill: doc.scrollWidth > window.innerWidth ? doc.scrollWidth : 0,
        text: (document.getElementById("appContent").innerText || "").replace(/\s+/g, " "),
      };
    });
    if (shotDir) {
      await page.screenshot({ path: require("path").join(shotDir, "brief-public-fold.png") });
      // Низ формы: согласие на обработку ПД и кнопка отправки — то, чем заказчик
      // заканчивает. Осматривать поверхность глазами дешевле всего здесь же.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(250);
      await page.screenshot({ path: require("path").join(shotDir, "brief-public-bottom.png") });
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    assert(r.fields >= 5, "публичная форма брифа открылась почти пустой: полей " + r.fields);
    assert(r.submit >= 1, "на форме брифа нет видимой кнопки отправки");
    assert(!r.crmNav, "на публичной странице брифа видна навигация CRM: " + r.crmNav);
    assertEqual(r.spill, 0, "бриф на 390px уезжает вбок: " + r.spill + "px");
    assert(/Полёт/.test(r.text), "бриф не подписан студией, которая его прислала");
    assert(errors.length === 0, "ошибки на публичном брифе: " + errors.join(" | "));
    await context.close();
  });

  /* Бриф собирает имя, телефон, почту и компанию у ЧУЖОГО человека — заказчика
     студии. Из трёх публичных форм продукта согласие на обработку ПД спрашивали
     две: калькулятор (calcSetLead('agree')) и портал КП вместе с подписью. Бриф,
     самая старая и самая массовая из них, просто отправлял; внизу стояло лишь
     «Данные используются только для связи с вами» — обещание, а не согласие, и
     без ссылки на политику.

     Проверяем не наличие галочки, а ПОВЕДЕНИЕ: без согласия заявка не уходит.
     Галочку можно нарисовать и не проверить — тогда сторож охранял бы декорацию. */
  await test("публичный бриф не отправляет чужие данные без согласия на обработку", async () => {
    const { context, page } = await bootBrief(browser, baseUrl);

    const posts = [];
    await context.route("**/rest/v1/brief_submissions*", (route) => {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    });

    /* Заполняем ВСЕ поля со звёздочкой, а не угаданную пару: набор обязательных
       полей задаётся шаблоном брифа и меняется вместе с ним — тест, знающий про
       «имя и почту», сломался бы на первом же новом обязательном вопросе (так и
       вышло: «Опишите проект подробно»). */
    const filled = await page.evaluate(() => {
      const out = [];
      [...document.querySelectorAll("#appContent .field")].forEach((f) => {
        const label = (f.querySelector("label")?.textContent || "").trim();
        if (!/\*\s*$/.test(label)) return;
        const el = f.querySelector("input, textarea, select");
        if (!el) return;
        if (el.tagName === "SELECT") {
          const opt = [...el.options].find((o) => o.value);
          if (opt) el.value = opt.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          el.value = /email/i.test(label) ? "petr@example.com"
            : /имя/i.test(label) ? "Пётр Заказчиков"
            : "Нужен ролик для сайта: съёмка, монтаж, музыка.";
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        out.push(label);
      });
      return out;
    });
    assert(filled.length >= 2, "на публичном брифе не нашлось обязательных полей: " + JSON.stringify(filled));

    await page.evaluate(() => window.app.submitBrief());
    await page.waitForTimeout(400);
    const refused = await page.evaluate(() => (document.getElementById("appContent").innerText || ""));
    assertEqual(posts.length, 0, "заявка с персональными данными ушла без согласия на обработку");
    assert(/соглас/i.test(refused), "форма промолчала о том, почему не отправила: нет объяснения про согласие");

    // Согласились — заявка уходит: барьер не должен превратиться в тупик.
    await page.evaluate(() => {
      const box = document.querySelector(".brief-agree input");
      box.checked = true;
      box.dispatchEvent(new Event("change", { bubbles: true }));
      window.app.submitBrief();
    });
    await page.waitForTimeout(600);
    const why = await page.evaluate(() => (document.querySelector("#appContent .brief-error")?.textContent || "").trim());
    assertEqual(posts.length, 1, `после согласия заявка так и не ушла студии (форма говорит: «${why || "ничего"}»)`);

    /* Последний экран, который заказчик вообще видит от этой студии. Он обязан
       сказать, что заявка принята, и остаться подписанным студией: до 18.08 такие
       экраны подставляли имя сервиса, и человек уходил с мыслью, что писал в
       ADERVIS, а не в студию. */
    const done = await page.evaluate(() => ({
      text: (document.getElementById("appContent").innerText || "").replace(/\s+/g, " "),
      stillForm: !!document.querySelector(".brief-submit"),
    }));
    assert(!done.stillForm, "после отправки на экране осталась та же форма — человек не понял, ушла ли заявка");
    assert(/отправлен|принят|спасибо/i.test(done.text), "экран после отправки не говорит, что заявка принята: " + done.text.slice(0, 120));
    assert(/Полёт/.test(done.text), "экран «заявка отправлена» потерял имя студии");
    if (shotDir) await page.screenshot({ path: require("path").join(shotDir, "brief-public-sent.png") });
    await context.close();
  });
};
