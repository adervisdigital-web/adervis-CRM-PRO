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
      const t = document.querySelector('.db-stat[title="Средний чек"]');
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
    ["Наличные", "Карта"].forEach((m) =>
      assert(modal.some((o) => o === m), `в списке нет варианта «${m}»: ${JSON.stringify(modal)}`));

    // Переход на список не должен стирать то, что уже вписали руками.
    const kept = await p.evaluate(() => {
      const html = window.app._paymentMethodOptions("ЮKassa через ссылку");
      return { есть: /ЮKassa через ссылку/.test(html), выбран: /selected/.test(html) };
    });
    assert(kept.есть, "нестандартный способ оплаты пропал из списка — при сохранении он бы стёрся");
    assert(kept.выбран, "нестандартный способ есть в списке, но не отмечен выбранным");

    await ctx.close();
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

  await context.close();
};
