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
const { assert, assertEqual } = require("../harness");

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

module.exports = async function ({ browser, baseUrl, test }) {
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
};
