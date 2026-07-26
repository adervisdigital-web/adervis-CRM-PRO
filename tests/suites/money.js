// Арифметика денег — единственная часть приложения, где баги повторялись из сессии
// в сессию, и до этого набора она не была покрыта ни одной проверкой:
//   • архивные сделки попадали в «Оборот»/«Собираемость» (правилось 4 раза);
//   • открытая сделка учитывалась и в live-state, и в снапшоте → суммы месяца
//     задваивались ([[gotcha-active-project-double-count]]);
//   • пустая смета стирала бюджет.
// Поэтому здесь не «рендерится ли раздел», а именно СУММЫ: состояние задаётся
// вручную (детерминированно), ожидания посчитаны на бумаге.
const { loadPlaywright, assert, assertEqual } = require("../harness");

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

  await test("рендер сумм прошёл без исключений в консоли", async () => {
    assert(errors.length === 0, "ошибки страницы: " + errors.slice(0, 3).join(" | "));
  });

  await context.close();
};
