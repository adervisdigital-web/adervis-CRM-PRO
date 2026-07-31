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

  // Скрин-ридер объявляет кнопку-дропдаун её доступным именем. enhanceSelects() читал
  // только aria-label/<label>, а в этом проекте селекты подписаны через title — до
  // 26.07.2026 НИ ОДНА из 6 кнопок в приложении не имела имени вообще («список», и всё).
  await test("кастом-дропдауны: у каждого есть доступное имя (aria-label)", async () => {
    const bad = [];
    for (const view of ["catalog", "global-tasks", "global-finances", "crm"]) {
      await page.evaluate((v) => window.app.go(v), view);
      await page.waitForTimeout(180);
      const nameless = await page.evaluate(() =>
        [...document.querySelectorAll(".uu-select-btn")].filter(b => !(b.getAttribute("aria-label") || "").trim()).length
      );
      if (nameless) bad.push(`${view}: ${nameless}`);
    }
    assertEqual(bad.length, 0, "дропдауны без aria-label — " + bad.join("; "));
  });

  // Иконочные кнопки без текста обязаны нести aria-label/title, иначе скрин-ридер
  // объявляет их просто «кнопка». На 26.07.2026 нарушений нет ни в одном разделе —
  // тест держит планку (миграция эмодзи→SVG 24.07 расставила подписи аккуратно).
  await test("кнопки: у каждой видимой есть доступное имя (текст/aria-label/title)", async () => {
    const bad = [];
    for (const view of ["home", "crm", "clients", "global-tasks", "global-finances", "catalog", "settings"]) {
      await page.evaluate((v) => window.app.go(v), view);
      await page.waitForTimeout(180);
      const nameless = await page.evaluate(() =>
        [...document.querySelectorAll("#appContent button")]
          .filter(b => b.offsetParent !== null)
          .filter(b => !((b.textContent || "").trim() || b.getAttribute("aria-label") || b.getAttribute("title")))
          .map(b => (b.className || "").toString().slice(0, 40) || b.outerHTML.slice(0, 50))
      );
      if (nameless.length) bad.push(`${view}: ${nameless.join(", ")}`);
    }
    assertEqual(bad.length, 0, "кнопки без доступного имени — " + bad.join(" | "));
  });

  // То же самое для полей ввода. Считаем имя по правилам accname, а НЕ регекспом
  // по исходнику: у большинства полей подпись стоит визуальным <label> рядом, и
  // грубый поиск по тексту насчитывает сотни ложных срабатываний.
  //
  // placeholder и title сознательно не считаются именем. Формально браузер их
  // подхватит, но placeholder исчезает при вводе, а title в каталоге был "Цена"
  // сразу у двух десятков полей подряд — на слух это «Цена, Цена, Цена…» без
  // единого намёка, к какой услуге относится поле.
  await test("поля ввода: у каждого видимого есть доступное имя", async () => {
    const bad = [];
    for (const view of ["home", "crm", "clients", "global-tasks", "global-finances", "catalog", "settings", "briefs", "knowledge"]) {
      await page.evaluate((v) => window.app.go(v), view);
      await page.waitForTimeout(200);
      const nameless = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("#appContent input, #appContent select, #appContent textarea")) {
          if (el.type === "hidden" || el.offsetParent === null) continue;
          let name = (el.getAttribute("aria-label") || "").trim();
          if (!name) {
            const lb = el.getAttribute("aria-labelledby");
            const t = lb && document.getElementById(lb);
            if (t) name = (t.textContent || "").trim();
          }
          if (!name && el.id) {
            const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (l) name = (l.textContent || "").trim();
          }
          if (!name) {
            const w = el.closest("label");
            if (w) name = (w.textContent || "").trim();
          }
          if (!name) out.push(`${el.tagName.toLowerCase()}/${el.type || ""}${el.className ? "." + String(el.className).split(" ")[0] : ""}`);
        }
        return out;
      });
      if (nameless.length) bad.push(`${view}: ${nameless.join(", ")}`);
    }
    assertEqual(bad.length, 0, "поля без доступного имени — " + bad.join(" | "));
  });

  // Карточки сделок/услуг/пакетов, этапы воронки, плитки статистики и сегменты
  // графиков кликабельны мышью, но это не <button> — без tabindex они были
  // недостижимы с клавиатуры вообще. Поднимает их централизованно _enhanceA11y.
  await test("кликабельные не-кнопки достижимы с клавиатуры", async () => {
    const NATIVE = ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "LABEL", "OPTION", "DETAILS"];
    const bad = [];
    for (const view of ["home", "crm", "clients", "global-finances", "catalog", "packages", "knowledge"]) {
      await page.evaluate((v) => window.app.go(v), view);
      await page.waitForTimeout(220);
      const nope = await page.evaluate((native) => {
        const out = [];
        for (const el of document.querySelectorAll("#appContent [onclick]")) {
          if (native.includes(el.tagName)) continue;
          if (el.offsetParent === null) continue;
          if (el.hasAttribute("tabindex")) continue;
          const oc = el.getAttribute("onclick") || "";
          // Исключения по смыслу, а не «чтобы тест позеленел»: клик по пустому
          // месту и обёртка-глушитель всплытия действием не являются.
          if (/event\.target\s*===\s*this/.test(oc)) continue;
          if (/^\s*event\.stopPropagation\(\)\s*;?\s*$/.test(oc)) continue;
          out.push(el.tagName.toLowerCase() + "." + String(el.className || "").split(" ")[0]);
        }
        return out;
      }, NATIVE);
      if (nope.length) bad.push(`${view}: ${[...new Set(nope)].join(", ")}`);
    }
    assertEqual(bad.length, 0, "кликабельно мышью, но не с клавиатуры — " + bad.join(" | "));
  });

  // Мало сделать элемент фокусируемым — на нём должен работать Enter. Проверяем
  // сквозным действием и по ВИДИМОМУ результату (этап воронки стал активным),
  // а не по внутреннему состоянию: так тест не зависит от того, как хранится state.
  await test("Enter на кликабельной не-кнопке выполняет то же, что клик", async () => {
    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(280);

    const filter = await page.evaluate(() => {
      const stages = [...document.querySelectorAll(".funnel-stage")];
      const target = stages.find(s => !s.classList.contains("active"));
      if (!target) return null;
      const f = (target.getAttribute("onclick") || "").match(/setCrmFilter\('([^']*)'\)/);
      if (!f) return null;
      target.id = "kbdTestStage";
      return f[1];
    });
    assert(filter, "не нашёлся неактивный этап воронки с setCrmFilter");

    await page.focus("#kbdTestStage");
    const focused = await page.evaluate(() =>
      document.activeElement && document.activeElement.classList.contains("funnel-stage"));
    assert(focused, "этап воронки не принимает фокус (нет tabindex?)");

    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    // После render() узел пересоздан — ищем этап заново по его фильтру.
    const nowActive = await page.evaluate((f) => {
      const el = [...document.querySelectorAll(".funnel-stage")]
        .find(s => (s.getAttribute("onclick") || "").includes(`setCrmFilter('${f}')`));
      return el ? el.classList.contains("active") : null;
    }, filter);
    assertEqual(nowActive, true, `Enter не применил фильтр «${filter}»`);
  });

  // Контраст цветных «капсул» в ОБЕИХ темах. Проверять глазами здесь бесполезно:
  // фон у них полупрозрачный (rgba(...,.12)), поэтому реальный контраст зависит от
  // того, что под ним — а под ним разный цвет в тёмной и светлой теме. Хардкод
  // светлых оттенков (напр. #60a5fa) выглядит нормально на тёмном и почти исчезает
  // на белом. Композитим альфу по цепочке родителей и считаем WCAG-отношение.
  // Порог 4.5:1 — это мелкий текст (12px), то есть AA для обычного текста.
  await test("цветные капсулы читаемы и в тёмной, и в светлой теме (контраст ≥ 4.5:1)", async () => {
    const CASES = [
      // [класс, атрибут-модификатор] — по одному представителю каждой цветовой группы
      [".pkg-cat-badge", 'data-cat="social"'],
      [".pkg-cat-badge", 'data-cat="interview"'],
      [".pkg-cat-badge", 'data-cat="business"'],
      [".pkg-cat-badge", 'data-cat="events"'],
      [".pkg-cat-badge", 'data-cat="ai"'],
      [".pkg-cat-badge", 'data-cat="graphic"'],
      [".pkg-cat-badge", 'data-cat="photo"'],
      [".pkg-cat-badge", 'data-cat="corporate"'],
      [".kb-cat-badge.sales", ""],
      [".kb-cat-badge.prod", ""],
      [".kb-cat-badge.price", ""],
      [".kb-cat-badge.client", ""],
      [".kb-cat-badge.guide", ""],
      [".catalog-action-btn.active", ""],
      [".status-pill.green", ""],
      [".status-pill.yellow", ""],
      [".status-pill.archived", ""],
      [".margin-badge.good", ""],
      [".margin-badge.ok", ""],
      [".margin-badge.bad", ""],
    ];
    const bad = [];
    for (const theme of ["dark", "light"]) {
      const res = await page.evaluate(({ cases, theme }) => {
        document.documentElement.setAttribute("data-theme", theme);
        const host = document.createElement("div");
        host.className = "panel";
        host.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.appendChild(host);

        const parse = (c) => {
          const m = String(c).match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const p = m[1].split(",").map(s => parseFloat(s.trim()));
          return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
        };
        // Эффективный фон: складываем полупрозрачные слои от элемента вверх до
        // непрозрачного (в пределе — белый лист браузера).
        const effBg = (el) => {
          const stack = [];
          for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
            const bg = parse(getComputedStyle(n).backgroundColor);
            if (bg && bg.a > 0) { stack.push(bg); if (bg.a === 1) break; }
          }
          const rootBg = parse(getComputedStyle(document.documentElement).backgroundColor);
          if (rootBg && rootBg.a > 0) stack.push(rootBg);
          stack.push({ r: 255, g: 255, b: 255, a: 1 });
          let out = stack[stack.length - 1];
          for (let i = stack.length - 2; i >= 0; i--) {
            const top = stack[i];
            out = {
              r: top.r * top.a + out.r * (1 - top.a),
              g: top.g * top.a + out.g * (1 - top.a),
              b: top.b * top.a + out.b * (1 - top.a),
              a: 1
            };
          }
          return out;
        };
        const lum = (c) => {
          const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
        };

        const out = [];
        for (const [cls, attr] of cases) {
          const el = document.createElement("span");
          el.className = cls.replace(/^\./, "").replace(/\./g, " ");
          if (attr) {
            const [k, v] = attr.split("=");
            el.setAttribute(k, v.replace(/"/g, ""));
          }
          el.textContent = "Тест";
          host.appendChild(el);
          const fg = parse(getComputedStyle(el).color);
          const bg = effBg(el);
          const l1 = lum(fg), l2 = lum(bg);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          out.push({ sel: cls + (attr ? "[" + attr + "]" : ""), ratio: Math.round(ratio * 100) / 100 });
          host.removeChild(el);
        }
        host.remove();
        return out;
      }, { cases: CASES, theme });

      for (const r of res) {
        if (r.ratio < 4.5) bad.push(`${theme}: ${r.sel} — ${r.ratio}:1`);
      }
    }
    // Вернуть тему по умолчанию, чтобы не влиять на следующие тесты.
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    assertEqual(bad.length, 0, "низкий контраст капсул — " + bad.join(" | "));
  });

  // Кнопка «Скрыть» чеклиста «первые шаги» была 18×18 — меньше даже мягкого порога
  // тач-таргета. Сам чеклист виден только со свежим demo-аккаунтом (seedDemo),
  // поэтому открываем отдельный контекст вместо общего page из этого набора.
  await test("чеклист «первые шаги»: кнопка «Скрыть» — тач-таргет не меньше 36×36", async () => {
    const { context: c2, page: p2 } = await bootLocal(browser, baseUrl, { seedDemo: true });
    await p2.evaluate(() => window.app.go("home"));
    await p2.waitForTimeout(200);
    const size = await p2.evaluate(() => {
      // Ищем по title, а не по тексту: крестик теперь иконка (символ × не входит
      // в сабсет DM Sans и рисовался системным шрифтом — «коробочкой»).
      const btn = [...document.querySelectorAll("#appContent button")].find((b) => b.title === "Скрыть");
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    assert(size, "кнопка «Скрыть» чеклиста не найдена");
    assert(size.w >= 36 && size.h >= 36, `тач-таргет меньше 36×36: ${size.w}×${size.h}`);
    await c2.close();
  });

  await context.close();
};
