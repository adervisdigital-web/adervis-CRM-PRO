// п.18 (Фаза F): регресс горизонтального переполнения на узких экранах,
// включая <360px и каталог-навигацию. Проверяем, что документ не расширяется
// за вьюпорт ни на одной вьюхе ни на одном брейкпоинте.
const path = require("path");
const { bootLocal, assert, assertEqual } = require("../harness");

const WIDTHS = [320, 360, 480, 640, 768, 900];
// Список расширен 26.07.2026 после ручного прохода 390×844 по всем разделам: тот проход
// нашёл 0 переполнений, но покрыты тестом были только 6 вьюх из 11 — фиксируем остальные,
// чтобы регресс ловился автоматически (грабли `.deal-cards-grid` 24.07 поймал именно этот тест).
const VIEWS = [
  "home", "catalog", "crm", "clients", "tasks", "global-tasks",
  "services", "packages", "proposals", "knowledge", "settings",
  "global-finances", "calendar", "global-calendar",
  // Дописаны 17.08 после обхода оставшихся страниц: раньше в наборе не было
  // ни профиля, ни тарифов, ни поддержки, ни брифов, ни договоров, ни команды —
  // то есть шесть экранов из полутора десятков никто не мерил.
  "profile", "plans", "support", "briefs", "contracts", "company-team",
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

  // ── Навигация каталога на телефоне ────────────────────────────────────────
  // Было: боковое меню разделов CSS разворачивал в горизонтальную ленту. Замер
  // на 390px — 1968px содержимого при окне 348px (5,7 экрана), из 14 пунктов
  // видно 4, и НИ ОДНОГО раздела каталога среди них: разделы искали свайпом
  // вслепую, а в ту же строку были подмешаны два действия.
  // ВАЖНО: обе вкладки услуг («Каталог» и «Пакеты») рисуют ОДНУ И ТУ ЖЕ <aside>.
  // Переделав каталог, я скрыл этот <aside> на телефоне общим CSS — и у пакетов
  // не осталось ни навигации, ни кнопки «Свой пакет», лежавшей внутри списка:
  // замер дал 0 видимых пунктов из 11. Классический «починил один вход, забыл
  // соседний», поэтому проверка идёт ЦИКЛОМ по обеим вкладкам.
  for (const [view, name] of [["catalog", "каталог"], ["packages", "пакеты"]]) {
  await test(`${name} на телефоне: разделы не уезжают лентой за экран`, async () => {
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate((v) => window.app.go(v), view);
      await page.waitForTimeout(600);

      const closed = await page.evaluate(() => {
        const trig = document.querySelector(".catalog-nav-trigger");
        const bar = document.querySelector(".catalog-cat-sidebar");
        return {
          hasTrigger: !!trig && trig.getBoundingClientRect().height > 0,
          listHidden: !bar || bar.getBoundingClientRect().height === 0,
          pageWide: document.documentElement.scrollWidth,
          clientWide: document.documentElement.clientWidth,
        };
      });
      assert(closed.hasTrigger, "нет кнопки выбора раздела — на телефоне разделы недоступны");
      assert(closed.listHidden, "список разделов снова висит на экране лентой");
      assert(closed.pageWide <= closed.clientWide + 1,
        `страница шире окна: ${closed.pageWide} > ${closed.clientWide}`);

      // Лист показывает ВСЕ разделы разом — ради этого всё и делалось.
      await page.evaluate(() => document.querySelector(".catalog-nav-trigger").click());
      await page.waitForTimeout(400);
      const open = await page.evaluate(() => {
        const bar = document.querySelector(".catalog-cat-sidebar.is-open");
        if (!bar) return null;
        const box = bar.getBoundingClientRect();
        const items = [...bar.querySelectorAll("button")].filter(b => !b.closest(".catalog-nav-sheet-head"));
        let visible = 0, occluded = 0, small = 0;
        for (const b of items) {
          const r = b.getBoundingClientRect();
          if (r.height === 0) continue;
          if (r.height < 44) small++;
          if (r.top < box.top - 1 || r.bottom > box.bottom + 1) continue;
          // Перекрытие: нижняя панель навигации прибита на z-index 110 и закрывала
          // последний раздел. Проверка по рамке этого НЕ ловит — только elementFromPoint.
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (el && (el === b || b.contains(el))) visible++; else occluded++;
        }
        return {
          total: items.length, visible, occluded, small,
          sideScroll: Math.round(bar.scrollWidth) > Math.round(bar.clientWidth) + 1,
        };
      });
      assert(open, "лист разделов не открылся");
      assert(!open.sideScroll, "внутри листа снова появилась прокрутка вбок");
      assert(open.occluded === 0, `${open.occluded} разделов перекрыто чем-то сверху`);
      assert(open.small === 0, `${open.small} пунктов ниже 44px — не попасть пальцем`);
      assert(open.visible === open.total,
        `видно ${open.visible} из ${open.total} разделов — список снова не помещается`);

      // Выбор пункта закрывает лист: иначе он остаётся поверх результата, ради
      // которого его и открывали. «Свои» есть в обеих вкладках.
      const picked = await page.evaluate(() => {
        const bar = document.querySelector(".catalog-cat-sidebar.is-open");
        const btn = [...bar.querySelectorAll("button")]
          .filter(b => !b.closest(".catalog-nav-sheet-head"))
          .find(b => /^Свои/.test(b.innerText.trim()));
        if (!btn) return false;
        btn.click();
        return true;
      });
      assert(picked, "в листе не нашёлся пункт «Свои» — на нём проверяется закрытие");
      await page.waitForTimeout(400);
      const afterPick = await page.evaluate(() => !!document.querySelector(".catalog-cat-sidebar.is-open"));
      assert(!afterPick, "после выбора пункта лист остался открытым");
    } finally {
      await context.close();
    }
  });
  }

  await test("иконки в кнопках не схлопываются при длинной подписи", async () => {
    // Кнопка — inline-flex, и SVG в ней обычный flex-элемент: при длинной подписи
    // в узкой кнопке он ужимался до НУЛЯ и пропадал молча. В разметке иконка при
    // этом есть, поэтому проверка «есть ли svg» такое не ловит — нужен размер.
    // Замер до правки: «Открыть каталог» — иконка 0×15px, «Выбрать пакет» — 11×15.
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate(() => window.app.go("catalog"));
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => {
        const bad = [];
        for (const b of document.querySelectorAll("#appContent .btn")) {
          if (b.getBoundingClientRect().height === 0) continue;
          for (const sv of b.querySelectorAll(":scope > svg")) {
            const w = sv.getBoundingClientRect().width;
            if (w < 8) bad.push(`${b.innerText.trim().slice(0, 20)} → ${Math.round(w)}px`);
          }
        }
        return bad;
      });
      assert(r.length === 0, "иконки схлопнулись в кнопках: " + r.join(" | "));
    } finally {
      await context.close();
    }
  });

  await test("сделка: статус виден на ленте, переключатель читается как выбор", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate(() => window.app.go("deal"));
      await page.waitForTimeout(600);

      // Переключатель сделки: раньше это была кнопка 33px с одним лишь названием —
      // владелец так и сказал: «не понятно, что за кнопка».
      const sw = await page.evaluate(() => {
        const b = document.querySelector(".deal-switcher-btn");
        if (!b) return null;
        return {
          h: Math.round(b.getBoundingClientRect().height),
          caption: (b.querySelector(".deal-switcher-btn-caption") || {}).textContent || "",
          hasIcon: !!b.querySelector("svg"),
          popup: b.getAttribute("aria-haspopup"),
        };
      });
      assert(sw, "переключатель сделки не найден");
      assert(sw.h >= 44, `переключатель ${sw.h}px — ниже порога касания`);
      assert(/Сделка/.test(sw.caption), "у переключателя нет подписи «Сделка» — он читается как заголовок");
      assert(sw.popup === "listbox", "переключатель не объявлен раскрывающимся списком");

      // Лента статусов открывается с начала, а сделка обычно в середине воронки:
      // активная пилюля обязана быть подтянута в видимую часть.
      const st = await page.evaluate(() => {
        const bar = document.querySelector(".deal-stage-progress");
        if (!bar) return null;
        const steps = [...bar.querySelectorAll(".dsp-step")];
        if (steps.length < 3) return { skip: true };
        steps[steps.length - 2].click();
        return { clicked: true };
      });
      assert(st, "лента статусов не найдена");
      if (!st.skip) {
        await page.waitForTimeout(600);
        const vis = await page.evaluate(() => {
          const bar = document.querySelector(".deal-stage-progress");
          const act = bar.querySelector(".dsp-step.active");
          if (!act) return null;
          const br = bar.getBoundingClientRect(), ar = act.getBoundingClientRect();
          return { visible: ar.left >= br.left - 1 && ar.right <= br.right + 1, text: act.innerText.trim() };
        });
        assert(vis, "активной пилюли нет");
        assert(vis.visible, `активный статус «${vis.text}» за краем ленты — не видно, на каком этапе сделка`);
      }
    } finally {
      await context.close();
    }
  });

  await test("настройка меню открывается на телефоне при отрисованном сайдбаре", async () => {
    // Слепое пятно тестов: bootLocal идёт БЕЗ сессии, поэтому сайдбар пуст, а у
    // живого пользователя он отрисован и лишь скрыт CSS (max-width:0; opacity:0).
    // Из-за этого выбор якоря «есть элемент → берём его» проходил тесты и ломался
    // в проде: getBoundingClientRect() у скрытой кнопки даёт нули, и панель
    // уезжала за верх экрана. Поэтому здесь мы САМИ подставляем скрытую кнопку.
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate(() => window.app.go("home"));
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const side = document.getElementById("appSidebar");
        if (side) side.innerHTML = '<button id="sidebarNavEditBtn">Настроить меню</button>';
      });
      /* Путь до настройки: кнопка панели ведёт в РАЗДЕЛЫ, настройка — строкой в
         конце листа и открывается ВНУТРИ него же. Отдельной всплывающей панели на
         телефоне больше нет: она была второй поверхностью и однажды уже осталась
         висеть поверх листа. Проверяемое свойство прежнее — настройка доступна с
         телефона и целиком помещается на экран, даже когда сайдбар ОТРИСОВАН и
         скрыт стилями (при живой сессии он именно такой). */
      await page.evaluate(() => document.getElementById("mbnMore").click());
      await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelector(".mobile-nav-sheet-config").click());
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const list = document.querySelector(".mobile-nav-sheet-config-list");
        if (!list) return null;
        const b = list.getBoundingClientRect();
        return {
          rows: list.querySelectorAll(".sidebar-nav-config-row").length,
          switches: list.querySelectorAll(".sidebar-nav-switch").length,
          onScreen: b.top >= 0 && b.left >= 0 && b.right <= window.innerWidth + 1 && b.bottom <= window.innerHeight + 1,
          box: `${Math.round(b.left)},${Math.round(b.top)}…${Math.round(b.right)},${Math.round(b.bottom)}`,
          floating: !!document.querySelector(".sidebar-nav-config"),
        };
      });
      assert(r, "настройка меню не открылась — кнопка в нижней панели не работает");
      assert(r.rows > 0, "настройка открылась пустой");
      assert(r.switches > 0, "в настройке нет переключателей видимости");
      assert(r.onScreen, `настройка вне экрана: ${r.box} при окне 390×844`);
      assert(!r.floating, "на телефоне снова появилась отдельная всплывающая панель настройки");
    } finally {
      await context.close();
    }
  });

  await test("пакеты: «Свой пакет» доступен с телефона", async () => {
    // Кнопка лежала ВНУТРИ списка категорий, а он на телефоне скрыт и открывается
    // листом — то есть создать свой пакет с телефона было нельзя вообще.
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate(() => window.app.go("packages"));
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => {
        const btn = [...document.querySelectorAll(".section-title .toolbar button")]
          .find(b => /Свой пакет/.test(b.innerText));
        const nav = document.querySelector(".catalog-cat-sidebar");
        return {
          visible: !!btn && btn.getBoundingClientRect().height > 0,
          tall: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
          inNav: /Свой пакет/.test(nav ? nav.innerText : ""),
        };
      });
      assert(r.visible, "«Свой пакет» не виден на телефоне");
      assert(r.tall >= 36, `кнопка «Свой пакет» ${r.tall}px — мелковата для пальца`);
      assert(!r.inNav, "«Свой пакет» снова внутри списка категорий — с телефона туда не добраться");
    } finally {
      await context.close();
    }
  });

  // Два действия — два разных места, и это НЕ произвол:
  //   «Своя позиция» добавляет услугу → главное действие раздела, ему место в
  //     панели шапки рядом с «Выгрузить/Загрузить»;
  //   «Настроить разделы» настраивает САМ СПИСОК → стоит внизу этого списка, как
  //     «Настроить меню» у главного бокового меню, и приглушена, потому что не
  //     выбирает раздел и не должна спорить за внимание с теми, кто выбирает.
  await test("каталог: «Своя позиция» в панели, «Настроить разделы» — внизу списка и приглушена", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, { width: 1280, height: 900, seedDemo: true });
    try {
      await page.evaluate(() => window.app.go("catalog"));
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => {
        const acts = [...document.querySelectorAll(".section-title .toolbar button")].map(b => b.innerText.trim());
        const nav = document.querySelector(".catalog-cat-sidebar");
        const cfg = nav && nav.querySelector(".catalog-cat-config");
        const items = nav ? [...nav.querySelectorAll("button")].filter(b => b.getBoundingClientRect().height > 0) : [];
        // Считаем ЭФФЕКТИВНЫЙ контраст к фону — с учётом opacity, иначе проверка
        // смотрит на объявленный цвет и не видит приглушения вовсе.
        const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const lum = (c) => c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); })
          .reduce((a, x, i) => a + x * [.2126, .7152, .0722][i], 0);
        const ratio = (a, b) => { const [h, l] = lum(a) > lum(b) ? [a, b] : [b, a];
          return (lum(h) + .05) / (lum(l) + .05); };
        const bg = rgb(getComputedStyle(document.querySelector(".panel")).backgroundColor);
        // Наложение цвета с opacity на фон — что глаз и видит.
        const blend = (el) => {
          const c = rgb(getComputedStyle(el).color);
          const o = parseFloat(getComputedStyle(el).opacity);
          return c.map((v, i) => v * o + bg[i] * (1 - o));
        };
        const plain = items.find(b => b.classList.contains("catalog-cat-item")
          && !b.classList.contains("active") && !b.classList.contains("catalog-cat-config"));
        return {
          acts,
          ownInNav: /Своя позиция/.test(nav ? nav.innerText : ""),
          hasCfg: !!cfg,
          cfgIsLast: !!cfg && items.length > 0 && items[items.length - 1] === cfg,
          cfgRatio: cfg ? ratio(blend(cfg), bg) : null,
          plainRatio: plain ? ratio(blend(plain), bg) : null,
        };
      });
      assert(r.acts.some(t => /Своя позиция/.test(t)), "«Своя позиция» пропала из панели раздела");
      assert(!r.acts.some(t => /Настроить разделы/.test(t)), "«Настроить разделы» снова в панели, а не внизу списка");
      assert(!r.ownInNav, "«Своя позиция» снова подмешана в список разделов");
      assert(r.hasCfg, "внизу списка нет «Настроить разделы»");
      assert(r.cfgIsLast, "«Настроить разделы» стоит не последней в списке");
      assert(r.cfgRatio && r.plainRatio, "не удалось снять цвета");
      // Тише разделов — но НЕ ниже порога читаемости. Контраст здесь порог, а не
      // «чем меньше тем лучше»: перестараться так же плохо, как не приглушить.
      assert(r.cfgRatio < r.plainRatio,
        `«Настроить разделы» не приглушена: ${r.cfgRatio.toFixed(2)}:1 против ${r.plainRatio.toFixed(2)}:1 у раздела`);
      assert(r.cfgRatio >= 4.5,
        `приглушили за порог AA: ${r.cfgRatio.toFixed(2)}:1 при минимуме 4.5:1`);
    } finally {
      await context.close();
    }
  });

  // ── Десктоп не должен пострадать: там боковое меню работает как работало ──
  await test("каталог на десктопе: боковое меню осталось столбиком слева", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, { width: 1280, height: 900, seedDemo: true });
    try {
      await page.evaluate(() => window.app.go("catalog"));
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => {
        const bar = document.querySelector(".catalog-cat-sidebar");
        const trig = document.querySelector(".catalog-nav-trigger");
        const box = bar ? bar.getBoundingClientRect() : null;
        return {
          visible: !!box && box.height > 0,
          column: box ? box.height > box.width : false,
          triggerHidden: !trig || trig.getBoundingClientRect().height === 0,
        };
      });
      assert(r.visible, "на десктопе пропало боковое меню каталога");
      assert(r.column, "боковое меню на десктопе легло лентой");
      assert(r.triggerHidden, "на десктопе показалась мобильная кнопка выбора раздела");
    } finally {
      await context.close();
    }
  });

  // ── KPI-плитки финансов: ряд заполняется целиком ─────────────────────────────
  // Пять плиток в сетке «сколько влезет» всегда оставляли последнюю одну. Замер до
  // правки (финансы сделки, живой DOM): окно 1600 → сетка 766px, ряд из четырёх и
  // 583px пустоты справа от «Прибыли»; 1400 → 499px; 860 → 601px; 640 → 305px.
  // На телефоне это чинили отдельным правилом ещё в v264 — и тогда решили, что
  // проблема только там. Она была на всех ширинах.
  //
  // Меряем не число колонок и не имя раскладки, а РЕЗУЛЬТАТ: сколько места в ряду
  // осталось незанятым. Такая проверка переживёт смену способа (грид → флекс →
  // что угодно) и сразу поймает шестую плитку: span'ы у 4-й и 5-й заданы явно,
  // и лишняя плитка тут же оставит дыру.
  //
  // Обе страницы, а не одна: класс общий, но auto-fit вёл себя на них по-разному —
  // на широкой общей странице пять плиток помещались в ряд и дыры не было, и её
  // легко было сломать, починив сделку.
  async function finRowGaps(page, sel) {
    return page.evaluate((s) => {
      const g = document.querySelector(s);
      if (!g) return null;
      const gw = g.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(g).columnGap) || 0;
      const rows = new Map();
      for (const c of g.children) {
        const b = c.getBoundingClientRect();
        if (b.height === 0) continue;
        const key = Math.round(b.top);
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push(b.width);
      }
      return {
        cards: g.children.length,
        gridW: Math.round(gw),
        // Свободное место в ряду = ширина сетки минус плитки и гэпы между ними.
        free: [...rows.values()].map(ws =>
          Math.round(gw - (ws.reduce((a, w) => a + w, 0) + gap * (ws.length - 1)))),
      };
    }, sel || ".fin-summary-grid");
  }

  await test("финансы: плитки заполняют ряд целиком, последняя не висит одна", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, { width: 1600, height: 900, seedDemo: true });
    try {
      const bad = [];
      for (const [where, open] of [["сделка", "deal"], ["общая", "global-finances"]]) {
        for (const w of [1600, 1400, 1280, 1100, 860, 760, 640, 500, 390]) {
          await page.setViewportSize({ width: w, height: 900 });
          await page.evaluate((v) => {
            window.app.go(v);
            if (v === "deal") window.app.setDealView("finance");
          }, open);
          await page.waitForTimeout(150);
          const r = await finRowGaps(page);
          if (!r) { bad.push(`${where} ${w}px: сетки нет вовсе`); continue; }
          // 2px — округление субпиксельных долей 1fr, не дыра.
          const hole = Math.max(...r.free);
          if (hole > 2) bad.push(`${where} ${w}px (сетка ${r.gridW}px): пустота ${hole}px`);
        }
      }
      assert(bad.length === 0, "в рядах KPI осталось пустое место — " + bad.join("; "));
    } finally {
      await context.close();
    }
  });

  await test("дашборд: плитки заполняют ряд целиком", async () => {
    /* Та же болезнь, что и в финансах, и на неё же владелец указывал. Плиток на
       главной стало ДЕСЯТЬ (комментарий в CSS всё ещё говорил «девять» — десятую
       добавили позже), и «сколько влезет» снова начало оставлять дыру. Замер до
       правки: 1440px → ряды 9+1 и 1251px пустоты во второй строке, 1280px → 8+2 и
       935px, 1024px → 6+4 и 331px.

       Десять делится нацело только на 2 и 5 — столько колонок и задано; 3 и 4 дают
       3+3+3+1 и 4+4+2, то есть ту же дыру. Тест меряет РЕЗУЛЬТАТ (сколько места в
       ряду осталось незанятым) и потому сразу поймает одиннадцатую плитку. */
    const { context, page } = await bootLocal(browser, baseUrl, { width: 1600, height: 900, seedDemo: true });
    try {
      const bad = [];
      for (const w of [1600, 1440, 1280, 1100, 1024, 860, 760, 640, 500, 390]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.evaluate(() => window.app.go("home"));
        await page.waitForTimeout(200);
        const r = await finRowGaps(page, ".db-stat-row");
        if (!r) { bad.push(`${w}px: сетки плиток нет вовсе`); continue; }
        const hole = Math.max(...r.free);
        if (hole > 2) bad.push(`${w}px (сетка ${r.gridW}px, плиток ${r.cards}): пустота ${hole}px`);
      }
      assert(bad.length === 0, "в рядах дашборда осталось пустое место — " + bad.join("; "));
    } finally {
      await context.close();
    }
  });

  // Та же болезнь этажом выше: .layout — двухколоночная сетка, где правые 360px
  // отведены сводке сметы. Вкладка «Финансы» в сделке кладёт внутрь одну только
  // .panel, и колонка вместе с гэпом простаивала: замер на окне 1250px — сетка
  // 932px, панель 554px, справа 378px пустоты. Проверяем все десять вкладок сделки
  // и все разделы: ищем .layout, у которого содержимое не доходит до правого края.
  await test("сетка раздела не резервирует пустую колонку под сводку", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, { width: 1250, height: 900, seedDemo: true });
    try {
      const deadSpace = () => page.evaluate(() => {
        const out = [];
        for (const l of document.querySelectorAll(".layout")) {
          const lb = l.getBoundingClientRect();
          if (lb.height === 0) continue;
          const kids = [...l.children].filter(c => c.getBoundingClientRect().height > 0);
          if (!kids.length) continue;
          const right = Math.max(...kids.map(c => c.getBoundingClientRect().right));
          out.push({ dead: Math.round(lb.right - right), kids: kids.length });
        }
        return out;
      });

      const bad = [];
      const DEAL_TABS = ["estimate", "description", "finance", "tasks", "calendar",
        "team", "proposal", "contract", "versions", "activity"];
      await page.evaluate(() => window.app.go("deal"));
      await page.waitForTimeout(300);
      for (const tab of DEAL_TABS) {
        await page.evaluate((t) => { window.app.setDealView(t); }, tab);
        await page.waitForTimeout(140);
        for (const r of await deadSpace()) {
          if (r.dead > 2) bad.push(`вкладка «${tab}» (${r.kids} колонк.): ${r.dead}px`);
        }
      }
      for (const v of VIEWS) {
        await page.evaluate((x) => { window.app.go(x); }, v);
        await page.waitForTimeout(140);
        for (const r of await deadSpace()) {
          if (r.dead > 2) bad.push(`раздел «${v}» (${r.kids} колонк.): ${r.dead}px`);
        }
      }
      assert(bad.length === 0, "справа от содержимого осталась пустая колонка — " + bad.join("; "));
    } finally {
      await context.close();
    }
  });

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

  /* KPI-полоса дашборда не должна обрываться пустой ячейкой. Плиток девять, и
     auto-fill на экране от ~1600px создавал ДЕСЯТЬ дорожек: справа от «Дедлайны»
     зияла дыра в целую плитку. Меряем не число дорожек (в computed style пустая
     всё равно перечислена), а хвост — расстояние от правого края последней
     плитки первого ряда до края полосы. */
  await test("дашборд: KPI-полоса заполнена до правого края, без пустой ячейки", async () => {
    const bad = [];
    try {
      for (const w of [1920, 1700, 1600, 1500, 1400, 1200]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.evaluate(() => window.app.go("home"));
        await page.waitForTimeout(220);
        const r = await page.evaluate(() => {
          const row = document.querySelector(".db-stat-row");
          if (!row) return null;
          const tiles = [...row.querySelectorAll(".db-stat")];
          if (!tiles.length) return null;
          const rr = row.getBoundingClientRect();
          const tops = [...new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top)))];
          const firstRow = tiles.filter((t) => Math.round(t.getBoundingClientRect().top) === tops[0]);
          const last = firstRow[firstRow.length - 1];
          return { tail: Math.round(rr.right - last.getBoundingClientRect().right), tiles: tiles.length };
        });
        if (!r) { bad.push(`${w}px: полоса не отрисовалась`); continue; }
        // Порог 60px: меньше плитки (минимум 150px), но с запасом на отступы.
        if (r.tail > 60) bad.push(`${w}px: пусто справа ${r.tail}px при ${r.tiles} плитках`);
      }
    } finally {
      await page.setViewportSize({ width: 900, height: 800 });
      await page.waitForTimeout(150);
    }
    assert(bad.length === 0, "KPI-полоса обрывается пустой ячейкой: " + bad.join("; "));
  });

  /* Доска воронки на телефоне. Десять этапов по 220px — это 2326px, при экране
     390px видно полторы колонки, а до «Завершённых» листать вбок шесть экранов.
     Правило «одна колонка» в CSS было написано давно и не работало: число
     колонок приходило ИНЛАЙНОВЫМ стилем из app.js и перебивало любые медиа-
     запросы, а соседнее `flex-direction: column` на гриде не делает ничего.

     Проверяем оба конца: на телефоне доска обязана уместиться в экран, на
     широком — остаться многоколоночной, иначе воронку станет не видно целиком. */
  await test("воронка CRM: на телефоне столбиком, на широком экране — колонками", async () => {
    /* Возврат вьюпорта — через finally: набор делит одну страницу, и падение
       посреди теста оставило бы следующему 1500px вместо 900. */
    try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.app.go("crm"));
    await page.waitForTimeout(500);
    const phone = await page.evaluate(() => {
      const b = document.querySelector(".kanban-scroll-x");
      if (!b) return null;
      const cols = document.querySelectorAll(".kanban-col").length;
      return { cols, scrollW: Math.round(b.scrollWidth), clientW: Math.round(b.clientWidth) };
    });
    assert(phone, "доска воронки не отрисовалась");
    assert(phone.cols > 1, "на доске нет колонок — проверять нечего");
    assert(phone.scrollW <= phone.clientW + 2,
      `на телефоне доска шире экрана: ${phone.scrollW}px против ${phone.clientW}px — придётся листать вбок`);

    /* Пустые этапы не должны раздувать столбик. У сделок обычно занято два-три
       этапа из десяти: при min-height 220px восемь пустых съедали 64% высоты
       доски и растягивали её на 3.2 экрана. На десктопе эта высота нужна —
       колонки стоят в ряд и выравниваются, — поэтому правило только мобильное. */
    const empties = await page.evaluate(() => {
      const cols = [...document.querySelectorAll(".kanban-col")];
      const empty = cols.filter((c) => !c.querySelector(".crm-card"));
      if (!empty.length) return null;
      return {
        count: empty.length,
        maxH: Math.max(...empty.map((c) => Math.round(c.getBoundingClientRect().height)))
      };
    });
    if (empties) {
      assert(empties.maxH <= 90,
        `пустой этап на телефоне занимает ${empties.maxH}px — столбик растянется впустую (пустых этапов ${empties.count})`);
    }

    await page.setViewportSize({ width: 1500, height: 900 });
    await page.evaluate(() => window.app.go("crm"));
    await page.waitForTimeout(450);
    const wide = await page.evaluate(() => {
      const cols = [...document.querySelectorAll(".kanban-col")];
      if (cols.length < 2) return null;
      const tops = new Set(cols.slice(0, 3).map((c) => Math.round(c.getBoundingClientRect().top)));
      return { cols: cols.length, sameRow: tops.size === 1 };
    });
    assert(wide, "на широком экране доска не отрисовалась");
    assert(wide.sameRow,
      "на широком экране колонки встали друг под друга — воронка перестала читаться одним взглядом");

    } finally {
      await page.setViewportSize({ width: 900, height: 800 });
      await page.waitForTimeout(150);
    }
  });

  /* Тач-таргеты. Меряем в ОТДЕЛЬНОМ контексте с hasTouch: без него Chromium
     сообщает pointer:fine, блок @media (hover:none) and (pointer:coarse) не
     применяется, и проверка мерила бы десктопную раскладку в узком окне —
     то есть не то, что видит человек с телефоном.

     Иконочные кнопки без подписи — самый опасный случай: попасть по ним нечем,
     кроме как по самой иконке, а рядом бывает «удалить». Область касания
     расширена невидимым ::after, поэтому визуальный размер кнопки тут ничего не
     доказывает — считаем именно псевдоэлемент. */
  await test("телефон: у иконочных кнопок область касания не меньше 44×44", async () => {
    const { context: touchCtx, page: tp } = await bootLocal(browser, baseUrl,
      { width: 390, height: 844, seedDemo: true, touch: true });

    const coarse = await tp.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches);
    assert(coarse, "эмуляция касания не включилась — проверка ничего не значит");

    const ICONS = [".topbar-icon-btn", ".profile-avatar-btn", ".logo", ".xlsx-icon-btn",
      ".catalog-action-btn", ".db-chart-nav-btn", ".deal-menu-btn"];
    const bad = [];
    for (const view of ["home", "catalog", "global-finances"]) {
      await tp.evaluate((v) => window.app.go(v), view);
      await tp.waitForTimeout(300);
      const res = await tp.evaluate((sels) => {
        const out = [];
        sels.forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const af = getComputedStyle(el, "::after");
            const hasArea = af && af.content && af.content !== "none" && af.position === "absolute";
            const w = Math.max(r.width, hasArea ? parseFloat(af.width) || 0 : 0);
            const h = Math.max(r.height, hasArea ? parseFloat(af.height) || 0 : 0);
            if (w < 44 || h < 44) out.push(`${sel} ${Math.round(w)}×${Math.round(h)}`);
          });
        });
        return out;
      }, ICONS);
      res.forEach((r) => { if (!bad.includes(view + ": " + r)) bad.push(view + ": " + r); });
    }
    assert(bad.length === 0, "иконочные кнопки меньше 44×44 при касании: " + bad.join("; "));

    // Поля ввода: промах по строке цены стоит неверной сметы.
    await tp.evaluate(() => window.app.go("catalog"));
    await tp.waitForTimeout(300);
    const shortInputs = await tp.evaluate(() => {
      const out = [];
      document.querySelectorAll("input:not([type=checkbox]):not([type=radio])").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.height < 44) {
          out.push((el.getAttribute("aria-label") || el.className || "input") + " " + Math.round(r.height) + "px");
        }
      });
      return out.slice(0, 5);
    });
    assert(shortInputs.length === 0, "поля ввода ниже 44px при касании: " + shortInputs.join("; "));

    await touchCtx.close();
  });

  /* KPI-полоса дашборда переносится уже с 1280px, а на 390px это ПЯТЬ рядов.
     Горизонтальных линий не было ни одной — ряды сливались в стену цифр.
     Разделители рисуются внешней тенью слева и сверху: `gap` с подложкой цвета
     линии не годится, потому что auto-fill оставляет в последнем ряду пустые
     дорожки и подложка проступила бы в них серым блоком. */
  await test("дашборд: у KPI-плиток есть разделители, и они переживают наведение", async () => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(350);

    const res = await page.evaluate(() => {
      const row = document.querySelector(".db-stat-row");
      if (!row) return null;
      const tiles = [...row.querySelectorAll(".db-stat")];
      if (tiles.length < 2) return null;
      const rect = (t) => t.getBoundingClientRect();
      const tops = [...new Set(tiles.map((t) => Math.round(rect(t).top)))].sort((a, b) => a - b);
      const firstRow = tiles.filter((t) => Math.round(rect(t).top) === tops[0]);
      const secondRow = tops[1] != null ? tiles.filter((t) => Math.round(rect(t).top) === tops[1]) : [];
      const shadowOf = (t) => getComputedStyle(t).boxShadow;
      return {
        rows: tops.length,
        clips: getComputedStyle(row).overflow,
        // Шов между рядами: низ первого ряда совпадает с верхом второго —
        // именно туда ложится верхняя тень.
        seam: secondRow.length
          ? Math.round(rect(firstRow[0]).bottom) === Math.round(rect(secondRow[0]).top)
          : null,
        shadow: shadowOf(tiles[0]),
        sepVar: getComputedStyle(tiles[0]).getPropertyValue("--stat-sep").trim()
      };
    });
    assert(res, "KPI-полоса не отрисовалась");
    assert(res.rows > 1, "на 900px полоса обязана переноситься — иначе проверять нечего");
    assertEqual(res.clips, "hidden",
      "контейнер перестал обрезать содержимое — тени вылезут рамкой по краям полосы");
    assertEqual(res.seam, true, "ряды не примыкают друг к другу — шов, на который ложится линия, разъехался");
    assert(/-1px/.test(res.shadow) && /0px -1px/.test(res.shadow.replace(/\s+/g, " ")),
      "у плитки нет разделительных теней слева и сверху: " + res.shadow);
    assert(res.sepVar.length > 0, "переменная --stat-sep пропала — правила наведения потеряют разделители");

    // Наведение раньше ЗАМЕНЯЛО box-shadow целиком, и линии вокруг плитки исчезали.
    const clickable = await page.$(".db-stat[onclick]");
    if (clickable) {
      await clickable.hover();
      await page.waitForTimeout(200);
      const hovered = await page.evaluate(() => {
        const t = document.querySelector(".db-stat[onclick]:hover") || document.querySelector(".db-stat[onclick]");
        return getComputedStyle(t).boxShadow;
      });
      assert(/-1px/.test(hovered),
        "под курсором разделители пропали — правило наведения перебило box-shadow: " + hovered);
    }

    await page.setViewportSize({ width: 900, height: 800 });
  });

  await test("телефон: из нижней панели открывается КАЖДЫЙ включённый раздел", async () => {
    /* Замер до правки (390×844): из 12 разделов приложения с телефона открывались
       ТРИ — «Проекты», «Смета» и «Финансы». Пятая кнопка панели вела не в разделы,
       а в НАСТРОЙКУ меню: список с виду тот же, но каждая строка — переключатель
       видимости. Тап по «Клиенты» не делал ничего, тап по тумблеру рядом убирал
       раздел из меню. Настройка того, чего нельзя открыть.

       Мерим РЕЗУЛЬТАТ: сколько разделов реально достижимо кликом с телефона
       против того, сколько их включено в конфиге. Тест переживёт замену листа на
       любой другой способ — лишь бы разделы открывались. */
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.waitForTimeout(500);
      const reachable = () => page.evaluate(() => {
        const seen = new Set();
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return false;
          // opacity наследуется — считаем по всей цепочке предков: элемент уже
          // однажды оказывался кликабельным, но НЕВИДИМЫМ.
          let o = 1, n = el;
          while (n && n !== document.documentElement) { o *= parseFloat(getComputedStyle(n).opacity || "1"); n = n.parentElement; }
          return o > 0.05;
        };
        document.querySelectorAll("[onclick]").forEach((el) => {
          const m = (el.getAttribute("onclick") || "").match(/app\.go\(['"]([^'"]+)['"]\)/);
          if (m && visible(el)) seen.add(m[1]);
        });
        return [...seen];
      });

      const before = await reachable();
      await page.click("#mbnMore");
      await page.waitForTimeout(400);
      const after = await reachable();

      const wanted = await page.evaluate(() => {
        const raw = localStorage.getItem("sidebar_nav_config");
        let cfg = null;
        try { cfg = JSON.parse(raw || "null"); } catch (e) { cfg = null; }
        // Конфиг не сохранён, пока его не трогали, — тогда включены все разделы.
        return cfg ? cfg.filter((x) => !x.hidden).length : 12;
      });

      const all = new Set([...before, ...after]);
      assert(
        all.size >= wanted,
        `с телефона достижимо ${all.size} разделов из ${wanted}: ${JSON.stringify([...all])}`
      );

      // Лист должен ВЕСТИ в раздел, а не только настраивать видимость: если из
      // него убрать переходы, счёт выше упадёт, но проверим и прямо.
      const navRows = await page.evaluate(() =>
        [...document.querySelectorAll(".mobile-nav-sheet [onclick]")]
          .filter((el) => /app\.go\(/.test(el.getAttribute("onclick") || "")).length);
      assert(navRows >= 5, "в листе разделов нет переходов — он снова только настраивает видимость");
    } finally {
      await context.close();
    }
  });

  await test("телефон: всплывающая поверхность на экране всегда ровно одна", async () => {
    /* История дефекта: настройка меню жила отдельным поповером у кнопки панели, и
       второй тап по «Разделы» открывал лист, оставляя поповер поверх него. Дело
       было не в z-index — поповер закрывался кликом МИМО себя, а этот клик до
       документа не доходил: обработчик кнопки сам гасил событие stopPropagation.

       Чинили дважды. Сначала точечно (закрывать явно), потом причину: лист стал
       ОДНИМ с режимами (разделы / настройка / вкладки сделки), и второй поверхности
       просто нет. Тест держит инвариант, а не конкретную реализацию: сколько бы
       поверхностей ни завели, показана одновременно не больше одной. */
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.waitForTimeout(500);
      const surfaces = () => page.evaluate(() => {
        const shown = (s) => [...document.querySelectorAll(s)].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        }).length;
        return {
          sheets: shown(".mobile-nav-sheet"),
          popovers: shown(".sidebar-nav-config"),
          mode: (document.querySelector(".mobile-nav-sheet-head span") || {}).textContent || "",
        };
      });

      await page.click("#mbnMore");
      await page.waitForTimeout(350);
      const step1 = await surfaces();
      assert(step1.sheets === 1 && step1.popovers === 0, `после «Разделы» ожидался один лист: ${JSON.stringify(step1)}`);

      await page.click(".mobile-nav-sheet-config");
      await page.waitForTimeout(450);
      const step2 = await surfaces();
      assert(step2.sheets === 1 && step2.popovers === 0, `настройка открылась второй поверхностью: ${JSON.stringify(step2)}`);
      assert(/Пункт/i.test(step2.mode), `лист не переключился в режим настройки: ${JSON.stringify(step2)}`);

      // Возврат к разделам — тем же листом, без мигания второй панелью. Кнопка
      // стоит в ЛИПКОЙ шапке: в конце списка она оказывалась частично за нижним
      // краем экрана (низ 850 при окне 844), то есть по ней нельзя было попасть.
      await page.click(".mobile-nav-sheet-back");
      await page.waitForTimeout(400);
      const step3 = await surfaces();
      assert(step3.sheets === 1 && step3.popovers === 0, `возврат к разделам поднял вторую поверхность: ${JSON.stringify(step3)}`);
      assert(/Раздел/i.test(step3.mode), `лист не вернулся к разделам: ${JSON.stringify(step3)}`);

      /* Закрытие подложкой и повторное открытие. Кликать в #mbnMore при открытом
         листе нельзя намеренно: подложка накрывает нижнюю панель — лист модальный,
         и это его правильное поведение, а не помеха (первая версия теста об это
         спотыкалась). */
      // Бить надо в ВИДИМУЮ часть подложки — она inset:0, и её центр приходится на
      // сам лист, который её и перехватывает.
      await page.click(".mobile-nav-backdrop", { position: { x: 195, y: 20 } });
      await page.waitForTimeout(350);
      const closed = await surfaces();
      assert(closed.sheets === 0 && closed.popovers === 0, `подложка не закрыла лист: ${JSON.stringify(closed)}`);

      await page.click("#mbnMore");
      await page.waitForTimeout(400);
      const step4 = await surfaces();
      assert(step4.sheets === 1 && step4.popovers === 0, `после повторного открытия поверхностей не одна: ${JSON.stringify(step4)}`);
      assert(/Раздел/i.test(step4.mode), `лист открылся не в режиме разделов: ${JSON.stringify(step4)}`);
    } finally {
      await context.close();
    }
  });

  for (const W of [390, 320]) {
  await test(`телефон ${W}px: подпись не наезжает на соседа и не лезет за край`, async () => {
    /* Класс дефекта: содержимое кнопки шире её самой. Страница при этом в ширину
       помещается, поэтому проверка «документ не шире окна» его НЕ видит — ломается
       внутри элемента. Так «Свернуть всё» (92px в кнопке 80px) рисовалось поверх
       соседней кнопки: на экране читалось «Свернуть всё+ Услуги» одной строкой.

       Мерим ВРЕД, а не факт перелива: вылезшее должно наезжать на соседа по строке
       или уходить за край родителя. Просто перелив безобиден — вокруг кнопки бывает
       запас, и на экране ничего не сталкивается (обход 17 разделов: 199 переливов,
       из них вредных ноль). Иначе тест ловил бы шум и его отключили бы.

       Артефакт замера: абсолютный ::after, которым расширяют область касания,
       попадает в scrollWidth кнопки, хотя невидим. Такие пропускаем.

       320px в наборе потому, что все прежние обходы шли на 390: узкий экран
       сжимает кнопки сильнее и вскрывает то, что на 390 ещё помещалось. */
    const VIEWS_SPILL = [
      "home", "crm", "deal", "services", "catalog", "packages", "clients",
      "proposals", "briefs", "global-finances", "global-calendar",
      "global-tasks", "contracts", "knowledge", "settings",
    ];
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: W, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.waitForTimeout(500);
      const bad = [];
      for (const view of VIEWS_SPILL) {
        await page.evaluate((v) => window.app.go(v), view);
        await page.waitForTimeout(380);
        const found = await page.evaluate(() => {
          const out = [];
          const name = (el) => (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 18)
            || (el.getAttribute("aria-label") || "").slice(0, 18)
            || (el.className || "").toString().split(/\s+/)[0].slice(0, 18);

          document.querySelectorAll("#appContent button, #appContent .btn").forEach((b) => {
            const box = b.getBoundingClientRect();
            if (box.width < 1 || box.height < 1) return;
            const over = b.scrollWidth - b.clientWidth;
            if (over <= 1) return;
            const a = getComputedStyle(b, "::after");
            if (a && a.content !== "none" && a.position === "absolute") return;

            const parent = b.parentElement;
            const pr = parent ? parent.getBoundingClientRect() : null;
            const bleed = over / 2; // содержимое центрировано → лезет в обе стороны
            const left = box.left - bleed, right = box.right + bleed;

            let hit = "";
            if (pr && (right > pr.right + 1 || left < pr.left - 1)) hit = "за край родителя";
            if (!hit && parent) {
              for (const sib of parent.children) {
                if (sib === b) continue;
                const s = sib.getBoundingClientRect();
                if (s.width < 1 || s.height < 1) continue;
                if (Math.min(box.bottom, s.bottom) - Math.max(box.top, s.top) <= 1) continue;
                if (right > s.left + 1 && left < s.right - 1) { hit = `наезд на «${name(sib)}»`; break; }
              }
            }
            if (hit) out.push(`${name(b)} +${over}px — ${hit}`);
          });
          return out;
        });
        found.forEach((f) => { const k = `${view}: ${f}`; if (!bad.includes(k)) bad.push(k); });
      }
      assert(bad.length === 0, `подписи вылезают из своих кнопок: ` + bad.slice(0, 8).join("; "));
    } finally {
      await context.close();
    }
  });
  }

  await test("каталог на телефоне: до первой услуги не целый экран", async () => {
    /* Замер до правок: первая услуга начиналась на 835px от верха при экране
       844px — то есть весь первый экран занимала шапка: заголовок, описание в три
       строки, три кнопки, выбор раздела, поиск, два фильтра и счётчик.

       Убрано: перенос каталога под «⋮», описание скрыто на узком экране, фильтр с
       сортировкой и счётчик сведены в один ряд. Мерим РЕЗУЛЬТАТ — где начинается
       первая карточка, — а не то, какими правилами это достигнуто.

       Порог 700px: это заметно меньше экрана, но с запасом на шрифты и переносы,
       чтобы тест не падал от лишней пары пикселей. */
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate(() => window.app.go("catalog"));
      await page.waitForTimeout(700);
      const res = await page.evaluate(() => {
        const addBtn = [...document.querySelectorAll("#appContent button")].find((b) => /Добавить/.test(b.textContent || ""));
        const card = addBtn ? addBtn.closest("article, .card, div[class]") : null;
        const bar = document.querySelector(".catalog-toolbar");
        const selects = [...document.querySelectorAll(".catalog-toolbar .uu-select-btn, .catalog-toolbar .catalog-toolbar-select")]
          .filter((el) => el.getBoundingClientRect().width > 1);
        return {
          top: card ? Math.round(card.getBoundingClientRect().top) : null,
          rows: bar ? new Set([...bar.children].filter((c) => c.getBoundingClientRect().height > 1)
            .map((c) => Math.round(c.getBoundingClientRect().top))).size : null,
          selectWidth: selects.length ? Math.round(Math.min(...selects.map((s) => s.getBoundingClientRect().width))) : null,
          cardHeight: (() => {
            const c = document.querySelector("#appContent article.item--catalog");
            return c ? Math.round(c.getBoundingClientRect().height) : null;
          })(),
          descTitle: (() => {
            const p = document.querySelector("#appContent article.item--catalog .item-top p");
            return !!(p && (p.getAttribute("title") || "").trim());
          })(),
        };
      });
      assert(res.top !== null, "в каталоге не нашлось ни одной услуги");
      assert(res.top < 700, `до первой услуги ${res.top}px — шапка снова занимает почти весь экран`);
      /* Высота самой карточки: цена стоит в одной строке с названием, а описание
         ограничено двумя строками. До правки карточка была 250px — на экран
         влезало 3,4 услуги; стало 207px и 4,1. Порог 225px с запасом на шрифты. */
      assert(res.cardHeight && res.cardHeight < 225,
        `карточка услуги ${res.cardHeight}px — на экран снова влезает меньше четырёх`);
      assert(res.descTitle, "у обрезанного описания услуги нет подсказки с полным текстом");
      // Сжать выбор до шеврона легко, и по дороге это уже случалось: подписи
      // «Без фильтра» и «По названию» превращались в две стрелки.
      assert(res.selectWidth === null || res.selectWidth >= 100,
        `выпадашка сжата до ${res.selectWidth}px — от подписи остаётся один шеврон`);
    } finally {
      await context.close();
    }
  });

  await test("выпадающее меню не уезжает за край окна", async () => {
    /* Меню прижато к правому краю своей кнопки. Если кнопка стоит недалеко от
       ЛЕВОГО края (на телефоне ряд шапки переносится, и «⋮» оказывается в начале
       строки), меню шириной 192px уходит за край: замер в шапке каталога на 390px
       дал −5…187, то есть первые пять пикселей срезаны.

       Поправка по горизонтали живёт там же, где давняя поправка по вертикали
       (раскрытие вверх у нижнего края) — в toggleDealMenu, поэтому она работает
       для ВСЕХ таких меню, а не только для каталога. Проверяем и её. */
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate(() => window.app.go("catalog"));
      await page.waitForTimeout(700);
      const res = await page.evaluate(() => {
        const btn = document.querySelector("[onclick*=\"toggleDealMenu('catalog-io'\"]");
        if (!btn) return null;
        btn.click();
        const m = document.getElementById("dcm-catalog-io");
        if (!m) return { нет: true };
        const r = m.getBoundingClientRect();
        return {
          left: Math.round(r.left), right: Math.round(r.right), win: window.innerWidth,
          items: [...m.querySelectorAll(".dcm-item")].map((b) => (b.textContent || "").trim()),
        };
      });
      assert(res && !res.нет, "в шапке каталога нет меню переноса каталога");
      assert(res.items.length >= 2, "в меню каталога меньше двух пунктов: " + JSON.stringify(res.items));
      assert(res.left >= 0, `меню выходит за левый край на ${-res.left}px`);
      assert(res.right <= res.win, `меню выходит за правый край на ${res.right - res.win}px`);
    } finally {
      await context.close();
    }
  });

  await test("телефон: по кнопке можно попасть пальцем во всех разделах", async () => {
    /* Обход 17 разделов на 390×844 нашёл 137 целей меньше 44px — включая
       «Добавить» в каталоге (117×32), самую нажимаемую кнопку продукта.

       Причина системная, а не поштучная: минимум 44px задан блоком в СЕРЕДИНЕ
       style.css, и правила компонентов ниже по тексту молча его перебивали —
       специфичность та же, побеждает то, что позже (`.btn.catalog-add-btn
       { min-height: 32px }`). Поэтому гарантии касания перенесены в САМЫЙ КОНЕЦ
       файла, а тест держит результат по всем разделам сразу: одиночная правка
       компонента снова его не отменит.

       ВАЖНО: контекст с hasTouch — без него Chromium сообщает pointer:fine, и
       часть мобильных правил вообще не применяется. Область касания часто
       расширена невидимым ::after, которого getBoundingClientRect() не видит,
       поэтому его учитываем отдельно. */
    const VIEWS_TOUCH = [
      "home", "crm", "deal", "services", "catalog", "packages", "clients",
      "proposals", "briefs", "company-team", "global-finances", "global-calendar",
      "global-tasks", "contracts", "knowledge", "settings", "profile",
    ];
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.waitForTimeout(500);
      const bad = [];
      for (const view of VIEWS_TOUCH) {
        await page.evaluate((v) => window.app.go(v), view);
        await page.waitForTimeout(400);
        const found = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll("#appContent button, #appContent .btn, .mobile-bottom-nav button").forEach((b) => {
            const r = b.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return;
            const after = getComputedStyle(b, "::after");
            const grown = after && after.content !== "none" && after.position === "absolute";
            if (grown) return;
            if (r.height < 44 || r.width < 32) {
              const label = (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 20)
                || (b.getAttribute("aria-label") || "").slice(0, 20)
                || (b.className || "").toString().slice(0, 20);
              out.push(`${label} ${Math.round(r.width)}×${Math.round(r.height)}`);
            }
          });
          return out;
        });
        found.forEach((f) => { const k = `${view}: ${f}`; if (!bad.includes(k)) bad.push(k); });
      }
      assert(bad.length === 0, `${bad.length} целей меньше 44px: ` + bad.slice(0, 10).join("; "));
    } finally {
      await context.close();
    }
  });

  await test("брифы на телефоне: все типы доступны, а не спрятаны за краем", async () => {
    /* Замер на 390px: лента типов показывала ТРИ из шести — «ИИ», «Общий» и «Свой
       бриф» уезжали за правый край, а намёком служила одна маска-градиент. Третий
       случай одного и того же (разделы каталога, вкладки сделки), поэтому и решение
       то же: кнопка с текущим типом плюс общий лист со всеми.

       Мерим РЕЗУЛЬТАТ — сколько типов реально можно выбрать пальцем. */
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate(() => window.app.go("briefs"));
      await page.waitForTimeout(700);

      const closed = await page.evaluate(() => {
        const t = document.querySelector(".brief-type-trigger");
        const strip = document.querySelector(".brief-type-tabs");
        const de = document.documentElement;
        return {
          hasTrigger: !!t && t.getBoundingClientRect().height >= 44,
          stripHidden: !strip || strip.getBoundingClientRect().height === 0,
          label: t ? (t.textContent || "").trim() : "",
          over: Math.max(de.scrollWidth, document.body.scrollWidth) - window.innerWidth,
        };
      });
      assert(closed.hasTrigger, "на телефоне нет кнопки выбора типа брифа (или она ниже 44px)");
      assert(closed.stripHidden, "лента типов снова висит на экране и прячет часть за краем");
      assert(closed.over <= 1, `страница шире окна на ${closed.over}px`);

      await page.click(".brief-type-trigger");
      await page.waitForTimeout(400);
      const open = await page.evaluate(() => {
        const sh = document.querySelector(".mobile-nav-sheet");
        if (!sh) return null;
        const rows = [...sh.querySelectorAll(".sidebar-nav-item")];
        const last = rows[rows.length - 1];
        return {
          rows: rows.length,
          lastVisible: last ? last.getBoundingClientRect().bottom <= window.innerHeight + 1 : false,
        };
      });
      assert(open, "лист типов брифа не открылся");
      assert(open.rows >= 6, `в листе ${open.rows} типов — часть снова недоступна`);
      assert(open.lastVisible, "последний тип за нижним краем экрана");

      // Выбор закрывает лист и меняет подпись кнопки.
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".mobile-nav-sheet .sidebar-nav-item")];
        (rows.find((r) => /Общий/.test(r.textContent)) || rows[1]).click();
      });
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => ({
        sheet: !!document.querySelector(".mobile-nav-sheet"),
        label: ((document.querySelector(".brief-type-trigger") || {}).textContent || "").trim(),
      }));
      assert(!after.sheet, "после выбора лист остался поверх страницы");
      assert(/Общий/.test(after.label), `кнопка не показывает выбранный тип: «${after.label}»`);
    } finally {
      await context.close();
    }
  });

  await test("сделка на телефоне: все её разделы открываются, а не прячутся в ленте", async () => {
    /* Замер до правки на 390px: лента вкладок показывала 310px при 883px
       содержимого — видно 3 раздела из 10, а 573px уезжали за край. Единственным
       намёком служила маска-градиент, то есть «Договор» и «Историю» находили
       слепым свайпом. Мерим РЕЗУЛЬТАТ — сколько разделов сделки реально можно
       открыть пальцем, — а не то, каким приёмом это сделано. */
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate(() => window.app.go("deal"));
      await page.waitForTimeout(700);

      const reach = () => page.evaluate(() => {
        const seen = new Set();
        document.querySelectorAll("[onclick]").forEach((el) => {
          const m = (el.getAttribute("onclick") || "").match(/app\.setDealView\(['"]([^'"]+)['"]\)/);
          if (!m) return;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return;
          // Видно глазу, а не только в разметке: полностью в пределах экрана и не
          // перекрыто. Лента как раз «содержала» все вкладки — просто за краем.
          if (r.right > window.innerWidth + 1 || r.left < -1) return;
          const el2 = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (el2 && (el2 === el || el.contains(el2))) seen.add(m[1]);
        });
        return [...seen];
      });

      const closed = await reach();
      const trigger = await page.evaluate(() => {
        const t = document.querySelector(".deal-tabs-trigger");
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { h: Math.round(r.height), text: t.textContent.trim() };
      });
      assert(trigger, "на телефоне нет кнопки выбора раздела сделки");
      assert(trigger.h >= 44, `кнопка выбора раздела ${trigger.h}px — ниже 44px, палец промахнётся`);

      await page.click(".deal-tabs-trigger");
      await page.waitForTimeout(400);
      const opened = await reach();
      const all = new Set([...closed, ...opened]);
      assert(all.size >= 10, `с телефона открывается ${all.size} разделов сделки из 10: ${JSON.stringify([...all])}`);

      // Список должен помещаться целиком: прокручиваемый список выбора снова
      // прячет часть пунктов от глаза.
      const fit = await page.evaluate(() => {
        const sh = document.querySelector(".mobile-nav-sheet");
        if (!sh) return null;
        const rows = [...sh.querySelectorAll(".mobile-tab-row")];
        const last = rows[rows.length - 1];
        return {
          rows: rows.length,
          needScroll: sh.scrollHeight - sh.clientHeight > 1,
          lastVisible: last ? last.getBoundingClientRect().bottom <= window.innerHeight + 1 : false,
        };
      });
      assert(fit, "лист разделов сделки не открылся");
      assert(fit.rows === 10, `в листе ${fit.rows} разделов вместо 10`);
      assert(fit.lastVisible, "последний раздел сделки за нижним краем экрана");

      // Выбор закрывает лист и меняет подпись кнопки — иначе непонятно, где ты.
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".mobile-tab-row")];
        (rows.find((r) => /Договор/.test(r.textContent)) || rows[rows.length - 1]).click();
      });
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({
        sheet: !!document.querySelector(".mobile-nav-sheet"),
        label: (document.querySelector(".deal-tabs-trigger") || {}).textContent?.trim() || "",
      }));
      assert(!after.sheet, "после выбора раздела лист остался поверх него");
      assert(/Договор/.test(after.label), `кнопка не показывает выбранный раздел: «${after.label}»`);
    } finally {
      await context.close();
    }
  });

  await test("строка сметы на телефоне: действия видны, а не висят пустой полосой", async () => {
    /* Полоса действий строки («В опции», дублировать, удалить) показывалась только
       по наведению — а на телефоне наведения НЕТ. В итоге она занимала 53px высоты
       в каждой строке сметы невидимой пустотой (владелец прислал скриншот именно с
       этой дырой), а кнопки при этом оставались нажимаемыми вслепую: те же грабли,
       что с ручками переноса — opacity: 0 прячет от глаза, но не от пальца.

       Заодно проверяем, что сумма и её подпись стоят В ОДНОЙ строке: на телефоне
       блок растягивался на всю ширину, подпись уходила влево, а сумма оставалась
       прибитой вправо — одно значение, разорванное надвое. */
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 430, height: 900, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate(() => { window.app.go("deal"); window.app.setDealView("estimate"); });
      await page.waitForTimeout(800);
      const res = await page.evaluate(() => {
        const item = document.querySelector(".estimate-stage .item");
        if (!item) return null;
        const bar = item.querySelector(".line-action-bar");
        const note = item.querySelector(".line-total-note");
        const price = item.querySelector(".price-editor .price");
        if (!bar || !note || !price) return { нет: true };
        // Прозрачность наследуется — считаем по всей цепочке предков.
        let op = 1;
        for (let e = bar; e && e !== document.body; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity || "1");
        const n = note.getBoundingClientRect(), p = price.getBoundingClientRect();
        return {
          прозрачность: +op.toFixed(2),
          высотаПолосы: Math.round(bar.getBoundingClientRect().height),
          подписьИСуммаНаОднойСтроке: Math.min(n.bottom, p.bottom) - Math.max(n.top, p.top) > 1,
          подписьЛевее: n.left < p.left,
        };
      });
      assert(res && !res.нет, "не нашлась строка сметы, её полоса действий или сумма");
      assert(res.прозрачность > 0.9,
        `полоса действий прозрачна (${res.прозрачность}) — на телефоне она невидима, но занимает ${res.высотаПолосы}px и ловит нажатия`);
      assert(res.подписьИСуммаНаОднойСтроке,
        "подпись «В итоге» и сумма снова на разных строках — одно значение, разорванное надвое");
      assert(res.подписьЛевее, "подпись оказалась правее суммы");
    } finally {
      await context.close();
    }
  });

  await test("смета на телефоне: подписи не вылезают за свои кнопки и карточки", async () => {
    /* Два дефекта на одном экране, оба невидимы для проверки «страница не шире
       окна» — ломалось ВНУТРИ элементов:

       1. Заголовок этапа. Название + шестизначная сумма + кнопка «Свернуть» в одну
          строку не влезали, и сумма с кнопкой уезжали за край карточки: кнопка
          выходила срезанной. Корень — flex-элемент с min-width: auto, который
          отказывается сжиматься и выталкивает соседа.
       2. Панель кнопок. `.toolbar > .btn { min-width: 128px }` молча проигрывало
          `.btn.small { min-width: 44px }` ниже по файлу (та же специфичность,
          побеждает то, что позже) — кнопки сжимались до 80px, а подпись «Свернуть
          всё» шириной 92px вылезала ЗА ГРАНИЦЫ СВОЕЙ КНОПКИ и налезала на
          соседнюю.

       Мерим результат: ничего не выходит за свой контейнер и ни у одной кнопки
       содержимое не шире её самой. */
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate(() => { window.app.go("deal"); window.app.setDealView("estimate"); });
      await page.waitForTimeout(700);

      const check = () => page.evaluate(() => {
        const bad = { clipped: [], spill: [] };
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
        const name = (el) => (el.className || el.tagName).toString().split(/\s+/)[0].slice(0, 24)
          + "«" + (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 16) + "»";

        document.querySelectorAll(".stage-header, .toolbar").forEach((box) => {
          const br = box.getBoundingClientRect();
          box.querySelectorAll("*").forEach((el) => {
            if (!vis(el)) return;
            const r = el.getBoundingClientRect();
            if (r.right > br.right + 1) bad.clipped.push(name(el) + " на " + Math.round(r.right - br.right) + "px");
          });
        });

        // Содержимое шире самой кнопки = подпись рисуется поверх соседей.
        document.querySelectorAll(".toolbar .btn, .stage-header .btn").forEach((b) => {
          if (!vis(b)) return;
          const over = b.scrollWidth - b.clientWidth;
          if (over > 1) bad.spill.push(name(b) + " на " + over + "px");
        });
        return bad;
      });

      const collapsed = await check();
      assert(collapsed.clipped.length === 0, "элементы вышли за свой контейнер: " + collapsed.clipped.join(", "));
      assert(collapsed.spill.length === 0, "подпись шире своей кнопки: " + collapsed.spill.join(", "));

      // Свёрнутые этапы — вид, в котором дефект и был снят: подпись кнопки меняется
      // на более длинную («Развернуть всё»), и запаса как раз не хватало.
      await page.evaluate(() => window.app.toggleAllEstimate());
      await page.waitForTimeout(450);
      const expanded = await check();
      assert(expanded.clipped.length === 0, "со свёрнутыми этапами элементы вышли за контейнер: " + expanded.clipped.join(", "));
      assert(expanded.spill.length === 0, "со свёрнутыми этапами подпись шире кнопки: " + expanded.spill.join(", "));
    } finally {
      await context.close();
    }
  });

  // Визуальная фиксация каталога на самом узком экране (п.20 — визуальный обход)
  await test("каталог на 320px: снимок для ревью", async () => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => window.app.go("catalog"));
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(shotDir, "catalog-320.png"), fullPage: true });
  });

  await context.close();

  await test("телефон: «Показать ещё» видна целиком, а не наполовину за краем", async () => {
    const { context: ctx, page: p } = await bootLocal(browser, baseUrl, { width: 390, height: 780, touch: true, seedDemo: true });
    await p.waitForTimeout(400);

    // Наполняем так, чтобы кнопка появилась в каждом из проверяемых разделов.
    await p.evaluate(() => {
      const key = "adervis_pro_381_state";
      const st = JSON.parse(localStorage.getItem(key) || "{}");
      const base = (st.savedProjects || [])[0];
      st.clients = [];
      for (let i = 0; i < 80; i++) st.clients.push({ id: "c" + i, name: "Клиент " + i, status: "new" });
      st.globalTasks = [];
      for (let i = 0; i < 80; i++) st.globalTasks.push({ id: "t" + i, title: "Задача " + i, status: "Новая", priority: "Средний", comments: [] });
      st.contracts = [];
      for (let i = 0; i < 60; i++) st.contracts.push({ id: "k" + i, name: "Договор " + i, number: "ADV-" + i, category: "Видео", status: "draft", body: "x", updatedAt: new Date().toISOString() });
      st.savedProjects = [];
      for (let i = 0; i < 60; i++) {
        const d = JSON.parse(JSON.stringify(base));
        d.id = "p" + i; d.name = "Проект " + i; d.crmStatus = "В работе";
        d.snapshot = Object.assign({}, d.snapshot, {
          payments: [{ id: "pa" + i, amount: 10000, date: "2026-08-01", title: "Аванс", method: "Перевод" }],
          expenses: [{ id: "ex" + i, amount: 5000, date: "2026-08-02", title: "Аренда", category: "Прочее" }],
        });
        st.savedProjects.push(d);
      }
      st.payments = []; st.expenses = [];
      localStorage.setItem(key, JSON.stringify(st));
    });

    // Вторая вкладка: reload затёрся бы снимком состояния с этой страницы.
    const p2 = await ctx.newPage();
    await p2.setViewportSize({ width: 390, height: 780 });
    await p2.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await p2.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 20000 });
    await p2.waitForTimeout(500);

    const bad = [];
    for (const view of ["clients", "global-tasks", "contracts", "global-finances", "home", "catalog"]) {
      await p2.evaluate((v) => window.app.go(v), view);
      await p2.waitForTimeout(400);
      const r = await p2.evaluate(() => {
        const btn = [...document.querySelectorAll("#appContent button")]
          .find((b) => /показать ещё/i.test(b.textContent || ""));
        if (!btn) return null;
        /* Крутим ТОЛЬКО по вертикали: scrollIntoView увёз бы и горизонтальную
           прокрутку внутреннего блока и спрятал бы ровно тот дефект, который ищем —
           кнопку, стоящую строкой внутри таблицы, что шире экрана. */
        const y = btn.getBoundingClientRect().top + window.scrollY - 200;
        window.scrollTo(0, Math.max(0, y));
        const b = btn.getBoundingClientRect();
        return { right: Math.round(b.right), left: Math.round(b.left), h: Math.round(b.height), vw: window.innerWidth };
      });
      if (!r) continue;
      if (r.right > r.vw + 1) bad.push(`${view}: правый край ${r.right} при экране ${r.vw} — кнопка за краем`);
      if (r.left < -1) bad.push(`${view}: левый край ${r.left} — кнопка уехала влево`);
      if (r.h < 44) bad.push(`${view}: высота ${r.h}px вместо 44`);
    }
    await ctx.close();
    assert(!bad.length, "«Показать ещё» на телефоне недоступна:\n  " + bad.join("\n  "));
  });

  await test("телефон: внизу страницы под нижней панелью не остаётся кнопок и полей", async () => {
    /* Нижняя панель навигации перекрывала пункт списка — находка 06.08, которую
       поймал только скриншот: замер геометрии её не видел. Инвариант простой —
       домотав страницу до конца, человек должен видеть ВСЁ её содержимое: у
       контента снизу отступ не меньше высоты панели. Проверяем результат, а не
       конкретное значение отступа: важно, что под панелью пусто. */
    const { context: ctx, page: p } = await bootLocal(browser, baseUrl, { width: 390, height: 780, touch: true, seedDemo: true });
    await p.waitForTimeout(400);

    const bad = [];
    for (const view of ["home", "crm", "clients", "services", "global-tasks", "global-finances", "contracts", "settings", "profile", "plans"]) {
      await p.evaluate((v) => window.app.go(v), view);
      await p.waitForTimeout(300);
      // Прокрутку и замер разносим: возврат промиса из evaluate уже ронял пробники
      // этого проекта («Execution context was destroyed»).
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await p.waitForTimeout(250);
      const covered = await p.evaluate(() => {
        const nav = document.querySelector(".mobile-bottom-nav");
        if (!nav) return [];
        const navTop = nav.getBoundingClientRect().top;
        const root = document.getElementById("appContent");
        return [...root.querySelectorAll("button, .btn, a[href], input, select, textarea")]
          .map((e) => ({ e, r: e.getBoundingClientRect() }))
          .filter((x) => x.r.height > 2 && x.r.bottom > navTop + 1 && x.r.top < window.innerHeight)
          .map((x) => ((x.e.textContent || "").trim().slice(0, 22) || x.e.tagName) + ` (${Math.round(x.r.top)}..${Math.round(x.r.bottom)})`)
          .slice(0, 3);
      });
      if (covered.length) bad.push(`«${view}»: ${covered.join(", ")}`);
    }
    await ctx.close();
    assert(!bad.length, "в самом низу страницы под нижней панелью остались элементы:\n  " + bad.join("\n  "));
  });

  /* Календарь на телефоне: первое действие в разделе было ловушкой.

     Кнопка «+» в ячейке дня невидима (`opacity: 0`), а на телефоне ей ещё и
     расширяли область касания до 44×44 — в ячейке 46×56. То есть НЕВИДИМАЯ
     кнопка перекрывала день целиком: тап по дню не выбирал его, а молча заводил
     задачу в открытой сделке и уводил на «Задачи проекта». Тот же класс, что
     [[gotcha-opacity-hidden-but-clickable]], только хуже: расширение области
     сделало невидимую кнопку ЕДИНСТВЕННЫМ, во что можно попасть.

     Мерим результат тем же жестом, что и человек: настоящий тап пальцем в
     середину дня. */
  await test("календарь на телефоне: тап по дню открывает день, а не заводит задачу", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate(() => window.app.go("global-calendar"));
      await page.waitForTimeout(700);
      const before = await page.evaluate(() => {
        const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
        return { dealTasks: (st.tasks || []).length, globalTasks: (st.globalTasks || []).length };
      });
      const cell = await page.evaluate(() => {
        const c = [...document.querySelectorAll(".cal-cell:not(.other-month)")][8];
        const r = c.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          day: c.querySelector(".cal-day-num").textContent,
          x: r.left + r.width / 2, y: r.top + r.height / 2,
          hitClass: hit ? String(hit.className || hit.tagName) : "none",
        };
      });
      assert(!/cal-day-add/.test(cell.hitClass),
        "середину дня по-прежнему перекрывает невидимая «+»: " + cell.hitClass);

      await page.touchscreen.tap(cell.x, cell.y);
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => {
        const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
        return {
          view: st.view,
          dealTasks: (st.tasks || []).length,
          globalTasks: (st.globalTasks || []).length,
          selected: (document.querySelector(".cal-cell.selected .cal-day-num") || {}).textContent || null,
          panelAdd: !!document.querySelector(".cal-day-panel .btn.primary"),
        };
      });
      assertEqual(after.selected, cell.day, "тап по дню не выбрал этот день");
      assertEqual(after.view, "global-calendar", "тап по дню увёл с календаря");
      assertEqual(after.dealTasks, before.dealTasks, "тап по дню завёл задачу в открытой сделке");
      assertEqual(after.globalTasks, before.globalTasks, "тап по дню завёл задачу");
      assert(after.panelAdd, "в панели дня нет подписанной кнопки «+ Задача» — на телефоне это единственный путь завести задачу на день");
    } finally {
      await context.close();
    }
  });

  /* Кружок «Готово» в строке задачи — 24×24 по рамке. Обход целей касания его не
     видел: он есть только у ЛИЧНОЙ задачи, а демо-данные их не заводят, поэтому
     раздел обходили с одними проектными строками (там кружка нет вовсе). Заводим
     личную задачу и меряем ФАКТИЧЕСКОЕ попадание, а не рамку. */
  await test("задачи на телефоне: кружок «Готово» ловит палец, а не только рамку", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, {
      width: 390, height: 844, touch: true, seedDemo: true,
    });
    try {
      await page.evaluate(() => {
        window.app.createGlobalTask();
        window.app.setTaskModalField("title", "Забрать камеру из проката");
        window.app.saveTaskModal();
      });
      await page.waitForTimeout(400);
      await page.evaluate(() => window.app.go("global-tasks"));
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const el = document.querySelector(".gtask-check");
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const pts = [[cx, cy - 20], [cx, cy + 20], [cx - 20, cy], [cx + 20, cy]];
        return {
          hits: pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e === el || el.contains(e)); }).length,
          box: [Math.round(b.width), Math.round(b.height)],
        };
      });
      assert(r, "в списке нет личной задачи с кружком «Готово»");
      assertEqual(r.hits, 4,
        `в кружок «Готово» попадает ${r.hits} из 4 точек в 20px от центра (рамка ${r.box[0]}×${r.box[1]})`);
    } finally {
      await context.close();
    }
  });

  await test("капсом не пишут целые фразы", async () => {
    /* Владелец спросил 04.09.2026: «нужно ли писать текст заглавными?» — и был
       прав. КАПС убивает различие букв по высоте: слово-разделитель так читается
       нормально, а ФРАЗА — по слогам.

       На карточках пакетов капсом шла строка из поля «кому подходит», до 62
       знаков: «ДЛЯ: АКТИВНЫЕ БРЕНДЫ, ПРОДАКШН-АГЕНТСТВА, МАРКЕТИНГОВЫЕ ОТДЕЛЫ».
       Это пользовательский текст, он растёт — сегодня 62 знака, завтра больше.

       Сторож меряет ЖИВОЙ DOM, а не CSS: в стилях два десятка правил с uppercase,
       и почти все законны — важно не правило, а то, что под ним оказалось. */
    const ПОРОГ = 24; // длиннее — уже фраза, а не подпись
    const { context, page } = await bootLocal(browser, baseUrl, { width: 1440, height: 950, seedDemo: true });
    try {
      const плохо = [];
      for (const view of ["home", "crm", "clients", "services", "packages", "global-finances",
        "global-tasks", "contracts", "knowledge", "proposals", "briefs", "company-team"]) {
        await page.evaluate((v) => window.app.go(v), view);
        await page.waitForTimeout(180);
        const found = await page.evaluate((порог) => {
          const out = [];
          document.querySelectorAll("#appContent *").forEach((el) => {
            if (el.children.length) return;             // только листья с текстом
            const t = (el.textContent || "").trim();
            if (t.length <= порог) return;
            const b = el.getBoundingClientRect();
            if (b.width < 2 || b.height < 2) return;
            if (getComputedStyle(el).textTransform !== "uppercase") return;
            out.push(`${(el.className || el.tagName).toString().split(/\s+/)[0].slice(0, 26)}: «${t.slice(0, 40)}»`);
          });
          return [...new Set(out)].slice(0, 4);
        }, ПОРОГ);
        found.forEach(x => плохо.push(`${view} → ${x}`));
      }
      assert(плохо.length === 0,
        `капсом написана целая фраза (длиннее ${ПОРОГ} знаков) — она читается по слогам:\n  ` +
        плохо.join("\n  ") + "\n  Капс оставляем словам-разделителям, не предложениям.");
    } finally {
      await context.close();
    }
  });

  await test("редактор пакета: панель справа на десктопе, окно на телефоне", async () => {
    /* Просьба владельца 04.09.2026: править пакет справа, как правая колонка в
       «Услугах», а не окном по центру — правя состав, человек смотрит на список
       слева, и окно по центру его закрывает. На телефоне решено оставить окно:
       панели справа негде развернуться.

       Сделано КЛАССОМ поверх существующей модалки, а не вторым путём отрисовки,
       поэтому тест меряет РАСКЛАДКУ на двух ширинах: одна разметка, два вида. */
    for (const [ширина, высота, touch, режим] of [[1440, 900, false, "панель"], [390, 844, true, "окно"]]) {
      const { context, page } = await bootLocal(browser, baseUrl,
        { width: ширина, height: высота, touch, seedDemo: true });
      try {
        await page.evaluate(() => window.app.go("packages"));
        await page.waitForTimeout(300);
        const открыт = await page.evaluate(() => {
          const el = document.querySelector("[onclick*='openPackageEditModal']");
          const m = el && el.getAttribute("onclick").match(/openPackageEditModal\('([^']+)'/);
          if (!m) return false;
          window.app.openPackageEditModal(m[1]);
          return true;
        });
        assert(открыт, `${ширина}px: не нашлось пакета, у которого можно открыть редактор`);
        await page.waitForTimeout(350);

        const r = await page.evaluate(() => {
          const ed = document.querySelector(".pkg-editor");
          const box = ed && ed.querySelector(".pkg-editor-inner");
          if (!box) return null;
          const b = box.getBoundingClientRect();
          return {
            наложение: getComputedStyle(ed).position === "fixed",
            // Список пакетов должен остаться на экране: ради этого всё и делалось.
            списокЖив: !!document.querySelector(".pkg-cards-grid"),
            заКраем: Math.round(b.right) > document.documentElement.clientWidth + 1 || b.left < -1,
            роль: ed.getAttribute("role"),
            модальна: ed.getAttribute("aria-modal"),
            /* Имя позиции — самое важное в строке состава, и именно оно
               обрезалось: «Монтаж короткого Reels / Shorts» превращался в
               «Монтаж короткого Reels / …». Считаем, у скольких имён текст не
               помещается в отведённую высоту. */
            имён: document.querySelectorAll(".pkg-item-name").length,
            обрезано: [...document.querySelectorAll(".pkg-item-name")]
              .filter(e => e.scrollHeight > e.clientHeight + 1).length,
            вРяду: (() => {
              const g = document.querySelector(".pkg-cards-grid");
              if (!g) return 0;
              const t = [...g.children].map(c => Math.round(c.getBoundingClientRect().top));
              return t.filter(x => x === t[0]).length;
            })(),
          };
        });
        assert(r, `${ширина}px: редактор пакета не открылся`);
        assert(!r.заКраем, `${ширина}px: редактор вылез за край экрана`);
        assert(r.списокЖив, `${ширина}px: список пакетов исчез, пока открыт редактор`);
        assert(r.имён > 0, `${ширина}px: в составе пакета нет ни одной позиции — проверять нечего`);
        assertEqual(r.обрезано, 0,
          `${ширина}px: у ${r.обрезано} из ${r.имён} позиций состава название не помещается — ` +
          "оно и есть главное в строке, обрезать его нельзя");
        assertEqual(r.вРяду, режим === "панель" ? 2 : 1,
          `${ширина}px: карточек в ряду ${r.вРяду} — с открытым редактором их должно быть ` +
          (режим === "панель" ? "два" : "одна"));

        if (режим === "панель") {
          /* Главное отличие от прежнего окна: НЕ position:fixed. Наложение гасит
             страницу и перехватывает клики, колонка — нет, и список слева
             остаётся рабочим. Это и просил владелец: «не поверх открытое окно, а
             сбоку как меню». */
          assert(!r.наложение,
            "на широком экране редактор всё ещё наложение (position:fixed), а должен быть колонкой раздела");
          assertEqual(r.роль, "region",
            "колонка объявлена диалогом — читалка запрёт человека в ней, хотя список рядом рабочий");
        } else {
          assert(r.наложение,
            "на телефоне редактор не стал окном поверх — колонке там негде развернуться, он уехал бы под список");
          /* На узком экране панель закрывает собой всё — там она честно диалог.
             Без aria-modal читалка увела бы человека в список ЗА панелью. Эта
             проверка переехала сюда из общего обхода модалок (tests/suites/
             modals.js), где редактор пакета больше не участвует. */
          assertEqual(r.роль, "dialog", "на телефоне редактор не объявлен диалогом");
          assertEqual(r.модальна, "true", "на телефоне у редактора нет aria-modal");
        }
      } finally {
        await context.close();
      }
    }
  });

  for (const [ширина, touch] of [[1440, false], [390, true]]) {
    await test(`ничего не обрезано без возможности прокрутить · ${ширина}px`, async () => {
      /* Отличие настоящего дефекта от ложного, на котором я ошибался дважды за
         сессию 03.09.2026: элемент ЗА КРАЕМ контейнера — это нормально, если до
         него можно доскроллить (вкладки базы знаний, пресеты дат, чипы фильтров
         живут в лентах с overflow-x:auto и специально уезжают). Дефект — когда
         прокрутить нельзя: ни один предок не прокручивается по этой оси, и часть
         интерфейса просто недостижима.

         Поэтому проверка одна и она про ДОСТУПНОСТЬ, а не про геометрию:
         родитель прячет выходящее (overflow hidden/clip), элемент за его правым
         краем, и ни один предок не даёт прокрутку. */
      const ВИДЫ = ["home", "crm", "deal", "services", "clients", "proposals", "briefs",
        "company-team", "global-finances", "global-calendar", "global-tasks",
        "contracts", "knowledge", "settings", "profile"];
      const { context, page } = await bootLocal(browser, baseUrl,
        { width: ширина, height: touch ? 844 : 1000, touch, seedDemo: true });
      try {
        const плохо = [];
        for (const v of ВИДЫ) {
          await page.evaluate((view) => window.app.go(view), v);
          await page.waitForTimeout(180);
          const найдено = await page.evaluate(() => {
            const out = [];
            const прокручиваемыйПредок = (el) => {
              let p = el.parentElement;
              while (p && p !== document.body) {
                const st = getComputedStyle(p);
                if (/(auto|scroll)/.test(st.overflowX) && p.scrollWidth > p.clientWidth + 2) return true;
                p = p.parentElement;
              }
              return false;
            };
            document.querySelectorAll("#appContent *").forEach((el) => {
              const b = el.getBoundingClientRect();
              if (b.width < 2 || b.height < 2) return;
              const st = getComputedStyle(el);
              if (st.visibility === "hidden" || st.opacity === "0" || st.position === "fixed") return;
              const host = el.parentElement;
              if (!host) return;
              const hs = getComputedStyle(host);
              if (!/(hidden|clip)/.test(hs.overflowX)) return;
              const за = Math.round(b.right - host.getBoundingClientRect().right);
              if (за <= 1) return;
              if (прокручиваемыйПредок(el)) return;
              out.push(`${(el.className || el.tagName).toString().split(/\s+/)[0].slice(0, 26)} +${за}px «${(el.textContent || "").trim().slice(0, 24)}»`);
            });
            return [...new Set(out)].slice(0, 4);
          });
          найдено.forEach(x => плохо.push(`${v}: ${x}`));
        }
        assert(плохо.length === 0,
          "обрезано и прокрутить нельзя — до этого не добраться:\n  " + плохо.join("\n  "));
      } finally {
        await context.close();
      }
    });
  }

};
