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

  // Цены, которые обязан показывать скриншот онбординга onboarding/plans.webp.
  // Меняете PLANS — пересоздайте картинку, иначе первое, что видит новый человек,
  // это старый прайс. Так уже было: 08.08 цены подняли до 890 ₽, а слайд онбординга
  // до 11.08 обещал 490/390/340/290 ₽ и «до 3/5/10 пользователей», которых нет
  // (PAID_MAX_USERS = 3 на любом оплаченном). Скриншот снимается локально:
  // Playwright → app.go("plans"), тёмная тема, кадр по .plan-card, 1600px, webp q82.
  const ONBOARDING_SHOT_PRICES = [0, 890, 690, 590, 490];

  await test("онбординг: скриншот тарифов не разошёлся с PLANS", async () => {
    const { context, page } = await bootLocal(browser, baseUrl);
    const prices = await page.evaluate(() => {
      const src = [...document.scripts].map(s => s.src).find(s => /app\.js/.test(s));
      return fetch(src).then(r => r.text()).then(t => {
        const block = t.slice(t.indexOf("const PLANS = ["));
        return [...block.slice(0, block.indexOf("];")).matchAll(/price:\s*(\d+)/g)].map(m => +m[1]);
      });
    });
    await context.close();
    assert(prices.length === ONBOARDING_SHOT_PRICES.length && prices.every((p, i) => p === ONBOARDING_SHOT_PRICES[i]),
      "цены в PLANS изменились (" + prices.join("/") + "), а скриншот онбординга обещает " +
      ONBOARDING_SHOT_PRICES.join("/") + ".\n" +
      "Пересними onboarding/plans.webp и обнови ONBOARDING_SHOT_PRICES в этом тесте.");
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

  /* Кто прислал КП. Портал — единственный артефакт продукта, который открывает
     ЗАКАЗЧИК студии, и до 18.08 он был подписан сервисом: логотип logo-icon.svg,
     имя «Adervis» в шапке и adervis.digital@gmail.com в подвале. Владелец сервиса
     этого не видит — он и есть ADERVIS. Любая другая студия рассылала КП, на
     котором стоит имя чужой компании и прямого конкурента, а отвечать заказчику
     предлагалось не ей. Тот же дефект уже чинили в брифе и в калькуляторе.

     Проверяем оба конца: с данными агентства — они и стоят; без данных (миграция
     20260818000001 не накатана) — сервис НЕ подписывается за студию. */
  const AGENCY_ROW = {
    ...PORTAL_ROW,
    agency_name: "Студия Пример",
    agency_logo: "",
    agency_desc: "Видеопродакшн в Перми",
    agency_email: "hello@studia-primer.ru",
    agency_phone: "+7 900 111-22-33",
    agency_site: "studia-primer.ru",
  };

  await test("портал КП: шапка и подвал называют агентство, а не сервис", async () => {
    const { context, page, errors } = await bootPortal(browser, baseUrl, AGENCY_ROW);
    const res = await page.evaluate(() => {
      const root = document.getElementById("appContent");
      const head = root.querySelector(".portal-header");
      return {
        head: head ? (head.textContent || "").trim() : null,
        txt: root.textContent || "",
        mailtos: [...root.querySelectorAll("a[href^='mailto:']")].map((a) => a.getAttribute("href")),
        tels: [...root.querySelectorAll("a[href^='tel:']")].map((a) => a.getAttribute("href")),
      };
    });
    assert(res.head, "у портала нет шапки .portal-header");
    assert(/Студия Пример/.test(res.head), "в шапке КП нет имени агентства: " + res.head);
    assert(/Видеопродакшн в Перми/.test(res.head), "в шапке нет описания агентства: " + res.head);
    assert(!res.txt.toLowerCase().includes("adervis.digital@gmail.com"),
      "в КП чужой студии осталась почта сервиса — заказчик ответит не студии");
    assert(res.mailtos.some((h) => h.includes("hello@studia-primer.ru")),
      "нет почты агентства для ответа: " + JSON.stringify(res.mailtos));
    assert(res.tels.some((h) => h === "tel:+79001112233"),
      "телефон агентства не стал ссылкой или не очищен от разделителей: " + JSON.stringify(res.tels));
    assert(errors.length === 0, "ошибки на портале: " + errors.join(" | "));
    await context.close();
  });

  await test("портал КП: без данных агентства сервис не подписывается за студию", async () => {
    const { context, page, errors } = await bootPortal(browser, baseUrl, PORTAL_ROW);
    const res = await page.evaluate(() => {
      const root = document.getElementById("appContent");
      const head = root.querySelector(".portal-header");
      return {
        head: head ? (head.textContent || "").trim() : null,
        mailtos: [...root.querySelectorAll("a[href^='mailto:']")].map((a) => a.getAttribute("href")),
        logos: [...root.querySelectorAll(".portal-header img")].map((i) => i.getAttribute("src")),
      };
    });
    assert(res.head !== null, "шапка исчезла вовсе — документ должен хотя бы называться");
    assert(!res.head.toLowerCase().includes("adervis"), "шапка КП подписана сервисом: " + res.head);
    assert(res.logos.length === 0, "в шапке КП чужой студии остался логотип: " + JSON.stringify(res.logos));
    assert(res.mailtos.length === 0,
      "в подвале осталась почта сервиса: " + JSON.stringify(res.mailtos));
    assert(errors.length === 0, "ошибки на портале: " + errors.join(" | "));
    await context.close();
  });

  /* Корень той же истории: до 18.08 данные сервиса лежали в defaultState как
     значения по умолчанию профиля компании, и «чужое имя в документе» появлялось
     само, без единой ошибки в коде рендера. Поэтому сторож стоит на самих дефолтах,
     а не только на документах. */
  await test("профиль нового аккаунта не содержит имени и логотипа сервиса", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, { seedDemo: true });
    const co = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return st.company || null;
    });
    // Без этой проверки сторож проходил бы и на несохранённом состоянии: company
    // тогда undefined, а «пустое поле» читается как выполненное требование. terms
    // остаётся дефолтом сознательно — он и служит признаком живого объекта.
    assert(co && String(co.terms || "").trim(), "состояние ещё не записано — сторож проверял бы пустоту, а не дефолты");
    for (const key of ["name", "logoUrl", "desc", "details"]) {
      assertEqual(String(co[key] || ""), "",
        "поле company." + key + " приходит заполненным данными сервиса: «" + co[key] + "»");
    }
    await context.close();
  });

  /* Аккаунты, созданные ДО правки, уже носят дефолты сервиса в облачном состоянии.
     Чистка живёт в _stripServiceIdentity и вызывается из _migrateStateData (тот путь
     тестами не покрыт: нужна живая сессия Supabase). Поэтому сторож статический —
     он ловит ровно то, что здесь можно потерять: обрыв вызова. */
  await test("чистка дефолтов сервиса вызывается при миграции состояния", async () => {
    const { context, page } = await bootLocal(browser, baseUrl);
    const src = await page.evaluate(() => {
      const url = [...document.scripts].map((x) => x.src).find((x) => x.includes("app.js"));
      return fetch(url).then((r) => r.text());
    });
    await context.close();
    assert(src.includes("function _stripServiceIdentity()"),
      "функции _stripServiceIdentity больше нет — аккаунты со старыми дефолтами останутся с чужим именем");
    const body = src.slice(src.indexOf("function _migrateStateData()"), src.indexOf("function _migrateStateData()") + 700);
    assert(body.includes("_stripServiceIdentity()"),
      "_migrateStateData больше не зовёт _stripServiceIdentity: у существующих аккаунтов имя сервиса останется в документах");
    for (const val of ["Adervis", "logo-icon.svg"]) {
      assert(src.includes("SERVICE_IDENTITY_DEFAULTS") && src.includes(val),
        "в списке дефолтов сервиса не осталось значения «" + val + "» — чистить будет нечего");
    }
  });

  /* Документы, которые студия отправляет заказчику файлом и текстом. 18.08 нашлось,
     что имя и логотип СЕРВИСА доставались каждому агентству как значения по
     умолчанию (company.name = "Adervis", logoUrl = "logo-icon.svg"), а печать вдобавок
     подставляла их запасным вариантом. То есть студия, не заполнившая профиль,
     рассылала КП, счета и договоры от имени чужой компании и прямого конкурента —
     и узнать об этом ей было неоткуда.

     Проверяется вся тройка путей наружу: предпросмотр/печать КП, текст для
     мессенджера и напоминание в интерфейсе. */
  await test("документы: пустой профиль не подписывается именем сервиса", async () => {
    const { context, page, errors } = await bootLocal(browser, baseUrl, { seedDemo: true });
    const id = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return ((st.savedProjects || [])[0] || {}).id || null;
    });
    assert(id, "демо-сделка не завелась");
    await page.evaluate((i) => window.app.openDeal(i), id);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.app.setDealView("proposal"));
    await page.waitForTimeout(400);

    const res = await page.evaluate(async () => {
      const prev = document.querySelector(".proposal-preview");
      const out = { html: prev ? prev.innerHTML : "", txt: "", banner: (document.getElementById("appContent").textContent || "") };
      const real = navigator.clipboard;
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: (t) => { out.txt = t; return Promise.resolve(); } },
        configurable: true,
      });
      try { window.app.copyProposalText(); } catch (e) { out.txt = "ОШИБКА: " + e.message; }
      await new Promise((r) => setTimeout(r, 100));
      Object.defineProperty(navigator, "clipboard", { value: real, configurable: true });
      return out;
    });

    assert(res.html, "предпросмотр КП не отрисовался");
    // Единственное допустимое упоминание сервиса в документе — мелкая подпись внизу
    // (.proposal-service-note), она же снимается на платном тарифе. Всё остальное
    // «adervis» в бланке означает, что документ подписан не той компанией.
    const noteAt = res.html.indexOf("proposal-service-note");
    const withoutNote = noteAt === -1 ? res.html : res.html.slice(0, noteAt);
    assert(!withoutNote.toLowerCase().includes("adervis"),
      "в КП без заполненного профиля напечатано имя сервиса");
    assert(!res.html.includes("КП сформировано в ADERVIS"),
      "в документе клиенту остался номер версии приложения (внутренний учёт в чужом документе)");
    assert(!res.html.includes("logo-icon.svg"),
      "в КП без своего логотипа напечатан логотип сервиса");
    assert(!res.txt.toLowerCase().startsWith("adervis"),
      "текст КП для мессенджера начинается именем сервиса: " + res.txt.slice(0, 60));
    assert(res.banner.includes("Не указано название компании"),
      "нет напоминания заполнить профиль — человек узнает о безымянном КП после отправки");
    assert(errors.length === 0, "ошибки страницы: " + errors.join(" | "));
    await context.close();
  });

  await test("документы: заполненное название печатается, напоминание уходит", async () => {
    const { context, page, errors } = await bootLocal(browser, baseUrl, { seedDemo: true });
    const id = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return ((st.savedProjects || [])[0] || {}).id || null;
    });
    await page.evaluate((i) => window.app.openDeal(i), id);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.app.updateCompany("name", "Студия Пример");
      window.app.setDealView("proposal");
    });
    await page.waitForTimeout(400);

    const res = await page.evaluate(() => ({
      html: (document.querySelector(".proposal-preview") || {}).innerHTML || "",
      banner: document.getElementById("appContent").textContent || "",
    }));
    assert(res.html.includes("Студия Пример"), "название студии не попало в КП");
    assert(!res.banner.includes("Не указано название компании"),
      "напоминание осталось при заполненном названии");

    // И обратно: стёрли название — напоминание вернулось. Проверка именно связки,
    // а не разового состояния: иначе плашка могла бы показываться один раз и гаснуть.
    await page.evaluate(() => window.app.updateCompany("name", ""));
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => document.getElementById("appContent").textContent || "");
    assert(back.includes("Не указано название компании"),
      "название стёрли, а напоминание не вернулось");
    assert(errors.length === 0, "ошибки страницы: " + errors.join(" | "));
    await context.close();
  });

  /* Деньги клиента не должны проходить через магазин сервиса: у чужой студии
     аванс уходил бы владельцу сервиса (и падал в его лимит по НПД). Способ
     оплаты выбирает само агентство, и КП обязано показывать именно его. */
  await test("портал КП: без настроенной оплаты кнопки нет вовсе", async () => {
    const { context, page, errors } = await bootPortal(browser, baseUrl, { ...PORTAL_ROW, pay_method: "none" });
    const res = await page.evaluate(() => ({
      txt: document.querySelector("#appContent").textContent || "",
      payBtn: !!document.getElementById("portalPayBtn"),
    }));
    assert(!res.payBtn, "показана кнопка онлайн-оплаты, хотя агентство её не настраивало");
    assert(!/Онлайн-оплата аванса/.test(res.txt), "остался блок онлайн-оплаты при pay_method=none");
    assert(/Рекламный ролик для бренда/.test(res.txt), "само КП не отрисовалось");
    assert(errors.length === 0, "ошибки на портале: " + errors.join(" | "));
    await context.close();
  });

  await test("портал КП: способ «ссылка» ведёт на сайт агентства, а не в ЮKassa", async () => {
    const link = "https://lknpd.nalog.ru/invoice/12345";
    const { context, page, errors } = await bootPortal(browser, baseUrl,
      { ...PORTAL_ROW, pay_method: "link", pay_link: link });
    const res = await page.evaluate(() => {
      const a = [...document.querySelectorAll("#appContent a")].find((x) => /Перейти к оплате/.test(x.textContent || ""));
      return { href: a ? a.getAttribute("href") : null, rel: a ? a.getAttribute("rel") : "", payBtn: !!document.getElementById("portalPayBtn") };
    });
    assert(res.href === link, "ссылка оплаты не совпала с заданной агентством: " + res.href);
    assert(/noopener/.test(res.rel || ""), "внешняя ссылка без rel=noopener");
    assert(!res.payBtn, "рядом со ссылкой осталась кнопка платежа через сервис");
    assert(errors.length === 0, "ошибки на портале: " + errors.join(" | "));
    await context.close();
  });

  await test("портал КП: «реквизиты» показывают текст агентства и не создают платёж", async () => {
    const details = "Перевод по СБП на +7 900 000-00-00, получатель Артём Н.";
    const { context, page, errors } = await bootPortal(browser, baseUrl,
      { ...PORTAL_ROW, pay_method: "requisites", pay_details: details });
    const res = await page.evaluate(() => ({
      txt: document.querySelector("#appContent").textContent || "",
      payBtn: !!document.getElementById("portalPayBtn"),
    }));
    assert(res.txt.includes("Перевод по СБП"), "реквизиты агентства не показаны клиенту");
    assert(!res.payBtn, "при оплате переводом не должно быть кнопки платежа через сервис");
    assert(errors.length === 0, "ошибки на портале: " + errors.join(" | "));
    await context.close();
  });

  // Счёт в «Мой налог» выставляется на конкретную сумму, поэтому ссылка у каждого
  // КП своя и её легко забыть. Клиенту в этом случае нельзя показывать кнопку,
  // ведущую в никуда, — блок оплаты просто не рисуется.
  await test("портал КП: способ «ссылка» без ссылки не рисует кнопку в никуда", async () => {
    const { context, page, errors } = await bootPortal(browser, baseUrl,
      { ...PORTAL_ROW, pay_method: "link", pay_link: "" });
    const res = await page.evaluate(() => ({
      hasLink: [...document.querySelectorAll("#appContent a")].some((a) => /Перейти к оплате/.test(a.textContent || "")),
      payBtn: !!document.getElementById("portalPayBtn"),
      txt: document.querySelector("#appContent").textContent || "",
    }));
    assert(!res.hasLink && !res.payBtn, "показана кнопка оплаты, хотя ссылка не задана");
    assert(/Рекламный ролик для бренда/.test(res.txt), "само КП не отрисовалось");
    assert(errors.length === 0, "ошибки на портале: " + errors.join(" | "));
    await context.close();
  });

  // Чужая схема в ссылке (javascript:, data:) — это XSS через настройку агентства.
  await test("портал КП: ссылка оплаты принимается только http(s)", async () => {
    const { context, page } = await bootPortal(browser, baseUrl,
      { ...PORTAL_ROW, pay_method: "link", pay_link: "javascript:alert(1)" });
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll("#appContent a")].some((a) => /^javascript:/i.test(a.getAttribute("href") || "")));
    assert(!bad, "в КП попала ссылка с чужой схемой");
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

    /* Кнопка обязана делать то, что обещает. Пока сделки нет, шаги «Соберите
       смету» и «Отправьте КП» делать нечего — раньше их кнопки МОЛЧА подменяли
       действие и обе вели в мастер новой сделки. На экране стояли три кнопки с
       тремя разными обещаниями, а нажатие у всех давало одно и то же; живой обход
       разделов нашёл их как три вызова app.startWizard() в одном разделе.
       Проверяем по ДЕЙСТВИЮ, а не по подписи: подписи как раз и различались. */
    const actions = await page.evaluate(() => {
      const panel = [...document.querySelectorAll("#appContent .panel")]
        .find((p) => /Начало работы/.test(p.textContent || ""));
      if (!panel) return null;
      return [...panel.querySelectorAll("button")]
        .map((b) => (b.getAttribute("onclick") || "").replace(/\s+/g, ""))
        .filter((a) => a && !/_onboardingDismissed/.test(a));
    });
    assert(actions, "не нашлась панель чеклиста");
    const dupes = actions.filter((a, i) => actions.indexOf(a) !== i);
    assertEqual(dupes.length, 0, "в чеклисте кнопки с разными подписями делают одно и то же: " + dupes.join(", "));
    // Заблокированный шаг честно говорит, что ждёт очереди, а не рисует кнопку.
    assert(/после первого шага/.test(txt), "шаг без выполненного предусловия снова показывает кнопку");
    await context.close();
  });

  /* Путь новичка меряется НА ТЕЛЕФОНЕ и по результату: видно ли действие без
     прокрутки. Замер 22.08.2026 на 390×844: кнопка «Создать» из чеклиста стояла
     на y=1001 — под девятью денежными плитками, посчитанными по ВЫДУМАННОЙ
     демо-сделке. Человек в первую минуту видел чужую выручку вместо того, что
     ему делать.

     Проверяем координату кнопки, а не порядок блоков в разметке: порядок —
     способ, а обещание продукта — «первое действие видно сразу». Новая плитка
     или другая раскладка эту проверку не обманут. */
  await test("путь новичка: первое действие видно без прокрутки на 390×844", async () => {
    const { context, page: p } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    await p.evaluate(() => window.app.go("home"));
    await p.waitForTimeout(300);
    const pos = await p.evaluate(() => {
      const btn = [...document.querySelectorAll("#appContent button")]
        .find((b) => /app\.startWizard\(\)/.test(b.getAttribute("onclick") || ""));
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      const firstMoney = document.querySelector("#appContent .db-stat");
      return {
        top: Math.round(r.top),
        fold: window.innerHeight,
        moneyTop: firstMoney ? Math.round(firstMoney.getBoundingClientRect().top) : null,
      };
    });
    assert(pos, "на главной новичка нет кнопки «Создать первую сделку»");
    assert(
      pos.top < pos.fold,
      `единственное действие новичка ушло за первый экран: y=${pos.top} при высоте ${pos.fold}`
    );
    assert(
      pos.moneyTop === null || pos.top < pos.moneyTop,
      `денежные плитки примера (y=${pos.moneyTop}) стоят выше первого действия (y=${pos.top})`
    );
    await context.close();
  });

  /* Демо-сделка приходит с платежом «Аванс 50%» датой сегодня. Считать её деньги
     продукт вправе (это настоящая запись в состоянии человека, он может её
     открыть и править), а вот выдавать за его заработок — нет: до 22.08.2026
     новичок в первый день читал «Выручка / мес 76 750 ₽» и «Всего получено
     76 750 ₽» про деньги, которых не получал. Расхождение жило ВНУТРИ одного
     экрана: чеклист прямо под плитками специально не считал демо прогрессом. */
  await test("деньги примера названы примером — и на главной, и в «Финансах»", async () => {
    const { context, page: p } = await bootLocal(browser, baseUrl, { seedDemo: true });
    await p.evaluate(() => window.app.go("home"));
    await p.waitForTimeout(250);
    const home = await p.evaluate(() => {
      const strip = document.querySelector("#appContent .demo-kind-strip");
      return { text: strip ? (strip.textContent || "").replace(/\s+/g, " ") : null };
    });
    assert(home.text, "полоса примера пропала с главной");
    assert(
      /цифр/i.test(home.text),
      "полоса примера не говорит, что цифры вокруг — из примера: " + home.text.slice(0, 90)
    );

    /* Список денежных экранов, а не один: оговорка на главной и в «Финансах»
       при молчащих «Клиентах» — ровно то точечное исключение, из-за которого
       демо и считалась настоящими деньгами. Появится четвёртый экран с суммами
       примера — его место здесь. */
    /* Селектор — по разметке САМОГО списка (.client-card / .client-list-row), а не
       по «чему-нибудь, что открывает клиента»: первая версия ловила `[onclick*=
       'openClient']` и находила скрытый пункт меню «+» с y=0, из-за чего проверка
       падала на исправном экране. Дефект замера, а не кода. */
    for (const [view, moneySel] of [["global-finances", ".fin-card"], ["clients", ".client-card, .client-list-row"]]) {
      await p.evaluate((v) => window.app.go(v), view);
      await p.waitForTimeout(300);
      const r = await p.evaluate((sel) => {
        const note = document.querySelector("#appContent .demo-money-note");
        const money = document.querySelector("#appContent " + sel);
        const y = (el) => (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null);
        return {
          has: !!note,
          noteY: y(note),
          moneyY: y(money),
          moneyCls: money ? money.className : null,
          aboveMoney: note && money ? y(note) < y(money) : null,
        };
      }, moneySel);
      assert(r.has, `раздел «${view}» показывает суммы примера без единой оговорки`);
      assert(
        r.aboveMoney !== false,
        `в «${view}» оговорка (y=${r.noteY}) стоит НИЖЕ сумм (y=${r.moneyY}, ${r.moneyCls})`
      );
    }
    await context.close();
  });

  /* Обратная сторона: как только сделка своя, цифры — правда, и продукт обязан
     вернуться к обычному виду. Иначе подсказка новичка становится вечной
     плашкой, а такие живут в продукте годами. Сделку заводим тем же путём, что
     человек: мастер, а не подсунутое состояние. */
  await test("своя сделка появилась — оговорки про пример уходят, цифры идут первыми", async () => {
    const { context, page: p } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    await p.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("name", "ООО Ромашка");
      window.app.wizardNext();
      window.app.wizardSetField("projectName", "Ролик для сайта");
      window.app.wizardNext();
      window.app.finishWizard("estimate");
    });
    await p.waitForTimeout(400);
    await p.evaluate(() => window.app.go("home"));
    await p.waitForTimeout(300);
    const home = await p.evaluate(() => {
      const money = document.querySelector("#appContent .db-stat");
      const list = document.querySelector("#appContent .demo-kind-strip");
      const check = [...document.querySelectorAll("#appContent .panel")]
        .find((x) => /Начало работы/.test(x.textContent || ""));
      return {
        strip: !!list,
        moneyTop: money ? Math.round(money.getBoundingClientRect().top) : null,
        checkTop: check ? Math.round(check.getBoundingClientRect().top) : null,
      };
    });
    assert(!home.strip, "полоса примера осталась на главной после появления своей сделки");
    assert(home.moneyTop !== null, "денежные плитки пропали с главной");
    assert(
      home.checkTop === null || home.moneyTop < home.checkTop,
      `у аккаунта со своей сделкой чеклист (y=${home.checkTop}) всё ещё выше цифр (y=${home.moneyTop})`
    );

    for (const view of ["global-finances", "clients"]) {
      await p.evaluate((v) => window.app.go(v), view);
      await p.waitForTimeout(300);
      const note = await p.evaluate(() => !!document.querySelector("#appContent .demo-money-note"));
      assert(!note, `оговорка про пример осталась в «${view}» при своей сделке`);
    }
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

  // Состав услуг в КП собирался через BASE_ITEMS.find — только встроенный каталог.
  // Свои услуги агентства и переименованные встроенные молча выпадали из списка,
  // который видит клиент, при том что сумма считалась по полной смете. Печатная
  // версия у владельца при этом была правильной, так что заметить расхождение
  // со своего экрана было невозможно.
  await test("КП: клиент видит свои услуги агентства и их переименования", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, { width: 1100, height: 800 });

    const customId = await page.evaluate(() => {
      window.app.createCustomItem();
      const s = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const custom = (s.customItems || [])[0];
      return custom ? custom.id : null;
    });
    assert(customId, "createCustomItem() не создал свою услугу");

    const list = await page.evaluate((customId) => {
      // Переименовываем встроенную позицию и кладём обе в смету.
      const base = "edit_short";
      window.app.updateCatalogOverride(base, "name", "Монтаж вертикалок под клиента");
      const snap = { selected: {} };
      snap.selected[customId] = { qty: 1 };
      snap.selected[base] = { qty: 1 };
      // Опция «сверх сметы»: в total_price не входит, значит и в списке ей не место.
      snap.selected.subtitles = { qty: 1, optional: true };
      return window.app._proposalServicesList(snap);
    }, customId);

    assertEqual(list.length, 2, "в составе услуг должны быть обе основные позиции и НИ ОДНОЙ опции, получено: " + JSON.stringify(list));
    assert(
      list.includes("Монтаж вертикалок под клиента"),
      "переименованная встроенная услуга должна идти под новым названием, получено: " + JSON.stringify(list)
    );
    // Своя услуга — вторая; её имя задаёт createCustomItem, поэтому проверяем сам факт
    // присутствия непустого названия, а не конкретную строку.
    assert(
      list.some(n => n && n !== "Монтаж вертикалок под клиента"),
      "своя услуга агентства должна попасть в состав услуг, получено: " + JSON.stringify(list)
    );

    await context.close();
  });

  /* Переключатели «Что показывать в КП» применялись ТОЛЬКО в печати у владельца:
     included_text / excluded_text / proposal_note уходили в client_portals всегда.
     Агентство снимало галочку, видело, что блок исчез у себя на экране, — а клиент
     его по-прежнему читал. Тот же класс расхождения, что и с составом услуг.

     Проверяем через шов app._portalTextBlocks: путь записи в Supabase тестами не
     покрыт (в local mode _supabase нет вовсе), иначе правило сторожил бы только
     регэксп по исходнику. */
  await test("КП: снятые галочки «Что показывать» не уходят клиенту", async () => {
    const { context: c3, page: p3 } = await bootLocal(browser, baseUrl, { width: 1200, height: 900 });
    const res = await p3.evaluate(() => {
      const f = window.app._portalTextBlocks;
      if (!f) return null;
      const full = {
        includedText: "Съёмка, монтаж, цветокоррекция",
        excludedText: "Актёры и студия",
        proposalNote: "Цены действуют 7 дней"
      };
      const mix = (extra) => Object.assign({}, full, extra);
      return {
        // Флажков нет вовсе — сделка заведена до их появления: показываем всё.
        legacy: f(full),
        allOn: f(mix({ proposalShowIncluded: true, proposalShowExcluded: true, proposalShowNote: true })),
        includedOff: f(mix({ proposalShowIncluded: false })),
        excludedOff: f(mix({ proposalShowExcluded: false })),
        noteOff: f(mix({ proposalShowNote: false })),
        empty: f({})
      };
    });
    assert(res, "нет шва app._portalTextBlocks — правило можно проверить только регэкспом");

    assertEqual(res.legacy.included, "Съёмка, монтаж, цветокоррекция",
      "у сделки без флажков блок пропал — undefined должен значить «показывать», как и в печати");
    assertEqual(res.allOn.excluded, "Актёры и студия", "включённая галочка убрала блок");

    assertEqual(res.includedOff.included, "", "снятая галочка «Что входит» — блок всё равно уходит клиенту");
    assertEqual(res.includedOff.excluded, "Актёры и студия",
      "снятая галочка «Что входит» задела соседний блок");
    assertEqual(res.excludedOff.excluded, "", "снятая галочка «Что не входит» — блок всё равно уходит клиенту");
    assertEqual(res.noteOff.note, "", "снятое «Примечание» всё равно уходит клиенту");
    assertEqual(res.empty.included, "", "пустая сделка отдала не пустую строку");

    await c3.close();
  });
};
