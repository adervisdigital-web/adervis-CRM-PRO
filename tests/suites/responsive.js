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

  // Строка «Все КП» несёт четыре действия (посмотреть, изменить, ссылка, удалить)
  // плюс пилюлю статуса. Проверять тут переполнение документа БЕСПОЛЕЗНО: .kp-row-main
  // имеет min-width:0 и молча сжимается — при отключённом переносе тест оставался
  // зелёным, а название сделки схлопывалось в «Мон…». Меряем то, что реально ломается:
  // сколько места остаётся названию. Живых КП в локальном режиме нет (нужен Supabase),
  // поэтому строку вставляем в настоящий список настоящей вьюхи: CSS, вьюпорт и
  // измерение подлинные, синтетическая тут только сама запись.
  await test("строка КП: четыре действия не съедают название на 320–560px", async () => {
    await page.evaluate(() => window.app.go("proposals"));
    await page.waitForTimeout(150);
    const bad = [];
    for (const w of [320, 360, 390, 480, 560]) {
      await page.setViewportSize({ width: w, height: 800 });
      const placed = await page.evaluate(() => {
        const panel = document.querySelector("#appContent .panel");
        if (!panel) return false;
        let host = document.getElementById("kpRowProbe");
        if (!host) {
          host = document.createElement("div");
          host.id = "kpRowProbe";
          host.className = "kp-list";
          panel.appendChild(host);
        }
        host.innerHTML =
          '<div class="kp-row">' +
            '<div class="kp-row-dot green"></div>' +
            '<div class="kp-row-main">' +
              '<div class="kp-row-name">Монтаж серии из 3 видеороликов для маркетплейса</div>' +
              '<div class="kp-row-sub">157 834 ₽ · аванс 78 900 ₽ (оплачен) · База отдыха «Раздолье» · 01.07.2026</div>' +
            '</div>' +
            '<span class="status-pill green" style="font-size:11px;flex-shrink:0">Аванс оплачен</span>' +
            '<div class="kp-row-actions">' +
              '<button class="icon-btn"></button><button class="icon-btn"></button>' +
              '<button class="icon-btn"></button><button class="icon-btn"></button>' +
            '</div>' +
          '</div>';
        return true;
      });
      assert(placed, "не нашёл панель «Все КП», чтобы вставить пробную строку");
      await page.waitForTimeout(60);
      const m = await page.evaluate(() => {
        const row = document.querySelector("#kpRowProbe .kp-row");
        const main = row.querySelector(".kp-row-main");
        return { row: row.getBoundingClientRect().width, main: main.getBoundingClientRect().width };
      });
      // Название с суммой и клиентом должно получать хотя бы 3/4 ширины строки —
      // иначе от него остаётся многоточие и строки не отличить одну от другой.
      const share = m.row ? m.main / m.row : 0;
      if (share < 0.75) bad.push(`${w}px: названию ${Math.round(share * 100)}% ширины`);
      const { over, culprit } = await overflow(page);
      if (over > 1) bad.push(`${w}px +${over}px (${culprit || "?"})`);
    }
    // Страница общая для всех тестов набора — за собой убираем.
    await page.evaluate(() => {
      const host = document.getElementById("kpRowProbe");
      if (host) host.remove();
    });
    assert(bad.length === 0, "строка КП на узком экране: " + bad.join("; "));
  });

  // На телефоне из топбара убрано почти всё ради места, и вместе с прочим туда
  // уехал глобальный поиск — при сотне сделок это значит «искать листанием».
  // Заодно проверяем, что активный пункт нижней навигации объявляется не только
  // цветом: подсветка ничего не говорит скрин-ридеру.
  await test("телефон: поиск доступен из топбара, активный пункт нав. помечен aria-current", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(250);
    const res = await page.evaluate(() => {
      const vis = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2 && getComputedStyle(el).display !== "none";
      };
      const search = document.getElementById("searchBtn");
      const nav = [...document.querySelectorAll(".mobile-bottom-nav button")];
      const active = nav.filter((b) => b.classList.contains("active"));
      return {
        searchVisible: vis(search),
        searchName: search ? (search.getAttribute("aria-label") || "").trim() : "",
        activeCount: active.length,
        activeCurrent: active.filter((b) => b.getAttribute("aria-current") === "page").length,
        navCount: nav.length,
      };
    });
    assert(res.searchVisible, "на 390px нет кнопки глобального поиска в топбаре");
    assert(res.searchName.length > 0, "у кнопки поиска нет доступного имени");
    assert(res.navCount >= 4, "нижняя навигация не отрисовалась: " + res.navCount);
    assert(res.activeCount > 0, "ни один пункт нижней навигации не активен на «Проектах»");
    assert(res.activeCurrent === res.activeCount,
      `активный пункт без aria-current: ${res.activeCurrent} из ${res.activeCount}`);
    await page.setViewportSize({ width: 900, height: 800 });
  });

  /* Редактор договора общий обход VIEWS не покрывает: он показывается только при
     выставленном contractEditId, а по списку вьюх мы попадаем на список договоров.
     Переполнение жило именно в редакторе — <select> со сделками не сжимался ниже
     своей самой длинной опции и растягивал ячейку сетки шире окна. */
  await test("редактор договора на 390px: длинное название сделки в списке не тянет страницу вбок", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      // Длинное имя сделки — то самое, что раздувает min-content у <select>.
      const s = window.app;
      s.go("contracts");
      s.createContractFromTemplate("tpl_release");
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (raw.contracts || [])[0];
      s.openContractEdit(c.id);
    });
    await page.waitForTimeout(400);

    const closed = await overflow(page);
    assert(closed.over <= 1, `редактор договора шире экрана на ${closed.over}px (${closed.tag})`);

    await page.evaluate(() => window.app.startContractWizard(0));
    await page.waitForTimeout(400);
    const opened = await overflow(page);
    assert(opened.over <= 1, `с открытым мастером редактор шире экрана на ${opened.over}px (${opened.tag})`);

    const hasInput = await page.$("#contractWizardInput");
    assert(hasInput, "мастер не открылся — проверка переполнения ничего не значит");

    await page.evaluate(() => window.app.closeContractEdit());
    await page.setViewportSize({ width: 900, height: 800 });
  });

  // Визуальная фиксация каталога на самом узком экране (п.20 — визуальный обход)
  await test("каталог на 320px: снимок для ревью", async () => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => window.app.go("catalog"));
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(shotDir, "catalog-320.png"), fullPage: true });
  });

  await context.close();
};
