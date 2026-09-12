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

  /* Отключённая кнопка обязана выглядеть отключённой. Общего правила для :disabled
     не было вовсе: в тарифах приглушение писалось inline прямо в разметке, у пяти
     компонентов были свои :disabled в CSS, а в остальных местах с атрибутом
     disabled — ничего. Кнопка выглядела рабочей, человек жал и не получал отклика:
     худший вид молчания в интерфейсе.

     Меряем результат по вычисленным стилям: отключённая отличается от соседней
     рабочей прозрачностью и курсором. Так проверка переживёт и перенос стиля из
     inline в CSS, и обратно. */
  await test("отключённая кнопка видна как отключённая, а не молчит", async () => {
    await page.evaluate(() => window.app.go("plans"));
    await page.waitForTimeout(400);

    const res = await page.evaluate(() => {
      const all = [...document.querySelectorAll("#appContent button")];
      const off = all.find((b) => b.disabled);
      const on = all.find((b) => !b.disabled);
      const look = (b) => (b ? { opacity: Number(getComputedStyle(b).opacity), cursor: getComputedStyle(b).cursor,
        text: b.textContent.replace(/\s+/g, " ").trim().slice(0, 24) } : null);
      return { off: look(off), on: look(on) };
    });

    assert(res.off, "на экране тарифов нет ни одной отключённой кнопки — проверять нечего");
    assert(res.on, "нет ни одной рабочей кнопки для сравнения");
    assert(res.off.opacity < 0.9,
      `отключённая кнопка «${res.off.text}» не приглушена (opacity ${res.off.opacity})`);
    assertEqual(res.off.cursor, "not-allowed",
      `у отключённой кнопки «${res.off.text}» обычный курсор — она выглядит рабочей`);
    assertEqual(res.on.opacity, 1, "рабочая кнопка приглушена — приглушение уехало не туда");
  });

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
    for (const view of ["home", "crm", "clients", "global-finances", "catalog", "packages", "knowledge", "proposals"]) {
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
  /* Тени в СВЕТЛОЙ теме. Токены --elev-* задавались только под тёмный фон, а
     всплывающие поверхности вдобавок несли рукописные тени до rgba(0,0,0,.55)
     при 80px размытия. На белом это читается грязным пятном, а не приподнятой
     поверхностью — владелец так и сказал: «большая и некрасивая тень».

     Правило: в светлой теме тень не должна быть чистым чёрным плотнее 20%.
     Проверяем сам CSS, подставляя элемент с нужным классом: дропдауны и меню
     создаются по требованию, и поймать их все в открытом виде ненадёжно. */
  await test("светлая тема: у всплывающих поверхностей мягкие тени, а не тёмные пятна", async () => {
    const CLASSES = ["uu-select-dd", "profile-dd", "deal-ctx-menu", "help-dd",
      "currency-select-dd", "global-add-menu", "sidebar-nav-config",
      "svg-chart-tooltip", "tour-popover", "task-modal-box", "auth-gate-box"];

    const prevTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.waitForTimeout(200);

    const heavy = await page.evaluate((cls) => {
      const out = [];
      cls.forEach((c) => {
        const d = document.createElement("div");
        d.className = c;
        d.style.cssText = "position:fixed;left:-9999px;width:10px;height:10px";
        document.body.appendChild(d);
        const sh = getComputedStyle(d).boxShadow;
        d.remove();
        // rgba(0, 0, 0, A) с A >= 0.2 — тень из тёмной темы, попавшая на светлую
        const m = /rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/.exec(sh);
        if (m && parseFloat(m[1]) >= 0.2) out.push(`${c}: ${sh.slice(0, 46)}`);
      });
      return out;
    }, CLASSES);

    await page.evaluate((t) => {
      if (t) document.documentElement.setAttribute("data-theme", t);
    }, prevTheme);

    assert(heavy.length === 0,
      "в светлой теме остались тени тёмной темы: " + heavy.join("; "));
  });

  /* DESIGN.md §5: суммы набираются табличными цифрами. Пропорциональные разной
     ширины — сумма «прыгает» при пересчёте, а в списке колонка чисел не встаёт
     по разрядам. Замер 04.08 нашёл семь таких мест, включая .fin-amount 22px —
     самое крупное число в «Финансах». */
  await test("суммы набраны табличными цифрами на всех экранах", async () => {
    const bad = [];
    for (const view of ["home", "crm", "proposals", "global-finances"]) {
      await page.evaluate((v) => window.app.go(v), view);
      await page.waitForTimeout(300);
      const found = await page.evaluate(() => {
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none";
        };
        const MONEY = /\d[\d\s ]{2,}\s*₽/;
        const out = [];
        document.querySelectorAll("#appContent *").forEach((el) => {
          if (el.children.length !== 0 || !vis(el)) return;
          const t = (el.textContent || "").trim();
          if (!MONEY.test(t)) return;
          const cs = getComputedStyle(el);
          if (/tabular-nums/.test(cs.fontVariantNumeric) || /tabular-nums/.test(cs.fontFeatureSettings)) return;
          out.push(el.tagName.toLowerCase()
            + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : "")
            + ` «${t.slice(0, 18)}»`);
        });
        return out;
      });
      found.forEach((f) => { const k = `${view}: ${f}`; if (!bad.includes(k)) bad.push(k); });
    }
    assert(bad.length === 0, "суммы без табличных цифр: " + bad.slice(0, 6).join("; "));
  });

  /* Текст, обрезанный жёстким многоточием, обязан иметь title: иначе какая это
     сделка или событие — не выяснить, не открыв запись. */
  await test("обрезанный многоточием текст подсказывает себя целиком", async () => {
    const bad = [];
    await page.setViewportSize({ width: 390, height: 844 });
    for (const view of ["global-finances", "global-calendar", "proposals"]) {
      await page.evaluate((v) => window.app.go(v), view);
      await page.waitForTimeout(350);
      const found = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll("#appContent *").forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.textOverflow !== "ellipsis") return;
          if (!(el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0)) return;
          if ((el.getAttribute("title") || "").trim()) return;
          out.push((el.textContent || "").trim().slice(0, 30));
        });
        return out;
      });
      found.forEach((f) => { const k = `${view}: «${f}»`; if (!bad.includes(k)) bad.push(k); });
    }
    await page.setViewportSize({ width: 1200, height: 900 });
    assert(bad.length === 0, "обрезано без подсказки: " + bad.slice(0, 6).join("; "));
  });

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

  /* Предыдущий тест проверяет капсулы точечно, по списку классов. Этот идёт от
     обратного: обходит живые вьюхи в обеих темах и меряет ВЕСЬ видимый текст.
     Так ловятся цвета, захардкоженные в разметке (не в CSS) — 02.08.2026 замером
     нашлось 19 мест, где цвет физически не менялся при переключении темы, и
     113 провалов AA; после чистки осталось 58, все не ниже 3:1.

     Порог — полный AA: 4.5:1 для обычного текста и 3:1 для крупного (≥24px либо
     ≥18.66px жирный), как в WCAG. После чистки 02.08.2026 ему отвечает ВЕСЬ текст
     в обеих темах, поэтому планка стоит на конечной цели, а не на «не хуже». */
  await test("текст в интерфейсе: контраст отвечает WCAG AA в обеих темах", async () => {
    const VIEWS = ["home", "crm", "clients", "catalog", "packages", "global-finances",
      "global-calendar", "contracts", "plans", "proposals", "knowledge"];
    const MEASURE = (theme) => {
      const parse = (c) => {
        const m = (c || "").match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(",").map((s) => parseFloat(s.trim()));
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      // Композиция ДВУХ полупрозрачных слоёв (source-over). Наивная формула
      // «fg*a + bg*(1-a)» с результатом a:1 считает нижний слой непрозрачным:
      // под кнопкой лежал .empty c rgba(255,255,255,.016), и фон в тёмной теме
      // выходил светло-серым — тест сообщал о провале, которого нет.
      const over = (fg, bg) => {
        const a = fg.a + bg.a * (1 - fg.a);
        if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
        return {
          r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
          g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
          b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
          a,
        };
      };
      const lum = (c) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const ratio = (a, b) => {
        const l1 = lum(a), l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      // Фактический фон: копим альфу вверх по родителям. Прозрачный body/html
      // (градиент) нельзя считать чёрным — иначе в светлой теме половина замеров
      // превращается в ложные провалы.
      const bgOf = (el) => {
        let acc = null, node = el;
        while (node) {
          const bg = parse(getComputedStyle(node).backgroundColor);
          if (bg && bg.a > 0) { acc = acc ? over(acc, bg) : bg; if (acc.a >= 0.999) break; }
          node = node.parentElement;
        }
        if (!acc || acc.a < 0.999) {
          let page = null;
          for (const n of [document.body, document.documentElement]) {
            const c = parse(getComputedStyle(n).backgroundColor);
            if (c && c.a >= 0.999) { page = c; break; }
          }
          if (!page) page = theme === "light" ? { r: 255, g: 255, b: 255, a: 1 } : { r: 12, g: 12, b: 18, a: 1 };
          acc = acc ? over(acc, page) : page;
        }
        return acc;
      };
      const out = [];
      for (const el of document.querySelectorAll("#appContent *")) {
        const txt = (el.textContent || "").trim();
        if (!txt || txt.length > 60) continue;
        if (el.children.length && !Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.opacity === "0") continue;
        const fg = parse(cs.color);
        if (!fg) continue;
        const bg = bgOf(el);
        const eff = fg.a < 1 ? over(fg, bg) : fg;
        const size = parseFloat(cs.fontSize) || 14;
        const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
        const large = size >= 24 || (size >= 18.66 && bold);
        out.push({
          need: large ? 3 : 4.5,
          cls: (el.className || "").toString().split(/\s+/)[0] || el.tagName.toLowerCase(),
          txt: txt.slice(0, 24), color: cs.color,
          bg: "rgb(" + Math.round(bg.r) + "," + Math.round(bg.g) + "," + Math.round(bg.b) + ")",
          ratio: Math.round(ratio(eff, bg) * 100) / 100,
        });
      }
      return out;
    };

    const bad = [];
    for (const theme of ["dark", "light"]) {
      // Тему ставим ОТДЕЛЬНО и ждём: переключение анимировано (transition на
      // background/color), и замер в тот же кадр ловит промежуточный цвет —
      // тест «находил» белый текст на светлом фоне и тёмный на тёмном.
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.waitForTimeout(450);
      for (const view of VIEWS) {
        await page.evaluate((v) => window.app.go(v), view);
        // 350 мс, а не 150: пустые состояния и панели появляются с анимацией,
        // и замер в переходном кадре давал ложные провалы (белый текст «на сером»).
        await page.waitForTimeout(350);
        const actual = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
        const rows = await page.evaluate(MEASURE, theme);
        for (const r of rows) {
          r.actual = actual;
          if (r.ratio < r.need) bad.push(`${theme}(факт:${r.actual})/${view}: .${r.cls} «${r.txt}» ${r.color} на ${r.bg} — ${r.ratio}:1 (нужно ${r.need})`);
        }
      }
    }

    // Тот же замер для остальных цветовых схем (Настройки → Оформление). Полный
    // список вьюх им не нужен — схема меняет только акцент, а «packages» держит
    // самый опасный случай: подсветка активного пункта и счётчик .catalog-cat-count
    // внутри неё дают ДВОЙНОЙ тинт, заметно темнее одиночного. Именно на нём
    // светлые схемы и проваливались, пока --primary-on-tint равнялся --primary-text.
    // (В «catalog» активного пункта в этот момент нет, и случай не воспроизводится —
    //  проверено подстановкой заведомо провального цвета.)
    const ACCENT_VIEWS = ["home", "packages", "crm"];
    for (const accent of ["indigo", "emerald", "amber", "teal", "midnight", "graphite"]) {
      await page.evaluate((a) => document.documentElement.setAttribute("data-accent", a), accent);
      for (const theme of ["dark", "light"]) {
        await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
        await page.waitForTimeout(450);
        for (const view of ACCENT_VIEWS) {
          await page.evaluate((v) => window.app.go(v), view);
          await page.waitForTimeout(350);
          const rows = await page.evaluate(MEASURE, theme);
          for (const r of rows) {
            if (r.ratio < r.need) bad.push(`схема ${accent}/${theme}/${view}: .${r.cls} «${r.txt}» ${r.color} на ${r.bg} — ${r.ratio}:1 (нужно ${r.need})`);
          }
        }
      }
    }
    await page.evaluate(() => {
      document.documentElement.removeAttribute("data-accent");
      document.documentElement.setAttribute("data-theme", "dark");
    });
    assertEqual(bad.length, 0, "текст ниже порога WCAG AA — " + [...new Set(bad)].slice(0, 10).join(" | "));
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

  /* Обход табом не должен останавливаться на невидимом. Свои выпадающие списки
     оставляют в разметке родной <select> держателем значения — скрытый (1×1,
     opacity 0), но он ЛОВИЛ ТАБ: замер 12.09.2026 на экране сметы — 62 таких
     остановки из 63 селектов, то есть шесть десятков нажатий Tab в пустоту, где
     фокус не виден нигде. Клавиатура при этом ничего не теряет: видимая кнопка
     открывает список по Enter, дальше стрелки, Escape и поиск.

     Заодно проверяем, что там, где фокус остановился, его ВИДНО. Сравнение
     «сфокусировал / снял фокус» тут не годится: programmatic focus после blur не
     возвращает :focus-visible, и живое поле даты выглядело дефектом, хотя обводка
     у него есть (ложная тревога первой версии обхода). */
  await test("таб не останавливается на невидимом и фокус всегда видно", async () => {
    const VIEWS = ["home", "crm", "clients", "catalog", "packages", "estimate", "global-finances",
      "global-tasks", "contracts", "knowledge", "proposals", "briefs", "company-team", "settings"];
    const own = await bootLocal(browser, baseUrl, { width: 1440, height: 900, seedDemo: true });
    const bad = new Map();
    let stops = 0;
    try {
      for (const v of VIEWS) {
        await own.page.evaluate((view) => { window.app.go(view); window.scrollTo(0, 0); document.body.focus(); }, v);
        await own.page.waitForTimeout(280);
        for (let i = 0; i < 25; i++) {
          await own.page.keyboard.press("Tab");
          const r = await own.page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body || !el.closest("#appContent")) return null;
            const st = getComputedStyle(el);
            const b = el.getBoundingClientRect();
            const cls = (typeof el.className === "string" ? el.className.trim().split(/\s+/)[0] : "") || "";
            return {
              key: el.tagName.toLowerCase() + (cls ? "." + cls : ""),
              txt: (el.textContent || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 24),
              видим: b.width > 1 && b.height > 1 && st.visibility !== "hidden" && parseFloat(st.opacity) > 0.01,
              focusVisible: el.matches(":focus-visible"),
              обводка: parseFloat(st.outlineWidth) > 0 && st.outlineStyle !== "none",
              тень: st.boxShadow !== "none",
            };
          });
          if (!r) continue;
          stops++;
          if (!r.видим) bad.set("h" + r.key, `${v} · ${r.key} «${r.txt}» — остановка на НЕВИДИМОМ`);
          else if (r.focusVisible && !r.обводка && !r.тень) bad.set("f" + r.key, `${v} · ${r.key} «${r.txt}» — фокус не видно`);
        }
      }

      // Прямая проверка там, где селектов больше всего.
      await own.page.evaluate(() => window.app.go("estimate"));
      await own.page.waitForTimeout(350);
      const sel = await own.page.evaluate(() => {
        const all = [...document.querySelectorAll("select")];
        return { всего: all.length, вТабе: all.filter((s) => s.tabIndex >= 0 && s.getBoundingClientRect().width <= 2).length };
      });
      assert(sel.всего > 5, `на экране сметы нашлось всего ${sel.всего} селектов — проверка смотрит мимо`);
      assertEqual(sel.вТабе, 0, "скрытые <select> снова ловят таб — остановки в пустоте");
    } finally {
      await own.context.close();
    }
    assert(stops > 50, `остановок под табом всего ${stops} — обход смотрит мимо`);
    assert(bad.size === 0, "обход табом:\n  " + [...bad.values()].join("\n  "));
  });

  /* Что нажимается — должно отзываться на наведение. Без отклика элемент читается
     как надпись: человек не понимает, кликабельно ли это, и проверяет мышью
     наугад. Обход 11.09.2026 нашёл четыре таких вида: строки операций в финансах,
     вкладки тем в базе знаний, фильтры типов в календаре (они были целиком
     инлайном, а инлайн перебивает любое :hover) и крестик чеклиста первых шагов.

     Отклик засчитываем ЛЮБОЙ и где угодно в цепочке: у строк КП подсвечивается
     вся строка, а нажимается её середина — сравнение только по самому элементу
     объявило бы это дефектом (так и вышло в первой версии обхода).
     Активные пункты пропускаем: им меняться на наведении не обязано. */
  await test("кликабельное отзывается на наведение во всех разделах", async () => {
    const VIEWS = ["home", "crm", "clients", "catalog", "packages", "estimate", "global-finances",
      "global-tasks", "contracts", "knowledge", "proposals", "briefs", "company-team", "global-calendar", "settings"];
    const own = await bootLocal(browser, baseUrl, { width: 1440, height: 900, seedDemo: true });
    const dead = [];
    let checked = 0;
    try {
      for (const v of VIEWS) {
        await own.page.evaluate((view) => { window.app.go(view); window.scrollTo(0, 0); }, v);
        await own.page.waitForTimeout(280);
        const targets = await own.page.evaluate(() => {
          const seen = new Set(), out = [];
          document.querySelectorAll("#appContent [onclick]").forEach((el, i) => {
            const r = el.getBoundingClientRect();
            // Только то, что целиком на экране и не под шапкой: иначе курсор попадёт не туда.
            if (r.width < 24 || r.height < 18 || r.top < 80 || r.bottom > window.innerHeight - 10) return;
            const st = getComputedStyle(el);
            if (st.cursor !== "pointer" && el.tagName !== "BUTTON" && el.tagName !== "A") return;
            const cn = typeof el.className === "string" ? el.className.trim() : "";
            if (/(^|\s)(active|on|selected|current|is-active|active-filter)(\s|$)/.test(cn)
              || el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-current")) return;
            if (el.disabled) return;
            const parentCls = el.parentElement && typeof el.parentElement.className === "string"
              ? el.parentElement.className.split(/\s+/)[0] : "";
            const key = (cn.split(/\s+/)[0] || el.tagName) + "@" + parentCls;
            if (seen.has(key)) return;
            seen.add(key);
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (!(top === el || el.contains(top))) return;   // перекрыт — не мерим
            el.setAttribute("data-hv", String(i));
            out.push({ id: String(i), key, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
              txt: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24) });
          });
          return out;
        });
        for (const t of targets) {
          const snap = () => own.page.evaluate((id) => {
            const el = document.querySelector(`[data-hv="${id}"]`);
            if (!el) return null;
            const chain = [el, el.parentElement, el.parentElement && el.parentElement.parentElement].filter(Boolean);
            const own_ = chain.map((e) => {
              const st = getComputedStyle(e);
              return [st.backgroundColor, st.backgroundImage, st.borderColor, st.boxShadow, st.transform, st.color, st.opacity, st.textDecorationLine].join("|");
            }).join("#");
            const kids = [...el.querySelectorAll("*")].slice(0, 6).map((c) => {
              const st = getComputedStyle(c);
              return st.color + st.backgroundColor + st.transform + st.opacity;
            }).join("");
            return own_ + "#" + kids;
          }, t.id);
          await own.page.mouse.move(2, 2);
          await own.page.waitForTimeout(100);
          const before = await snap();
          if (!before) continue;
          await own.page.mouse.move(t.cx, t.cy);
          await own.page.waitForTimeout(320);
          const after = await snap();
          checked++;
          if (before === after) dead.push(`${v} · ${t.key} «${t.txt}»`);
        }
      }
    } finally {
      await own.context.close();
    }
    assert(checked > 30, `проверено всего ${checked} видов — обход смотрит мимо`);
    assert(dead.length === 0,
      "нажимается, но на наведение не отзывается — читается как надпись:\n  " + dead.join("\n  "));
  });

  await context.close();
};
