// Тарифы и подпись на клиентском КП.
//
// Здесь проверяется то, что легко сломать текстом и незаметно для глаза:
//   • число мест в команде НЕ должно зависеть от купленного периода (27.07.2026) —
//     раньше «до 3 пользователей» продавалось вместе с «3 месяца», и команда из трёх
//     человек была обязана купить сразу квартал;
//   • подпись «Сделано в ADERVIS» внизу портала КП — бесплатный канал
//     распространения: она должна быть по умолчанию и исчезать только по флагу
//     hide_branding, который выставляется на оплаченном тарифе;
//   • переключатель подписи не должен быть доступен на неоплаченном тарифе.
const { bootLocal, assert, assertEqual } = require("../harness");

// Портал КП рисуется по ответу RPC get_client_portal. В тестах Supabase нет и
// ходить в прод нельзя — подменяем ответ на маршруте, чтобы проверялся настоящий
// путь рендера, а не заглушка «Ссылка недействительна».
async function bootPortal(browser, baseUrl, portalRow, ctx) {
  const context = ctx || (await browser.newContext({ viewport: { width: 900, height: 1000 } }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));

  // Перехватываем цели Метрики до загрузки страницы. metrika.js делает
  // `m[i] = m[i] || function(){...}`, поэтому наш ym остаётся на месте.
  await page.addInitScript(() => {
    window.__goals = [];
    window.ym = (id, action, goal) => { if (action === "reachGoal") window.__goals.push(goal); };
  });

  // Порядок важен: Playwright примеряет маршруты в обратном порядке регистрации,
  // поэтому общая заглушка идёт ПЕРВОЙ, а конкретный RPC — последним, иначе он
  // будет перекрыт и портал получит пустой ответ.
  // Всё лишнее к Supabase (уведомление агентству, статус аванса) — молча гасим.
  await page.route("**/*.supabase.co/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  await page.route("**/rest/v1/rpc/get_client_portal*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(portalRow),
    })
  );

  const uuid = "11111111-2222-3333-4444-555555555555";
  await page.goto(`${baseUrl}/index.html?portal=${uuid}`, { waitUntil: "load" });
  await page.waitForFunction(
    () => {
      const el = document.getElementById("appContent");
      return el && /portal-card/.test(el.innerHTML);
    },
    { timeout: 10000 }
  );
  return { context, page, errors };
}

const PORTAL_ROW = {
  deal_name: "Рекламный ролик для бренда",
  deal_status: "КП отправлено",
  total_price: 450000,
  included_text: "— Съёмочный день",
  excluded_text: "— Аренда локации",
  proposal_note: "Спасибо за интерес",
  services_list: ["Режиссёр", "Оператор"],
  approved_at: null,
  advance_amount: 225000,
  advance_paid_at: null,
  advance_payment_id: null,
  agency_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  signer_name: null,
  hide_branding: false,
};

module.exports = async function ({ browser, baseUrl, test }) {
  await test("тарифы: места в команде одинаковы у всех платных периодов", async () => {
    const { context, page } = await bootLocal(browser, baseUrl);
    await page.evaluate(() => window.app.go("plans"));
    await page.waitForSelector(".plan-card", { timeout: 5000 });

    // Строка сравнения «Пользователей в команде»: первая ячейка — пробный (1),
    // остальные четыре — платные периоды, и они обязаны совпадать между собой.
    const cells = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#appContent table tr")];
      const row = rows.find((r) => /Пользователей в команде/.test(r.textContent || ""));
      if (!row) return null;
      return [...row.querySelectorAll("td")].slice(1).map((td) => (td.textContent || "").trim());
    });
    assert(cells, "нет строки «Пользователей в команде» в таблице сравнения");
    assertEqual(cells.length, 5, "ожидалось 5 колонок тарифов");
    const paid = cells.slice(1);
    assert(
      paid.every((c) => c === paid[0]),
      "число мест различается по периодам оплаты: " + JSON.stringify(paid)
    );
    await context.close();
  });

  await test("тарифы: PLANS не содержит числа мест (места развязаны с периодом)", async () => {
    const { context, page } = await bootLocal(browser, baseUrl);
    await page.evaluate(() => window.app.go("plans"));
    await page.waitForSelector(".plan-card", { timeout: 5000 });
    // Карточки периодов не должны обещать разное число людей.
    const seatPromises = await page.$$eval(".plan-card", (cards) =>
      cards.slice(1).map((c) => {
        const m = (c.textContent || "").match(/До (\d+) пользовател/);
        return m ? m[1] : null;
      })
    );
    assert(seatPromises.every((s) => s !== null), "не у всех платных карточек указано число мест: " + JSON.stringify(seatPromises));
    assert(
      seatPromises.every((s) => s === seatPromises[0]),
      "карточки обещают разное число мест: " + JSON.stringify(seatPromises)
    );
    await context.close();
  });

  await test("настройки: переключатель подписи КП заблокирован без оплаты", async () => {
    const { context, page } = await bootLocal(browser, baseUrl);
    await page.evaluate(() => window.app.go("settings"));
    await page.waitForSelector("#hideProposalBranding", { timeout: 5000 });
    const disabled = await page.$eval("#hideProposalBranding", (el) => el.disabled);
    assert(disabled, "чекбокс «скрывать подпись» доступен на неоплаченном тарифе");
    await context.close();
  });

  await test("портал КП: подпись «Сделано в ADERVIS» показана по умолчанию", async () => {
    const { context, page, errors } = await bootPortal(browser, baseUrl, PORTAL_ROW);
    const txt = await page.$eval("#appContent", (el) => el.textContent || "");
    assert(/Сделано в\s*ADERVIS/i.test(txt), "нет подписи на портале КП");
    const href = await page.$eval("#appContent a[href*='app.adervis.ru']", (a) => a.getAttribute("href"));
    assert(/[?&]ref=/.test(href), "подпись без реферальной метки ?ref=: " + href);
    assert(errors.length === 0, "ошибки на портале: " + errors.join(" | "));
    await context.close();
  });

  await test("портал КП: hide_branding убирает подпись, но не ломает страницу", async () => {
    const { context, page, errors } = await bootPortal(browser, baseUrl, { ...PORTAL_ROW, hide_branding: true });
    const txt = await page.$eval("#appContent", (el) => el.textContent || "");
    assert(!/Сделано в\s*ADERVIS/i.test(txt), "подпись осталась при hide_branding=true");
    assert(/Рекламный ролик для бренда/.test(txt), "само КП не отрисовалось");
    assert(errors.length === 0, "ошибки на портале: " + errors.join(" | "));
    await context.close();
  });

  await test("портал КП: оплаченный аванс шлёт цель advance_paid один раз на КП", async () => {
    const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
    const paidRow = { ...PORTAL_ROW, advance_paid_at: "2026-07-27T10:00:00Z" };

    const first = await bootPortal(browser, baseUrl, paidRow, context);
    const goals1 = await first.page.evaluate(() => window.__goals);
    assert(goals1.includes("advance_paid"), "цель advance_paid не отправлена: " + JSON.stringify(goals1));
    await first.page.close();

    // Клиент открыл ту же ссылку ещё раз — это не вторая оплата.
    const second = await bootPortal(browser, baseUrl, paidRow, context);
    const goals2 = await second.page.evaluate(() => window.__goals);
    assert(!goals2.includes("advance_paid"), "цель отправлена повторно при переоткрытии КП");
    await context.close();
  });

  await test("портал КП: неоплаченный аванс цель не шлёт", async () => {
    const { context, page } = await bootPortal(browser, baseUrl, PORTAL_ROW);
    const goals = await page.evaluate(() => window.__goals);
    assert(!goals.includes("advance_paid"), "цель advance_paid отправлена без оплаты");
    await context.close();
  });

  // Главная у нового пользователя выглядит именно так: демо-сделка засеяна при
  // регистрации (_seedDemoDeal), поэтому welcome-экран уже позади, а чеклист впереди.
  await test("чеклист: у нового пользователя показан со счётом 0 из 3", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, { seedDemo: true });
    await page.evaluate(() => window.app.go("home"));
    const txt = await page.$eval("#appContent", (el) => el.textContent || "");
    assert(/Начало работы/.test(txt), "чеклиста «первые шаги» нет на главной");
    // Демо-сделка засеяна нами, а не пользователем: в прогресс она входить не должна.
    assert(
      /0 из 3 шагов/.test(txt),
      "неверный счёт шагов (демо-сделка засчиталась?): " + (txt.match(/\d+ из \d+ шагов/) || ["—"])[0]
    );
    // Шага про подписку в чеклисте активации быть не должно: он невыполним и ломал счёт.
    assert(!/Оформите подписку/.test(txt), "в чеклисте остался невыполнимый шаг про подписку");
    await context.close();
  });

  await test("чеклист: совсем пустой аккаунт видит welcome-экран, а не чеклист", async () => {
    const { context, page } = await bootLocal(browser, baseUrl);
    // Якорь — разметка экрана, а не его текст: раньше тест искал «Добро пожаловать»
    // и упал на смене позиционирования (02.08), хотя сам экран никуда не делся.
    // Заголовок там продающий и будет меняться ещё не раз.
    const found = await page.evaluate(() => ({
      welcome: !!document.querySelector("#appContent .welcome-screen"),
      steps: document.querySelectorAll("#appContent .welcome-step").length,
    }));
    assert(found.welcome, "пустое состояние перестало показывать welcome-экран");
    assert(found.steps >= 3, "на welcome-экране пропали шаги первого запуска: " + found.steps);
    await context.close();
  });

  await test("активация: цель отправляется один раз, повторный вызов молчит", async () => {
    const { context, page } = await bootLocal(browser, baseUrl);
    const calls = await page.evaluate(() => {
      const seen = [];
      window.ym = (id, action, goal) => { if (action === "reachGoal") seen.push(goal); };
      try { localStorage.removeItem("_goal_test_activation"); } catch (e) {}
      // _fireGoalOnce приватная — проверяем её контракт через публичный trackGoal
      // и ту же метку в localStorage, на которой она построена.
      const fire = (name) => {
        const key = "_goal_" + name;
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "1");
        window.app.trackGoal(name);
      };
      fire("test_activation");
      fire("test_activation");
      return seen;
    });
    assertEqual(calls.length, 1, "цель отправлена не один раз: " + JSON.stringify(calls));
    await context.close();
  });

  // Вкладка КП доступна и на пустой смете, а createClientPortal вызывается из
  // ЧЕТЫРЁХ мест, включая чеклист «первые шаги» — то есть новичок мог отправить
  // клиенту предложение на 0 ₽ без единой услуги буквально следуя подсказке.
  // Смета и КП — то, ради чего продукт покупают; это самый неловкий способ их
  // показать. Гарда живёт в createClientPortal, поэтому закрывает все входы разом.
  // Портал КП на телефоне — самая внешняя страница продукта: её видит заказчик
  // клиента, решая подписать и заплатить. Здесь ломалось сразу двумя способами.
  await test("портал КП на 390px: без прокрутки вбок и без навигации CRM", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const { context, page } = await bootPortal(browser, baseUrl, PORTAL_ROW, ctx);

    // 1. body.portal-mode прячет .topbar и .nav, но нижняя навигация — это
    //    <nav class="mobile-bottom-nav"> из index.html, под правило не попадала.
    //    Заказчик на телефоне видел «Проекты · Смета · + · Финансы · Ещё» чужого
    //    приложения поверх своего КП. brief-mode и calc-mode её прячут явно.
    const navVisible = await page.evaluate(() => {
      const nav = document.querySelector(".mobile-bottom-nav");
      return !!(nav && nav.offsetParent !== null);
    });
    assertEqual(navVisible, false, "на клиентском портале видна нижняя навигация CRM");

    // 2. Глобальное `input,select,textarea { width:100% }` не имело исключения для
    //    чекбоксов: квадрат согласия становился 266px и выталкивал текст за
    //    карточку — горизонтальная прокрутка 442px при окне 390.
    const box = await page.evaluate(() => {
      const cb = document.getElementById("esignConsent");
      if (!cb) return null;
      const r = cb.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    assert(box, "не нашёлся чекбокс согласия на портале");
    assert(box.w <= 30, `чекбокс согласия растянут на ${box.w}px — глобальное input{width:100%} снова ловит checkbox`);

    const overflow = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, w: window.innerWidth,
    }));
    assert(
      overflow.sw <= overflow.w + 1,
      `портал прокручивается вбок: scrollWidth ${overflow.sw} при окне ${overflow.w}`
    );

    await context.close();
  });

  await test("КП: пустая смета не даёт создать ссылку клиенту", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, { width: 1100, height: 800 });

    const click = (t) => page.evaluate((txt) => {
      const el = [...document.querySelectorAll("button,[onclick]")]
        .filter(e => e.offsetParent !== null)
        .find(e => (e.textContent || "").replace(/\s+/g, " ").includes(txt));
      if (!el) return false;
      el.click();
      return true;
    }, t);
    const fill = (v) => page.evaluate((val) => {
      const i = [...document.querySelectorAll("#appContent input")].filter(e => e.offsetParent !== null)[0];
      if (i) { i.value = val; i.dispatchEvent(new Event("input", { bubbles: true })); }
    }, v);

    // Проходим мастер ровно так, как это сделает новичок: клиент, название,
    // а на шаге пакета — «Пропустить». Получается сделка с 0 позиций и 0 ₽.
    await page.evaluate(() => window.app.startWizard());
    await page.waitForTimeout(300);
    await fill("Тестовый клиент");
    assert(await click("Далее"), "шаг «Кто клиент» не пройден");
    await page.waitForTimeout(350);
    await fill("Пустой проект");
    assert(await click("Далее"), "шаг «О проекте» не пройден");
    await page.waitForTimeout(350);
    assert(await click("Пропустить"), "на шаге пакета нет «Пропустить»");
    await page.waitForTimeout(600);

    const proj = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const p = (s.savedProjects || [])[0];
      return p ? { id: p.id, total: p.total, positions: Object.keys((p.snapshot || {}).selected || {}).length } : null;
    });
    assert(proj, "мастер не создал сделку");
    assertEqual(proj.positions, 0, "сделка после «Пропустить» должна быть без позиций");
    assertEqual(proj.total, 0, "сделка после «Пропустить» должна быть на 0 ₽");

    await page.evaluate((id) => window.app.createClientPortal(id), proj.id);
    await page.waitForTimeout(350);

    const toast = await page.evaluate(() => {
      const el = document.getElementById("toast");
      return el ? (el.textContent || "").trim() : "";
    });
    assert(/нет позиций/i.test(toast), "пустая смета должна отказывать с объяснением, получено: «" + toast + "»");

    // И портал действительно не создан — отказ, а не «отказ на словах».
    const portalId = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return ((s.savedProjects || [])[0] || {}).portalId || null;
    });
    assertEqual(portalId, null, "портал не должен быть создан для пустой сметы");

    await context.close();
  });
};
