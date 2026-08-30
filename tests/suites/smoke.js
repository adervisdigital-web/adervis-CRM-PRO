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

  /* Первый день пользователя: каждый раздел должен что-то СКАЗАТЬ, даже когда
     данных нет. «Онлайн-брифы» на чистом аккаунте показывали ровно ноль символов
     текста — три серые полоски скелета и всё: загрузка брифов молча выходит, если
     сессии нет, а флаг «загружено» при этом не выставляется никогда, поэтому
     полоски крутились вечно.

     Меряем результат, а не устройство экрана: сколько текста человек видит.
     Порог низкий (60 символов) — это защита от пустоты, а не от лаконичности. */
  await test("на пустом аккаунте ни один раздел не показывает пустой экран", async () => {
    const { context, page } = await bootLocal(browser, baseUrl);
    const sections = [
      "home", "estimate", "clients", "global-finances", "global-calendar",
      "tasks", "contracts", "knowledge", "catalog", "packages", "proposals", "briefs", "team",
    ];
    const silent = [];
    for (const s of sections) {
      await page.evaluate((v) => window.app.go(v), s);
      await page.waitForTimeout(200);
      const len = await page.$eval("#appContent", (el) => el.innerText.replace(/\s+/g, " ").trim().length);
      if (len < 60) silent.push(`${s} (${len} символов)`);
    }
    await context.close();
    assert(silent.length === 0, "разделы молчат на пустом аккаунте: " + silent.join(", "));
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

  await test("выездная съёмка: без сети приложение открывается, работает и говорит об этом", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, { seedDemo: true, width: 1100, height: 900 });
    await page.waitForTimeout(400);

    // Без контролирующего воркера офлайн-перезагрузка упрётся в сеть, и мы измерим
    // отсутствие SW, а не поведение приложения.
    const controlled = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!reg) return false;
      for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) {
        await new Promise((r) => setTimeout(r, 250));
      }
      return !!navigator.serviceWorker.controller;
    });
    assert(controlled, "Service Worker не взял страницу под контроль — офлайна не будет вовсе");

    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}"));
    const before = await read();

    await context.setOffline(true);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message || e)));

    await page.reload({ waitUntil: "load", timeout: 20000 });
    await page.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await page.waitForTimeout(500);

    const after = await read();
    assert((after.savedProjects || []).length === (before.savedProjects || []).length,
      "после перезагрузки без сети сделки не на месте");

    /* Плашку показывало только СОБЫТИЕ offline — а оно не приходит тому, кто открыл
       приложение уже без связи. Ровно случай, ради которого офлайн и делался. */
    const banner = await page.evaluate(() => {
      const b = document.getElementById("offlineBanner");
      if (!b) return "нет элемента";
      return getComputedStyle(b).display !== "none" && b.getBoundingClientRect().height > 0
        ? (b.textContent || "").replace(/\s+/g, " ").trim()
        : "";
    });
    assert(banner, "приложение открыто без сети, но человеку об этом не сказано — плашка скрыта");
    assert(/локальн/i.test(banner), "плашка не говорит, что правки сохраняются локально: «" + banner + "»");

    // Работать можно: задача, сделка, позиция в смету — всё локально.
    const work = await page.evaluate(async () => {
      const res = {};
      const st = () => JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const t0 = (st().globalTasks || []).length;
      window.app.go("global-tasks");
      // «+ Задача» открывает черновик в окне (с 29.08.2026): задача попадает в
      // список по «Создать». Offline это не меняет, но шагов теперь два.
      window.app.createGlobalTask();
      await new Promise((r) => setTimeout(r, 250));
      window.app.setTaskModalField("title", "Задача с выезда");
      window.app.saveTaskModal();
      await new Promise((r) => setTimeout(r, 350));
      res.task = (st().globalTasks || []).length - t0;

      const d0 = (st().savedProjects || []).length;
      window.app.startWizard();
      window.app.wizardSetData("name", "Клиент с выезда");
      window.app.wizardSetData("projectName", "Съёмка в поле");
      window.app.finishWizard("estimate");
      await new Promise((r) => setTimeout(r, 600));
      res.deal = (st().savedProjects || []).length - d0;

      const s0 = Object.keys(st().selected || {}).length;
      window.app.go("catalog");
      await new Promise((r) => setTimeout(r, 350));
      // В смету кладёт «+»: клик по самой карточке открывает её редактор.
      const add = document.querySelector("#appContent .item--catalog:not(.selected) .catalog-add-btn");
      if (add) add.click();
      await new Promise((r) => setTimeout(r, 400));
      res.estimate = Object.keys(st().selected || {}).length - s0;
      return res;
    });
    assert(work.task === 1, "без сети не создаётся задача: +" + work.task);
    assert(work.deal === 1, "без сети не создаётся сделка: +" + work.deal);
    assert(work.estimate === 1, "без сети позиция не кладётся в смету: +" + work.estimate);
    assert(!errors.length, "офлайн-сессия дала ошибки страницы: " + errors.slice(0, 2).join(" | "));

    await context.setOffline(false);
    await page.waitForTimeout(900);
    const hidden = await page.evaluate(() => {
      const b = document.getElementById("offlineBanner");
      return !b || getComputedStyle(b).display === "none";
    });
    await context.close();
    assert(hidden, "сеть вернулась, а плашка «нет соединения» осталась висеть");
  });
};
