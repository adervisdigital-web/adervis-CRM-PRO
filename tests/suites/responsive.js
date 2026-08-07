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
      await page.evaluate(() => document.getElementById("mbnMore").click());
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const p = document.querySelector(".sidebar-nav-config");
        if (!p) return null;
        const b = p.getBoundingClientRect();
        return {
          rows: p.querySelectorAll(".sidebar-nav-config-row").length,
          onScreen: b.top >= 0 && b.left >= 0 && b.right <= window.innerWidth + 1 && b.bottom <= window.innerHeight + 1,
          box: `${Math.round(b.left)},${Math.round(b.top)}…${Math.round(b.right)},${Math.round(b.bottom)}`,
        };
      });
      assert(r, "панель настройки меню не открылась — кнопка в нижней панели не работает");
      assert(r.rows > 0, "панель открылась пустой");
      assert(r.onScreen, `панель вне экрана: ${r.box} при окне 390×844`);
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
  async function finRowGaps(page) {
    return page.evaluate(() => {
      const g = document.querySelector(".fin-summary-grid");
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
          Math.round(gw - (ws.reduce((s, w) => s + w, 0) + gap * (ws.length - 1)))),
      };
    });
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

  // Визуальная фиксация каталога на самом узком экране (п.20 — визуальный обход)
  await test("каталог на 320px: снимок для ревью", async () => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => window.app.go("catalog"));
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(shotDir, "catalog-320.png"), fullPage: true });
  });

  await context.close();
};
