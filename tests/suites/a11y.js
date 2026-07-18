// Доступность (WCAG 2.1): семантические роли на канбане, табах и кастом-дропдауне.
// Проверяет централизованный _enhanceA11y() + ARIA в enhanceSelects.
const { bootLocal, assert, assertEqual } = require("../harness");

async function dealId(page) {
  await page.evaluate(() => window.app.go("home"));
  await page.waitForTimeout(80);
  return page.evaluate(() => {
    for (const el of document.querySelectorAll("[onclick]")) {
      const m = (el.getAttribute("onclick") || "").match(/openDeal\('([^']+)'\)/);
      if (m) return m[1];
    }
    return null;
  });
}

module.exports = async function ({ browser, baseUrl, test }) {
  const { context, page } = await bootLocal(browser, baseUrl, { width: 1200, height: 860, seedDemo: true });

  await test("канбан: доска и колонки — семантические группы с подписью", async () => {
    await page.evaluate(() => window.app.go("crm"));
    await page.waitForTimeout(150);
    const res = await page.evaluate(() => {
      const board = document.querySelector(".kanban");
      const cols = [...document.querySelectorAll(".kanban-col")];
      return {
        boardRole: board && board.getAttribute("role"),
        colCount: cols.length,
        colsWithRole: cols.filter(c => c.getAttribute("role") === "group").length,
        colsWithLabel: cols.filter(c => (c.getAttribute("aria-label") || "").length > 0).length,
      };
    });
    assertEqual(res.boardRole, "group", "у .kanban нет role=group");
    assert(res.colCount > 0, "нет колонок канбана");
    assertEqual(res.colsWithRole, res.colCount, "не все .kanban-col получили role=group");
    assert(res.colsWithLabel >= res.colCount, "не у всех колонок есть aria-label");
  });

  await test("табы сделки: role=tab + ровно один aria-selected=true", async () => {
    const id = await dealId(page);
    assert(id, "нет демо-сделки");
    await page.evaluate((pid) => window.app.openDeal(pid), id);
    await page.waitForTimeout(150);
    const res = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll(".deal-tab")];
      const bar = tabs[0] && tabs[0].parentElement;
      return {
        count: tabs.length,
        allTab: tabs.every(t => t.getAttribute("role") === "tab"),
        selected: tabs.filter(t => t.getAttribute("aria-selected") === "true").length,
        barRole: bar && bar.getAttribute("role"),
      };
    });
    assert(res.count > 0, "нет табов сделки");
    assert(res.allTab, "не все .deal-tab имеют role=tab");
    assertEqual(res.selected, 1, "должен быть ровно один активный таб (aria-selected)");
    assertEqual(res.barRole, "tablist", "контейнер табов не role=tablist");
  });

  await test("кастом-дропдаун: combobox → listbox с option (если не тач-фолбэк)", async () => {
    await page.evaluate(() => window.app.go("crm"));
    await page.waitForTimeout(150);
    const hasCustom = await page.evaluate(() => !!document.querySelector(".uu-select-btn"));
    if (!hasCustom) {
      // В headless возможен тач-фолбэк (hover:none) → нативный select, это допустимо.
      return;
    }
    const trigger = await page.evaluate(() => {
      const b = document.querySelector(".uu-select-btn");
      return { haspopup: b.getAttribute("aria-haspopup"), expanded: b.getAttribute("aria-expanded") };
    });
    assertEqual(trigger.haspopup, "listbox", "кнопка дропдауна не aria-haspopup=listbox");
    assertEqual(trigger.expanded, "false", "закрытый дропдаун должен быть aria-expanded=false");

    await page.evaluate(() => document.querySelector(".uu-select-btn").click());
    await page.waitForTimeout(80);
    const opened = await page.evaluate(() => {
      const dd = document.querySelector(".uu-select-dd");
      const opts = dd ? [...dd.querySelectorAll(".uu-select-opt")] : [];
      const btn = document.querySelector(".uu-select-btn");
      return {
        listbox: dd && dd.getAttribute("role"),
        optCount: opts.length,
        allOption: opts.every(o => o.getAttribute("role") === "option"),
        selectedAttr: opts.some(o => o.getAttribute("aria-selected") === "true"),
        expanded: btn.getAttribute("aria-expanded"),
      };
    });
    assertEqual(opened.listbox, "listbox", "раскрытый список не role=listbox");
    assert(opened.optCount > 0, "нет опций в списке");
    assert(opened.allOption, "не все опции имеют role=option");
    assertEqual(opened.expanded, "true", "открытый дропдаун должен быть aria-expanded=true");
  });

  await context.close();
};
