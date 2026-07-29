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
function dayThisMonth(day) {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(day)}`;
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

  await context.close();
};
