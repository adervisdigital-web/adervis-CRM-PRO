// Арифметика денег — единственная часть приложения, где баги повторялись из сессии
// в сессию, и до этого набора она не была покрыта ни одной проверкой:
//   • архивные сделки попадали в «Оборот»/«Собираемость» (правилось 4 раза);
//   • открытая сделка учитывалась и в live-state, и в снапшоте → суммы месяца
//     задваивались ([[gotcha-active-project-double-count]]);
//   • пустая смета стирала бюджет.
// Поэтому здесь не «рендерится ли раздел», а именно СУММЫ: состояние задаётся
// вручную (детерминированно), ожидания посчитаны на бумаге.
const { loadPlaywright, bootLocal, assert, assertEqual } = require("../harness");

const STORAGE_KEY = "adervis_pro_381_state";

// Текущий месяц — суммы «за месяц» считаются по префиксу YYYY-MM, поэтому даты
// вычисляем от сегодняшнего дня, а не хардкодим.
// Дата внутри ТЕКУЩЕГО месяца — нужна, чтобы операция попала в метрику «за месяц».
// День зажимаем сегодняшним: раньше dayThisMonth(9) в первых числах месяца давал
// дату в БУДУЩЕМ, а приложение теперь переспрашивает про такие операции (деньги
// отмечают по факту). В тесте на это отвечает автодиспетчер Playwright — отказом,
// и сохранение молча не происходило. Фикстуре будущая дата не нужна ни для чего.
function dayThisMonth(day) {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(Math.min(day, d.getDate()))}`;
}

// Сделки: A — оплачена частично, B — оплачена полностью, C — архивная.
//   долг       = 60 000 (только A; у B нулевой, C архив → вне метрики)
//   выручка/мес = 90 000 (40 000 + 50 000)
//   расходы/мес = 10 000
//   собираемость = 90 000 / 150 000 = 60 % (архивная C не в знаменателе)
function seedDeals() {
  const mk = (id, name, total, paid, crmStatus, payments, expenses) => ({
    id, name, client: "Клиент " + name, clientId: "cl_" + id,
    total, paid, debt: Math.max(0, total - paid), crmStatus, status: "В работе",
    updatedAt: new Date().toISOString(),
    snapshot: { project: { name, client: "Клиент " + name }, payments, expenses, tasks: [], selected: {} }
  });
  return [
    mk("d_a", "A", 100000, 40000, "В работе",
       [{ id: "pa1", title: "Предоплата", amount: 40000, date: dayThisMonth(5), method: "" }],
       [{ id: "ea1", title: "Аренда", amount: 10000, date: dayThisMonth(6), category: "Прочее" }]),
    mk("d_b", "B", 50000, 50000, "В работе",
       [{ id: "pb1", title: "Оплата", amount: 50000, date: dayThisMonth(7), method: "" }], []),
    mk("d_c", "C", 30000, 0, "Архив", [], []),
  ];
}

async function bootSeeded(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await page.addInitScript(({ key, deals }) => {
    localStorage.setItem("adervis_local_mode", "1");
    localStorage.setItem("adervis_tour_done", "1");
    localStorage.setItem("adervis_onboarded", "1");
    // Минимальное состояние: migrateState() достроит остальное дефолтами.
    localStorage.setItem(key, JSON.stringify({ savedProjects: deals, view: "home" }));
  }, { key: STORAGE_KEY, deals: seedDeals() });

  await page.goto(baseUrl + "/index.html", { waitUntil: "load" });
  await page.waitForFunction(() => {
    const el = document.getElementById("appContent");
    return el && el.innerHTML.trim().length > 0;
  }, { timeout: 20000 });
  return { context, page, errors };
}

// Значение плитки дашборда по её подписи → число (money() форматирует с пробелами-разделителями).
async function dbStat(page, title) {
  await page.evaluate(() => window.app.go("home"));
  await page.waitForTimeout(120);
  return page.evaluate((t) => {
    const tile = document.querySelector(`.db-stat[title="${t}"]`);
    if (!tile) return null;
    const v = tile.querySelector(".db-stat-value");
    return v ? Number(v.textContent.replace(/[^\d-]/g, "")) : null;
  }, title);
}

// Значение KPI-плитки в разделе «Финансы» по подписи.
// «Собираемость» и прочие KPI живут на подвкладке «Аналитика», а не на дефолтной
// «Транзакции» — без переключения плиток в DOM просто нет.
async function finKpi(page, label) {
  await page.evaluate(() => { window.app.go("global-finances"); window.app.setGFinSubTab("analytics"); });
  await page.waitForTimeout(200);
  return page.evaluate((l) => {
    for (const tile of document.querySelectorAll(".kpi-tile")) {
      const lbl = tile.querySelector(".kpi-lbl");
      if (lbl && lbl.textContent.trim() === l) {
        const v = tile.querySelector(".kpi-val");
        return v ? Number(v.textContent.replace(/[^\d-]/g, "")) : null;
      }
    }
    return null;
  }, label);
}

module.exports = async function ({ browser, baseUrl, test }) {

  await test("тариф сверх лимита правится вручную и не едет за ценой позиции", async () => {
    /* Тарифы монтажа (минута, камера/исходник, доп. версия, доп. правка) лежали в
       описании позиции и умножались на отношение «текущая цена ÷ базовая». Задать
       ОДИН тариф было нельзя: менялись только все разом, вслед за ценой. Владелец
       спросил, где их править, — правильный ответ был «нигде».

       Ручное значение задаётся в рублях и ценой НЕ масштабируется: иначе введённое
       число тут же поехало бы, и на экране оказалось бы не то, что вбили. Пустое
       поле возвращает автоматику, и подсказка в поле показывает именно её. */
    const { context, page } = await bootLocal(browser, baseUrl, { seedDemo: true, width: 1200, height: 950 });
    try {
      await page.evaluate(() => window.app.go("catalog"));
      await page.waitForTimeout(500);
      await page.evaluate(() => window.app.openCatalogEdit("edit"));
      await page.waitForTimeout(400);

      const fields = await page.evaluate(() =>
        [...document.querySelectorAll('[data-key^="rate:"]')].map((i) => ({ key: i.dataset.key, hint: i.placeholder, val: i.value })));
      assertEqual(fields.length, 4, "полей тарифа не четыре: " + JSON.stringify(fields));
      assert(fields.every((f) => Number(f.hint) > 0), "в подсказке нет автоматического тарифа: " + JSON.stringify(fields));
      assert(fields.every((f) => f.val === ""), "поля тарифа заполнены по умолчанию — автоматику не отличить от ручного значения");

      const autoBefore = Number(fields.find((f) => f.key === "rate:extraRevision").hint);

      await page.evaluate(() => {
        const el = document.querySelector('[data-key="rate:extraRevision"]');
        el.value = "5000";
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.waitForTimeout(500);
      const saved = await page.evaluate(() => {
        const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
        return ((st.catalogOverrides || {}).edit || {}).rateOverrides || null;
      });
      assert(saved && saved.extraRevision === 5000, "ручной тариф не сохранился: " + JSON.stringify(saved));

      // Цена вдвое: автоматические тарифы обязаны удвоиться, ручной — остаться.
      // updateCatalogPrice спрашивает причину диалогом, отвечаем на него.
      page.evaluate(() => window.app.updateCatalogPrice("edit", "12000"));
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll(".modal-overlay button")].find((b) => /Сохранить/.test(b.textContent));
        if (btn) btn.click();
      });
      await page.waitForTimeout(900);
      await page.evaluate(() => window.app.openCatalogEdit("edit"));
      await page.waitForTimeout(400);

      const after = await page.evaluate(() =>
        [...document.querySelectorAll('[data-key^="rate:"]')].map((i) => ({ key: i.dataset.key, hint: Number(i.placeholder), val: i.value })));
      const rev = after.find((f) => f.key === "rate:extraRevision");
      const min = after.find((f) => f.key === "rate:perMinute");
      assertEqual(rev.val, "5000", "ручной тариф уехал вслед за ценой — введённое число перестало быть тем, что вбили");
      assertEqual(rev.hint, autoBefore * 2, `подсказка должна показывать АВТОМАТИЧЕСКИЙ тариф (${autoBefore * 2}), а показывает ${rev.hint}`);
      assert(min.hint > 0 && min.val === "", "автоматический тариф перестал считаться от цены");
    } finally {
      await context.close();
    }
  });
  const { context, page, errors } = await bootSeeded(browser, baseUrl);

  await test("дашборд: долг клиентов = сумма недоплат по активным сделкам", async () => {
    assertEqual(await dbStat(page, "Долг клиентов"), 60000, "долг посчитан неверно");
  });

  await test("дашборд: выручка/расходы/прибыль за месяц из снапшотов сделок", async () => {
    assertEqual(await dbStat(page, "Выручка / мес"), 90000, "выручка месяца");
    assertEqual(await dbStat(page, "Расходы / мес"), 10000, "расходы месяца");
    assertEqual(await dbStat(page, "Прибыль / мес"), 80000, "прибыль месяца");
  });

  await test("архивная сделка не входит в знаменатель «Собираемости»", async () => {
    // 90 000 из 150 000 = 60 %. Если архивная C (30 000) попадёт в знаменатель — 50 %.
    assertEqual(await finKpi(page, "Собираемость"), 60, "архивная сделка попала в собираемость");
  });

  await test("архивирование оплаченной сделки меняет собираемость по факту", async () => {
    // Убираем из метрики полностью оплаченную B: остаётся 40 000 из 100 000 = 40 %.
    await page.evaluate(() => window.app.archiveDeal("d_b"));
    await page.waitForTimeout(200);
    assertEqual(await finKpi(page, "Собираемость"), 40, "после архивации B собираемость не пересчиталась");
    await page.evaluate(() => window.app.unarchiveDeal("d_b"));
    await page.waitForTimeout(200);
    assertEqual(await finKpi(page, "Собираемость"), 60, "возврат из архива не восстановил собираемость");
  });

  await test("открытая сделка не задваивает суммы месяца (live-state + снапшот)", async () => {
    const before = await dbStat(page, "Выручка / мес");
    assertEqual(before, 90000, "исходная выручка месяца");
    // Открываем A: её платежи переезжают в live state.payments, оставаясь в снапшоте.
    await page.evaluate(() => window.app.loadSavedProject("d_a"));
    await page.waitForTimeout(250);
    const after = await dbStat(page, "Выручка / мес");
    assertEqual(after, 90000, `после открытия сделки выручка задвоилась: ${before} → ${after}`);
    assertEqual(await dbStat(page, "Долг клиентов"), 60000, "после открытия сделки долг изменился");
  });

  await test("поступление через модалку финансов уменьшает долг и растит выручку", async () => {
    // Заодно регресс на то, что поля модалки фиксируются при сохранении:
    // setFinanceModalField больше не пишет состояние на каждый символ.
    const debtBefore = await dbStat(page, "Долг клиентов");
    const revBefore = await dbStat(page, "Выручка / мес");
    await page.evaluate((date) => {
      window.app.openFinanceModal("payment");
      window.app.setFinanceModalField("projectId", "d_a");
      window.app.setFinanceModalField("amount", "15000");
      window.app.setFinanceModalField("date", date);
      window.app.setFinanceModalField("title", "Доплата");
      window.app.saveFinanceModal();
    }, dayThisMonth(9));
    await page.waitForTimeout(250);
    assertEqual(await dbStat(page, "Долг клиентов"), debtBefore - 15000, "долг не уменьшился на сумму поступления");
    assertEqual(await dbStat(page, "Выручка / мес"), revBefore + 15000, "выручка месяца не выросла на сумму поступления");
  });

  // ── Ввод сумм ─────────────────────────────────────────────────────────────
  // Ошибка в разряде на поступлении стоит дороже любой другой опечатки в приложении,
  // поэтому поле суммы группирует цифры по три. Проверяем и то, что при этом не
  // сломался ввод: раньше модалка редактирования транзакции перерисовывалась на
  // каждый символ и фокус улетал в body после первого же нажатия.
  await test("поле суммы группирует разряды и не теряет курсор в середине числа", async () => {
    // ВАЖНО: app-метод, открывающий модалку, зовём блочной стрелкой — иначе Playwright
    // ждёт возвращённый промис и набор виснет ([[gotcha-playwright-evaluate-async-deadlock]]).
    await page.evaluate(() => { window.app.openFinanceModal("payment"); });
    await page.waitForSelector("#finModalAmount", { timeout: 5000 });
    await page.click("#finModalAmount");
    await page.keyboard.type("18933");
    assertEqual(await page.$eval("#finModalAmount", (e) => e.value), "18 933", "разряды не проставлены");

    // Печатаем в середину: «18|933» → 7. Курсор обязан остаться за вставленным символом.
    await page.$eval("#finModalAmount", (el) => el.setSelectionRange(2, 2));
    await page.keyboard.type("7");
    const mid = await page.$eval("#finModalAmount", (el) => ({ v: el.value, caret: el.selectionStart }));
    assertEqual(mid.v, "187 933", "вставка в середину числа сломала значение");
    assertEqual(mid.caret, 3, "курсор прыгнул после вставки в середину");
    await page.evaluate(() => { window.app.closeFinanceModal(); });
  });

  await test("редактирование транзакции: фокус не улетает после первого символа", async () => {
    // Подвкладку задаём явно: предыдущий тест переключил раздел на «Аналитику», и
    // выбор запоминается в состоянии — списка транзакций там просто нет.
    await page.evaluate(() => { window.app.go("global-finances"); window.app.setGFinSubTab("transactions"); });
    await page.waitForTimeout(250);
    // Клик диспатчим из страницы: строка таблицы перекрывается липкой шапкой раздела,
    // и настоящий клик мышью до неё не доходит. Блочная стрелка — чтобы не вернуть промис.
    await page.evaluate(() => { document.querySelector("#appContent [onclick*='openEditTransaction']").click(); });
    await page.waitForSelector(".modal-amount-input", { timeout: 5000 });
    await page.fill(".modal-amount-input", "");
    await page.type(".modal-amount-input", "180000");
    const res = await page.$eval(".modal-amount-input", (el) => ({
      v: el.value,
      focused: document.activeElement === el,
    }));
    assertEqual(res.v, "180 000", "в поле доехали не все цифры (потеря фокуса?)");
    assert(res.focused, "поле суммы потеряло фокус во время ввода");
    await page.evaluate(() => { window.app.closeEditTransactionModal(); });
  });

  // Бюджет, названный клиентом в мастере, раньше оставался в state.wizard и исчезал.
  await test("бюджет из мастера становится суммой сделки, пока смета пуста", async () => {
    await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Сделка с бюджетом");
      window.app.wizardSetField("budget", "37 985");
      window.app.finishWizard("estimate");
    });
    await page.waitForTimeout(300);
    const txt = await page.$eval("#appContent", (el) => el.textContent.replace(/\s+/g, " "));
    assert(/Бюджет сделки/.test(txt), "сделка без позиций не показывает бюджет");
    assert(/37\s*985/.test(txt), "бюджет из мастера не доехал до сделки: " + txt.slice(0, 120));
  });

  /* Пустая сделка отчитывалась как закрытая: «Долг 0 ₽ · Закрыто» ЗЕЛЁНЫМ, «50% =
     0 ₽» и «Прибыль 0 ₽ · 0%». Формально верно, читается как «клиент всё оплатил,
     маржа нулевая» — ноль-потому-что-заплатили и ноль-потому-что-нечего-платить
     выглядели одинаково. Проверяем обе стороны: пустая сделка молчит, а как только
     появляется сумма — плитки снова считают, иначе «починка» просто выключила экран. */
  await test("финансы сделки: пустая сделка не отчитывается как оплаченная", async () => {
    await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Пустые финансы");
      window.app.finishWizard("estimate");
      window.app.setDealView("finance");
    });
    await page.waitForTimeout(400);

    const cards = () => page.$$eval(".fin-card", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
    const empty = (await cards()).join(" | ");
    assert(!/Закрыто/.test(empty), "на сделке без сметы долг помечен «Закрыто»: " + empty);
    assert(/Счёт ещё не выставлен/.test(empty), "нет честной подписи у пустого долга: " + empty);
    assert(!/50% = 0/.test(empty), "показан аванс «50% = 0 ₽» от несуществующей сметы: " + empty);
    assert(!/\b0%/.test(empty), "показан процент оплаты или маржи там, где считать нечего: " + empty);

    // Появилась сумма — экран обязан вернуться к обычному расчёту.
    await page.evaluate(() => {
      window.app.updateProject("crmStatus", "В работе");
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Финансы с бюджетом");
      window.app.wizardSetField("budget", "120 000");
      window.app.finishWizard("estimate");
      window.app.setDealView("finance");
    });
    await page.waitForTimeout(400);
    const filled = (await cards()).join(" | ");
    assert(/120\s*000/.test(filled), "бюджет не доехал до финансов: " + filled);
    assert(/50% =/.test(filled), "с появлением сметы не вернулась подсказка про аванс: " + filled);
    assert(/Ожидаем/.test(filled), "долг по неоплаченной сделке снова не показан: " + filled);
  });

  /* Закрытая сделка уходит из ОПЕРАТИВНЫХ чисел — правило, которое продукт уже
     применяет в списке «Задачи» и в телеграм-статистике. Но два счётчика
     просроченных (бейдж у пунктов меню и плитка «Дедлайны / 7 дн» на главной)
     считали задачи ВСЕХ сделок, включая сданные и архивные.

     Хуже всего тут расхождение: бейдж обещает семь просроченных, человек
     открывает список и видит две — остальные пять принадлежат сделкам,
     закрытым полгода назад. Первому числу перестают верить, а список
     перестают открывать. */
  await test("просрочки закрытых сделок не попадают в счётчики главной и меню", async () => {
    /* Число просроченных живёт в ПОДПИСИ плитки («N просрочено»), а её крупное
       значение — это дедлайны за 7 дней. Первая версия замера читала значение и
       получала ноль на исправном экране. */
    const overdue = () => page.evaluate(() => {
      const tile = [...document.querySelectorAll("#appContent .db-stat")]
        .find((e) => /Дедлайны/.test(e.textContent || ""));
      if (!tile) return { found: false, count: null };
      const delta = (tile.querySelector(".db-stat-delta")?.textContent || "").trim();
      const m = delta.match(/(\d+)\s*просрочено/);
      return { found: true, count: m ? Number(m[1]) : 0, delta };
    });

    await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Сделка с просрочкой");
      window.app.finishWizard("estimate");
      window.app.createTask("Новая", "2020-01-01"); // заведомо просроченная
      window.app.saveCurrentProject();
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(400);
    const live = await overdue();
    assert(live.found, "на главной нет плитки «Дедлайны / 7 дн»");
    assert(live.count >= 1, "просроченная задача живой сделки не попала в счётчик: «" + live.delta + "»");

    // Сделку закрыли — её просрочка обязана уйти из оперативных чисел.
    await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      window.app.setKanbanStatus("crm", st.activeProjectId, "Завершённые");
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(400);
    const closed = await overdue();
    assertEqual(
      closed.count, live.count - 1,
      `плитка «Дедлайны» считает просрочку закрытой сделки: было ${live.count}, стало ${closed.count}`
    );
  });

  /* Себестоимость позиций и расходы складываются в «Расходы (план)» — и одни и
     те же деньги попадают туда дважды на раз: у позиции с бейджем «Расходы»
     себестоимость равна цене, а человек заводит тот же платёж ещё и расходом.
     Живой случай владельца 29.08.2026: план 63 580 ₽ при реальных 31 790, и
     заметить это можно было только сложив две строки итогов в уме.

     Подсказка при вводе расхода (v353) помогает лишь тем, кто заводит его
     ПОСЛЕ правки. Здесь — в самих итогах, где на цифры и смотрят. */
  await test("итоги сметы предупреждают, когда себестоимость и расходы могут дублировать друг друга", async () => {
    await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Двойной счёт");
      window.app.finishWizard("estimate");
      window.app.catalogAddOne("director");
    });
    await page.waitForTimeout(450);
    await page.evaluate((KEY) => {
      const st = JSON.parse(localStorage.getItem(KEY) || "{}");
      const id = Object.keys(st.selected || {})[0];
      if (id) { window.app.updateLine(id, "price", 40000); window.app.updateLine(id, "cost", 12000); }
    }, STORAGE_KEY);
    await page.waitForTimeout(350);

    const note = () => page.$eval("#appContent", (el) => /себестоимость позиций и расходы складываются/i.test(el.innerText || ""));
    assert(!(await note()), "предупреждение показано, хотя расходов ещё нет — так оно станет фоном");

    await page.evaluate(() => {
      window.app.openFinanceModal("expense");
      window.app.setFinanceModalField("amount", "12000");
      window.app.setFinanceModalField("title", "Тот же платёж");
      window.app.saveFinanceModal();
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.app.setDealView("estimate"));
    await page.waitForTimeout(400);
    assert(await note(), "итоги молчат о том, что себестоимость и расходы складываются");
  });

  /* Отчёты считают только транзакции: getAllTransactions читает payments и
     expenses и про себестоимость СТРОК СМЕТЫ не знает вовсе. Из-за этого
     «Расходы» занижены на всё, что посчитано в смете, — и человек, не понимая
     почему, заводит те же деньги ещё и расходом, задваивая их в сделке (живой
     случай владельца 23.08.2026).

     Складывать две базы нельзя: смета — план, транзакция — проведённая
     операция. Поэтому проверяем не сумму, а ОБЪЯСНЕНИЕ: аналитика обязана
     называть заложенную в сметах себестоимость и говорить, что в «Расходы»
     она не входит. */
  await test("аналитика объясняет, почему себестоимость из смет не в «Расходах»", async () => {
    await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Смета с себестоимостью");
      window.app.finishWizard("estimate");
      window.app.catalogAddOne("director");
    });
    await page.waitForTimeout(400);
    await page.evaluate((KEY) => {
      const st = JSON.parse(localStorage.getItem(KEY) || "{}");
      const id = Object.keys(st.selected || {})[0];
      if (id) { window.app.updateLine(id, "price", 50000); window.app.updateLine(id, "cost", 31000); }
    }, STORAGE_KEY);
    await page.waitForTimeout(350);

    await page.evaluate(() => { window.app.go("global-finances"); window.app.setGFinSubTab("analytics"); });
    await page.waitForTimeout(450);

    const txt = await page.$eval("#appContent", (el) => (el.innerText || "").replace(/\s+/g, " "));
    assert(
      /В сметах заложена себестоимость/.test(txt),
      "аналитика молчит о себестоимости, заложенной в сметах"
    );
    /* Сумму НЕ сверяем с константой: набор прогоняется на одной странице, и
       соседние тесты добавляют свои сделки с себестоимостью — жёсткое «31 000»
       ломалось от любого нового теста рядом. Проверяем, что названо число и что
       оно не меньше только что заведённой позиции. */
    const named = Number(((txt.match(/В сметах заложена себестоимость ([\d\s ]+)/) || [])[1] || "").replace(/[\s ]/g, ""));
    assert(named >= 31000, "названа не та сумма себестоимости: " + (txt.match(/В сметах заложена[^.]*/) || ["—"])[0]);
    assert(
      /не входит/.test(txt),
      "не сказано главное — что в «Расходы» эта сумма не входит"
    );
  });

  /* Зеркало проверки выше. Нулевая ВЫРУЧКА когда-то давала «0% маржа» красным —
     тревогу там, где просто нет данных; это починили. Нулевая СЕБЕСТОИМОСТЬ
     осталась: у всех позиций каталога, кроме перевыставляемых, cost = 0, поэтому
     смета из пакета даёт «100% маржа» ЗЕЛЁНЫМ — похвалу там, где данных так же
     нет. Первая собственная сделка новичка встречала его именно ей (замер пути
     новичка 22.08.2026), и по этой цифре человек назначает цену, не заложив ни
     аренду, ни людей.

     Проверяем не число (оно верное: без себестоимости прибыль правда равна всей
     сумме), а ОЦЕНКУ: цвет капсулы и наличие объяснения. */
  await test("маржа: незаполненная себестоимость не выдаётся за отличный результат", async () => {
    await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Смета без себестоимости");
      window.app.wizardSetField("budget", "300 000");
      window.app.finishWizard("estimate");
      window.app.setDealView("finance");
    });
    await page.waitForTimeout(400);

    const badge = () => page.evaluate(() => {
      const b = document.querySelector("#appContent .margin-badge");
      if (!b) return null;
      return {
        text: (b.textContent || "").trim(),
        cls: b.className,
        title: b.getAttribute("title") || "",
        near: (b.closest(".fin-card") || b.parentElement || {}).innerText || "",
      };
    });

    const blind = await badge();
    assert(blind, "капсула маржи пропала со вкладки «Финансы»");
    assert(
      !/\bgood\b/.test(blind.cls),
      `маржа без себестоимости покрашена как отличный результат: ${blind.cls} «${blind.text}»`
    );
    assert(
      /себестоимость/i.test(blind.title + " " + blind.near),
      "продукт не объясняет, почему маржа такая: " + JSON.stringify(blind.title || blind.near).slice(0, 120)
    );

    // Себестоимость появилась — оценка обязана вернуться: это не вечная плашка.
    await page.evaluate(() => {
      window.app.openFinanceModal("expense");
      window.app.setFinanceModalField("amount", "100000");
      window.app.setFinanceModalField("title", "Аренда камеры");
      window.app.saveFinanceModal();
    });
    await page.waitForTimeout(450);
    await page.evaluate(() => window.app.setDealView("finance"));
    await page.waitForTimeout(350);

    const known = await badge();
    assert(known, "капсула маржи пропала после внесения расхода");
    assert(
      !/себестоимость не заполнена/i.test(known.title + " " + known.near),
      "объяснение про пустую себестоимость осталось, хотя расход внесён"
    );
    assert(
      /\b(good|ok|bad)\b/.test(known.cls),
      "с появлением расхода маржа так и не получила оценку: " + known.cls
    );
  });

  /* Себестоимость сделки складывается из трёх слагаемых — позиции сметы, выплаты
     команде и расходы — и одни и те же деньги легко попадают в неё дважды. Живой
     случай владельца (23.08.2026): в смете позиция-перевыставление с
     себестоимостью 21 890 ₽, те же 21 890 ₽ заведены ещё и расходом → план
     расходов 43 780 ₽ при реальных 21 890, маржа сделки 69% → 38%.

     Задваивание не случайность: два места считаются ПО-РАЗНОМУ. Себестоимость
     строки видна только внутри сделки, а в «Расходы / мес» и месячный P&L
     попадают ТОЛЬКО транзакции. Кому нужна правда в отчётах — заводит расход и
     ломает сделку. Продукт не может выбрать за человека, но обязан сказать, что
     деньги сложатся. */
  await test("расход к сделке предупреждает о себестоимости, уже заложенной в смете", async () => {
    await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Сделка с себестоимостью в смете");
      window.app.finishWizard("estimate");
    });
    await page.waitForTimeout(400);

    // Позиция с себестоимостью прямо в строке сметы. Состояние читаем из
    // localStorage — публичного геттера у него нет (см. соседние тесты набора).
    await page.evaluate(() => window.app.catalogAddOne("director"));
    await page.waitForTimeout(300);
    const seeded = await page.evaluate((KEY) => {
      const st = JSON.parse(localStorage.getItem(KEY) || "{}");
      const id = Object.keys(st.selected || {})[0];
      if (!id) return null;
      window.app.updateLine(id, "price", 30000);
      window.app.updateLine(id, "cost", 21890);
      return id;
    }, STORAGE_KEY);
    await page.waitForTimeout(250);

    const noteFor = async () => page.evaluate(() => {
      const el = document.querySelector("#modalContainer .fin-linecost-note");
      return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
    });

    await page.evaluate((KEY) => {
      const st = JSON.parse(localStorage.getItem(KEY) || "{}");
      window.app.openFinanceModal("expense");
      window.app.setFinanceModalProject(st.activeProjectId || "");
    }, STORAGE_KEY);
    await page.waitForTimeout(300);
    const expenseNote = await noteFor();
    assert(seeded, "в смете не оказалось ни одной позиции — нечего оценивать");
    assert(
      /21\s*890/.test(expenseNote),
      "расход не предупреждает про себестоимость, уже заложенную в смете: «" + expenseNote.slice(0, 90) + "»"
    );
    assert(/дважды/.test(expenseNote), "подсказка не объясняет последствие — что деньги посчитаются дважды");

    // У ПОСТУПЛЕНИЯ этой подсказки быть не должно: там своя, про остаток долга.
    await page.evaluate(() => window.app.setFinanceModalType("payment"));
    await page.waitForTimeout(250);
    assertEqual(await noteFor(), "", "подсказка про себестоимость показана у поступления, где она не к месту");

    /* Закрываем как человек: модалка «грязная» (проект и тип меняли), поэтому
       closeFinanceModal спрашивает «Закрыть окно?». Без ответа диалог висит, и
       ВЕСЬ набор встаёт по таймауту — тесты делят одну страницу. */
    await page.evaluate(() => { window.app.closeFinanceModal(); });
    await page.waitForTimeout(250);
    /* Жмём программно, а не page.click(): диалог лежит ПОД модалкой финансов по
       стековому контексту, и Playwright ждёт «элемент принимает клики» до
       таймаута — 30 секунд на ровном месте. Нам нужен сам обработчик. */
    await page.evaluate(() => {
      const b = [...document.querySelectorAll(".confirm-dialog-overlay button")]
        .find((x) => /Закрыть/i.test(x.textContent || ""));
      if (b) b.click();
    });
    await page.waitForTimeout(300);
  });
  /* Расход в «Финансах» — проведённая операция: его записывают, когда деньги
     ушли. Галочка «Деньги уже выплачены» (v354) прожила один день: решение
     владельца 29.08.2026 — убрать, «слишком сложно для пользователя». Пара
     «начислено / выплачено» осталась там, где её вводят суммой, — в выплатах
     команде.

     Сторож держит ДВА следствия. Первое: «факт» по расходам сходится с планом,
     то есть отдельной строки «факт» в прибыли нет — именно она и путала. Второе
     важнее: расходы, заведённые ДО v354, лежат с paid=false, и если код снова
     начнёт смотреть на этот флаг, они станут «невыплаченными» навсегда, а
     «Прибыль (факт)» опять покажет всю сумму сделки. */
  await test("расход считается выплаченным сразу — «факт» не расходится с планом", async () => {
    await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Расход без галочек");
      window.app.wizardSetField("budget", "200 000");
      window.app.finishWizard("estimate");
      window.app.openFinanceModal("expense");
      window.app.setFinanceModalField("amount", "50000");
      window.app.setFinanceModalField("title", "Аренда света");
      window.app.saveFinanceModal();
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.app.setDealView("finance"));
    await page.waitForTimeout(400);

    const card = await page.evaluate(() => {
      const el = [...document.querySelectorAll("#appContent .fin-card")]
        .find((c) => /Прибыль/.test(c.textContent || ""));
      return el ? el.innerText.replace(/\s+/g, " ") : null;
    });
    assert(card, "не нашлась карточка прибыли");
    assert(!/факт:/.test(card), "«факт» снова расходится с планом: " + card.slice(0, 120));

    // И в модалке расхода не должно быть никаких галочек про выплату.
    await page.evaluate(() => window.app.openFinanceModal("expense"));
    await page.waitForTimeout(300);
    const hasCheck = await page.evaluate(() =>
      /Деньги уже выплачены/.test(document.getElementById("modalContainer").textContent || ""));
    await page.evaluate(() => { window.app.closeFinanceModal(); });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll(".confirm-dialog-overlay button")].find((x) => /Закрыть/i.test(x.textContent || ""));
      if (b) b.click();
    });
    await page.waitForTimeout(250);
    assert(!hasCheck, "галочка «Деньги уже выплачены» вернулась в модалку расхода");
  });
    await page.waitForTimeout(400);

    // Расход БЕЗ отметки о выплате — начисление вперёд.
    await page.evaluate(() => {
      window.app.openFinanceModal("expense");
      window.app.setFinanceModalField("amount", "40000");
      window.app.setFinanceModalField("title", "Счёт подрядчика");
      /* Необязательный вызов: до правки такого метода не было, и расход и так
         создавался невыплаченным. Так сторож падает на СМЫСЛОВОЙ проверке
         («100% покрашены как отличный результат»), а не на «нет функции». */
      if (window.app.setFinanceModalPaid) window.app.setFinanceModalPaid(false);
      window.app.saveFinanceModal();
    });
    await page.waitForTimeout(450);
    await page.evaluate(() => window.app.setDealView("finance"));
    await page.waitForTimeout(350);


  /* Одни деньги на двух экранах должны сходиться. Сделка «одной суммой» (смета не
     разбита на позиции) считалась по-разному: карточка на главной брала бюджет
     сделки и честно показывала долг, а вкладка «Финансы» смотрела только на сумму
     ПОЗИЦИЙ — их нет, поэтому там значилось «Бюджет 0 ₽» и «Долг 0 ₽ · Закрыто».
     Правым был экран, где денег больше. Сравниваем напрямую: расхождение = баг. */
  await test("сделка «одной суммой»: долг в финансах совпадает с карточкой на главной", async () => {
    await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Сумма без позиций");
      window.app.wizardSetField("budget", "240 000");
      window.app.finishWizard("estimate");
    });
    await page.waitForTimeout(400);

    const num = (s) => Number(String(s).replace(/[^\d]/g, "")) || 0;

    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(300);
    const onCard = await page.evaluate(() => {
      const card = [...document.querySelectorAll(".deal-card")]
        .find((c) => /Сумма без позиций/.test(c.textContent));
      if (!card) return null;
      const stats = [...card.querySelectorAll(".deal-card-stat")]
        .map((s) => s.textContent.replace(/\s+/g, " ").trim());
      const debt = stats.find((s) => /^Долг/.test(s)) || "";
      const budget = stats.find((s) => /^Бюджет/.test(s)) || "";
      return { debt, budget, id: card.getAttribute("data-deal-id") };
    });
    assert(onCard && onCard.id, "карточка сделки «одной суммой» не найдена на главной");

    await page.evaluate((id) => { window.app.openDeal(id); window.app.setDealView("finance"); }, onCard.id);
    await page.waitForTimeout(400);
    // Берём ЗАГОЛОВОК и САМУ СУММУ, а не весь текст плитки: под суммой стоит ещё
    // подпись («50% = …»), и склеенные цифры давали бессмысленное число.
    const inFinance = await page.$$eval(".fin-card", (els) =>
      els.map((e) => ({
        title: ((e.querySelector("h3") || {}).textContent || "").trim(),
        amount: ((e.querySelector(".fin-amount") || {}).textContent || "").trim(),
        sub: ((e.querySelector(".fin-sub") || {}).textContent || "").replace(/\s+/g, " ").trim(),
      }))
    );
    const pick = (re) => inFinance.find((c) => re.test(c.title)) || { amount: "", sub: "" };
    const finDebt = pick(/^Долг/).amount;
    const finDebtSub = pick(/^Долг/).sub;
    const finBudget = pick(/^Бюджет/).amount;

    assertEqual(num(finBudget), num(onCard.budget),
      `бюджет расходится: карточка «${onCard.budget}», финансы «${finBudget}»`);
    assertEqual(num(finDebt), num(onCard.debt),
      `долг расходится: карточка «${onCard.debt}», финансы «${finDebt}»`);
    assert(!/Закрыто/.test(finDebtSub), "неоплаченная сделка помечена «Закрыто»: " + finDebtSub);
  });

  /* Та же пара «свой экран ↔ экран клиента», но в самом дорогом месте: КП, которое
     владелец печатает и отправляет. У сделки «одной суммой» renderProposalPrint
     считал только позиции и печатал «Работы 0 ₽ · Итого 0 ₽», тогда как КЛИЕНТУ в
     портал уходит project.total — карточка и страница клиента показывали 240 000 ₽,
     а PDF тому же клиенту — ноль. Проверяем связку целиком: карточка = предпросмотр
     КП = сумма, которая уйдёт в портал. */
  await test("КП: сделка «одной суммой» печатается с ценой проекта, а не с нулём", async () => {
    await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "КП без позиций");
      window.app.wizardSetField("budget", "310 000");
      window.app.finishWizard("estimate");
      window.app.setDealView("proposal");
    });
    await page.waitForTimeout(500);

    const preview = await page.evaluate(() => {
      const el = document.querySelector(".proposal-preview");
      return el ? el.innerText.replace(/\s+/g, " ") : "";
    });
    assert(preview, "предпросмотр КП не отрисовался");

    const shown = (preview.match(/(?:Итого|Стоимость проекта)\s*([\d\s]+)\s*₽/) || [])[1] || "";
    assertEqual(Number(shown.replace(/\D/g, "")), 310000,
      "в КП напечатана не цена проекта: " + preview.slice(0, 200));
    assert(!/Итого\s*0\s*₽/.test(preview), "КП всё ещё печатает «Итого 0 ₽»: " + preview.slice(0, 200));
  });

  /* Подсказка «остаток по сделке» в форме поступления заведена ровно затем, чтобы
     не набирать сумму руками (из-за этого однажды повис долг 60 ₽ — переставили
     цифры). У сделки «одной суммой» она показывала 0: остаток считался по позициям
     сметы, которых нет. То есть страховка не работала именно там, где сумму
     набирают руками чаще всего. */
  await test("поступление: остаток подсказывается и у сделки «одной суммой»", async () => {
    const id = await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Остаток одной суммой");
      window.app.wizardSetField("budget", "180 000");
      window.app.finishWizard("estimate");
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return st.activeProjectId || "";
    });
    await page.waitForTimeout(400);
    assert(id, "сделка не создалась");

    const hint = await page.evaluate((pid) => {
      window.app.openFinanceModal("payment");
      window.app.setFinanceModalField("projectId", pid);
      const box = document.querySelector(".modal-box");
      return box ? box.innerText.replace(/\s+/g, " ") : "";
    }, id);
    await page.evaluate(() => window.app.closeFinanceModal && window.app.closeFinanceModal());

    const shown = (hint.match(/[Оо]стат[а-я]*[^\d]{0,20}([\d\s ]+)\s*₽/) || [])[1] || "";
    assertEqual(Number(shown.replace(/\D/g, "")), 180000,
      "остаток по сделке «одной суммой» подсказан неверно: " + hint.slice(0, 200));
  });

  /* Шапка сделки делила оплату на сумму ПОЗИЦИЙ, а при её отсутствии — на `|| 1`,
     то есть на один рубль. У сделки «одной суммой» любая, даже первая частичная
     оплата рисовала «Оплачено 100%»: враньё в самую опасную сторону — «клиент
     рассчитался». Проверяем на живых числах: 60 000 из 240 000 = 25%. */
  await test("шапка сделки: процент оплаты считается от суммы сделки, а не от рубля", async () => {
    const id = await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Процент одной суммой");
      window.app.wizardSetField("budget", "240 000");
      window.app.finishWizard("estimate");
      const saved = [...document.querySelectorAll("[data-deal-id]")];
      return saved.length ? saved[0].getAttribute("data-deal-id") : null;
    });
    await page.waitForTimeout(400);

    await page.evaluate((date) => {
      window.app.openFinanceModal("payment");
      window.app.setFinanceModalField("amount", "60000");
      window.app.setFinanceModalField("date", date);
      window.app.setFinanceModalField("title", "Аванс");
      window.app.saveFinanceModal();
    }, dayThisMonth(9));
    await page.waitForTimeout(400);

    const pct = await page.evaluate(() => {
      const el = [...document.querySelectorAll(".deal-stat-item")]
        .find((e) => /Оплачено/.test(e.textContent));
      const m = el ? el.textContent.match(/Оплачено\s*(\d+)\s*%/) : null;
      return m ? Number(m[1]) : null;
    });
    assertEqual(pct, 25, "процент оплаты в шапке сделки посчитан не от суммы сделки");
  });

  /* Один класс дефекта во ВСЕХ местах сразу, а не по одному. Сумма сделки «одной
     суммой» терялась везде, где считали по позициям: долг в финансах, печатное КП,
     текст КП для мессенджера, выгрузка в Excel, счёт. Клиенту при этом в портал
     уходил project.total — то есть правильная сумма.

     Здесь проверяются два оставшихся пути, до которых не добраться через разметку
     экрана: текст КП (уходит в буфер) и счёт (открывается отдельным окном). Оба
     перехватываем на границе — подменяем clipboard и window.open. */
  await test("документы клиенту: текст КП и счёт показывают сумму сделки, а не ноль", async () => {
    await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Документы одной суммой");
      window.app.wizardSetField("budget", "175 000");
      window.app.finishWizard("estimate");
    });
    await page.waitForTimeout(400);

    const captured = await page.evaluate(async () => {
      const out = { text: "", invoice: "" };

      // Текст КП. copyToClipboard ходит в navigator.clipboard, а в headless он
      // недоступен — подменяем и забираем то, что ушло бы человеку в мессенджер.
      const realClip = navigator.clipboard;
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: (s) => { out.text = s; return Promise.resolve(); } },
        configurable: true,
      });
      try { window.app.copyProposalText(); } catch (e) { out.text = "ОШИБКА: " + e.message; }
      await new Promise((r) => setTimeout(r, 100));
      Object.defineProperty(navigator, "clipboard", { value: realClip, configurable: true });

      // Счёт печатается в отдельном окне — перехватываем document.write.
      const realOpen = window.open;
      window.open = () => ({
        document: { write: (html) => { out.invoice += html; }, close: () => {} },
        print: () => {},
        close: () => {},
      });
      try { window.app.printInvoice(); } catch (e) { out.invoice = "ОШИБКА: " + e.message; }
      window.open = realOpen;

      return out;
    });

    const sum = (s, re) => Number(((String(s).match(re) || [])[1] || "").replace(/\D/g, ""));

    assert(captured.text && !/^ОШИБКА/.test(captured.text), "текст КП не сформировался: " + captured.text);
    assertEqual(sum(captured.text, /Итого:\s*([\d\s ]+)\s*₽/), 175000,
      "в тексте КП для мессенджера сумма не та: " + captured.text.slice(0, 160));

    assert(captured.invoice && !/^ОШИБКА/.test(captured.invoice), "счёт не сформировался: " + captured.invoice);
    assertEqual(sum(captured.invoice, /Итого по смете<\/td><td[^>]*>([\d\s ]+)/), 175000,
      "в счёте «Итого по смете» не сходится с суммой сделки");
    assertEqual(sum(captured.invoice, /К ОПЛАТЕ<\/td><td>([\d\s ]+)/), 175000,
      "в счёте «К оплате» не сходится с суммой сделки");
  });

  // Этап «Оплата» между «Сдано» и «Завершёнными»: по договору 50/50 остаток приходит
  // после сдачи работы. Ключевое — деньги ещё НЕ получены, поэтому такая сделка обязана
  // остаться в долге; выпадет она оттуда только в «Завершённых»/«Архиве».
  await test("этап «Оплата» стоит после «Сдано», и долг по нему остаётся в дебиторке", async () => {
    const stages = await page.evaluate(() => {
      window.app.go("home");
      return null;
    });
    await page.waitForTimeout(200);
    const names = await page.$$eval("#appContent .funnel-stage h3", (hs) => hs.map((h) => h.textContent.trim()));
    const iDone = names.indexOf("Сдано");
    const iPaid = names.indexOf("Оплата");
    const iClosed = names.indexOf("Завершённые");
    assert(iPaid > iDone && iPaid < iClosed, "порядок этапов воронки неверный: " + names.join(" → "));

    const debtBefore = await dbStat(page, "Долг клиентов");
    // Статус меняем штатным способом (как перетаскиванием в канбане), а НЕ правкой
    // localStorage с перезагрузкой: bootSeeded засевает состояние через addInitScript,
    // и reload вернул бы исходный сид, стерев всё, что накопили предыдущие тесты.
    await page.evaluate(() => { window.app.setKanbanStatus("crm", "d_a", "Оплата"); });
    await page.waitForTimeout(250);
    assertEqual(await dbStat(page, "Долг клиентов"), debtBefore, "сделка в «Оплате» выпала из долга — деньги ведь ещё не пришли");
  });

  // Названный клиентом бюджет хранится отдельно от total сделки (тот при первой же
  // позиции пересчитывается по смете) — иначе сравнивать «просили уложиться» с
  // «получилось» просто не с чем.
  await test("смета сверяется с бюджетом клиента: запас и перерасход", async () => {
    const { context: c3, page: p3 } = await bootLocal(browser, baseUrl);
    await p3.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Сверка с бюджетом");
      window.app.wizardSetField("budget", "37 985");
      window.app.finishWizard("estimate");
      window.app.applyPackage("event_report_full"); // состав 30 300 ₽ по ценам каталога
    });
    await p3.waitForTimeout(400);
    const txt = await p3.$eval("#appContent", (el) => el.textContent.replace(/\s+/g, " "));
    assert(/бюджет клиента/.test(txt), "плашки сверки с бюджетом нет");
    assert(/запас/.test(txt), "смета дешевле бюджета, а запас не показан: " + (txt.match(/бюджет клиента[^А-Я]{0,40}/) || [""])[0]);

    await p3.evaluate(() => { window.app.updateProject("clientBudget", 25000); });
    await p3.waitForTimeout(300);
    const txt2 = await p3.$eval("#appContent", (el) => el.textContent.replace(/\s+/g, " "));
    assert(/перерасход/.test(txt2), "смета дороже бюджета, а перерасход не показан");
    await c3.close();
  });

  // Карточка позиции сметы показывала все шесть полей расчёта сразу: при оплате
  // сменой рядом с итогом 20 000 ₽ стояли «Часов» и «Ставка/час», не влияющие ни на
  // что. Понять, откуда взялась сумма, было нельзя.
  await test("карточка позиции показывает поля только выбранного способа оплаты", async () => {
    const { context: c2, page: p2 } = await bootLocal(browser, baseUrl, { seedDemo: true });
    await p2.evaluate(() => { window.app.go("deal"); });
    await p2.waitForTimeout(400);

    const labels = () =>
      p2.$$eval("#appContent .calc-box", (boxes) => {
        const box = boxes.find((b) => /Расчёт смены/.test(b.textContent || ""));
        return box ? [...box.querySelectorAll("label")].map((l) => l.textContent.trim()) : [];
      });

    const shift = await labels();
    assert(shift.length, "блока «Расчёт смены / часов» нет");
    assert(shift.includes("Длительность смены"), "нет поля длительности при оплате сменой: " + shift);
    assert(!shift.includes("Ставка / час"), "почасовые поля показаны при оплате сменой: " + shift);

    await p2.evaluate(() => {
      const sel = document.querySelector("#appContent select[data-key='crewBilling']");
      sel.value = "hour";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await p2.waitForTimeout(350);
    const hour = await labels();
    assert(hour.includes("Ставка / час") && hour.includes("Часов"), "нет почасовых полей: " + hour);
    assert(!hour.includes("Длительность смены"), "поля смены показаны при почасовой оплате: " + hour);
    await c2.close();
  });

  await test("рендер сумм прошёл без исключений в консоли", async () => {
    assert(errors.length === 0, "ошибки страницы: " + errors.slice(0, 3).join(" | "));
  });

  // Смета уходит клиенту файлом и печатается, поэтому её вид — часть продукта, а
  // не украшение. До этого лист выгружался голой сеткой: названия обрезались
  // соседней колонкой, суммы стояли как 15000 без разрядов и валюты, разделы
  // ничем не выделялись, а две колонки «Переработка»/«Час. перераб.» висели
  // пустыми даже в смете, где нет ни одной съёмочной смены.
  //
  // Оформление пишет xlsx-js-style (community-сборка xlsx свойство s молча
  // теряет). Проверять объект книги в памяти НЕДОСТАТОЧНО: cell.s там лежит при
  // любой библиотеке, разница — переживёт ли он сериализацию. Поэтому книгу
  // прогоняем через XLSX.write + XLSX.read и смотрим, что осталось в файле;
  // проверено, что на обычном xlsx@0.18.5 этот тест падает.
  await test("выгрузка сметы в Excel: ширины, деньги, разделы и заголовок", async () => {
    const { context: c2, page: p2 } = await bootLocal(browser, baseUrl, { seedDemo: true, width: 1280, height: 900 });
    await p2.evaluate(() => window.app.go("home"));
    await p2.waitForTimeout(250);
    await p2.click(".deal-card");
    await p2.waitForTimeout(400);

    // Перехватываем writeFile — так книга достаётся без возни со скачиванием.
    const wb = await p2.evaluate(async () => {
      await window.app._ensureXLSX();
      const orig = XLSX.writeFile;
      let captured = null;
      XLSX.writeFile = (book) => { captured = book; };
      try { await window.app.exportXlsx(); } finally { XLSX.writeFile = orig; }
      if (!captured) return null;

      // Ключевой шаг: сериализуем книгу и читаем обратно — так видно, что реально
      // попало в файл, а не что мы положили в объект.
      const bytes = XLSX.write(captured, { type: "array", bookType: "xlsx", cellStyles: true });
      const back = XLSX.read(bytes, { type: "array", cellStyles: true });
      const ws = back.Sheets["Смета"];
      const ref = XLSX.utils.decode_range(ws["!ref"]);
      // На чтении оформление приходит «расплющенным»: fill лежит прямо в s
      // (s.patternType / s.fgColor), а не в s.fill — проверено на живом файле.
      let fills = 0, money = 0;
      const rows = [];
      for (let r = ref.s.r; r <= ref.e.r; r++) {
        const line = [];
        for (let c = ref.s.c; c <= ref.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          line.push(cell && cell.v != null ? String(cell.v) : "");
          if (!cell) continue;
          const st = cell.s || {};
          const pat = st.patternType || (st.fill && st.fill.patternType);
          if (pat && pat !== "none") fills++;
          if (cell.z && String(cell.z).indexOf("₽") >= 0) money++;
        }
        rows.push(line);
      }
      return {
        sheets: back.SheetNames,
        cols: (ws["!cols"] || []).map((x) => x && x.wch),
        merges: (ws["!merges"] || []).length,
        fills, money,
        secondCell: rows[1] ? rows[1][0] : "",
        flat: rows.map((r) => r.join("|")).join("\n"),
      };
    });

    assert(wb, "exportXlsx не собрал книгу");
    assert(wb.sheets.includes("Смета"), "нет листа «Смета»: " + JSON.stringify(wb.sheets));

    // Порог, а не точное значение: названия в первой колонке переносятся по словам
    // (wrapText), поэтому экстремальная ширина не нужна — важно, что она задана и
    // не осталась дефолтной (~8 знаков), при которой имена резались.
    assert(wb.cols.length > 0 && wb.cols[0] >= 36,
      "первая колонка узкая — длинные названия обрежутся: " + JSON.stringify(wb.cols));
    assert(wb.merges >= 2, "заголовок документа не растянут на ширину таблицы (объединений: " + wb.merges + ")");
    assert(wb.money > 0, "суммы выгружены без денежного формата");
    assert(wb.fills > 0,
      "в записанном файле нет ни одной залитой ячейки — разделы и итог не выделены " +
      "(так бывает, если библиотеку вернули на обычный xlsx: он теряет cell.s при записи)");

    assert(/смета/i.test(wb.secondCell), "во второй строке нет подзаголовка со сметой: «" + wb.secondCell + "»");
    assert(/ИТОГО К ОПЛАТЕ/.test(wb.flat), "в листе нет строки общего итога");
    // Название раздела должно стоять ПЕРЕД шапкой колонок, а не после неё.
    const lines = wb.flat.split("\n");
    const secIdx = lines.findIndex((l) => /^(Подготовка|Команда|Оборудование|Пост-продакшн|Прочее)\|/.test(l));
    const headIdx = lines.findIndex((l) => /^Наименование\|/.test(l));
    assert(secIdx >= 0 && headIdx >= 0, "не найдены раздел и шапка колонок");
    assert(secIdx < headIdx, "название раздела идёт после шапки колонок — читается как первая строка таблицы");

    await c2.close();
  });

  /* Легаси-строка монтажа: старое поле sourcePacks — это ПАКЕТЫ ИСХОДНИКОВ из
     модели, где камер не было вовсе, а надбавка бралась один раз по
     rates.sourcePack. Прежняя миграция раскладывала его И в cameraCount, И в
     sourceCount, а расчёт берёт надбавку и за камеры, и за исходники — по
     одному тарифу. На строке с sourcePacks = 3 смета выходила 4000 вместо 2000,
     то есть ВДВОЕ больше (замерено по живому DOM, не посчитано на бумаге:
     базовая цена сюда не входит, поэтому проверяем именно надбавку).

     Значения читаем из полей «Камер»/«Исходников» — это то, что видит человек,
     а localStorage до первого сохранения хранит ещё домиграционную строку. */
  await test("монтаж: старое поле sourcePacks не берёт надбавку дважды", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.addInitScript((key) => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
      // Строка ровно в том виде, в каком она лежала ДО разделения камер и
      // исходников: cameraCount/sourceCount отсутствуют вовсе.
      localStorage.setItem(key, JSON.stringify({
        view: "estimate",
        selected: { edit: { qty: 1, sourcePacks: 3 } }
      }));
    }, STORAGE_KEY);
    await p.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await p.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await p.evaluate(() => window.app.go("estimate"));
    await p.waitForTimeout(400);

    const read = () => p.evaluate(() => ({
      cam: (document.querySelector('[data-key="cameraCount"]') || {}).value,
      src: (document.querySelector('[data-key="sourceCount"]') || {}).value,
      total: Number(String((document.querySelector(".summary-total") || {}).textContent || "").replace(/[^\d]/g, ""))
    }));

    const migrated = await read();
    assertEqual(migrated.src, "3", "исходники не перенеслись из sourcePacks");
    assertEqual(migrated.cam, "1", "камеры проставились из sourcePacks — надбавка берётся дважды");
    assertEqual(migrated.total, 2000, "надбавка за 2 лишних пакета исходников должна быть 2000");

    // Ставим камеры руками — так выглядела строка после прежней миграции.
    await p.fill('[data-key="cameraCount"]', "3");
    await p.evaluate(() => document.querySelector('[data-key="cameraCount"]')
      .dispatchEvent(new Event("change", { bubbles: true })));
    await p.waitForTimeout(400);
    const manual = await read();
    assertEqual(manual.total, 4000,
      "камеры тарифицируются по тому же rates.sourcePack — значит старая миграция удваивала надбавку");

    /* Починка обязана быть ОДНОРАЗОВОЙ. Если легаси-поле sourcePacks не обнулять,
       условие починки совпадёт снова на следующей перерисовке и молча вернёт
       камеры к 1 — человек не сможет выставить их равными исходникам. */
    await p.evaluate(() => { window.app.go("home"); window.app.go("estimate"); });
    await p.waitForTimeout(400);
    const afterRerender = await read();
    assertEqual(afterRerender.cam, "3",
      "перерисовка сбросила выставленные вручную камеры — починка срабатывает повторно");

    await ctx.close();
  });

  /* Средний чек считался по разным множествам: сумма — только по «Завершённым»,
     а деление — на счётчик «Завершённые + Оплата + Сдано». При закрытых сделках
     без единой «Завершённой» плитка показывала прочерк и рядом «по N сделкам».
     Найдено при сборке кадров для баннера — цифра бросилась в глаза на экране. */
  await test("дашборд: средний чек считается по тем же сделкам, что и счётчик закрытых", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const p = await ctx.newPage();
    const deals = [
      { id: "d1", name: "Сдана", client: "А", crmStatus: "Сдано",       total: 300000, paid: 300000 },
      { id: "d2", name: "Оплачена", client: "Б", crmStatus: "Оплата",   total: 500000, paid: 500000 },
      { id: "d3", name: "В работе", client: "В", crmStatus: "В работе", total: 900000, paid: 0 },
    ];
    await p.addInitScript(([key, d]) => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
      localStorage.setItem(key, JSON.stringify({ savedProjects: d, view: "home" }));
    }, [STORAGE_KEY, deals]);
    await p.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await p.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await p.waitForTimeout(400);

    const tile = await p.evaluate(() => {
      // Ищем по ПОДПИСИ плитки, а не по title: подсказка — текст для человека, её
      // переписывают (08.08 к ней добавили «— открыть завершённые»), и селектор по
      // точному title молча перестал находить плитку, хотя на экране всё было цело.
      const t = [...document.querySelectorAll(".db-stat")].find(
        (el) => ((el.querySelector(".db-stat-label") || {}).textContent || "").trim() === "Ср. чек"
      );
      if (!t) return null;
      return {
        value: (t.querySelector(".db-stat-value") || {}).textContent.replace(/\s/g, ""),
        sub: (t.querySelector(".db-stat-delta") || {}).textContent.trim()
      };
    });
    assert(tile, "плитка «Ср. чек» не найдена");
    assert(tile.sub.includes("2"), "счётчик закрытых сделок не 2: " + tile.sub);
    // Ни одной «Завершённой» — но две закрытые есть: (300000 + 500000) / 2.
    assert(/400000/.test(tile.value),
      `средний чек ${tile.value} вместо 400 000 — сумма и счётчик считаются по разным сделкам (${tile.sub})`);

    await ctx.close();
  });

  /* Сохранение сметы без названия. Условие «требуем название ИЛИ услугу»
     проверяло `state.items` — поля, которого на состоянии не существует вовсе
     (items есть только внутри описаний пакетов). Ветка «или услугу» не
     срабатывала никогда: человек собирал смету, жал «Сохранить» и получал совет
     добавить услугу, которая уже добавлена, а сделка не создавалась. */
  await test("смета с позициями сохраняется и без названия проекта", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
    });
    await p.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await p.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await p.waitForTimeout(400);

    const res = await p.evaluate(() => {
      window.app.go("catalog");
      window.app.catalogAddOne("director");
      const before = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const positions = Object.keys(before.selected || {}).length;
      const name = (before.project && before.project.name || "").trim();
      window.app.saveCurrentProject();
      const after = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const t = document.getElementById("toast");
      return {
        positions,
        nameWasEmpty: name === "",
        saved: (after.savedProjects || []).length,
        toast: t ? (t.textContent || "").trim() : ""
      };
    });

    assertEqual(res.positions, 1, "позиция не добавилась в смету — проверять нечего");
    assert(res.nameWasEmpty, "у проекта оказалось название — тогда тест проверяет не ту ветку");
    assertEqual(res.saved, 1,
      `смета с позицией не сохранилась без названия (тост: «${res.toast}») — ветка «или услугу» снова смотрит на несуществующее поле`);

    await ctx.close();
  });

  /* Способ оплаты был свободным полем: одно и то же писали по-разному («карта»,
     «Карта», «на карту»), и сгруппировать поступления по способу было нельзя.
     Теперь список — но уже введённые произвольные значения теряться не должны. */
  await test("поступление: способ оплаты — список, и своё значение из него не пропадает", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
    });
    await p.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await p.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await p.waitForTimeout(400);

    await p.evaluate(() => window.app.openFinanceModal("payment"));
    await p.waitForTimeout(400);
    const modal = await p.evaluate(() => {
      const l = [...document.querySelectorAll(".modal-box label")]
        .find((x) => /Способ оплаты/.test(x.textContent || ""));
      if (!l) return null;
      const sel = l.parentElement ? l.parentElement.querySelector("select") : null;
      return sel ? [...sel.options].map((o) => o.textContent.trim()) : "не select";
    });
    assert(Array.isArray(modal), "«Способ оплаты» в поступлении — не список: " + JSON.stringify(modal));
    assert(modal.length >= 4, "в списке способов оплаты слишком мало вариантов: " + JSON.stringify(modal));
    /* «Карта» из набора убрана: она значила то же, что «Перевод на карту», и
       выбор между ними был выбором ни о чём (у владельца «Картой» не отмечен ни
       один платёж). Проверяем оставшиеся — и отдельно то, ради чего проверка и
       заведена: нестандартное значение из списка не пропадает. */
    ["Наличные", "Перевод на карту"].forEach((m) =>
      assert(modal.some((o) => o === m), `в списке нет варианта «${m}»: ${JSON.stringify(modal)}`));
    assert(!modal.includes("Карта"),
      "«Карта» вернулась в набор — она дублирует «Перевод на карту»: " + JSON.stringify(modal));

    // Переход на список не должен стирать то, что уже вписали руками.
    const kept = await p.evaluate(() => {
      const html = window.app._paymentMethodOptions("ЮKassa через ссылку");
      return { есть: /ЮKassa через ссылку/.test(html), выбран: /selected/.test(html) };
    });
    assert(kept.есть, "нестандартный способ оплаты пропал из списка — при сохранении он бы стёрся");
    assert(kept.выбран, "нестандартный способ есть в списке, но не отмечен выбранным");

    await ctx.close();
  });

  /* «Итого расходов −0 ₽» — знак минуса перед нулём. Расходов не было вовсе, а
     строка выглядит как списание. Замечено на скриншоте раздела «Финансы» у
     аккаунта с одним поступлением. Заодно проверяем, что у ненулевой суммы знак
     остался: без него доход и расход в одной колонке не различить. */
  await test("итоги финансов: нулевая сумма без знака, ненулевая — со знаком", async () => {
    const { context: cz, page: pz } = await bootLocal(browser, baseUrl,
      { width: 1280, height: 900, seedDemo: true });
    // Фильтр «только поступления» гарантирует нулевой расход независимо от того,
    // что накопили соседние тесты.
    await pz.evaluate(() => {
      window.app.go("global-finances");
      window.app.setGFinSubTab("transactions");
      window.app.setGFinTypeFilter("income");
    });
    await pz.waitForTimeout(400);
    const foot = await pz.evaluate(() => {
      const rows = [...document.querySelectorAll(".fin-table-footer tr")];
      const out = {};
      rows.forEach((r) => {
        const cells = [...r.children];
        const label = (cells[0].textContent || "").trim();
        out[label] = (cells[cells.length - 1].textContent || "").replace(/\s+/g, " ").trim();
      });
      return out;
    });
    assert(foot["Итого расходов"] !== undefined, "в итогах нет строки расходов: " + JSON.stringify(foot));
    assert(!/^[−-]/.test(foot["Итого расходов"]),
      "нулевой расход подписан минусом: «" + foot["Итого расходов"] + "»");
    assert(/^\+/.test(foot["Итого получено"] || ""),
      "ненулевое поступление осталось без плюса: «" + foot["Итого получено"] + "»");
    await cz.close();
  });

  /* Фильтры «Финансов» стояли друг под другом во всю ширину страницы: внутри
     флекс-ряда браузер «блокифицирует» select, enhanceSelects читал display:block
     и вешал на обёртку width:100%. Меряем живой DOM — по исходнику этого не видно. */
  await test("фильтры финансов: два выбора и поиск — в одну строку", async () => {
    const { context: cf, page: pf } = await bootLocal(browser, baseUrl,
      { width: 1280, height: 900, seedDemo: true });
    await pf.evaluate(() => {
      window.app.go("global-finances");
      window.app.setGFinSubTab("transactions");
      window.app.setGFinTypeFilter("all");
    });
    await pf.waitForTimeout(400);
    const bar = await pf.evaluate(() => {
      const el = document.querySelector("#appContent .fin-action-bar");
      if (!el) return null;
      const pr = el.getBoundingClientRect();
      const kids = [...el.children].map((k) => {
        const r = k.getBoundingClientRect();
        return { top: Math.round(r.top), w: Math.round(r.width) };
      });
      return { parentW: Math.round(pr.width), kids };
    });
    assert(bar && bar.kids.length >= 3, "не нашёл ряд фильтров в «Финансах»: " + JSON.stringify(bar));
    const tops = bar.kids.map((k) => k.top);
    assert(Math.max(...tops) - Math.min(...tops) <= 4,
      "фильтры разъехались по строкам: " + JSON.stringify(bar.kids));
    bar.kids.slice(0, 2).forEach((k) =>
      assert(k.w < bar.parentW * 0.5,
        "выпадашка заняла полстроки и больше (" + k.w + " из " + bar.parentW + ")"));
    await cf.close();
  });

  /* «Маржа 95% — высокая, бизнес прибыльный» на аккаунте владельца, где расходы
     внесены у горстки сделок из сотни, а 62% всех внесённых трат — налог. Это не
     высокая маржа, это незаполненные расходы. Тот же класс, что «100% маржа» на
     пустой смете: продукт утверждает бизнес-факт, которого не знает, а человек по
     нему назначает цену. */
  await test("аналитика финансов: маржа не хвалится, пока расходов почти нет", async () => {
    /* Состояние кладём через addInitScript — ДО первой загрузки страницы.
       Подсовывать его потом и перезагружать нельзя: на выгрузке приложение
       пишет свой снимок поверх. */
    const прогон = async (сКакимиРасходами) => {
      const deals = [];
      const iso = (back) => {
        const d = new Date(); d.setDate(12); d.setMonth(d.getMonth() - back);
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-12";
      };
      for (let i = 0; i < 20; i++) {
        const amt = 50000 + i * 1000;
        const свои = сКакимиРасходами === "все" || i < 2;
        deals.push({
          id: "m" + i, name: "Сделка " + i, client: "Клиент " + i, clientId: "cm" + i,
          total: amt, paid: amt, debt: 0, expensesTotal: 0,
          crmStatus: "Завершённые", status: "Завершено", updatedAt: new Date().toISOString(),
          snapshot: {
            project: { name: "Сделка " + i, client: "Клиент " + i },
            payments: [{ id: "pm" + i, title: "Оплата", amount: amt, date: iso(i % 5), method: "Счёт" }],
            expenses: свои ? [{ id: "em" + i, title: "Затраты", amount: 20000, date: iso(i % 5), category: "Команда" }] : [],
            tasks: [], selected: {}
          }
        });
      }
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
      const pg = await ctx.newPage();
      await pg.addInitScript(({ key, deals }) => {
        localStorage.setItem("adervis_local_mode", "1");
        localStorage.setItem("adervis_tour_done", "1");
        localStorage.setItem("adervis_onboarded", "1");
        localStorage.setItem(key, JSON.stringify({ savedProjects: deals, view: "home" }));
      }, { key: STORAGE_KEY, deals });
      await pg.goto(baseUrl + "/index.html", { waitUntil: "load" });
      await pg.waitForFunction(() => {
        const el = document.getElementById("appContent");
        return el && el.innerHTML.trim().length > 0;
      }, { timeout: 20000 });
      await pg.evaluate(() => {
        window.app.go("global-finances");
        window.app.setGFinSubTab("analytics");
      });
      await pg.waitForTimeout(600);
      const res = await pg.evaluate(() => {
        const tile = [...document.querySelectorAll("#appContent .kpi-tile")]
          .find((t) => /Маржа/.test(t.textContent || ""));
        const arc = tile ? tile.querySelectorAll(".spark-gauge path")[1] : null;
        return {
          текст: document.getElementById("appContent").textContent.replace(/\s+/g, " "),
          подсказка: tile ? tile.getAttribute("title") || "" : "",
          цвет: arc ? arc.getAttribute("stroke") : ""
        };
      });
      await ctx.close();
      return res;
    };

    const мало = await прогон("у двух");
    assert(/Маржа \d+%/.test(мало.текст), "вывода про маржу нет вовсе: " + мало.текст.slice(0, 160));
    assert(!/бизнес прибыльный/.test(мало.текст),
      "продукт хвалит маржу, хотя расходы есть у двух сделок из двадцати");
    assert(/2 сделок из 20/.test(мало.текст),
      "не сказано, у скольких сделок есть расходы: " + мало.текст.slice(0, 300));
    /* Плитка «Маржа» и вывод под ней должны говорить ОДНО. Плитка красила
       полукруг зелёным («95% — отлично»), а текст прямо под ней сообщал, что
       расходы заполнены у меньшинства сделок: один экран, два противоположных
       сообщения. Проверяем цвет дуги — при недоверии к расходам он нейтральный. */
    assert(/Расходы заполнены не у всех сделок/.test(мало.подсказка),
      "плитка маржи не предупреждает о незаполненных расходах: «" + мало.подсказка + "»");
    assert(!/success|22c55e/.test(мало.цвет),
      "полукруг маржи покрашен как достижение, хотя расходов почти нет: " + мало.цвет);

    const все = await прогон("все");
    assert(/Маржа \d+%/.test(все.текст), "вывод про маржу пропал, когда расходы заполнены");
    assert(!/посчитана по внесённым расходам/.test(все.текст),
      "оговорка про незаполненные расходы осталась, хотя они есть у всех сделок");
  });

  /* Первого сентября дашборд встретил владельца красным «↓ 100% к прошлому»:
     неполный месяц сравнивался с ПОЛНЫМ предыдущим, и каждое первое число бизнес
     выглядел рухнувшим. Сравнение должно идти по одинаковому отрезку дней. */
  await test("выручка месяца сравнивается с тем же отрезком прошлого месяца", async () => {
    const сегодня = new Date();
    const день = сегодня.getDate();
    const прошлый = new Date(сегодня.getFullYear(), сегодня.getMonth() - 1, 1);
    const днейВПрошлом = new Date(прошлый.getFullYear(), прошлый.getMonth() + 1, 0).getDate();
    const iso = (d, day) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const прогон = async (деньОплаты) => {
      const deals = [{
        id: "t1", name: "Сделка", client: "Клиент", clientId: "ct1",
        total: 100000, paid: 100000, debt: 0,
        crmStatus: "Завершённые", status: "Завершено", updatedAt: new Date().toISOString(),
        snapshot: { project: { name: "Сделка", client: "Клиент" },
          payments: [{ id: "pt1", title: "Оплата", amount: 100000, date: iso(прошлый, деньОплаты), method: "Счёт" }],
          expenses: [], tasks: [], selected: {} }
      }];
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
      const pg = await ctx.newPage();
      await pg.addInitScript(({ key, deals }) => {
        localStorage.setItem("adervis_local_mode", "1");
        localStorage.setItem("adervis_tour_done", "1");
        localStorage.setItem("adervis_onboarded", "1");
        localStorage.setItem(key, JSON.stringify({ savedProjects: deals, view: "home" }));
      }, { key: STORAGE_KEY, deals });
      await pg.goto(baseUrl + "/index.html", { waitUntil: "load" });
      await pg.waitForFunction(() => {
        const el = document.getElementById("appContent");
        return el && el.innerHTML.trim().length > 0;
      }, { timeout: 20000 });
      await pg.waitForTimeout(400);
      const txt = await pg.$eval('#appContent .db-stat[title="Выручка / мес"]',
        (el) => el.textContent.replace(/\s+/g, " "));
      await ctx.close();
      return txt;
    };

    // Деньги пришли в тот же день месяца, что идёт сейчас, — отрезок сопоставим,
    // падение настоящее, и оно должно быть названо отрезком, а не «к прошлому».
    const сопоставимо = await прогон(Math.min(день, днейВПрошлом));
    assert(/к тем же дням/.test(сопоставимо),
      "подпись не называет отрезок сравнения: " + сопоставимо);

    /* Деньги пришли ПОЗЖЕ той даты, где мы сейчас. Сравнивать не с чем — и
       вопить «↓ 100%» не с чего. Проверяем только когда такой день существует:
       в последний день месяца «позже» уже не бывает. */
    if (день < днейВПрошлом) {
      const позже = await прогон(днейВПрошлом);
      assert(!/100% к тем же дням/.test(позже) && !/↓/.test(позже),
        "неполный месяц объявлен провалом, хотя деньги в прошлом пришли позже этой даты: " + позже);
    }
  });

  /* Темп по первым дням месяца — не прогноз, а умножение случайности: одна оплата
     первого числа превращалась в «прогноз поступлений» ×30. Ниже пяти дней прогноз
     не строим и показываем факт. Ожидание считаем от СЕГОДНЯШНЕЙ даты, чтобы тест
     был верен в любой день месяца, а не только первого. */
  await test("прогноз месяца не строится по первым дням", async () => {
    const сегодня = new Date();
    const день = сегодня.getDate();
    const днейВМесяце = new Date(сегодня.getFullYear(), сегодня.getMonth() + 1, 0).getDate();
    const сумма = 100000;
    const iso = `${сегодня.getFullYear()}-${String(сегодня.getMonth() + 1).padStart(2, "0")}-${String(день).padStart(2, "0")}`;

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const pg = await ctx.newPage();
    await pg.addInitScript(({ key, iso, сумма }) => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
      localStorage.setItem(key, JSON.stringify({
        view: "home",
        savedProjects: [{
          id: "fc1", name: "Сделка", client: "Клиент", clientId: "cfc1",
          total: сумма, paid: сумма, debt: 0,
          crmStatus: "Завершённые", status: "Завершено", updatedAt: new Date().toISOString(),
          snapshot: { project: { name: "Сделка", client: "Клиент" },
            payments: [{ id: "pfc1", title: "Оплата", amount: сумма, date: iso, method: "Счёт" }],
            expenses: [], tasks: [], selected: {} }
        }]
      }));
    }, { key: STORAGE_KEY, iso, сумма });
    await pg.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await pg.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await pg.evaluate(() => {
      window.app.go("global-finances");
      window.app.setGFinSubTab("analytics");
    });
    await pg.waitForTimeout(600);
    const карточка = await pg.$eval("#appContent .fin-forecast-card",
      (el) => el.textContent.replace(/\s+/g, " "));
    // Число берём из САМОГО значения, а не из всего текста карточки: в подписи
    // «за 1 день» тоже есть цифра, и она приклеивалась к сумме.
    const значение = await pg.$eval("#appContent .fin-forecast-card .fc-val",
      (el) => el.textContent.replace(/\s+/g, " "));
    const шапка = await pg.$eval("#appContent .analytics-section h3",
      (el) => el.textContent.replace(/\s+/g, " "));
    await ctx.close();

    const число = Number(значение.replace(/[^\d]/g, "")) || 0;
    if (день < 5) {
      assert(/показываем факт/.test(шапка),
        "на " + день + "-й день месяца страница всё ещё обещает прогноз: " + шапка);
      assert(Math.abs(число - сумма) < 1000,
        "вместо факта показан домысел: " + карточка);
    } else {
      const ожидание = Math.round(сумма / день * днейВМесяце);
      assert(Math.abs(число - ожидание) <= ожидание * 0.02,
        "прогноз посчитан не по темпу: " + карточка + " (ждали ~" + ожидание + ")");
    }
  });

  /* Пустая смета: считать маржу не из чего, а капсула писала «0% маржа» — и в
     шапке сделки, и в «Итогах» ниже, то есть дважды утверждала то, чего не знает.
     Тот же класс, что «100% маржа» на смете без себестоимости. */
  await test("пустая смета не объявляет «0% маржа»", async () => {
    const { context: cz, page: pz } = await bootLocal(browser, baseUrl,
      { width: 1440, height: 950, seedDemo: true });
    await pz.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Пустая сделка");
      window.app.finishWizard("estimate");
    });
    await pz.waitForTimeout(700);
    const res = await pz.evaluate(() => {
      const pills = [...document.querySelectorAll("#appContent .margin-badge")].map((e) => e.textContent.trim());
      const txt = document.getElementById("appContent").textContent.replace(/\s+/g, " ");
      return { капсул: pills.length, тексты: pills, естьНоль: /0% маржа/.test(txt) };
    });
    await cz.close();
    assertEqual(res.капсул, 0, "на пустой смете осталась капсула маржи: " + JSON.stringify(res.тексты));
    assert(!res.естьНоль, "на пустой смете написано «0% маржа» — маржу считать не из чего");
  });

  /* В ячейке календаря у денежных событий стояло их НАЗВАНИЕ, а по умолчанию оно
     одинаковое для всех: «Платёж», «Расход», «Поступление». У владельца в августе
     шестнадцать событий, и почти все подписаны одним словом — календарь сообщал,
     что «что-то было», и молчал о том, что именно. */
  await test("календарь: у денежных событий в ячейке видна сумма", async () => {
    const iso = (d) => "2026-08-" + String(d).padStart(2, "0");
    const deals = [{
      id: "cal1", name: "Раздолье – День нептуна", client: "Арина", clientId: "ca1",
      total: 200000, paid: 120000, debt: 80000, deadline: iso(28),
      crmStatus: "В работе", status: "В работе", updatedAt: new Date().toISOString(),
      snapshot: { project: { name: "Раздолье – День нептуна" },
        payments: [
          { id: "q1", title: "Платёж", amount: 18992, date: iso(4), method: "Счёт" },
          { id: "q2", title: "Поступление", amount: 7000, date: iso(5), method: "Карта" }
        ],
        expenses: [{ id: "w1", title: "Расход", amount: 1140, date: iso(4), category: "Прочее" }],
        tasks: [], selected: {} }
    }];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const pg = await ctx.newPage();
    await pg.addInitScript(({ key, deals }) => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
      localStorage.setItem(key, JSON.stringify({ savedProjects: deals, view: "home", calMonth: "2026-08" }));
    }, { key: STORAGE_KEY, deals });
    await pg.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await pg.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await pg.evaluate(() => {
      window.app.go("global-calendar");
      if (window.app.calSetMonth) window.app.calSetMonth("2026-08");
    });
    await pg.waitForTimeout(700);
    const подписи = await pg.evaluate(() =>
      [...document.querySelectorAll("#appContent .cal-event-label.payment, #appContent .cal-event-label.expense")]
        .map((e) => e.textContent.trim()));
    await ctx.close();
    assert(подписи.length >= 3, "в календаре нет денежных событий: " + JSON.stringify(подписи));
    const безСуммы = подписи.filter((t) => !/\d/.test(t));
    assertEqual(безСуммы.length, 0,
      "денежные события подписаны без суммы: " + JSON.stringify(безСуммы));
    assert(подписи.some((t) => /18\s*992/.test(t)),
      "суммы в ячейках не те: " + JSON.stringify(подписи));
    assert(подписи.some((t) => /^−/.test(t)), "расход не отмечен минусом: " + JSON.stringify(подписи));
  });

  /* Список операций на телефоне был ТАБЛИЦЕЙ в шесть колонок: замер на 390px —
     741px при доступных 348, вдвое шире экрана. На виду оставались «Дата ·
     Проект · Описание», а СУММА, ради которой в список и заходят, уезжала за
     правый край вместе с итогами. Проверяем результат: строка помещается в
     ширину, и сумма видна. */
  await test("операции на телефоне: сумма видна без прокрутки вбок", async () => {
    const deals = [0, 1, 2].map((i) => ({
      id: "op" + i, name: 'Реклама – База отдыха "Раздолье – Троица" ' + i,
      client: "Клиент " + i, clientId: "cop" + i,
      total: 120000, paid: 60000, debt: 60000,
      crmStatus: "В работе", status: "В работе", updatedAt: new Date().toISOString(),
      snapshot: { project: { name: "Реклама" },
        payments: [{ id: "pp" + i, title: "Предоплата по договору", amount: 60000, date: "2026-08-2" + i, method: "Счёт (безнал)" }],
        expenses: [{ id: "pe" + i, title: "Оплата подрядчику за монтаж", amount: 12000, date: "2026-08-2" + i, category: "Команда" }],
        tasks: [], selected: {} }
    }));
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await pg.addInitScript(({ key, deals }) => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
      localStorage.setItem(key, JSON.stringify({ savedProjects: deals, view: "home" }));
    }, { key: STORAGE_KEY, deals });
    await pg.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await pg.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await pg.evaluate(() => {
      window.app.go("global-finances");
      window.app.setGFinSubTab("transactions");
    });
    await pg.waitForTimeout(600);
    const res = await pg.evaluate(() => {
      const wrap = document.querySelector("#appContent .fin-table-wrap");
      // Запасной селектор — на старую разметку без модификатора: иначе сторож
      // падал бы «нет таблицы» вместо «сумма за краем» и ничего не доказывал.
      const table = document.querySelector("#appContent .fin-table--ops, #appContent .fin-table");
      if (!wrap || !table) return null;
      const row = table.querySelector("tbody tr");
      const cells = row ? [...row.children] : [];
      const sum = cells[cells.length - 1];
      const sr = sum ? sum.getBoundingClientRect() : null;
      return {
        обёртка: Math.round(wrap.getBoundingClientRect().width),
        прокрутка: Math.round(wrap.scrollWidth),
        суммаСправа: sr ? Math.round(sr.right) : 0,
        окно: window.innerWidth,
        суммаТекст: sum ? (sum.textContent || "").trim() : "",
      };
    });
    await ctx.close();
    assert(res, "не нашёл таблицу операций");
    assert(res.прокрутка <= res.обёртка + 2,
      "список операций шире экрана: " + res.прокрутка + "px при " + res.обёртка);
    assert(res.суммаСправа > 0 && res.суммаСправа <= res.окно,
      "сумма операции за краем экрана: правый край " + res.суммаСправа + " при окне " + res.окно);
    assert(/\d/.test(res.суммаТекст), "в ячейке суммы нет числа: «" + res.суммаТекст + "»");
  });

  /* Ширина выпадашки идёт от самого длинного варианта списка. У фильтра по
     проекту это название сделки: у владельца «Реклама – База отдыха "Раздолье –
     Троица"» растягивала выбор на всю строку, поиск уезжал вниз, и ряд ломался.
     Проверяем на заведомо длинных именах — на коротких дефект не виден. */
  await test("фильтр по проекту не растягивается длинным названием сделки", async () => {
    const длинное = 'Реклама – База отдыха "Раздолье – Троица" (осенняя серия роликов)';
    /* Сделок нужно БОЛЬШЕ СОРОКА и обязательно touch-окно: на телефоне длинный
       список остаётся нативным select (см. UU_TOUCH_MAX_OPTIONS), а растягивает
       строку именно он. На четырёх сделках с кастомной выпадашкой дефекта нет —
       первая версия сторожа так и прошла мимо. */
    const deals = Array.from({ length: 60 }, (_, i) => ({
      id: "L" + i, name: длинное + " " + i, client: "Клиент " + i, clientId: "cl" + i,
      total: 100000, paid: 50000, debt: 50000,
      crmStatus: "В работе", status: "В работе", updatedAt: new Date().toISOString(),
      snapshot: { project: { name: длинное + " " + i }, payments: [], expenses: [], tasks: [], selected: {} }
    }));
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await pg.addInitScript(({ key, deals }) => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
      localStorage.setItem(key, JSON.stringify({ savedProjects: deals, view: "home" }));
    }, { key: STORAGE_KEY, deals });
    await pg.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await pg.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await pg.evaluate(() => {
      window.app.go("global-finances");
      window.app.setGFinSubTab("transactions");
    });
    await pg.waitForTimeout(600);
    const ряд = await pg.evaluate(() => {
      const bar = document.querySelector("#appContent .fin-action-bar");
      if (!bar) return null;
      const bw = bar.getBoundingClientRect().width;
      // Ищем и кастомные обёртки, и нативные селекты: на телефоне длинный
      // список остаётся нативным, и растягивает строку именно он.
      // enhanceSelects помечает классом .uu-done ВСЕ селекты, включая те, что
      // оставил нативными, — отличать надо не по нему, а по наличию обёртки.
      const sels = [...bar.querySelectorAll(".uu-select-wrap, select")]
        .filter((el) => !(el.tagName === "SELECT" && el.closest(".uu-select-wrap")));
      const wraps = sels.map((w) => Math.round(w.getBoundingClientRect().width));
      const tops = sels.map((w) => Math.round(w.getBoundingClientRect().top));
      return { ширина: Math.round(bw), выборы: wraps, наОднойСтроке: new Set(tops).size === 1 };
    });
    await ctx.close();
    assert(ряд && ряд.выборы.length >= 2, "не нашёл выпадашки фильтров: " + JSON.stringify(ряд));
    assert(ряд.наОднойСтроке, "выпадашки разъехались по строкам: " + JSON.stringify(ряд));
    ряд.выборы.forEach((w) =>
      assert(w <= ряд.ширина * 0.55,
        "выпадашка заняла " + w + "px из " + ряд.ширина + " — её растянуло название сделки"));
  });

  /* Период без операций давал ДВЕ панели подряд с одинаковым «Нет данных» —
     на телефоне это полэкрана пустоты вместо ответа. */
  await test("аналитика: пустой период не плодит одинаковые «Нет данных»", async () => {
    const { context: ce, page: pe } = await bootLocal(browser, baseUrl,
      { width: 390, height: 900, seedDemo: true });
    await pe.evaluate(() => {
      window.app.go("global-finances");
      window.app.setGFinSubTab("analytics");
      window.app.setGFinDatePreset("custom");
      window.app.setGFinDateFrom("2020-01-01");
      window.app.setGFinDateTo("2020-01-31");
    });
    await pe.waitForTimeout(600);
    const txt = await pe.$eval("#appContent", (el) => el.textContent.replace(/\s+/g, " "));
    await ce.close();
    const пустышек = (txt.match(/Нет данных/g) || []).length;
    assert(пустышек <= 1, "пустых блоков с «Нет данных» " + пустышек + " — они дублируют друг друга");
    assert(/операций нет/.test(txt), "не сказано, почему разрезы пустые: " + txt.slice(0, 200));
  });

  /* Заголовок обещал «Прибыль по проектам (топ-10)», а бралось десять ПЕРВЫХ
     сделок из списка и уже они сортировались между собой: у аккаунта со ста
     сделками в «топе» оказывались случайные. */
  await test("прибыль по проектам: в топ-10 попадают самые прибыльные", async () => {
    const deals = [];
    // Двадцать сделок: прибыль растёт к концу списка. При старом отборе первые
    // десять (самые бедные) и попадали бы в «топ».
    for (let i = 0; i < 20; i++) {
      deals.push({
        id: "tp" + i, name: "Проект " + i, client: "К" + i, clientId: "ctp" + i,
        total: 100000, paid: 100000, debt: 0, profit: (i + 1) * 1000,
        crmStatus: "Завершённые", status: "Завершено", updatedAt: new Date().toISOString(),
        snapshot: { project: { name: "Проект " + i }, payments: [], expenses: [], tasks: [], selected: {} }
      });
    }
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const pg = await ctx.newPage();
    await pg.addInitScript(({ key, deals }) => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
      localStorage.setItem(key, JSON.stringify({ savedProjects: deals, view: "home" }));
    }, { key: STORAGE_KEY, deals });
    await pg.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await pg.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await pg.evaluate(() => {
      window.app.go("global-finances");
      window.app.setGFinSubTab("analytics");
    });
    await pg.waitForTimeout(600);
    const имена = await pg.evaluate(() => {
      const h = [...document.querySelectorAll("#appContent .analytics-section h3")]
        .find((x) => /Прибыль по проектам/.test(x.textContent || ""));
      if (!h) return null;
      // Оба класса: старая разметка звалась .category-bar-label. Иначе сторож
      // падал бы «нет строк» вместо «отобраны не те» и ничего не доказывал.
      return [...h.parentElement.querySelectorAll(".rank-name, .category-bar-label")]
        .map((e) => e.textContent.trim());
    });
    await ctx.close();
    assert(имена && имена.length === 10, "в блоке не десять строк: " + JSON.stringify(имена));
    assertEqual(имена[0], "Проект 19", "первым идёт не самый прибыльный проект");
    assert(!имена.includes("Проект 0"),
      "в «топ-10» попал самый бедный проект — отбирается не по прибыли: " + JSON.stringify(имена));
  });

  /* Остаток по сделке в форме поступления. Повод из жизни: на завершённой сделке
     навсегда повис долг 60 ₽ — сумму платежа набрали с переставленными цифрами
     (18933 вместо 18993), и приложение это молча приняло. Теперь остаток видно
     у поля суммы и его можно внести одним нажатием, не набирая цифры руками. */
  await test("поступление: показан остаток по сделке и вносится одной кнопкой", async () => {
    const { context: c4, page: p4 } = await bootLocal(browser, baseUrl,
      { width: 1400, height: 950, seedDemo: true });

    const deal = await p4.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const d = (raw.savedProjects || [])[0];
      return d ? { id: d.id, debt: d.debt } : null;
    });
    assert(deal && deal.debt > 0, "нужна сделка с ненулевым долгом");

    await p4.evaluate((id) => {
      window.app.openFinanceModal("payment");
      window.app.setFinanceModalProject(id);
    }, deal.id);
    await p4.waitForTimeout(400);

    const hint = await p4.evaluate(() => {
      const box = document.querySelector(".modal-box");
      if (!box) return null;
      const el = [...box.querySelectorAll("span")]
        .find((s) => /Остаток по сделке/.test(s.textContent || ""));
      const btn = [...box.querySelectorAll("button")]
        .find((b) => /Внести весь остаток/.test(b.textContent || ""));
      return { text: el ? el.textContent.replace(/\s+/g, " ").trim() : "", hasBtn: !!btn };
    });
    assert(hint, "форма поступления не открылась");
    assert(hint.text.includes("Остаток"), "остаток по сделке не показан у поля суммы");
    assert(hint.hasBtn, "нет кнопки «Внести весь остаток» — сумму снова придётся набирать руками");

    // Подставленная сумма обязана совпасть с долгом до рубля.
    await p4.evaluate(() => window.app.fillFinanceRemaining());
    await p4.waitForTimeout(350);
    const filled = await p4.evaluate(() => {
      const inp = document.getElementById("finModalAmount");
      const btn = [...document.querySelectorAll(".modal-box button")]
        .find((b) => /Внести весь остаток/.test(b.textContent || ""));
      return { value: inp ? inp.value.replace(/\s/g, "") : "", btnStillThere: !!btn };
    });
    assertEqual(filled.value, String(deal.debt),
      "подставлена не та сумма — кнопка обязана закрывать долг ровно");
    assert(!filled.btnStillThere,
      "кнопка осталась, хотя остаток уже внесён — предлагает сделать то же самое второй раз");

    // Шов: расчёт остатка проверяем и напрямую, без разметки.
    const calc = await p4.evaluate(() => window.app._financeModalRemaining());
    assertEqual(calc.debt, deal.debt, "расчёт остатка расходится с долгом сделки");

    await c4.close();
  });

  /* Копеечный остаток после платежа почти всегда опечатка в сумме. Живой случай:
     набрали 18933 вместо 18993 — и на завершённой сделке навсегда повис долг
     60 ₽, найти который удалось только сверкой арифметики по базе. Теперь сразу
     после записи показываем остаток, пока человек помнит, что вводил.
     Проверяем ОБА конца: мелкий остаток предупреждает, честная частичная оплата
     молчит — иначе предупреждение станет фоновым шумом и его перестанут читать. */
  await test("поступление: мелкий остаток предупреждает, частичная оплата — нет", async () => {
    const пробник = async (leave) => {
      const { context: c, page: p } = await bootLocal(browser, baseUrl,
        { width: 1300, height: 900, seedDemo: true });
      const deal = await p.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
        const d = (raw.savedProjects || [])[0];
        return d ? { id: d.id, debt: d.debt } : null;
      });
      if (!deal || deal.debt <= 0) { await c.close(); return null; }
      await p.evaluate(([id, sum]) => {
        window.app.openFinanceModal("payment");
        window.app.setFinanceModalProject(id);
        window.app.setFinanceModalField("amount", String(sum));
        window.app.saveFinanceModal();
      }, [deal.id, deal.debt - leave]);
      await p.waitForTimeout(3200);
      const toastText = await p.evaluate(() => {
        const el = document.getElementById("toast");
        return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
      });
      const left = await p.evaluate((id) => window.app._dealRemaining(id), deal.id);
      await c.close();
      return { toastText, left, debt: deal.debt };
    };

    // 60 ₽ на смете в 41 500 — та самая опечатка.
    const мелкий = await пробник(60);
    assert(мелкий, "нет сделки с долгом — проверять нечего");
    assertEqual(мелкий.left.debt, 60, "остаток посчитан неверно");
    assert(/Остался долг/.test(мелкий.toastText),
      "мелкий остаток не предупредил — опечатка в сумме снова пройдёт молча: " + мелкий.toastText);

    // Половина долга — обычная частичная оплата, предупреждать не о чем.
    const частичный = await пробник(Math.round(мелкий.debt / 2));
    assert(частичный, "второй прогон не получил сделку");
    assert(!/Остался долг/.test(частичный.toastText),
      "частичная оплата вызвала предупреждение — оно станет шумом: " + частичный.toastText);
  });

  await test("способ оплаты проставляется группой — и открытой сделке, и снимкам", async () => {
    /* На боевом счёте владельца 02.09.2026 поступлений «без способа» было на
       1 017 887 ₽ — пятая часть денег. Правился способ только внутри модалки
       ОДНОЙ операции, то есть сорок раз открыть и закрыть.

       Главная ловушка не в интерфейсе, а в хранении: поступления открытой сделки
       живут в state.payments, всех остальных — в proj.snapshot.payments. Запись
       обязана попадать В ОБА места, поэтому фикстура держит и то, и другое, а
       проверка смотрит РЕЗУЛЬТАТ на экране (значок способа в строке), а не то,
       какую функцию мы позвали. */
    const ФИКСТУРА = {
      свои:   [{ id: "nm_a", title: "Аванс без способа", amount: 100000 },
               { id: "nm_b", title: "Второй без способа", amount: 50000 }],
      чужие:  [{ id: "nm_c", title: "Снимок без способа", amount: 300000 },
               { id: "nm_d", title: "Ещё один без", amount: 7000 }],
    };
    const ожидаемоБез = ФИКСТУРА.свои.length + ФИКСТУРА.чужие.length;
    const ожидаемоСумма = [...ФИКСТУРА.свои, ...ФИКСТУРА.чужие].reduce((s, x) => s + x.amount, 0);

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const ошибки = [];
    p.on("pageerror", e => ошибки.push(String(e.message || e)));
    await p.addInitScript(({ key, fx, date }) => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
      const снимок = (payments) => ({ project: { name: "Ч", client: "К" }, payments, expenses: [], tasks: [], selected: {} });
      const своиПлатежи = fx.свои.map(x => ({ ...x, date, method: "" }));
      const чужиеПлатежи = fx.чужие.map(x => ({ ...x, date, method: "" }));
      localStorage.setItem(key, JSON.stringify({
        view: "global-finances",
        activeProjectId: "d_open",
        // открытая сделка: её платежи лежат в state.payments, снимок — копия
        payments: своиПлатежи,
        expenses: [{ id: "nm_exp", title: "Аренда", amount: 30000, date, category: "Прочее" }],
        project: { name: "Открытая", client: "К" },
        savedProjects: [
          { id: "d_open", name: "Открытая", client: "К", total: 150000, paid: 150000, crmStatus: "В работе",
            updatedAt: new Date().toISOString(), snapshot: снимок(своиПлатежи) },
          { id: "d_snap", name: "Из снимка", client: "К", total: 307000, paid: 307000, crmStatus: "В работе",
            updatedAt: new Date().toISOString(), snapshot: снимок(чужиеПлатежи) },
        ],
      }));
    }, { key: STORAGE_KEY, fx: ФИКСТУРА, date: dayThisMonth(5) });

    await p.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await p.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await p.evaluate(() => { window.app.go("global-finances"); window.app.setGFinSubTab("transactions"); });
    await p.waitForTimeout(250);

    const фишка = () => p.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(x => /Без способа/.test(x.textContent));
      return b ? b.textContent.replace(/\s+/g, " ").trim() : null;
    });
    // Строка операции: описание + значок способа/статьи (третья и четвёртая ячейки).
    const строки = () => p.evaluate(() => {
      const tb = document.querySelector(".fin-table--ops tbody");
      if (!tb) return [];
      return [...tb.querySelectorAll("tr")]
        .filter(r => !r.querySelector("td[colspan]"))
        .map(r => ({ title: r.children[2].textContent.trim(), method: r.children[3].textContent.trim() }));
    });

    const текстФишки = await фишка();
    assert(текстФишки, "нет кнопки «Без способа» — дыру в данных нечем найти");
    const числоВФишке = Number((текстФишки.match(/Без способа:\s*(\d+)/) || [])[1]);
    assertEqual(числоВФишке, ожидаемоБез, "кнопка считает не те поступления: " + текстФишки);
    assertEqual(Number(текстФишки.replace(/.*·\s*/, "").replace(/[^\d]/g, "")), ожидаемоСумма,
      "сумма в кнопке разошлась с фикстурой: " + текстФишки);

    await p.evaluate(() => window.app.toggleGFinNoMethod());
    await p.waitForTimeout(200);
    assertEqual((await строки()).length, ожидаемоБез,
      "фильтр «без способа» показывает не только поступления без способа");

    await p.evaluate(() => { window.app.toggleGFinSelectMode(); window.app.selectAllGFinVisible(); });
    await p.waitForTimeout(200);
    assertEqual(await p.evaluate(() => document.querySelectorAll(".gfin-cb:checked").length), ожидаемоБез,
      "«Выбрать все» отметило не все видимые операции");

    await p.evaluate(() => window.app.bulkSetTxMethod("СБП"));
    await p.waitForTimeout(300);

    assertEqual((await строки()).length, 0, "после простановки в фильтре «без способа» что-то осталось");
    assertEqual(await фишка(), null, "кнопка «Без способа» осталась, хотя размечать больше нечего");

    // Снимаем фильтр и смотрим, ЧТО записалось — в обе стороны хранения.
    await p.evaluate(() => window.app.toggleGFinNoMethod());
    await p.waitForTimeout(250);
    const после = await строки();
    for (const x of [...ФИКСТУРА.свои, ...ФИКСТУРА.чужие]) {
      const r = после.find(r => r.title === x.title);
      assert(r, `операция «${x.title}» пропала из списка`);
      assertEqual(r.method, "СБП",
        `«${x.title}» осталась без способа — запись не дошла до ${ФИКСТУРА.свои.includes(x) ? "state.payments открытой сделки" : "snapshot.payments чужой сделки"}`);
    }

    // Обратный ход: у каждой автоматики он должен быть и должен работать.
    await p.evaluate(() => window.app.undoLastDelete());
    await p.waitForTimeout(300);
    const текстПослеОтмены = await фишка();
    assert(текстПослеОтмены, "после отмены кнопка «Без способа» не вернулась — откат неполный");
    assertEqual(Number((текстПослеОтмены.match(/Без способа:\s*(\d+)/) || [])[1]), ожидаемоБез,
      "откат вернул не все способы: " + текстПослеОтмены);

    assertEqual(ошибки.length, 0, "исключения на странице: " + ошибки.join(" | "));
    await ctx.close();
  });

  await test("смета из Telegram разворачивается в позиции с теми же ценами", async () => {
    /* Бот разбирает сообщение владельца («Съёмка — 50 000₽» списком) и кладёт
       позиции в сделку полем botEstimate. Строку сметы он НЕ собирает: у неё 35
       полей и своя математика, и вторая реализация в Edge Function разошлась бы
       с первой молча. Разворачивает приложение — тем же кодом, каким добавляет
       позиции человек.

       Здесь проверяется то, ради чего всё затевалось: цены из сообщения должны
       доехать до сметы БЕЗ изменений. Плюс расхождение с «Итого» — его человек
       обязан увидеть до того, как смета уйдёт клиенту. */
    const ПОЗИЦИИ = [
      { name: "Создание сценария", price: 10000, qty: 1, note: "" },
      { name: "Съёмка", price: 50000, qty: 1, note: "2 оператора" },
      { name: "Монтаж", price: 20000, qty: 1, note: "" },
      { name: "Графика 2D", price: 35000, qty: 1, note: "" },
      { name: "Аренда оборудования", price: 20000, qty: 1, note: "" },
    ];
    const СУММА = ПОЗИЦИИ.reduce((s, l) => s + l.price * l.qty, 0); // 135 000

    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const p = await ctx.newPage();
    const ошибки = [];
    p.on("pageerror", e => ошибки.push(String(e.message || e)));
    await p.addInitScript(({ key, lines, sum }) => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
      localStorage.setItem(key, JSON.stringify({
        view: "deal",
        activeProjectId: "d_bot",
        project: { name: "Рекорд Урала", client: "Рекорд Урала" },
        selected: {}, estimateOrder: [], customItems: [],
        savedProjects: [{
          id: "d_bot", name: "Рекорд Урала", client: "Рекорд Урала",
          crmStatus: "Лид", total: sum, paid: 0,
          updatedAt: new Date().toISOString(),
          snapshot: { project: { name: "Рекорд Урала" }, payments: [], expenses: [], tasks: [], selected: {} },
          // «Итого» в сообщении было на 5 000 больше — бот обязан это показать
          botEstimate: { source: "telegram", lines, statedTotal: sum + 5000, mismatch: 5000, openItems: ["трансфер"] },
        }],
      }));
    }, { key: STORAGE_KEY, lines: ПОЗИЦИИ, sum: СУММА });

    await p.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await p.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await p.evaluate(() => window.app.go("deal"));
    await p.waitForTimeout(400);

    const плашка = () => p.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(x => /Развернуть смету/.test(x.textContent));
      return b ? b.closest("div").parentElement.textContent.replace(/\s+/g, " ").trim() : null;
    });

    const текст = await плашка();
    assert(текст, "плашки «Смета из Telegram» нет — черновик бота негде развернуть");
    assert(/5 позиций/.test(текст), "плашка неверно считает позиции: " + текст.slice(0, 140));
    assert(/трансфер/.test(текст), "позиция без суммы не названа — она потеряется молча");
    assert(/Итого/.test(текст) && /5\s*000/.test(текст.replace(/ /g, " ")),
      "расхождение с «Итого» не показано — клиент получит смету с другой суммой: " + текст.slice(0, 200));

    await p.evaluate(() => window.app.expandBotEstimate());
    await p.waitForTimeout(500);

    assertEqual(await плашка(), null, "плашка осталась после разворота — второе нажатие задвоит позиции");

    // Цены обязаны доехать без изменений: это и есть смысл всей затеи.
    const цены = await p.evaluate(() => [...document.querySelectorAll("input[data-scope='line'][data-key='price']")]
      .map(i => Number(i.value)).filter(n => n > 0));
    assertEqual(цены.length, ПОЗИЦИИ.length, "в смете не столько строк, сколько прислал бот: " + JSON.stringify(цены));
    assertEqual(цены.reduce((s, n) => s + n, 0), СУММА,
      "суммы позиций разошлись с присланными: " + JSON.stringify(цены));

    const имена = await p.evaluate(() => [...document.querySelectorAll(".line-head, .line-name, [data-key='lineName']")]
      .map(e => (e.value || e.textContent || "").trim()).join(" | "));
    assert(/Съёмка/.test(имена), "названия позиций не доехали до сметы: " + имена.slice(0, 160));

    assertEqual(ошибки.length, 0, "исключения на странице: " + ошибки.join(" | "));
    await ctx.close();
  });

  await test("«Данные»: плитки называют настоящий объём базы, а не круглые нули", async () => {
    /* Экран выгрузок показывал только кнопки — ни слова о том, что именно лежит
       в базе. Человек приходит сюда перед необратимым (импорт поверх, сброс), и
       решать вслепую нельзя. Плитки обязаны считать РЕАЛЬНОЕ состояние: пустые
       или застывшие числа здесь хуже, чем их отсутствие. */
    const { context: ctx, page: p } = await bootSeeded(browser, baseUrl);
    await p.evaluate(() => { window.app.go("settings"); window.app._setSettingsTab("data"); });
    await p.waitForTimeout(300);

    const плитки = await p.evaluate(() => [...document.querySelectorAll(".data-stat")].map(el => ({
      num: (el.querySelector(".data-stat__num") || {}).textContent?.trim(),
      lbl: (el.querySelector(".data-stat__lbl") || {}).textContent?.trim(),
    })));
    assert(плитки.length >= 6, "плиток с фактами меньше, чем должно быть: " + плитки.length);

    const поПодписи = (re) => плитки.find(t => re.test(t.lbl || ""));
    const сделки = поПодписи(/сделк/i);
    assert(сделки, "нет плитки со сделками");
    // seedDeals() кладёт ровно три сделки — плитка обязана назвать это число.
    assertEqual(сделки.num, "3", "плитка сделок посчитала не состояние: " + JSON.stringify(сделки));

    const объём = поПодписи(/занято в браузере/i);
    assert(объём, "нет плитки с занятым объёмом");
    assert(/^\d+([.,]\d+)?\s*(КБ|МБ)$/.test(объём.num || ""),
      "объём показан не как размер: " + JSON.stringify(объём));
    assert(Number(String(объём.num).replace(/[^\d.,]/g, "").replace(",", ".")) > 0,
      "объём хранилища нулевой — значит считается не то");

    // Склонения: «1 сделок» на этом экране уже было.
    for (const t of плитки) {
      assert(!/^\s*1\s*$/.test(t.num) || !/(сделок|клиентов|задач|договоров|операций)$/.test(t.lbl || ""),
        "число 1 с подписью во множественном числе: " + JSON.stringify(t));
    }

    const опасно = await p.evaluate(() => {
      const h = [...document.querySelectorAll("h2")].find(x => /Опасная зона/.test(x.textContent));
      return h ? h.parentElement.textContent.replace(/\s+/g, " ") : "";
    });
    assert(/облак/i.test(опасно),
      "«Опасная зона» не предупреждает про облачную копию: " + опасно.slice(0, 120));

    await ctx.close();
  });

  await test("себестоимость каталога проставляется разделу и наследуется новой строкой", async () => {
    /* До 03.09.2026 себестоимость жила ТОЛЬКО в строке сметы и начиналась с нуля.
       Каждая новая смета выходила с маржой 100%, а совет продукта «проставьте
       себестоимость в позициях» означал заполнять её заново в каждой сделке: на
       боевом счёте из 122 сделок себестоимость есть у 40.

       Здесь проверяется именно СЦЕПКА: значение у позиции каталога → строка сметы.
       И граница: уже собранная смета не должна поехать задним числом. */
    const { context: ctx, page: p, errors: ошибки } =
      await bootLocal(browser, baseUrl, { width: 1400, height: 950, seedDemo: true });

    await p.evaluate(() => { window.app.go("catalog"); window.app.setTab("post"); });
    await p.waitForTimeout(300);

    const наЭкране = await p.evaluate(() => document.querySelectorAll(".catalog-grid .item").length);
    assert(наЭкране > 0, "в разделе «Пост» не нарисовано ни одной позиции — проверять нечего");

    // Себестоимость строк ДО простановки — граница «старое не трогаем».
    const костыДо = await p.evaluate(() => {
      window.app.go("deal");
      return null;
    });
    await p.waitForTimeout(400);
    const строкиДо = await p.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll("input[data-scope='line'][data-key='cost']")]
        .map(i => [i.getAttribute("data-id"), i.value])));
    assert(Object.keys(строкиДо).length > 0, "в демо-смете нет строк — не с чем сравнивать");

    await p.evaluate(() => { window.app.go("catalog"); window.app.setTab("post"); window.app.toggleCatalogCostPanel(); });
    await p.waitForTimeout(300);

    // Область действия обязана совпасть с тем, что на экране: кнопка называет число.
    const подписьКнопки = await p.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(x => /Проставить \d+ позици/.test(x.textContent));
      return b ? b.textContent.trim().replace(/\s+/g, " ") : null;
    });
    assert(подписьКнопки, "панель себестоимости не открылась");
    assertEqual(Number((подписьКнопки.match(/(\d+)/) || [])[1]), наЭкране,
      "кнопка обещает тронуть не столько позиций, сколько показано: " + подписьКнопки);

    await p.evaluate(() => window.app.bulkSetCatalogCost(40));
    await p.waitForTimeout(400);

    // Берём позицию из этого же раздела и кладём в смету — она обязана прийти с себестоимостью.
    const добавленный = await p.evaluate(() => {
      const btn = document.querySelector(".catalog-grid .item [onclick*='catalogAddOne']");
      const m = btn && btn.getAttribute("onclick").match(/catalogAddOne\('([^']+)'/);
      if (!m) return null;
      window.app.catalogAddOne(m[1]);
      return m[1];
    });
    assert(добавленный, "не нашлось позиции, которую можно добавить в смету");
    await p.evaluate(() => window.app.go("deal"));
    await p.waitForTimeout(500);

    const пара = await p.evaluate((id) => {
      const cost = document.querySelector(`input[data-scope='line'][data-key='cost'][data-id='${id}']`);
      const price = document.querySelector(`input[data-scope='line'][data-key='price'][data-id='${id}']`);
      return cost && price ? { cost: Number(cost.value), price: Number(price.value) } : null;
    }, добавленный);
    assert(пара, `строка «${добавленный}» не появилась в смете`);
    assert(пара.price > 0, "у позиции нулевая цена — от неё нельзя посчитать процент");
    assertEqual(пара.cost, Math.round(пара.price * 0.4),
      `новая строка пришла с себестоимостью ${пара.cost} при цене ${пара.price} — 40% не наследовались`);

    // Старые строки не поехали: смета — документ, задним числом деньги в нём не меняем.
    const строкиПосле = await p.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll("input[data-scope='line'][data-key='cost']")]
        .map(i => [i.getAttribute("data-id"), i.value])));
    for (const [id, было] of Object.entries(строкиДо)) {
      assertEqual(строкиПосле[id], было,
        `строка «${id}» уже собранной сметы изменила себестоимость с ${было} на ${строкиПосле[id]}`);
    }

    // Обратный ход: после отмены та же позиция снова приходит без себестоимости.
    await p.evaluate((id) => {
      window.app.go("catalog");
      window.app.undoLastDelete();
      window.app.catalogRemoveOne(id);
    }, добавленный);
    await p.waitForTimeout(400);
    await p.evaluate((id) => window.app.catalogAddOne(id), добавленный);
    await p.evaluate(() => window.app.go("deal"));
    await p.waitForTimeout(500);
    const послеОтмены = await p.evaluate((id) => {
      const c = document.querySelector(`input[data-scope='line'][data-key='cost'][data-id='${id}']`);
      return c ? Number(c.value) : null;
    }, добавленный);
    assertEqual(послеОтмены, 0,
      "после отмены позиция всё ещё приносит себестоимость — откат массовой простановки неполный");

    assertEqual(ошибки.length, 0, "исключения на странице: " + ошибки.join(" | "));
    await ctx.close();
  });

  await context.close();
};
