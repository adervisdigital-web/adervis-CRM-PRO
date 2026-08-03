// Смоук: приложение вообще поднимается — и в local mode, и на auth gate.
const { bootLocal, assert } = require("../harness");

module.exports = async function ({ browser, baseUrl, test }) {
  await test("local mode: #appContent наполняется без pageerror", async () => {
    const { context, page, errors } = await bootLocal(browser, baseUrl);
    const len = await page.$eval("#appContent", (el) => el.innerHTML.trim().length);
    assert(len > 0, "#appContent пуст");
    assert(errors.length === 0, "консольные ошибки: " + errors.join(" | "));
    await context.close();
  });

  await test("local mode: рендерится топбар (кнопка добавления)", async () => {
    const { context, page } = await bootLocal(browser, baseUrl);
    const addBtn = await page.$("#globalAddBtn");
    assert(addBtn, "нет #globalAddBtn — топбар не отрисовался");
    await context.close();
  });

  await test("без local mode: показан auth gate с CTA", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, { localMode: false });
    await page.waitForFunction(
      () => {
        const g = document.getElementById("authGateContainer");
        return g && g.innerHTML.trim().length > 0;
      },
      { timeout: 12000 }
    );
    const txt = await page.$eval("#authGateContainer", (el) => el.textContent);
    assert(
      /войти|регистр|бесплат|7 дней|попроб/i.test(txt),
      "нет ожидаемого CTA в auth gate: " + txt.slice(0, 100)
    );
    await context.close();
  });

  // Телеметрия проверяла только наличие _supabase, поэтому в боевую таблицу
  // client_errors писали ещё и локальная разработка, и КАЖДЫЙ прогон этих тестов
  // (Playwright поднимает сервер на случайном порту — записи даже не схлопывались
  // в группы). Вкладка «Ошибки» в Admin Panel из-за этого показывала 199 записей,
  // почти целиком мусорных. Проверяем сетевой факт, а не намерение.
  await test("телеметрия: ошибки с localhost не уезжают в client_errors", async () => {
    const { context, page } = await bootLocal(browser, baseUrl);

    const telemetryCalls = [];
    page.on("request", (r) => {
      if (r.url().includes("/rest/v1/client_errors")) telemetryCalls.push(r.url());
    });

    // Роняем необработанное отклонение промиса — ровно то, что ловит репортёр.
    await page.evaluate(() => {
      Promise.reject(new Error("ADERVIS-TEST: намеренная ошибка для проверки телеметрии"));
    });
    // И синхронную ошибку через window.onerror.
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent("error", {
        message: "ADERVIS-TEST: намеренная синхронная ошибка",
        error: new Error("ADERVIS-TEST: намеренная синхронная ошибка"),
      }));
    });
    await page.waitForTimeout(600);

    assert(
      telemetryCalls.length === 0,
      "с localhost ушло " + telemetryCalls.length + " запрос(ов) в client_errors: " + telemetryCalls.join(", ")
    );
    await context.close();
  });

  // Публичная форма брифа рисовала в шапке зашитые «ADERVIS · Видеопродакшн».
  // Для владельца незаметно — он и есть ADERVIS; для любой другой студии это
  // значит, что её заказчик видит бриф от чужой компании и прямого конкурента.
  // Имя агентства приходит из get_brief_agency; пока RPC нет — шапки нет вовсе.
  await test("бриф: шапка не представляется клиенту чужой компанией", async () => {
    const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
    const page = await context.newPage();
    await page.goto(baseUrl + "/index.html?brief=47880b74-de7b-4ef5-8fcf-5e9ae7497edc");
    // Ждём именно формы: шапка дорисовывается после ответа RPC.
    await page.waitForSelector(".brief-card", { timeout: 15000 });
    await page.waitForTimeout(1200);

    const header = await page.evaluate(() => {
      const r = document.querySelector(".brief-logo-row");
      return r ? (r.textContent || "").replace(/\s+/g, " ").trim() : "";
    });
    assert(
      !/видеопродакшн/i.test(header),
      "в шапке брифа осталась зашитая подпись сервиса: «" + header + "»"
    );

    // Форма при этом обязана открыться и быть подписана — заголовок задаёт агентство.
    const title = await page.evaluate(() => {
      const h = document.querySelector(".brief-card h1");
      return h ? (h.textContent || "").trim() : "";
    });
    assert(title.length > 0, "форма брифа осталась без заголовка");

    await context.close();
  });
};
