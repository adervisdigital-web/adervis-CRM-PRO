// п.18 (Фаза F): регресс горизонтального переполнения на узких экранах,
// включая <360px и каталог-навигацию. Проверяем, что документ не расширяется
// за вьюпорт ни на одной вьюхе ни на одном брейкпоинте.
const path = require("path");
const { bootLocal, assert } = require("../harness");

const WIDTHS = [320, 360, 480, 640, 768, 900];
// Список расширен 26.07.2026 после ручного прохода 390×844 по всем разделам: тот проход
// нашёл 0 переполнений, но покрыты тестом были только 6 вьюх из 11 — фиксируем остальные,
// чтобы регресс ловился автоматически (грабли `.deal-cards-grid` 24.07 поймал именно этот тест).
const VIEWS = [
  "home", "catalog", "crm", "clients", "tasks", "global-tasks",
  "services", "packages", "proposals", "knowledge", "settings",
  "global-finances", "calendar", "global-calendar",
];

// Возвращает {over, tag} — на сколько px документ шире вьюпорта и кто виноват.
async function overflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const vw = window.innerWidth;
    const over = Math.max(de.scrollWidth, document.body.scrollWidth) - vw;
    let culprit = "";
    if (over > 1) {
      for (const el of document.querySelectorAll("#appContent *")) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && r.width <= vw + 2) {
          culprit = (el.tagName + "." + (el.className || "").toString().split(/\s+/)[0]).slice(0, 40);
          break;
        }
      }
    }
    return { over, culprit };
  });
}

module.exports = async function ({ browser, baseUrl, test, shotDir }) {
  const { context, page } = await bootLocal(browser, baseUrl, { width: 900, height: 800, seedDemo: true });

  for (const view of VIEWS) {
    await test(`нет гориз. переполнения: вьюха «${view}» на ${WIDTHS.join("/")}px`, async () => {
      const bad = [];
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.evaluate((v) => window.app.go(v), view);
        await page.waitForTimeout(80);
        const { over, culprit } = await overflow(page);
        if (over > 1) bad.push(`${w}px +${over}px (${culprit || "?"})`);
      }
      assert(bad.length === 0, "переполнение: " + bad.join("; "));
    });
  }

  // Визуальная фиксация каталога на самом узком экране (п.20 — визуальный обход)
  await test("каталог на 320px: снимок для ревью", async () => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => window.app.go("catalog"));
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(shotDir, "catalog-320.png"), fullPage: true });
  });

  await context.close();
};
