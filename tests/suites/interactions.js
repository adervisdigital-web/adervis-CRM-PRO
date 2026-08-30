// Ключевые UX-паттерны Фаз I/H: undo-тост вместо confirm() и смена этапа
// на канбан-карточке через нативный select (тач-фолбэк вместо HTML5 DnD).
const { bootLocal, assert, assertEqual } = require("../harness");

async function homeDealCount(page) {
  await page.evaluate(() => window.app.go("home"));
  await page.waitForTimeout(80);
  return page.evaluate(() => document.querySelectorAll(".deal-card").length);
}

async function dealId(page) {
  await page.evaluate(() => window.app.go("home"));
  await page.waitForTimeout(80);
  // data-deal-id, а не разбор onclick: имя обработчика меняли (selectActiveDeal →
  // openDeal), и такой разбор молча переставал находить карточки — ровно на этом
  // однажды сломалось и само перетаскивание в app.js.
  return page.evaluate(() => {
    const el = document.querySelector("[data-deal-id]");
    return el ? el.getAttribute("data-deal-id") : null;
  });
}


// В наборе одна страница на все тесты, и предыдущий тест может оставить висеть
// подтверждение «Закрыть окно?» — оно перехватывает клики следующего. Начинаем
// с чистого экрана: отвечаем «Отменить» на всё, что осталось открытым.
async function dismissStaleDialog(page) {
  const overlay = await page.$(".confirm-dialog-overlay");
  if (!overlay) return;
  const cancel = await page.$(".confirm-dialog-overlay button:not(.primary):not(.danger)");
  if (cancel) await cancel.click();
  else await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

module.exports = async function ({ browser, baseUrl, test }) {

  /* Ввод в СОБСТВЕННЫЙ диалог приложения. Раньше эти тесты подменяли window.prompt —
     системное окно заменили на свой диалог (оно чуждо в PWA, не держит фокус-ловушку и
     стиль), и подмена перестала что-либо значить: код ждал ответа, окно висело, а
     следующие тесты падали по таймауту клика. Теперь отвечаем как человек. */
  async function answerPrompt(p, value) {
    await p.waitForSelector(".confirm-dialog-overlay .confirm-dialog-input", { timeout: 8000 });
    await p.evaluate((v) => {
      const i = document.querySelector(".confirm-dialog-overlay .confirm-dialog-input");
      i.value = v;
      i.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector(".confirm-dialog-overlay .confirm-ok").click();
    }, value);
    await p.waitForTimeout(180);
  }
  const { context, page } = await bootLocal(browser, baseUrl, { width: 1000, height: 820, seedDemo: true });

  await test("undo-тост: удаление проекта показывает «Отменить» и восстанавливается", async () => {
    const id = await dealId(page);
    assert(id, "нет демо-сделки");
    const before = await homeDealCount(page);
    assert(before > 0, "на главной нет карточек сделок");

    await page.evaluate((pid) => window.app.deleteSavedProject(pid), id);
    await page.waitForTimeout(100);

    const toast = await page.evaluate(() => {
      const el = document.getElementById("toast");
      return {
        shown: !!el && el.classList.contains("show"),
        hasUndo: !!(el && el.querySelector(".toast-undo")),
        text: el ? el.textContent : "",
      };
    });
    assert(toast.shown, "тост не показан после удаления");
    assert(toast.hasUndo, "нет кнопки «Отменить» в тосте");
    assert(/отмен/i.test(toast.text), "в тосте нет текста отмены: " + toast.text);

    const afterDelete = await homeDealCount(page);
    assertEqual(afterDelete, before - 1, "карточка не исчезла после удаления");

    await page.evaluate(() => window.app.undoLastDelete());
    await page.waitForTimeout(100);
    const afterUndo = await homeDealCount(page);
    assertEqual(afterUndo, before, "проект не восстановился после «Отменить»");
  });

  await test("канбан: setKanbanStatus меняет этап и сохраняет его на карточке", async () => {
    const id = await dealId(page);
    assert(id, "нет демо-сделки");
    const target = "Договор";

    await page.evaluate(([pid, st]) => window.app.setKanbanStatus("crm", pid, st), [id, target]);
    await page.waitForTimeout(100);

    const toastText = await page.evaluate(() => {
      const el = document.getElementById("toast");
      return el ? el.textContent : "";
    });
    assert(toastText.includes(target), "нет тоста смены статуса: " + toastText);

    // Персистентность: на канбан-карточке select этапа теперь показывает новый статус
    await page.evaluate(() => window.app.go("crm"));
    await page.waitForTimeout(120);
    const val = await page.evaluate((pid) => {
      for (const s of document.querySelectorAll("select")) {
        const oc = s.getAttribute("onchange") || "";
        if (oc.includes("setKanbanStatus") && oc.includes(pid)) return s.value;
      }
      return null;
    }, id);
    assertEqual(val, target, "этап не сохранился на канбан-карточке");
  });

  await test("render() сохраняет позицию прокрутки на том же виде", async () => {
    // Длинный вид (каталог) → скроллим вниз → перерисовка не должна прыгнуть наверх.
    await page.evaluate(() => window.app.go("catalog"));
    await page.waitForTimeout(150);
    const scrollable = await page.evaluate(() => {
      window.scrollTo(0, 500);
      return window.scrollY;
    });
    assert(scrollable > 50, "страница каталога слишком короткая для проверки скролла: " + scrollable);
    const after = await page.evaluate(() => {
      window.app.render();
      return window.scrollY;
    });
    assert(Math.abs(after - scrollable) < 30, `скролл не сохранился: было ${scrollable}, стало ${after}`);
  });

  await test("список сделок: пагинация по 30 + «показать ещё»", async () => {
    const id = await dealId(page);
    assert(id, "нет демо-сделки");
    // Доводим число сделок до ~35 дублированием, чтобы сработала пагинация (страница = 30).
    await page.evaluate((pid) => { for (let i = 0; i < 34; i++) window.app.duplicateSavedProject(pid); }, id);
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.app.setCrmView("grid"); window.app.go("home"); });
    await page.waitForTimeout(200);
    const first = await page.evaluate(() => ({
      cards: document.querySelectorAll(".deal-card").length,
      hasMore: [...document.querySelectorAll("button")].some(b => /Показать ещё/.test(b.textContent)),
    }));
    assertEqual(first.cards, 30, "на первой странице должно быть ровно 30 карточек, а не " + first.cards);
    assert(first.hasMore, "нет кнопки «Показать ещё» при 35 сделках");
    await page.evaluate(() => window.app.crmShowMore());
    await page.waitForTimeout(150);
    const more = await page.evaluate(() => document.querySelectorAll(".deal-card").length);
    assert(more > 30, `после «Показать ещё» карточек не прибавилось: 30 → ${more}`);
  });

  // Каталог рендерил все 93 позиции сразу (на телефоне страница ~26 000px и 93 живых
  // <input> цены, пересобираемых каждым render). Пагинация не должна ломать поиск:
  // счётчик обязан считать ВСЕ совпадения, а при вводе запроса лимит — сбрасываться.
  await test("каталог: пагинация по 24 + «показать ещё»; поиск сбрасывает лимит", async () => {
    await page.evaluate(() => { window.app.setSearch(""); window.app.setTab("all"); window.app.go("catalog"); });
    await page.waitForTimeout(220);
    const first = await page.evaluate(() => ({
      cards: document.querySelectorAll(".catalog-grid > .item").length,
      found: parseInt((document.querySelector(".catalog-found-count") || {}).textContent || "0", 10),
      more: !!document.querySelector("[onclick*='catalogShowMore']"),
    }));
    assertEqual(first.cards, 24, "на первой странице каталога должно быть 24 карточки, а не " + first.cards);
    assert(first.found > 24, `счётчик должен считать ВСЕ совпадения (>24), а показал ${first.found}`);
    assert(first.more, "нет кнопки «Показать ещё» в каталоге");

    await page.evaluate(() => window.app.catalogShowMore());
    await page.waitForTimeout(150);
    const grown = await page.evaluate(() => document.querySelectorAll(".catalog-grid > .item").length);
    assertEqual(grown, 48, `после «Показать ещё» должно стать 48 карточек, стало ${grown}`);

    // Поиск сужает выборку — лимит сбрасывается, результат виден целиком, кнопки нет.
    await page.evaluate(() => window.app.setSearch("монтаж"));
    await page.waitForTimeout(200);
    const searched = await page.evaluate(() => ({
      cards: document.querySelectorAll(".catalog-grid > .item").length,
      found: parseInt((document.querySelector(".catalog-found-count") || {}).textContent || "0", 10),
      more: !!document.querySelector("[onclick*='catalogShowMore']"),
    }));
    assert(searched.cards > 0, "поиск «монтаж» не дал результатов");
    assertEqual(searched.cards, searched.found, "при поиске показаны не все найденные позиции");
    assert(!searched.more, "при коротком результате поиска кнопка «Показать ещё» лишняя");

    // Сброс поиска возвращает пагинацию к первой странице, а не к разросшемуся лимиту.
    await page.evaluate(() => window.app.setSearch(""));
    await page.waitForTimeout(200);
    const back = await page.evaluate(() => document.querySelectorAll(".catalog-grid > .item").length);
    assertEqual(back, 24, `после сброса поиска лимит должен вернуться к 24, а не ${back}`);
  });

  // Сайдбар каталога: 13 плоских категорий заменены семью группами по ходу проекта
  // (подготовка → команда → техника → пост → дистрибуция). Принадлежность считает
  // itemGroup() по способу расчёта, поэтому новая позиция каталога не может выпасть
  // из групп молча — проверяем, что сумма по группам равна всему каталогу.
  await test("каталог: группы покрывают все позиции и раскрывают подкатегории", async () => {
    await page.evaluate(() => { window.app.setSearch(""); window.app.setTab("all"); window.app.go("catalog"); });
    await page.waitForTimeout(250);

    // Размер группы читаем из data-атрибута, а не из текста кнопки: там показывается
    // либо число выбранных позиций, либо размер группы — по тексту не различить.
    const groups = await page.$$eval("#appContent [data-group]", (bs) =>
      bs.map((b) => ({ id: b.dataset.group, size: Number(b.dataset.groupSize) }))
    );
    assert(groups.length >= 7, "в сайдбаре меньше семи групп: " + JSON.stringify(groups));

    const total = await page.evaluate(() => parseInt((document.querySelector(".catalog-found-count") || {}).textContent || "0", 10));
    const sum = groups.reduce((s, g) => s + g.size, 0);
    assertEqual(sum, total, `сумма по группам (${sum}) не сходится с каталогом (${total}) — позиция выпала из групп`);

    // Раскрытие не привязано к выбору: групп можно держать открытыми несколько,
    // повторный клик по выбранной сворачивает её.
    const count = () => page.$$eval("#appContent .catalog-cat-item", (b) => b.length);
    const before = await count();
    await page.evaluate(() => { window.app.toggleCatalogGroup("crew"); });
    await page.waitForTimeout(250);
    const oneOpen = await count();
    assert(oneOpen > before, "подкатегории раскрытой группы не появились");

    await page.evaluate(() => { window.app.toggleCatalogGroup("post"); });
    await page.waitForTimeout(250);
    const twoOpen = await count();
    assert(twoOpen > oneOpen, "вторая группа не раскрылась одновременно с первой");
    const openGroups = await page.$$eval("#appContent [data-group]", (b) => b.filter((x) => x.dataset.open === "1").length);
    assertEqual(openGroups, 2, "открытых групп должно быть две");

    await page.evaluate(() => { window.app.toggleCatalogGroup("post"); });
    await page.waitForTimeout(250);
    assertEqual(await count(), oneOpen, "повторный клик по выбранной группе не свернул её");

    const shown = await page.evaluate(() => document.querySelectorAll(".catalog-grid > .item").length);
    assert(shown > 0, "в группе «Команда» не показано ни одной позиции");
    await page.evaluate(() => { window.app.setTab("all"); });
  });

  // Кнопка навигации каталога — единственный указатель раздела на телефоне (список
  // там скрыт и открывается листом), поэтому она обязана называть то, что показано
  // ниже. Подкатегории бывают ДВУХ видов: у групп с разными category это сама
  // категория («creative»), у односоставных — тег с префиксом «sub:». Первый вид
  // подпись не разбирала и молча откатывалась на «Все»: выбран «Креатив», написано
  // «Все». Перебираем ВСЕ пункты навигации и сверяем подпись с текстом пункта —
  // сторож переживёт появление третьего вида подгрупп.
  await test("каталог: кнопка навигации подписана выбранным разделом", async () => {
    await page.evaluate(() => { window.app.setSearch(""); window.app.setTab("all"); window.app.go("catalog"); });
    await page.waitForTimeout(250);

    // Подгруппы есть в разметке только у раскрытой группы — раскрываем все.
    const groups = await page.$$eval("#appContent .catalog-cat-item[data-group]", (bs) => bs.map((b) => b.dataset.group));
    for (const g of groups) {
      await page.evaluate((v) => window.app.toggleCatalogGroup(v), g);
      await page.waitForTimeout(60);
    }

    // Подпись пункта = текст кнопки без счётчика и без стрелки раскрытия.
    const items = await page.$$eval("#appContent .catalog-cat-item", (bs) =>
      bs
        .map((b) => {
          const oc = b.getAttribute("onclick") || "";
          const tab = oc.match(/app\.setTab\('([^']+)'\)/);
          const grp = oc.match(/app\.toggleCatalogGroup\('([^']+)'\)/);
          if (!tab && !grp) return null;
          const clone = b.cloneNode(true);
          clone.querySelectorAll(".catalog-cat-count").forEach((c) => c.remove());
          const label = clone.textContent.replace(/▶/g, "").replace(/\s+/g, " ").trim();
          return { id: tab ? tab[1] : "grp:" + grp[1], group: !tab, label };
        })
        .filter(Boolean)
    );
    assert(items.length >= 15, "в навигации каталога меньше пятнадцати пунктов: " + items.length);

    const wrong = [];
    for (const it of items) {
      if (it.group) await page.evaluate((v) => window.app.toggleCatalogGroup(v), it.id.slice(4));
      else await page.evaluate((v) => window.app.setTab(v), it.id);
      await page.waitForTimeout(90);
      const shown = await page.evaluate(() =>
        ((document.querySelector(".catalog-nav-trigger-label strong") || {}).textContent || "").trim()
      );
      // У подгрупп «sub:…» подпись показывает группу-родителя — это осознанно:
      // «Оборудование» на кнопке, «Камеры» в раскрытом списке под ней.
      const ok = it.id.startsWith("sub:") ? shown.length > 0 && shown !== "Все" : shown === it.label;
      if (!ok) wrong.push(`${it.id}: «${shown}» вместо «${it.label}»`);
    }
    await page.evaluate(() => window.app.setTab("all"));
    assertEqual(wrong.length, 0, "кнопка навигации каталога врёт о выбранном разделе:\n  " + wrong.join("\n  "));
  });

  // Пустая смета ведёт по шагам сборки (люди → техника → пост), а не просто говорит
  // «добавьте услуги»: каждый шаг открывает каталог сразу своей группой.
  await test("пустая смета: шаги сборки открывают нужную группу каталога", async () => {
    await page.evaluate(() => {
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Пустая смета");
      window.app.finishWizard("estimate");
    });
    await page.waitForTimeout(350);
    const txt = await page.$eval("#appContent", (el) => el.textContent.replace(/\s+/g, " "));
    assert(/Соберите смету по шагам/.test(txt), "на пустой смете нет пошаговой подсказки");
    assert(/Шаг 1/.test(txt) && /Шаг 3/.test(txt), "показаны не все шаги сборки");

    await page.evaluate(() => { window.app.goCatalogGroup("gear"); });
    await page.waitForTimeout(350);
    const active = await page.$$eval("#appContent [data-group].active", (b) => b.map((x) => x.dataset.group));
    assertEqual(active.join(","), "gear", "шаг открыл каталог не той группой");
    const cards = await page.evaluate(() => document.querySelectorAll(".catalog-grid > .item").length);
    assert(cards > 0, "в открытой группе нет позиций");
  });

  // Обе вкладки услуг рисуют одну <aside>, и подпись кнопки навигации у них общая
  // (pkgNavCurrentLabel вынесена наружу 06.08). 07.08 из-за этого весь раздел падал
  // с «ReferenceError: CAT_META is not defined»: константу оставили локальной внутри
  // renderPackages, а читает её и вынесенная функция. Падало НЕ всегда — условие
  // `filter !== "all" && CAT_META[filter]` замыкается на «Все», поэтому свежий вход
  // и весь набор были зелёными, а у того, кто раз выбрал категорию, раздел не
  // открывался вовсе: выбор лежит в state и переживает перезагрузку.
  //
  // Меряем результат, а не способ: по КАЖДОЙ категории раздел показывает карточки,
  // а не экран ошибки, и кнопка навигации подписана тем же, что и пункт списка.
  await test("пакеты: каждая категория открывает раздел, а не роняет его", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => window.app.go("packages"));
    await page.waitForTimeout(250);

    // Категории читаем из живого DOM: добавят новую — сторож проверит и её.
    const cats = await page.$$eval("#appContent .catalog-cat-item", (bs) =>
      bs
        .map((b) => {
          const m = (b.getAttribute("onclick") || "").match(/setPkgCatFilter\('([^']+)'\)/);
          const first = b.querySelector("span");
          return m ? { id: m[1], label: (first ? first.textContent : "").replace(/\s+/g, " ").trim() } : null;
        })
        .filter(Boolean)
    );
    assert(cats.length >= 8, "в списке категорий пакетов меньше восьми пунктов: " + cats.length);

    const broken = [];
    for (const c of cats) {
      await page.evaluate((id) => window.app.setPkgCatFilter(id), c.id);
      await page.waitForTimeout(120);
      const st = await page.evaluate(() => {
        const el = document.getElementById("appContent");
        return {
          crashed: /Что-то пошло не так/.test(el ? el.innerText : ""),
          cards: document.querySelectorAll(".package-card").length,
          label: ((document.querySelector(".catalog-nav-trigger-label strong") || {}).textContent || "").trim(),
        };
      });
      // «Свои» на демо-данных пусты штатно: там пустое состояние вместо карточек.
      if (st.crashed) broken.push(`${c.id}: экран ошибки вместо раздела`);
      else if (st.label !== c.label) broken.push(`${c.id}: подпись «${st.label}» вместо «${c.label}»`);
      else if (c.id !== "own" && !st.cards) broken.push(`${c.id}: ни одной карточки`);
    }
    await page.evaluate(() => window.app.setPkgCatFilter("all"));
    assertEqual(broken.length, 0, "категории пакетов не открываются:\n  " + broken.join("\n  "));
  });

  /* «Настроить разделы» у пакетов — та же настройка, что у каталога, но правило
     скрытия НАМЕРЕННО жёстче: у каталога скрытый раздел уходит только из списка
     слева (услуги остаются в «Все»), а у пакетов лента и есть весь экран — убрать
     один пункт слева значило бы не убрать ничего.
     Ради чего сторож: скрытая категория уходит и из списка, и из ленты; пакеты при
     этом НЕ пропадают — их находит поиск; экран говорит, что часть скрыта; выбор,
     павший на скрытую категорию, не оставляет человека перед пустотой. */
  await test("пакеты: скрытая категория уходит из ленты, но находится поиском", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => { window.app.setPkgSearch(""); window.app.setPkgCatFilter("all"); window.app.go("packages"); });
    await page.waitForTimeout(450);

    const read = () => page.evaluate(() => ({
      cats: [...document.querySelectorAll(".catalog-cat-item[data-pkg-cat]")].map((b) => b.dataset.pkgCat),
      cards: document.querySelectorAll(".package-card").length,
      cfg: !!document.querySelector('.catalog-cat-config[onclick*="openPkgCatsConfig"]'),
      nav: (document.querySelector(".catalog-cat-sidebar") || {}).innerText || "",
      label: ((document.querySelector(".catalog-nav-trigger-label strong") || {}).textContent || "").trim(),
    }));

    const before = await read();
    assert(before.cats.includes("photo"), "в списке категорий пакетов нет «Фото»");
    assert(before.cfg, "внизу списка категорий пакетов нет «Настроить разделы»");

    await page.evaluate(() => window.app.setPkgCatFilter("photo"));
    await page.waitForTimeout(250);
    const photo = await page.evaluate(() => ({
      cards: document.querySelectorAll(".package-card").length,
      name: ((document.querySelector(".pkg-card-name") || {}).textContent || "").trim(),
    }));
    assert(photo.cards > 0 && photo.name, "в категории «Фото» нет пакетов — тест не о том");

    await page.evaluate(() => window.app.togglePkgCatHidden("photo"));
    await page.waitForTimeout(350);

    const after = await read();
    assert(!after.cats.includes("photo"), "скрытая категория осталась в списке слева");
    assertEqual(after.cards, before.cards - photo.cards, "лента потеряла не ровно пакеты скрытой категории");
    assert(/скрыто/.test(after.nav), "экран не говорит, что часть категорий скрыта — «куда делись пакеты» без ответа");
    assertEqual(after.label, "Все", "скрыли выбранную категорию, а экран остался отфильтрованным по ней");

    // Скрытие — про глаза, а не про удаление: поиск обязан доставать скрытое.
    await page.evaluate((q) => window.app.setPkgSearch(q), photo.name);
    await page.waitForTimeout(700);
    const found = await page.evaluate((n) =>
      [...document.querySelectorAll(".pkg-card-name")].filter((x) => x.textContent.trim() === n).length, photo.name);
    assert(found > 0, "пакет скрытой категории не находится поиском — значит, скрытие его удалило");

    await page.evaluate(() => { window.app.setPkgSearch(""); window.app.togglePkgCatHidden("photo"); });
    await page.waitForTimeout(700);
    const restored = await read();
    assertEqual(restored.cards, before.cards, "категория вернулась не полностью");
  });

  /* Задачи ЗАКРЫТЫХ сделок (архив, завершённые) висели в списке наравне с живыми
     и вечно росли в счётчике «Просрочено»: сделка сдана полгода назад, а её
     недоделанная задача каждый день говорит «просрочен на 180 дн.». Тот же
     дефект, что уже правили в телеграм-статистике: закрытая сделка обязана
     уходить из оперативных чисел.

     Но скрытое обязано быть НАЗВАНО — иначе «потерял задачи» не лучше «вечно
     висят». Проверяем оба конца: их нет в списке и в счётчиках, и при этом видно,
     сколько их и как показать; показанные помечены статусом сделки; поиск
     достаёт их и без включения показа. */
  await test("задачи: закрытые сделки уходят из списка и «Просрочено», но названы", async () => {
    const own = await bootLocal(browser, baseUrl, { width: 1280, height: 900, seedDemo: true });
    try {
      await own.page.evaluate(() => {
        const past = new Date(); past.setDate(past.getDate() - 5);
        window.app.createTask();
        const st = JSON.parse(localStorage.getItem("adervis_pro_381_state"));
        window.app.updateTask(st.tasks[0].id, "title", "Свести звук");
        window.app.updateTask(st.tasks[0].id, "deadline", past.toISOString().slice(0, 10));
      });
      // Снимок сделки достраивается по таймеру — без паузы архив унесёт пустой снимок.
      await own.page.waitForTimeout(2600);
      await own.page.evaluate(() => {
        const st = JSON.parse(localStorage.getItem("adervis_pro_381_state"));
        window.app.archiveDeal(st.activeProjectId);
      });
      await own.page.waitForTimeout(500);
      await own.page.evaluate(() => window.app.go("global-tasks"));
      await own.page.waitForTimeout(500);

      const view = () => own.page.evaluate(() => {
        const txt = (el) => (el && el.innerText ? el.innerText.replace(/\s+/g, " ").trim() : "");
        return {
          stats: txt(document.querySelector(".gtask-stats")),
          rows: [...document.querySelectorAll(".gtask-row")].map((r) => txt(r)),
          offer: [...document.querySelectorAll(".show-more-row .btn, .empty__actions .btn")].map((b) => txt(b)),
        };
      });

      const hidden = await view();
      assertEqual(hidden.rows.length, 0, "задача архивной сделки осталась в списке: " + JSON.stringify(hidden.rows));
      assert(/ПРОСРОЧЕНО 0/i.test(hidden.stats.toUpperCase()),
        "задача архивной сделки всё ещё считается просроченной: " + hidden.stats);
      assert(hidden.offer.some((t) => /закрыт/i.test(t)),
        "экран не говорит, что задачи закрытых сделок скрыты: " + JSON.stringify(hidden.offer));

      await own.page.evaluate(() => {
        const b = [...document.querySelectorAll(".empty__actions .btn, .show-more-row .btn")]
          .find((x) => /закрыт/i.test(x.textContent));
        b.click();
      });
      await own.page.waitForTimeout(600);
      const shown = await view();
      assertEqual(shown.rows.length, 1, "показ задач закрытых сделок ничего не показал");
      assert(/Архив/.test(shown.rows[0]), "задача закрытой сделки не помечена статусом: " + shown.rows[0]);
      assert(shown.offer.some((t) => /Скрыть/i.test(t)), "нет обратного хода — скрыть их снова нечем");

      // Поиск достаёт закрытые независимо от переключателя
      await own.page.evaluate(() => {
        const b = [...document.querySelectorAll(".show-more-row .btn")].find((x) => /Скрыть/i.test(x.textContent));
        b.click();
      });
      await own.page.waitForTimeout(500);
      await own.page.evaluate(() => window.app.setGlobalTaskSearch("звук"));
      await own.page.waitForTimeout(900);
      const found = await view();
      assertEqual(found.rows.length, 1, "поиск не нашёл задачу закрытой сделки — «ничего не нашлось» было бы неправдой");
    } finally {
      await own.context.close();
    }
  });

  /* «Отметить сделанной» — самое частое действие по задаче, и оно было доступно
     только у ЛИЧНОЙ: у проектной вместо кружка стояла мёртвая точка статуса, а
     единственный путь вёл через openDealTasks() — тот ЗАГРУЖАЕТ сделку как
     активную (меняет активную сделку всего приложения) и показывает канбан, где
     на телефоне нужная карточка лежала на 1325px при экране 844.

     Задача живёт в ДВУХ местах, поэтому проверяем оба: активная сделка (живой
     state.tasks) и любая другая (snapshot.tasks сохранённой) — правка не в то
     место потерялась бы на ближайшем flush. Плюс отмена: строка после отметки
     исчезает (фильтр «Активные»), и промах иначе не исправить. */
  await test("задачи: проектную отмечаем готовой из списка — в активной сделке и в чужой", async () => {
    const own = await bootLocal(browser, baseUrl, { width: 1280, height: 900, seedDemo: true });
    try {
      await own.page.evaluate(() => {
        window.app.createTask();
        const st = JSON.parse(localStorage.getItem("adervis_pro_381_state"));
        window.app.updateTask(st.tasks[0].id, "title", "Отснять интервью");
      });
      // Ждём автосохранение: снимок сделки достраивается по таймеру (2 с), а копия
      // берётся именно из снимка — без паузы копия уехала бы без задачи.
      await own.page.waitForTimeout(2600);
      // Копия сделки не активна — её задачи лежат в снимке, а не в state.tasks.
      await own.page.evaluate(() => {
        const st = JSON.parse(localStorage.getItem("adervis_pro_381_state"));
        window.app.duplicateSavedProject(st.activeProjectId);
      });
      await own.page.waitForTimeout(400);
      await own.page.evaluate(() => window.app.go("global-tasks"));
      await own.page.waitForTimeout(500);

      const read = () => own.page.evaluate(() => {
        const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
        const copy = (st.savedProjects || []).find((p) => /копия/.test(p.name || ""));
        return {
          view: st.view,
          activeId: st.activeProjectId,
          live: (st.tasks || []).map((t) => t.status),
          copySnap: (((copy || {}).snapshot || {}).tasks || []).map((t) => t.status),
          rows: [...document.querySelectorAll(".gtask-row")].map((r) => ({
            project: ((r.querySelector(".gtask-project") || {}).textContent || "").trim(),
            hasCheck: !!r.querySelector(".gtask-check"),
          })),
        };
      });
      const before = await read();
      assertEqual(before.rows.length, 2, "ожидались две проектные задачи (оригинал и копия)");
      assert(before.rows.every((r) => r.hasCheck), "у проектной задачи нет кружка «Готово»");
      assertEqual(before.live[0], "Новая", "задача активной сделки уже готова — тест не о том");

      const tick = (nameFragment) => own.page.evaluate((frag) => {
        const row = [...document.querySelectorAll(".gtask-row")]
          .find((r) => ((r.querySelector(".gtask-project") || {}).textContent || "").includes(frag));
        row.querySelector(".gtask-check").click();
      }, nameFragment);

      // 1) чужая (неактивная) сделка — пишем в снимок
      await tick("копия");
      await own.page.waitForTimeout(500);
      const afterCopy = await read();
      assertEqual(afterCopy.copySnap[0], "Готово", "отметка не дошла до снимка неактивной сделки");
      assertEqual(afterCopy.view, "global-tasks", "отметка увела с «Задач»");
      assertEqual(afterCopy.activeId, before.activeId, "отметка сменила активную сделку");

      // 2) активная сделка — пишем в живой список и в её снимок
      await tick("Демо");
      await own.page.waitForTimeout(500);
      const afterLive = await read();
      assertEqual(afterLive.live[0], "Готово", "отметка не дошла до задачи активной сделки");

      // 3) отмена возвращает задачу в работу (строка уже исчезла из «Активных»)
      await own.page.evaluate(() => document.querySelector("#toast .toast-undo").click());
      await own.page.waitForTimeout(500);
      const afterUndo = await read();
      assertEqual(afterUndo.live[0], "Новая", "«Отменить» не вернуло задачу в работу");
    } finally {
      await own.context.close();
    }
  });

  /* Пустой экран «Задач» обещает словами: «задачи с дедлайном попадут в календарь».
     Для ЛИЧНЫХ задач это не выполнялось ни разу — календарь собирал события только
     из сделок. А личная задача это ровно тот вид, который заводят без открытой
     сделки (и который ставит себе исполнитель на съёмке).

     Здесь же второе: «+ Задача» на дне. Раньше «+» в ячейке звал createTask() —
     задача уходила в ТЕКУЩУЮ сделку (а без открытой — в несохранённую рабочую
     копию), и человека уносило с календаря на «Задачи проекта». */
  await test("календарь: личная задача с дедлайном видна в дне, «+ Задача» не уводит с экрана", async () => {
    const own = await bootLocal(browser, baseUrl, { width: 1280, height: 900, seedDemo: true });
    try {
      const day = await own.page.evaluate(() => {
        const d = new Date(); d.setDate(d.getDate() + 2);
        const iso = d.toISOString().slice(0, 10);
        window.app.createGlobalTask();
        window.app.setTaskModalField("title", "Забрать камеру из проката");
        window.app.setTaskModalField("deadline", iso);
        window.app.saveTaskModal();
        return iso;
      });
      await own.page.waitForTimeout(400);
      await own.page.evaluate((d) => { window.app.go("global-calendar"); window.app.calSelectDay(d); }, day);
      await own.page.waitForTimeout(600);

      const shown = await own.page.evaluate(() => ({
        inDayPanel: [...document.querySelectorAll(".cal-day-panel .cal-day-event-info h4")].map((h) => h.textContent.trim()),
        panelSub: [...document.querySelectorAll(".cal-day-panel .cal-day-event-info p")].map((p) => p.textContent.trim()),
      }));
      assert(shown.inDayPanel.includes("Забрать камеру из проката"),
        "личной задачи нет в её дне: " + JSON.stringify(shown.inDayPanel));
      assert(shown.panelSub.some((t) => /Личная задача/.test(t)),
        "личная задача не подписана как личная — не отличить от проектной");

      // Клик по ней открывает саму задачу, а не уводит в чужой проект
      await own.page.evaluate(() => {
        const row = [...document.querySelectorAll(".cal-day-panel .cal-day-event-row")]
          .find((r) => /Забрать камеру/.test(r.innerText));
        row.click();
      });
      await own.page.waitForTimeout(500);
      // Название задачи лежит в input, а не в тексте — innerText его не видит.
      const opened = await own.page.evaluate(() => {
        const box = document.querySelector("#modalContainer .modal-overlay");
        const vals = box ? [...box.querySelectorAll("input, textarea")].map((i) => i.value) : [];
        return { open: !!box, vals };
      });
      assert(opened.open && opened.vals.some((v) => /Забрать камеру/.test(v || "")),
        "клик по личной задаче в календаре не открыл её: " + JSON.stringify(opened.vals).slice(0, 120));
      await own.page.evaluate(() => window.app.closeTaskModal());
      await own.page.waitForTimeout(300);

      const before = await own.page.evaluate(() => {
        const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
        return { deal: (st.tasks || []).length, personal: (st.globalTasks || []).length };
      });
      await own.page.evaluate(() => document.querySelector(".cal-day-panel .btn.primary").click());
      await own.page.waitForTimeout(600);
      const after = await own.page.evaluate(() => {
        const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
        return {
          view: st.view,
          deal: (st.tasks || []).length,
          personal: (st.globalTasks || []).length,
          newDeadline: (st.globalTasks || [])[0] ? st.globalTasks[0].deadline : null,
          modalOpen: !!document.querySelector("#modalContainer .modal-overlay"),
        };
      });
      assertEqual(after.deal, before.deal, "«+ Задача» из календаря положила задачу в открытую сделку");
      assertEqual(after.personal, before.personal + 1, "«+ Задача» не завела личную задачу");
      assertEqual(after.newDeadline, day, "новая задача встала не на выбранный день");
      assertEqual(after.view, "global-calendar", "«+ Задача» увела с календаря");
      assert(after.modalOpen, "новая задача создалась молча — её нечем назвать");
    } finally {
      await own.context.close();
    }
  });

  /* Обещание окна настройки словами: «свои пакеты не пропадают — из скрытой
     категории они переезжают в «Мои пакеты»». Это и есть граница между «убрал с
     глаз» и «потерял свою работу», поэтому проверяем обещание, а не состояние.
     Контекст свой: тест заводит пакет, а страница набора одна на все тесты. */
  await test("пакеты: свой пакет из скрытой категории переезжает в «Мои пакеты»", async () => {
    const own = await bootLocal(browser, baseUrl, { width: 1280, height: 900 });
    try {
      // Позиция в смете — без неё createPackage отказывается собирать пакет.
      await own.page.evaluate(() => window.app.addItem("camera_basic"));
      await own.page.waitForTimeout(200);
      await own.page.evaluate(() => { window.app.createPackage(); });
      await answerPrompt(own.page, "Свой фото-пакет");
      const id = await own.page.evaluate(() =>
        JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}")
          .packages.find((p) => p.name === "Свой фото-пакет").id);
      assert(id && id.startsWith("package_"), "свой пакет не создался");

      await own.page.evaluate((pid) => {
        window.app.openPackageEditModal(pid);
        window.app.setPackageEditField("cat", "photo");
        window.app.savePackageEdit();
      }, id);
      await own.page.waitForTimeout(400);
      await own.page.evaluate(() => window.app.go("packages"));
      await own.page.waitForTimeout(450);

      // Заголовок группы, под которой лежит карточка: он и есть ответ «где пакет».
      const groupOf = () => own.page.evaluate(() => {
        const card = [...document.querySelectorAll(".package-card")].find((c) => /Свой фото-пакет/.test(c.innerText));
        if (!card) return "(карточки нет)";
        let n = card.closest(".pkg-cards-grid");
        while (n && !(n.classList && n.classList.contains("pkg-group-header"))) n = n.previousElementSibling;
        return n ? n.innerText.trim().toUpperCase() : "(без заголовка)";
      });
      assertEqual(await groupOf(), "ФОТО", "свой пакет не встал в свою категорию");

      await own.page.evaluate(() => window.app.togglePkgCatHidden("photo"));
      await own.page.waitForTimeout(450);
      assertEqual(await groupOf(), "МОИ ПАКЕТЫ",
        "свой пакет исчез вместе со скрытой категорией — «скрыл раздел» не должно означать «потерял свою работу»");

      await own.page.evaluate(() => window.app.setPkgCatFilter("own"));
      await own.page.waitForTimeout(350);
      const inOwnTab = await own.page.evaluate(() =>
        [...document.querySelectorAll(".pkg-card-name")].some((x) => x.textContent.trim() === "Свой фото-пакет"));
      assert(inOwnTab, "«Свои» не показывают свой пакет из скрытой категории");
    } finally {
      await own.context.close();
    }
  });

  // Редактировать можно ЛЮБОЙ пакет, не только созданный вручную: готовые — тоже
  // заготовки агентства. Проверяем весь цикл: объём → удаление → сохранение → карточка.
  await test("пакет редактируется целиком: объём, состав, сохранение", async () => {
    await page.evaluate(() => { window.app.go("packages"); window.app.openPackageEditModal("event_report_full"); });
    await page.waitForTimeout(300);

    const state = () => page.$eval(".modal-box", (b) => {
      const m = b.textContent.replace(/\s+/g, " ").match(/Состав \((\d+)\)\s*([\d\s]+)\s*₽/);
      return m ? { count: Number(m[1]), price: Number(m[2].replace(/\D/g, "")) } : null;
    });

    const head = await page.$eval(".modal-box h2", (h) => h.textContent.trim());
    assert(/Редактировать/.test(head), "готовый пакет открылся в режиме просмотра: " + head);
    assert(await page.$$eval(".modal-box button", (bs) => bs.some((b) => /Сохранить/.test(b.textContent))),
      "у готового пакета нет кнопки «Сохранить»");

    const before = await state();
    assert(before && before.price > 0, "не видно состава и цены пакета");

    await page.evaluate(() => { window.app.setPackageItemQty(0, 3); });
    await page.waitForTimeout(200);
    const withQty = await state();
    assert(withQty.price > before.price, `объём не поднял цену: ${before.price} → ${withQty.price}`);

    await page.evaluate(() => { window.app.removePackageItem(1); });
    await page.waitForTimeout(200);
    const afterDel = await state();
    assertEqual(afterDel.count, before.count - 1, "позиция не убралась из состава");
    assert(afterDel.price < withQty.price, "удаление позиции не удешевило пакет");

    await page.evaluate(() => { window.app.savePackageEdit(); });
    await page.waitForTimeout(300);
    const card = await page.evaluate(() => {
      window.app.go("packages");
      const el = document.querySelector("[onclick*='event_report_full']");
      const c = el && el.closest(".package-card");
      const m = c && c.textContent.replace(/\s+/g, " ").match(/([\d\s]+)\s*₽/);
      return m ? Number(m[1].replace(/\D/g, "")) : null;
    });
    assertEqual(card, afterDel.price, "правка пакета не доехала до карточки");
  });

  // Цена пакета считается из каталога, а не вписывается руками: раньше priceLabel жил
  // своей жизнью и у 27 пакетов расходился с составом в обе стороны (замер 28.07).
  // Проверяем три вещи разом: карточка = смета; правка цены услуги двигает пакет;
  // параметры строки в составе («полсмены») реально влияют на цену.
  await test("цена пакета считается по каталогу и следует за ценами услуг", async () => {
    const cardPrice = (pid) =>
      page.evaluate((id) => {
        window.app.go("packages");
        const el = document.querySelector("[onclick*='" + id + "']");
        const card = el && el.closest(".package-card");
        const m = card && card.textContent.replace(/\s+/g, " ").match(/([\d\s]+)\s*₽/);
        return m ? Number(m[1].replace(/\D/g, "")) : null;
      }, pid);
    const appliedPrice = async (pid) => {
      await page.evaluate((id) => { window.app.newProject(); window.app.applyPackage(id); window.app.go("deal"); }, pid);
      await page.waitForTimeout(250);
      return page.evaluate(() => {
        const t = document.getElementById("appContent").textContent.replace(/\s+/g, " ");
        const m = t.match(/([\d\s]+)\s*₽\s*\d+ позиц/);
        return m ? Number(m[1].replace(/\D/g, "")) : null;
      });
    };

    const halfCard = await cardPrice("event_report_half");
    const halfReal = await appliedPrice("event_report_half");
    assertEqual(halfCard, halfReal, "цена на карточке пакета разошлась с реальной сметой");

    const fullCard = await cardPrice("event_report_full");
    assert(fullCard > halfCard, `полная смена (${fullCard}) должна стоить дороже полусмены (${halfCard})`);

    // Правим ставку оператора вдвое — обе цены обязаны поехать, и по-разному:
    // полусмена дорожает на половинную ставку, полная — на полную.
    await page.evaluate(() => { window.app.updateCatalogPrice("event_cameraman", 12000); });
    await page.waitForSelector(".confirm-dialog-overlay", { timeout: 5000 });
    await page.click(".confirm-dialog-overlay .confirm-ok");
    await page.waitForTimeout(300);

    const halfAfter = await cardPrice("event_report_half");
    const fullAfter = await cardPrice("event_report_full");
    assert(halfAfter > halfCard, "цена пакета не изменилась после правки цены услуги");
    assert(fullAfter - fullCard > halfAfter - halfCard, "полсмены подорожали не меньше полной смены — параметры строки не учтены");
  });

  // Доска CRM держала в DOM карточки ВСЕХ сделок (замер: 12 745 узлов при 600),
  // «Сохранённые проекты» — тоже (76 285px высоты). Лимит канбана — на колонку:
  // срез поперёк колонок скрывал бы сделки непредсказуемо.
  await test("канбан CRM: колонка режет по 20 карточек + «показать ещё»", async () => {
    // К этому моменту предыдущий тест уже размножил сделки до ~35 штук; все копии
    // получают статус «Лид», то есть падают в одну колонку.
    const col = await page.evaluate(() => {
      window.app.go("crm");
      return null;
    });
    await page.waitForTimeout(250);
    const first = await page.evaluate(() => {
      const cols = [...document.querySelectorAll(".kanban-col")];
      const fullest = cols.map(c => ({
        count: c.querySelectorAll(".crm-card").length,
        pill: Number((c.querySelector(".pill-count") || {}).textContent || 0),
        more: !!c.querySelector("[onclick*='kanbanColShowMore']"),
      })).sort((a, b) => b.pill - a.pill)[0];
      return fullest;
    });
    assert(first && first.pill > 20, `нужна колонка с >20 сделками, максимум ${first && first.pill}`);
    assertEqual(first.count, 20, "в колонке должно быть отрисовано ровно 20 карточек, а не " + first.count);
    assert(first.more, "нет кнопки «Показать ещё» в переполненной колонке");

    // Счётчик в заголовке — про воронку целиком, он не должен схлопнуться до лимита.
    assert(first.pill > first.count, `счётчик колонки (${first.pill}) должен показывать все сделки, а не только отрисованные`);

    const grown = await page.evaluate(() => {
      const btn = document.querySelector("[onclick*='kanbanColShowMore']");
      btn.click();
      return null;
    });
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => {
      const cols = [...document.querySelectorAll(".kanban-col")];
      return Math.max(...cols.map(c => c.querySelectorAll(".crm-card").length));
    });
    assert(after > 20, `после «Показать ещё» карточек в колонке не прибавилось: 20 → ${after}`);
  });

  await test("«Сохранённые проекты»: пагинация по 24 + сброс лимита при смене фильтра", async () => {
    await page.evaluate(() => { window.app.setProjectFilter("all"); window.app.go("projects"); });
    await page.waitForTimeout(250);
    const first = await page.evaluate(() => ({
      cards: document.querySelectorAll(".project-card").length,
      more: !!document.querySelector("[onclick*='projectsShowMore']"),
      found: Number((document.querySelector('input[readonly]') || {}).value || 0),
    }));
    assertEqual(first.cards, 24, "на первой странице должно быть 24 карточки проектов, а не " + first.cards);
    assert(first.more, "нет кнопки «Показать ещё» в списке проектов");
    assert(first.found > 24, `счётчик «Найдено» должен считать все проекты (>24), а показал ${first.found}`);

    await page.evaluate(() => window.app.projectsShowMore());
    await page.waitForTimeout(200);
    const grown = await page.evaluate(() => ({
      cards: document.querySelectorAll(".project-card").length,
      more: !!document.querySelector("[onclick*='projectsShowMore']"),
    }));
    // Страница = 24, а сделок в этом прогоне ~35 — вторая страница показывает остаток.
    assertEqual(grown.cards, Math.min(48, first.found), `после «Показать ещё» показано ${grown.cards} из ${first.found}`);
    assert(!grown.more || first.found > 48, "остатка нет, а кнопка «Показать ещё» осталась");

    // Смена фильтра сужает выборку — лимит обязан вернуться к первой странице,
    // иначе кнопка осталась бы взведённой на прошлый набор (грабли каталога).
    await page.evaluate(() => window.app.setProjectFilter("Лид"));
    await page.waitForTimeout(220);
    const filtered = await page.evaluate(() => document.querySelectorAll(".project-card").length);
    assert(filtered <= 24, `после смены фильтра лимит не сбросился: ${filtered} карточек`);
    await page.evaluate(() => window.app.setProjectFilter("all"));
    await page.waitForTimeout(200);
  });

  await test("настройки: вкладки (Компания/Уведомления/Данные) рендерят свои секции", async () => {
    await page.evaluate(() => window.app.go("settings"));
    await page.waitForTimeout(150);
    const companyTab = await page.evaluate(() => /Компания/.test(document.getElementById("appContent").textContent));
    assert(companyTab, "вкладка «Компания» не активна по умолчанию в настройках");

    await page.evaluate(() => window.app._setSettingsTab("notify"));
    await page.waitForTimeout(150);
    const hasTelegram = await page.evaluate(() => /Уведомления \(Telegram\)/.test(document.getElementById("appContent").textContent));
    assert(hasTelegram, "нет вынесенной секции Telegram (renderSettingsTelegram) на вкладке «Уведомления»");

    await page.evaluate(() => window.app._setSettingsTab("data"));
    await page.waitForTimeout(150);
    const hasDanger = await page.evaluate(() => /Опасная зона/.test(document.getElementById("appContent").textContent));
    assert(hasDanger, "нет секции «Опасная зона» на вкладке «Данные»");
  });

  await test("confirmDialog: диалог с role=dialog; отмена бережёт данные, подтверждение сбрасывает", async () => {
    const before = await homeDealCount(page);
    assert(before > 0, "нет сделок для проверки сброса");
    // Открываем диалог сброса данных (resetAllData использует confirmDialog).
    // ВАЖНО: блочная стрелка без возврата промиса — иначе page.evaluate будет ЖДАТЬ
    // resolve resetAllData (который наступит только после клика ниже) → дедлок.
    await page.evaluate(() => { window.app.resetAllData(); });
    await page.waitForTimeout(70);
    const dlg = await page.evaluate(() => {
      const o = document.querySelector(".confirm-dialog-overlay");
      return {
        shown: !!o,
        role: o && o.getAttribute("role"),
        modal: o && o.getAttribute("aria-modal"),
        hasDanger: !!(o && o.querySelector(".btn.danger.confirm-ok")),
      };
    });
    assert(dlg.shown, "диалог подтверждения не появился");
    assertEqual(dlg.role, "dialog", "у диалога нет role=dialog");
    assertEqual(dlg.modal, "true", "нет aria-modal");
    assert(dlg.hasDanger, "нет опасной кнопки подтверждения");
    // Отмена — данные на месте.
    await page.evaluate(() => document.querySelector(".confirm-dialog-overlay .confirm-cancel").click());
    await page.waitForTimeout(90);
    const afterCancel = await homeDealCount(page);
    assertEqual(afterCancel, before, "после «Отмена» число сделок изменилось");
    // Подтверждение — сброс всех данных (тоже без возврата промиса — см. выше).
    await page.evaluate(() => { window.app.resetAllData(); });
    await page.waitForTimeout(70);
    await page.evaluate(() => document.querySelector(".confirm-dialog-overlay .confirm-ok").click());
    await page.waitForTimeout(140);
    const afterOk = await homeDealCount(page);
    assertEqual(afterOk, 0, "после подтверждения данные не сброшены");
  });


  // Второй уровень каталога. Подкатегории выводятся из item.category, но у трёх
  // групп все позиции лежат в ОДНОЙ категории (equipment / ai / expenses), поэтому
  // подкатегорий не выводилось вовсе и разделы на 9–14 позиций были сплошным
  // списком. Для них второй уровень берётся из тегов позиции.
  await test("каталог: у Оборудования, ИИ и Расходов есть подгруппы, и счётчики сходятся", async () => {
    await page.evaluate(() => window.app.go("catalog"));
    await page.waitForTimeout(300);
    for (const g of ["gear", "ai", "money"]) {
      await page.evaluate((gid) => window.app.toggleCatalogGroup(gid), g);
      await page.waitForTimeout(200);
    }
    const data = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll(".catalog-cat-item[data-group]").forEach((b) => {
        const gid = b.dataset.group;
        const size = +b.dataset.groupSize;
        const subs = [];
        let sib = b.nextElementSibling;
        if (sib && sib.tagName === "DIV") {
          sib.querySelectorAll("button").forEach((sb) => {
            const oc = sb.getAttribute("onclick") || "";
            const m = oc.match(/setTab\('([^']+)'\)/);
            const n = +(sb.querySelector(".catalog-cat-count")?.textContent || 0);
            subs.push({ tab: m ? m[1] : "", n });
          });
        }
        out[gid] = { size, subs };
      });
      return out;
    });
    for (const g of ["gear", "ai", "money"]) {
      const d = data[g];
      assert(d, `группа ${g} не отрисована`);
      assert(d.subs.length > 1, `у группы ${g} нет подгрупп (${d.subs.length})`);
      assert(d.subs.every((s) => s.tab.startsWith("sub:" + g + ":")), `подгруппы ${g} используют не sub:-вкладки`);
      const sum = d.subs.reduce((a, s) => a + s.n, 0);
      assertEqual(sum, d.size, `сумма подгрупп ${g} (${sum}) не равна размеру группы (${d.size}) — позиция потерялась`);
    }
  });

  await test("каталог: выбор подгруппы реально фильтрует список", async () => {
    await page.evaluate(() => window.app.go("catalog"));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.app.setTab("sub:gear:light"));
    await page.waitForTimeout(350);
    const names = await page.evaluate(() =>
      [...document.querySelectorAll(".catalog-grid .item")].map((c) => (c.textContent || "").trim())
    );
    assert(names.length > 0, "подгруппа «Свет» показала пустой список");
    assert(names.every((n) => /свет/i.test(n)), "в подгруппе «Свет» оказались посторонние позиции: " + names.map(n => n.slice(0, 24)).join(" | "));
  });

  // Свой раздел меню = внешняя ссылка. Протоколы кроме http(s) должны отсекаться:
  // иначе в меню можно вписать javascript:… и получить исполнение кода по клику.
  await test("меню: свой раздел принимает https и отвергает javascript:", async () => {
    await page.evaluate(() => {
      localStorage.removeItem("sidebar_nav_config");
      window.app.addCustomNavItem();
    });
    await answerPrompt(page, "Наш Drive");
    await answerPrompt(page, "drive.google.com/x");
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("sidebar_nav_config") || "[]")
      .filter((x) => String(x.id).startsWith("custom:")));
    assertEqual(before.length, 1, "свой раздел не сохранился");
    assertEqual(before[0].url, "https://drive.google.com/x", "ссылка без схемы не нормализовалась в https");

    await page.evaluate(() => { window.app.addCustomNavItem(); }); // без return: иначе evaluate ждёт ответа в диалоге
    await answerPrompt(page, "Злой");
    await answerPrompt(page, "javascript:alert(1)");
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("sidebar_nav_config") || "[]")
      .filter((x) => String(x.id).startsWith("custom:")));
    assertEqual(after.length, 1, "javascript:-ссылка попала в меню");
  });


  // «Настроить разделы» у каталога — тот же смысл, что «Настроить меню» у сайдбара.
  // Ключевой инвариант: скрытие убирает ПУНКТ НАВИГАЦИИ, но не сами услуги. Иначе
  // «скрыл раздел» молча означало бы «выкинул из сметы половину каталога».
  await test("каталог: скрытый раздел уходит из списка, но услуги остаются", async () => {
    await page.evaluate(() => window.app.go("catalog"));
    await page.waitForTimeout(300);
    const readGroups = () =>
      page.evaluate(() => [...document.querySelectorAll(".catalog-cat-item[data-group]")].map((b) => b.dataset.group));

    const before = await readGroups();
    assert(before.includes("ai"), "группы ИИ нет в исходном списке");

    const totalBefore = await page.evaluate(() => {
      window.app.setTab("all");
      return null;
    });
    await page.waitForTimeout(250);
    const countBefore = await page.evaluate(() => document.querySelectorAll(".catalog-grid .item").length);

    await page.evaluate(() => window.app.toggleCatalogGroupHidden("ai"));
    await page.waitForTimeout(350);

    const after = await readGroups();
    assert(!after.includes("ai"), "скрытая группа осталась в списке слева");

    await page.evaluate(() => window.app.setTab("all"));
    await page.waitForTimeout(300);
    const countAfter = await page.evaluate(() => document.querySelectorAll(".catalog-grid .item").length);
    assertEqual(countAfter, countBefore, "скрытие раздела убрало услуги из «Все» — должно убирать только пункт слева");

    await page.evaluate(() => window.app.toggleCatalogGroupHidden("ai"));
    await page.waitForTimeout(250);
    void totalBefore;
  });

  await test("каталог: свой раздел создаётся, наполняется и фильтрует", async () => {
    await page.evaluate(() => window.app.go("catalog"));
    await page.waitForTimeout(250);

    await page.evaluate(() => { window.app.addCustomCatalogGroup(); });
    await answerPrompt(page, "Мои хиты");
    const cg = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st.customCatalogGroups || [])[0];
    });
    assert(cg && cg.id.startsWith("cg:"), "свой раздел не создался");
    assertEqual(cg.label, "Мои хиты", "название своего раздела не сохранилось");

    await page.evaluate((id) => window.app.setItemCustomGroup("camera_basic", id), cg.id);
    await page.waitForTimeout(250);
    await page.evaluate((id) => window.app.setTab(id), cg.id);
    await page.waitForTimeout(350);

    const names = await page.evaluate(() =>
      [...document.querySelectorAll(".catalog-grid .item")].map((x) => (x.textContent || "").trim())
    );
    assertEqual(names.length, 1, "в своём разделе должна быть ровно одна назначенная услуга");
    assert(/Камера базовая/.test(names[0]), "в своём разделе не та услуга: " + names[0].slice(0, 40));

    // Удаление раздела не должно уносить услуги из каталога
    await page.evaluate((id) => {
      window.confirm = () => true;
      window.app.removeCustomCatalogGroup(id);
    }, cg.id);
    await page.waitForTimeout(350);
    const stillThere = await page.evaluate(() => {
      window.app.setTab("all");
      return null;
    });
    await page.waitForTimeout(300);
    const total = await page.evaluate(() => document.querySelectorAll(".catalog-grid .item").length);
    assert(total > 0, "после удаления своего раздела каталог опустел");
    void stillThere;
  });


  // ── Договоры ────────────────────────────────────────────────────────────────
  // Договор — это на 90% заполнение пропусков, поэтому редактор построен вокруг
  // них. Именованные {{поля}} заполняются формой и подстановкой из сделки,
  // свободные ___ — навигацией. Здесь проверяется, что подстановка реально
  // меняет текст, а не только рисует форму.
  await test("договоры: восемь шаблонов, включая акт, подряд и согласие на съёмку", async () => {
    await page.evaluate(() => window.app.go("contracts"));
    await page.waitForTimeout(300);
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll('[onclick*="createContractFromTemplate"]')]
        .map((el) => (el.getAttribute("onclick") || "").match(/createContractFromTemplate\('([^']+)'\)/))
        .filter(Boolean)
        .map((m) => m[1])
    );
    assert(ids.length >= 8, "шаблонов меньше восьми: " + ids.length);
    for (const need of ["tpl_act", "tpl_contractor", "tpl_release"]) {
      assert(ids.includes(need), "нет шаблона " + need);
    }
  });

  /* Автоподстановка в договор закрывала не всё, что уже известно приложению.
     Замер по восьми шаблонам: {{город}} не подставлялся НИ РАЗУ — карта брала его
     из company.city, а такого поля нет вовсе (в настройках компании есть адрес),
     при этом город лежит в самой сделке. Подсказка рядом honest-ли отправляла
     заполнять его в «Настройки → Компания», где искать нечего.
     {{срок оплаты}} спрашивали три шаблона из восьми, хотя условия оплаты человек
     уже написал в смете. Итог замера: ручных вопросов было 15, стало 8. */
  await test("договор: город и условия оплаты подставляются из сделки", async () => {
    await dismissStaleDialog(page);
    const left = await page.evaluate(() => {
      const st = () => JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      window.app.startWizard();
      window.app.wizardSetField("projectName", "Договор с городом");
      window.app.wizardSetField("budget", "150 000");
      window.app.finishWizard("estimate");
      window.app.updateProject("city", "Пермь");
      window.app.updateProject("paymentTerms", "100% предоплата");

      window.app.go("contracts");
      window.app.createContractFromTemplate("tpl_act");
      const c0 = (st().contracts || [])[0];
      window.app.autofillContract(c0.id);
      const c1 = (st().contracts || []).find((x) => x.id === c0.id);
      return { vars: window.app.contractVars(c1.body), body: c1.body };
    });

    assert(!left.vars.includes("город"), "город не подставился, хотя он есть в сделке: " + left.vars.join(", "));
    assert(!left.vars.includes("срок оплаты"), "условия оплаты из сметы не подставились: " + left.vars.join(", "));
    assert(/Пермь/.test(left.body), "города нет в тексте договора");
    assert(/100% предоплата/.test(left.body), "условий оплаты нет в тексте договора");
  });

  /* Договор «из сделки» — тот, который студия отправляет заказчику и подписывает.
     Осмотр глазами 23.08.2026 показал прочерки на месте ОБЕИХ сторон, пустой
     номер и странное «г. ______, до 2026-09-10» вместо даты.

     Корень: кнопка «Договор из сделки» подставляла данные ВТОРЫМ механизмом —
     заменами регулярками по тексту шаблона, мимо готового `{{…}}`. Замер по
     восьми шаблонам: маркеров `[ИСПОЛНИТЕЛЬ]` и `[ЗАКАЗЧИК]` нет НИ В ОДНОМ,
     то есть имена сторон не подставлялись никогда, а замена даты вписывала в
     место даты договора ДЕДЛАЙН проекта в машинном виде.

     Проверяем по СОДЕРЖИМОМУ документа, а не по механизму: как бы подстановка ни
     была устроена завтра, в договоре обязаны стоять обе стороны, номер и дата. */
  await test("договор из сделки: обе стороны, номер и дата — на месте", async () => {
    await dismissStaleDialog(page);
    const res = await page.evaluate(() => {
      const st = () => JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      window.app.updateCompany("name", "ООО «Полёт»");
      window.app.updateCompany("inn", "590000000000");
      window.app.updateCompany("phone", "+7 999 123-45-67");
      window.app.updateCompany("email", "hello@polet.ru");
      /* Идём шагами, как человек: клиента заводит переход с ПЕРВОГО шага
         (finishWizard берёт его только по готовому clientId), и без wizardNext
         сделка осталась бы вовсе без заказчика. */
      window.app.startWizard();
      window.app.wizardSetField("name", "Бренд «Вкус»");
      window.app.wizardNext();
      window.app.wizardSetField("projectName", "Ролик для бренда");
      window.app.wizardSetField("budget", "300 000");
      window.app.wizardNext();
      window.app.finishWizard("estimate");
      const projectId = st().activeProjectId;
      window.app.quickContractFromDeal(projectId);
      const c = (st().contracts || [])[0];
      return { body: c ? c.body : "", number: c ? c.number : "" };
    });
    await page.waitForTimeout(250);

    assert(res.body, "договор из сделки не создался");
    assert(
      res.body.includes("ООО «Полёт»"),
      "исполнителя нет в договоре — стороны снова не подставляются"
    );
    assert(
      res.body.includes("Бренд «Вкус»"),
      "заказчика нет в договоре — стороны снова не подставляются: " + (res.body.match(/и .{0,50}именуемый/) || ["—"])[0]
    );
    assert(
      res.number && res.body.includes(res.number),
      `номер договора (${res.number}) не попал в текст — в шапке он есть, а в самом договоре прочерк`
    );
    // Дата договора — сегодняшняя и человеческая. Дедлайн проекта тут не при чём.
    assert(
      /«\d{2}\.\d{2}\.\d{4}»/.test(res.body),
      "в месте даты договора нет обычной даты: " + (res.body.match(/г\. .{0,40}/) || ["—"])[0]
    );
    assert(
      !/до \d{4}-\d{2}-\d{2}/.test(res.body),
      "в дату договора снова вписан дедлайн проекта в машинном виде"
    );
    // Реквизиты сторон: то, что продукт знает, печатается, а не спрашивается ручкой.
    assert(res.body.includes("590000000000"), "ИНН студии не попал в реквизиты договора");
    assert(res.body.includes("hello@polet.ru"), "почта студии не попала в реквизиты договора");
  });

  /* Акт — закрывающий документ: по нему подписывают окончательный расчёт, и он
     ССЫЛАЕТСЯ на договор. Токены «номер» и «номер договора» брались из одного
     поля — номера самого акта, — и печаталось «АКТ № 2026-002 к Договору
     № 2026-002», хотя договор был 2026-001. Договора с таким номером не
     существует: бухгалтерия заказчика такой документ вернёт. */
  await test("акт ссылается на номер ДОГОВОРА, а не на собственный", async () => {
    await dismissStaleDialog(page);
    const res = await page.evaluate(() => {
      const st = () => JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      window.app.startWizard();
      window.app.wizardSetField("name", "Клиент Актов");
      window.app.wizardNext();
      window.app.wizardSetField("projectName", "Проект с актом");
      window.app.wizardNext();
      window.app.finishWizard("estimate");

      // Сначала договор по сделке, потом акт к нему — как в жизни.
      window.app.quickContractFromDeal(st().activeProjectId);
      const contract = (st().contracts || [])[0];
      window.app.go("contracts");
      window.app.createContractFromTemplate("tpl_act");
      const act0 = (st().contracts || [])[0];
      window.app.autofillContract(act0.id);
      const act = (st().contracts || []).find((x) => x.id === act0.id);
      return { contractNumber: contract.number, actNumber: act.number, actBody: act.body };
    });
    await page.waitForTimeout(250);

    assert(res.contractNumber && res.actNumber, "не создались договор и акт");
    assert(
      res.contractNumber !== res.actNumber,
      "акт получил тот же номер, что и договор: " + res.actNumber
    );
    const ref = (res.actBody.match(/к Договору № ([^\s]+)/) || [])[1];
    assertEqual(
      ref, res.contractNumber,
      `акт ссылается на «${ref}» вместо номера договора ${res.contractNumber}`
    );
    assert(
      res.actBody.includes("АКТ № " + res.actNumber),
      "у акта пропал собственный номер"
    );
  });

  /* Тот же класс во ВСЕХ местах, а не в одном. Кнопка «Договор из сделки» всегда
     берёт шаблон видеопроизводства, но остальные четыре клиентских договора
     (фото, мероприятие, абонентский, свадебный) человек создаёт из списка
     шаблонов — и там подстановке было НЕ ЗА ЧТО зацепиться: замер 23.08.2026
     дал 0 токенов и 22–39 прочерков на шаблон, тогда как служебные (акт,
     подрядчик, релиз) имели по 11–16 токенов.

     Проверяем циклом: любой клиентский договор после «Подставить из сделки»
     обязан знать обе стороны и свой номер. Список — источник правды: появится
     шестой шаблон, он сюда впишется. */
  await test("договоры: подстановка работает во ВСЕХ клиентских шаблонах, а не только в видео", async () => {
    await dismissStaleDialog(page);
    const res = await page.evaluate(() => {
      const st = () => JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      window.app.updateCompany("name", "ООО «Полёт»");
      window.app.startWizard();
      window.app.wizardSetField("name", "Пётр Заказчиков");
      window.app.wizardNext();
      window.app.wizardSetField("projectName", "Съёмка по шаблонам");
      window.app.wizardNext();
      window.app.finishWizard("estimate");

      const out = [];
      for (const tpl of ["tpl_video", "tpl_photo", "tpl_event", "tpl_retainer", "tpl_wedding"]) {
        window.app.go("contracts");
        window.app.createContractFromTemplate(tpl);
        const c0 = (st().contracts || [])[0];
        window.app.autofillContract(c0.id);
        const c1 = (st().contracts || []).find((x) => x.id === c0.id);
        out.push({
          tpl,
          hasExec: (c1.body || "").includes("ООО «Полёт»"),
          hasClient: (c1.body || "").includes("Пётр Заказчиков"),
          hasNumber: !!c1.number && (c1.body || "").includes(c1.number),
        });
      }
      return out;
    });
    await page.waitForTimeout(250);

    const badExec = res.filter((r) => !r.hasExec).map((r) => r.tpl);
    const badClient = res.filter((r) => !r.hasClient).map((r) => r.tpl);
    const badNumber = res.filter((r) => !r.hasNumber).map((r) => r.tpl);
    assertEqual(badExec.length, 0, "исполнитель не подставился в шаблоны: " + badExec.join(", "));
    assertEqual(badClient.length, 0, "заказчик не подставился в шаблоны: " + badClient.join(", "));
    assertEqual(badNumber.length, 0, "номер договора не попал в текст шаблонов: " + badNumber.join(", "));
  });

  /* Последняя непроверенная пара «свой экран ↔ экран заказчика»: договор в
     редакторе против того, что уходит на печать и на подпись. В коде это заявлено
     принципом — подстановка идёт НЕОБРАТИМО в текст именно затем, чтобы правишь и
     подписываешь одно и то же, — но проверено до сих пор не было.

     Сверяем тело символ в символ, включая переносы строк (в печати они значимы:
     .doc-body держит white-space: pre-wrap), и заодно ловим самое обидное — уход
     клиенту незаполненного {{поля}}. */
  await test("договор: на печать уходит ровно то, что в редакторе", async () => {
    await dismissStaleDialog(page);
    const made = await page.evaluate(() => {
      window.app.go("contracts");
      window.app.createContractFromTemplate("tpl_act");
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (st.contracts || [])[0];
      return { id: c.id };
    });
    await page.waitForTimeout(250);

    // Заполняем ВСЕ именованные поля: незаполненные вызывают вопрос перед печатью,
    // а нам нужен обычный путь — «всё готово, печатаем».
    const body = await page.evaluate((id) => {
      const st = () => JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      let guard = 0;
      while (guard++ < 40) {
        const c = (st().contracts || []).find((x) => x.id === id);
        const vars = window.app.contractVars(c.body);
        if (!vars.length) break;
        window.app.fillContractVar(id, vars[0], "ЗНАЧЕНИЕ-" + guard);
      }
      const c = (st().contracts || []).find((x) => x.id === id);
      return c.body;
    }, made.id);
    assert(body && !/\{\{/.test(body), "не удалось заполнить поля договора: " + String(body).slice(0, 120));

    const printed = await page.evaluate((id) => {
      let html = "";
      const realOpen = window.open;
      window.open = () => ({
        document: { write: (s) => { html += s; }, close: () => {}, readyState: "complete" },
        addEventListener: () => {}, focus: () => {}, print: () => {}, close: () => {},
      });
      try { window.app.printContract(id); } catch (e) { html = "ОШИБКА: " + e.message; }
      window.open = realOpen;
      return html;
    }, made.id);
    assert(printed && !/^ОШИБКА/.test(printed), "печать договора не сформировалась: " + printed);

    // Достаём тело из печатной версии и снимаем экранирование — сравнивать нужно
    // текст, а не разметку.
    const printedBody = await page.evaluate((html) => {
      const m = html.match(/<div class="doc-body">([\s\S]*?)<\/div>/);
      if (!m) return null;
      const d = document.createElement("div");
      d.innerHTML = m[1];
      return d.textContent;
    }, printed);

    assert(printedBody !== null, "в печатной версии нет тела договора");
    assertEqual(printedBody, body, "текст договора на печати отличается от редактора");
    assert(!/\{\{[^}]+\}\}/.test(printedBody), "в печать ушло незаполненное поле {{…}}");
    assert(/ЗНАЧЕНИЕ-1/.test(printedBody), "подставленные значения не доехали до печати");
  });

  /* Восстановление из файла (Настройки → Данные → «Импорт JSON») заменяло состояние
     ЦЕЛИКОМ и без единого вопроса. Два следствия:

       • настройка, которой в файле нет, молча возвращалась к дефолту. Файл, снятый
         до появления настройки, гасил её: publicCalcEnabled по умолчанию false —
         скорее всего, так и погас публичный калькулятор на проде (проверено SQL
         19.08: флаг false, хотя владелец его включал);
       • перепутать бэкап с экспортом каталога легко (кнопки стоят рядом), а такой
         файл не содержит savedProjects — то есть один клик стирал все сделки.

     Проверяем шов: слияние делает _importKeepKeys + сам путь importDataFromFile. */
  await test("импорт: настройки, которых нет в файле, не сбрасываются", async () => {
    const res = await page.evaluate(async () => {
      // Готовим аккаунт: включённая витрина расчёта и заполненный профиль.
      window.app.updateCompany("name", "Студия Пример");
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      // Шов может отсутствовать (старый код) — тест обязан дойти до проверок поведения
      // и упасть на них, а не на отсутствии функции: иначе он охраняет наличие шва.
      const keep = window.app._importKeepKeys ? window.app._importKeepKeys() : [];

      // Файл-бэкап СТАРОГО образца: сделки есть, настроек нет вовсе.
      const backup = { savedProjects: [], clients: [{ id: "c1", name: "Из файла" }] };
      const file = new File([JSON.stringify(backup)], "backup.json", { type: "application/json" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById("importJsonInput");
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));

      // Диалог подтверждения обязателен — иначе замена уже произошла бы.
      await new Promise((r) => setTimeout(r, 300));
      const dialog = document.querySelector(".confirm-dialog-overlay");
      const asked = !!dialog;
      const msg = dialog ? (dialog.textContent || "") : "";
      if (dialog) dialog.querySelector(".confirm-ok").click();
      await new Promise((r) => setTimeout(r, 400));

      const after = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return {
        asked,
        msg,
        keep,
        hadName: (st.company || {}).name,
        nameAfter: (after.company || {}).name,
        clientsAfter: (after.clients || []).map((c) => c.name),
      };
    });

    assert(res.asked, "импорт заменил данные без подтверждения — один клик стирает всё");
    assert(res.msg.includes("клиентов"),
      "в подтверждении нет цифр из файла: человек соглашается вслепую — " + res.msg.slice(0, 120));
    assertEqual(res.nameAfter, "Студия Пример",
      "профиль компании сброшен файлом, в котором его не было (было «" + res.hadName + "»)");
    assert(res.clientsAfter.includes("Из файла"),
      "данные из файла не применились вовсе: " + JSON.stringify(res.clientsAfter));
    assert(res.keep.includes("publicCalcEnabled") && res.keep.includes("company"),
      "из списка защищаемых ключей пропали настройки: " + res.keep.join(", "));
  });

  /* Список защищаемых ключей легко написать наугад — я и написал: в первой версии
     пять имён из восьми (notifySettings, telegram, calendarFeedToken, accent,
     navOrder) в состоянии не существовали, и защита была декоративной. Ключ, которого
     нет, не падает и не логируется — ровно тот класс, что сторож «мёртвых ссылок». */
  await test("импорт: защищаются только существующие ключи состояния", async () => {
    const bad = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      if (!window.app._importKeepKeys) return ["__нет шва _importKeepKeys__"];
      return window.app._importKeepKeys().filter((k) => !(k in st));
    });
    assertEqual(bad.length, 0,
      "в списке защищаемых ключей есть несуществующие: " + bad.join(", "));
  });

  await test("договоры: подстановка из сделки заполняет поля и убирает их из формы", async () => {
    // Сначала открываем сделку: привязка берётся из НЕЁ, и без открытой сделки
    // пустой dealId — правильное поведение, а не баг. Сделку заводим свою, а не
    // берём демо-сделку из bootLocal: предыдущие тесты набора её удаляют, и тест
    // падал бы от порядка выполнения, а не от регрессии.
    const dealId = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const existing = ((st.savedProjects || [])[0] || {}).id;
      if (existing) return existing;
      window.app.seedDemoDeal();
      const st2 = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return ((st2.savedProjects || [])[0] || {}).id || "";
    });
    assert(dealId, "не удалось получить сделку для проверки привязки");
    await page.evaluate((id) => window.app.loadSavedProject(id), dealId);
    await page.waitForTimeout(300);

    const res = await page.evaluate(() => {
      // Профиль компании у нового аккаунта пуст (имя сервиса больше не выдаётся за
      // имя студии — правка 18.08), а {{исполнитель}} подставляется именно из него.
      window.app.updateCompany("name", "Студия Пример");
      window.app.go("contracts");
      window.app.createContractFromTemplate("tpl_act");
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (st.contracts || [])[0];
      return { id: c.id, before: window.app.contractVars(c.body).length, dealId: c.dealId || "" };
    });
    assert(res.before > 5, "в акте должно быть больше пяти именованных полей, найдено " + res.before);
    assertEqual(res.dealId, dealId, "договор из шаблона не привязался к открытой сделке — подставлять будет нечего");

    const after = await page.evaluate((id) => {
      window.app.autofillContract(id);
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (st.contracts || []).find((x) => x.id === id);
      return { left: window.app.contractVars(c.body).length, body: c.body };
    }, res.id);
    assert(after.left < res.before, `подстановка ничего не заполнила: было ${res.before}, стало ${after.left}`);
    assert(!/\{\{исполнитель\}\}/.test(after.body), "{{исполнитель}} остался незаполненным после подстановки");
  });

  await test("договоры: ручное заполнение подставляет значение во ВСЕ вхождения", async () => {
    const r = await page.evaluate(() => {
      window.app.createContractFromTemplate("tpl_release");
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (st.contracts || [])[0];
      const occurrences = (c.body.match(/\{\{фио\}\}/g) || []).length;
      return { id: c.id, occurrences };
    });
    assert(r.occurrences >= 2, "в согласии {{фио}} должно встречаться минимум дважды, найдено " + r.occurrences);

    const after = await page.evaluate((id) => {
      window.app.fillContractVar(id, "фио", "Иванов Иван Иванович");
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (st.contracts || []).find((x) => x.id === id);
      return {
        left: (c.body.match(/\{\{фио\}\}/g) || []).length,
        filled: (c.body.match(/Иванов Иван Иванович/g) || []).length,
      };
    }, r.id);
    assertEqual(after.left, 0, "остались незаполненные {{фио}}");
    assertEqual(after.filled, r.occurrences, "значение подставилось не во все места");
  });

  // Раньше текст уходил в state только по onchange, то есть при уходе фокуса:
  // набрал договор, закрыл вкладку не кликнув мимо — потерял всё.
  await test("договоры: текст сохраняется во время набора, без ухода фокуса", async () => {
    const id = await page.evaluate(() => {
      window.app.createContractFromTemplate("tpl_act");
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st.contracts || [])[0].id;
    });
    await page.evaluate((cid) => window.app.contractBodyInput(cid, "ЧЕРНОВИК ДОГОВОРА"), id);
    await page.waitForTimeout(900); // дебаунс 600 мс
    const saved = await page.evaluate((cid) => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st.contracts || []).find((x) => x.id === cid).body;
    }, id);
    assertEqual(saved, "ЧЕРНОВИК ДОГОВОРА", "набранный текст не сохранился без ухода фокуса");
  });


  // Пяти встроенных типов брифа хватает не всем: студия может вести отдельную
  // форму под «Свадьбу» или «Маркетплейс». Сам раздел «Онлайн-брифы» в тестовом
  // режиме показывает скелетон (загрузка заявок требует сессии Supabase), поэтому
  // проверяем модель: тип заводится, попадает в общий список и удаляется.
  await test("брифы: свой тип создаётся, попадает в список типов и удаляется", async () => {
    await page.evaluate(() => { window.app.addCustomBriefType(); });
    await answerPrompt(page, "Свадьба");
    const created = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return st.customBriefTypes || [];
    });
    assertEqual(created.length, 1, "свой тип брифа не создался");
    assert(created[0].id.startsWith("own_"), "у своего типа неожиданный id: " + created[0].id);
    assertEqual(created[0].label, "Свадьба", "название своего типа не сохранилось");

    const removed = await page.evaluate((id) => {
      window.confirm = () => true;
      window.app.removeCustomBriefType(id);
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st.customBriefTypes || []).length;
    }, created[0].id);
    assertEqual(removed, 0, "свой тип брифа не удалился");
  });


  // ── Ввод даты и денег ───────────────────────────────────────────────────────
  // У <input type="date"> событие change срабатывает на КАЖДОМ полном валидном
  // значении, а поле предзаполнено — значит на каждую введённую цифру. Мастер
  // звал на change полный render(), инпут пересоздавался, и редактируемый
  // сегмент сбрасывался: дату нельзя было допечатать.
  await test("мастер: поле даты не теряет фокус на изменении (можно допечатать)", async () => {
    await page.evaluate(() => window.app.startWizard());
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const i = document.querySelector("#appContent input");
      if (i) { i.value = "Тест"; i.dispatchEvent(new Event("input", { bubbles: true })); }
      const next = [...document.querySelectorAll("button")].find(b => /Далее/.test(b.textContent));
      if (next) next.click();
    });
    await page.waitForTimeout(350);

    // Порядок сегментов у <input type="date"> задаёт ЛОКАЛЬ браузера: у нас
    // ДД.ММ.ГГГГ, на раннере CI (en-US) — ММ/ДД/ГГГГ. Поэтому набор цифр
    // клавиатурой проверять нельзя — тест был бы зелёным локально и красным в CI.
    // Проверяем саму регрессию: change на поле даты НЕ должен выбивать фокус.
    // Раньше мастер звал на change полный render(), инпут пересоздавался, фокус
    // улетал в body — и дату нельзя было допечатать до конца.
    await page.focus("#wizDeadline");
    const res = await page.evaluate(() => {
      const el = document.querySelector("#wizDeadline");
      el.value = "2026-07-24";
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        focused: document.activeElement ? document.activeElement.id : null,
        value: document.querySelector("#wizDeadline").value,
      };
    });
    assertEqual(res.focused, "wizDeadline", "фокус слетел с поля даты — дату нельзя допечатать");
    assertEqual(res.value, "2026-07-24", "введённая дата не удержалась в поле");

    const inState = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st.wizard || {}).deadline;
    });
    void inState; // черновик мастера фиксируется на шаге «Далее», не на каждый ввод
  });

  await test("мастер: бюджет показывается с разделением разрядов", async () => {
    await page.focus("#wizBudget");
    await page.keyboard.type("150000");
    await page.waitForTimeout(150);
    const shown = await page.evaluate(() => document.querySelector("#wizBudget").value);
    assertEqual(shown, "150 000", "бюджет без группировки разрядов: " + shown);
  });

  // ── Перетаскивание карточек сделок ──────────────────────────────────────────
  // Ручной порядок = порядок state.savedProjects, поэтому он виден ТОЛЬКО в
  // сортировке «по умолчанию». В остальных режимах карточку можно было бы
  // отпустить, но список тут же пересортировался бы обратно.
  await test("главная: карточка тащится из любой точки, порядок сохраняется", async () => {
    const ids = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const id = (st.savedProjects || [])[0] && (st.savedProjects || [])[0].id;
      if (!id) return null;
      if ((st.savedProjects || []).length < 3) {
        window.app.duplicateSavedProject(id);
        window.app.duplicateSavedProject(id);
      }
      const st2 = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st2.savedProjects || []).map((p) => p.id);
    });
    assert(ids && ids.length >= 3, "нужно минимум три сделки для проверки порядка");

    await page.evaluate(() => { window.app.setCrmView("grid"); window.app.setCrmSort("default"); window.app.go("home"); });
    await page.waitForTimeout(400);
    // Карточки лежат ниже сгиба — без прокрутки события мыши до них не доходят
    // и перетаскивание «не работает», хотя код исправен.
    await page.evaluate(() => document.querySelector(".deal-card").scrollIntoView({ block: "center" }));
    await page.waitForTimeout(250);

    const before = await page.evaluate(() =>
      [...document.querySelectorAll(".deal-card")]
        .map((c) => c.getAttribute("data-deal-id")));
    const box = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".deal-card")];
      const a = cards[0].getBoundingClientRect();
      const b = cards[2].getBoundingClientRect();
      // Берём за ЗАГОЛОВОК — точка заведомо не на кнопке внутри карточки.
      return { from: { x: a.left + 60, y: a.top + 26 }, to: { x: b.left + b.width * 0.75, y: b.top + b.height / 2 } };
    });

    await page.mouse.move(box.from.x, box.from.y);
    await page.mouse.down();
    await page.mouse.move(box.from.x + 14, box.from.y + 5, { steps: 3 });
    await page.waitForTimeout(120);

    const mid = await page.evaluate(() => ({
      placeholder: document.querySelectorAll(".deal-card-placeholder").length,
      flying: document.querySelectorAll(".deal-card-flying").length,
      body: document.body.classList.contains("is-dragging-card"),
    }));
    assertEqual(mid.placeholder, 1, "на месте карточки не появилось серое пятно");
    assertEqual(mid.flying, 1, "за указателем не поехал клон карточки");
    assertEqual(mid.body, true, "не выставлен режим перетаскивания на body");

    await page.mouse.move(box.to.x, box.to.y, { steps: 10 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = await page.evaluate(() =>
      [...document.querySelectorAll(".deal-card")]
        .map((c) => c.getAttribute("data-deal-id")));
    assert(after[0] !== before[0], "порядок не изменился после переноса");
    assertEqual(after.length, before.length, "перетаскивание изменило число карточек");

    const clean = await page.evaluate(() => ({
      placeholder: document.querySelectorAll(".deal-card-placeholder").length,
      flying: document.querySelectorAll(".deal-card-flying").length,
      body: document.body.classList.contains("is-dragging-card"),
    }));
    assertEqual(clean.placeholder + clean.flying, 0, "после отпускания остался мусор в DOM");
    assertEqual(clean.body, false, "режим перетаскивания не снят с body");
  });

  // Клик по карточке — основное действие (открыть смету). Порог в 6px существует
  // ровно для того, чтобы обычный клик не превращался в перенос. Поскольку клик
  // теперь УВОДИТ в смету, порядок читаем, вернувшись на главную.
  await test("главная: клик по карточке без движения не меняет порядок", async () => {
    await page.evaluate(() => document.querySelector(".deal-card").scrollIntoView({ block: "center" }));
    await page.waitForTimeout(200);
    const read = () => page.evaluate(() =>
      [...document.querySelectorAll(".deal-card")]
        .map((c) => c.getAttribute("data-deal-id")));
    const before = await read();
    const pt = await page.evaluate(() => {
      const r = document.querySelector(".deal-card").getBoundingClientRect();
      return { x: r.left + 60, y: r.top + 26 };
    });
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(350);
    const opened = await page.evaluate(() => !!document.querySelector(".deal-layout"));
    assert(opened, "клик по карточке должен открывать смету");
    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(300);
    assertEqual(JSON.stringify(await read()), JSON.stringify(before), "простой клик переставил карточки");
  });

  await test("главная: при сортировке «по сумме» перетаскивание выключено", async () => {
    await page.evaluate(() => { window.app.setCrmView("grid"); window.app.setCrmSort("amount"); window.app.go("home"); });
    await page.waitForTimeout(350);
    const off = await page.evaluate(() =>
      [...document.querySelectorAll(".deal-card")].filter((c) => c.hasAttribute("onpointerdown")).length);
    assertEqual(off, 0, "карточки перетаскиваемы в режиме сортировки — порядок тут же вернулся бы обратно");

    await page.evaluate(() => { window.app.setCrmSort("default"); window.app.go("home"); });
    await page.waitForTimeout(350);
    const on = await page.evaluate(() =>
      [...document.querySelectorAll(".deal-card")].filter((c) => c.hasAttribute("onpointerdown")).length);
    assert(on > 0, "в сортировке «по умолчанию» карточки должны быть перетаскиваемы");
  });

  // ── Статьи финансов ─────────────────────────────────────────────────────────
  await test("финансы: статьи добавляются, переименовываются и не ломают операции", async () => {
    await page.evaluate(() => { window.app.addFinanceArticle("payment"); });
    await answerPrompt(page, "Ретейнер");
    const added = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st.financeArticles || {}).payment || [];
    });
    assert(added.includes("Ретейнер"), "своя статья не добавилась: " + JSON.stringify(added));
    assert(added.includes("Предоплата"), "встроенные статьи пропали при добавлении своей");

    await page.evaluate(() => { window.app.renameFinanceArticle("payment", 0); });
    await answerPrompt(page, "Аванс");
    const renamed = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st.financeArticles || {}).payment || [];
    });
    assertEqual(renamed[0], "Аванс", "статья не переименовалась");

    const reset = await page.evaluate(() => {
      window.confirm = () => true;
      window.app.resetFinanceArticles("payment");
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st.financeArticles || {}).payment;
    });
    assert(!reset || !reset.length, "сброс не вернул встроенный набор");
  });

  // ── Дата операции в будущем ─────────────────────────────────────────────────
  // Деньги отмечают по факту. Молча принятая будущая дата портит отчёт за месяц
  // и задолженность, а заметить это можно спустя недели.
  await test("финансы: дата операции в будущем требует подтверждения", async () => {
    // Всё одним evaluate и БЕЗ доведения сохранения до конца: подтверждаем отказом
    // (confirm → false), иначе тест дописал бы лишнюю операцию в финансы, а
    // следующие проверки считали бы суммы уже с ней.
    const res = await page.evaluate(() => {
      const out = {};
      window.app.openFinanceModal("payment");
      window.app.setFinanceModalField("amount", "5000");

      window.confirm = (m) => { out.future = m; return false; };
      window.app.setFinanceModalField("date", new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));
      window.app.saveFinanceModal();

      out.today = null;
      window.confirm = (m) => { out.today = m; return false; };
      window.app.setFinanceModalField("date", new Date().toISOString().slice(0, 10));
      window.app.saveFinanceModal();

      window.app.closeFinanceModal();
      return out;
    });
    assert(res.future && /вперёд/.test(res.future), "будущая дата прошла без предупреждения: " + res.future);
    assertEqual(res.today, null, "сегодняшняя дата не должна ничего спрашивать");
  });

  // ── Каталог: раздел «Дизайн и сайты» ────────────────────────────────────────
  await test("каталог: раздел «Дизайн и сайты» есть, счётчики подгрупп сходятся", async () => {
    await page.evaluate(() => window.app.go("catalog"));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.app.toggleCatalogGroup("web"));
    await page.waitForTimeout(250);
    const d = await page.evaluate(() => {
      const btn = document.querySelector('.catalog-cat-item[data-group="web"]');
      if (!btn) return null;
      const subs = [];
      const sib = btn.nextElementSibling;
      if (sib && sib.tagName === "DIV") {
        sib.querySelectorAll("button").forEach((b) =>
          subs.push(+(b.querySelector(".catalog-cat-count") || {}).textContent || 0));
      }
      return { size: +btn.dataset.groupSize, subs };
    });
    assert(d, "раздела «Дизайн и сайты» нет в каталоге");
    assert(d.size >= 10, "в разделе меньше десяти позиций: " + d.size);
    assert(d.subs.length > 1, "у раздела нет подгрупп");
    assertEqual(d.subs.reduce((a, b) => a + b, 0), d.size, "сумма подгрупп не равна размеру раздела");
  });

  // ── Каталог не пополняется сам собой ────────────────────────────────────────
  // Свои позиции лежат в state.customItems, а он целиком копируется в снимок
  // КАЖДОЙ сделки. Пока снимок вливался в каталог целиком, удалённая позиция
  // возвращалась при переходе в любую сделку, которая её когда-то знала, — со
  // стороны это выглядело как «услуги в „Свои“ создаются сами».
  await test("каталог: удалённая своя позиция не возвращается при переходе по сделкам", async () => {
    const ids = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const first = (st.savedProjects || [])[0];
      if (!first) return null;
      if ((st.savedProjects || []).length < 2) window.app.duplicateSavedProject(first.id);
      const st2 = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st2.savedProjects || []).map((p) => p.id);
    });
    assert(ids && ids.length >= 2, "нужно минимум две сделки");

    const свои = () => page.evaluate(() => {
      window.app.setTab("custom");
      window.app.go("services");
      return null;
    }).then(() => page.waitForTimeout(300)).then(() => page.evaluate(() =>
      +((document.querySelector(".catalog-found-count") || {}).textContent || "0").replace(/\D+/g, "")));

    // Сделка A: своя позиция попадает в смету и в снимок
    await page.evaluate((id) => window.app.selectActiveDeal(id), ids[0]);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.app.createCustomItem();
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      window.app.addItem(st.customItems[0].id);
      window.app.saveCurrentProject();
    });
    await page.waitForTimeout(300);
    assertEqual(await свои(), 1, "своя позиция не появилась во вкладке «Свои»");

    // Удаляем её, находясь в ДРУГОЙ сделке — снимок A остаётся со старым составом
    await page.evaluate((id) => window.app.selectActiveDeal(id), ids[1]);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      window.app.deleteCustomItem((st.customItems.find((x) => x.category === "custom") || {}).id);
    });
    await page.waitForTimeout(300);
    assertEqual(await свои(), 0, "позиция не удалилась из каталога");

    await page.evaluate((id) => window.app.selectActiveDeal(id), ids[0]);
    await page.waitForTimeout(300);
    assertEqual(await свои(), 0, "удалённая позиция вернулась в каталог после перехода в сделку");
  });

  await test("каталог: копия строки сметы не становится карточкой каталога", async () => {
    const до = await page.evaluate(() => {
      window.app.setTab("all");
      window.app.go("services");
      return null;
    }).then(() => page.waitForTimeout(300)).then(() => page.evaluate(() =>
      +((document.querySelector(".catalog-found-count") || {}).textContent || "0").replace(/\D+/g, "")));

    const ok = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const id = Object.keys(st.selected || {})[0];
      if (!id) return false;
      window.app.duplicateEstimateLine(id);
      window.app.catalogAddOne(id);
      return true;
    });
    assert(ok, "в смете нет ни одной строки для дублирования");
    await page.waitForTimeout(300);

    const после = await page.evaluate(() => {
      window.app.setTab("all");
      window.app.go("services");
      return null;
    }).then(() => page.waitForTimeout(300)).then(() => page.evaluate(() =>
      +((document.querySelector(".catalog-found-count") || {}).textContent || "0").replace(/\D+/g, "")));
    assertEqual(после, до, "каталог вырос после дублирования строк сметы: " + до + " → " + после);
  });

  // ── Выбор клиента в мастере и раскладки на «Клиентах» ───────────────────────
  await test("мастер: выбор клиента из базы ищется, а статусы не висят пилюлями", async () => {
    await dismissStaleDialog(page);
    // Клиенты добавляются по одному: saveClientModal асинхронна, и пачкой в одном
    // evaluate вызовы переплетаются и упираются в диалог «Возможный дубль».
    const люди = [["Шахзод", "Ск Ферма"], ["Оськина Ксения", "Freedom"], ["Никита Юткин", "ROCKSTAR"],
      ["Рома Черемных", "Загадкино"], ["Саша Спиридонова", "Битва Роботов"]];
    for (let i = 0; i < люди.length; i++) {
      await page.evaluate(async ([name, company, phone]) => {
        window.app.openClientModal("");
        window.app.setClientModalField("name", name);
        window.app.setClientModalField("company", company);
        window.app.setClientModalField("phone", phone);
        await window.app.saveClientModal();
      }, [люди[i][0], люди[i][1], "+7 93" + i + " 111-22-3" + i]);
      await page.waitForTimeout(60);
    }

    await page.evaluate(() => { window.app.startWizard(); });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.app.wizardSetData("clientMode", "existing"));
    await page.waitForTimeout(250);

    const было = await page.evaluate(() => ({
      строк: document.querySelectorAll(".client-select-item").length,
      поиск: !!document.getElementById("wzClientSearch"),
      // «active»/«paused» по-английски читались как непонятные кнопки — их быть не должно
      пилюли: document.querySelectorAll(".client-select-item .status-pill").length,
    }));
    assert(было.строк >= 5, "в списке меньше пяти клиентов: " + было.строк);
    assert(было.поиск, "в мастере нет поиска по базе клиентов");
    assertEqual(было.пилюли, 0, "в списке снова висят пилюли со статусом");

    await page.fill("#wzClientSearch", "Шах");
    await page.waitForTimeout(400);
    const найдено = await page.evaluate(() =>
      [...document.querySelectorAll(".client-select-item strong")].map((e) => e.textContent.trim()));
    assertEqual(найдено.join("|"), "Шахзод", "поиск по базе не отфильтровал список: " + найдено.join("|"));

    await page.click(".client-select-item");
    await page.waitForTimeout(250);
    assertEqual(await page.evaluate(() => document.querySelectorAll(".client-select-item.selected").length), 1,
      "клик по строке не выбрал клиента");

    await page.evaluate(() => window.app.cancelWizard());
    await page.waitForTimeout(200);
  });

  await test("клиенты: переключатель плитка/список меняет раскладку", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => { window.app.setClientsView("grid"); window.app.go("clients"); });
    await page.waitForTimeout(300);
    const плитка = await page.evaluate(() => ({
      карточек: document.querySelectorAll(".client-card").length,
      строк: document.querySelectorAll(".client-list-row").length,
      кнопок: document.querySelectorAll(".deal-view-toggle .deal-view-btn").length,
    }));
    assert(плитка.карточек >= 5, "в плитке нет карточек клиентов");
    assertEqual(плитка.строк, 0, "в режиме плитки отрисованы строки списка");
    assertEqual(плитка.кнопок, 2, "нет переключателя вида на «Клиентах»");

    await page.evaluate(() => window.app.setClientsView("list"));
    await page.waitForTimeout(300);
    const список = await page.evaluate(() => ({
      карточек: document.querySelectorAll(".client-card").length,
      строк: document.querySelectorAll(".client-list-row").length,
      выбор: JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}").clientsView,
    }));
    assertEqual(список.карточек, 0, "в режиме списка остались карточки плитки");
    assert(список.строк >= 5, "в списке нет строк клиентов: " + список.строк);
    assertEqual(список.выбор, "list", "выбранная раскладка не сохранилась");

    // Строка ведёт в карточку клиента, а не проваливается в пустоту. Проверяем
    // обработчик, а не кликаем: закрытие модалки спрашивает «Закрыть окно?» и
    // диалог остаётся висеть поверх следующих тестов.
    assert(await page.evaluate(() =>
      /openClientModal\('[^']+'\)/.test(document.querySelector(".client-list-row").getAttribute("onclick") || "")),
      "строка списка не открывает карточку клиента");

    await page.evaluate(() => window.app.setClientsView("grid"));
    await page.waitForTimeout(200);
  });

  // Тематики базы знаний были захардкожены одной строкой (KB_CATS): ни своей
  // завести, ни встроенную переименовать. Проверяем оба пути целиком, включая
  // главное свойство переименования — документы остаются на месте.
  await test("база знаний: своя тематика заводится, встроенная переименовывается", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => window.app.go("knowledge"));
    await page.waitForTimeout(200);

    const catText = () => page.$eval("#appContent .tabs", (el) => el.textContent || "");
    const before = await catText();
    assert(/Продажи/.test(before), "во вкладках нет встроенной тематики «Продажи»");

    const docsBefore = await page.$$eval("#appContent .kb-doc-card", (els) => els.length);
    await page.click("[onclick*='openKbCatsModal']");
    await page.waitForSelector(".kb-cat-row", { timeout: 3000 });

    // Своя тематика: promptDialog — не нативный prompt, поэтому заполняем поле.
    await page.click("button[onclick*='kbAddCat']");
    await page.waitForSelector(".confirm-dialog-input", { timeout: 3000 });
    await page.fill(".confirm-dialog-input", "Съёмка дронами");
    await page.click(".confirm-dialog-overlay .confirm-ok");
    await page.waitForTimeout(250);
    const rows = await page.$$eval(".kb-cat-row", (els) => els.map((e) => e.textContent.trim()));
    assert(rows.some((r) => /Съёмка дронами/.test(r) && /своя/.test(r)), "своей тематики нет в окне настройки: " + rows.join(" | "));

    // Переименование встроенной: документы не должны переехать.

    await page.click(".kb-cat-row:nth-child(1) [onclick*='kbRenameCat']");
    await page.waitForSelector(".confirm-dialog-input", { timeout: 3000 });
    await page.fill(".confirm-dialog-input", "Как продавать");
    await page.click(".confirm-dialog-overlay .confirm-ok");
    await page.waitForTimeout(250);
    // Именно button: тот же onclick висит и на самом оверлее (event.target===this),
    // и клик по нему приходится в центр окна — модалка осталась бы открытой.
    await page.click("button[onclick*='closeKbCatsModal']");
    await page.waitForTimeout(200);
    assert(!(await page.$(".kb-cat-row")), "окно настройки тематик не закрылось");

    const after = await catText();
    assert(/Как продавать/.test(after), "переименование встроенной тематики не применилось");
    assert(!/Продажи/.test(after), "старое название тематики осталось во вкладках");
    assert(/Съёмка дронами/.test(after), "своя тематика не появилась во вкладках");
    const docsAfter = await page.$$eval("#appContent .kb-doc-card", (els) => els.length);
    assert(docsAfter === docsBefore, `переименование увело документы: было ${docsBefore}, стало ${docsAfter}`);
  });

  // Последний пункт меню карточки («В архив») пропадал ДВУМЯ независимыми способами,
  // и оба выглядят одинаково — список просто обрывается на «Завершить», как будто
  // так и задумано:
  //   1) у карточки в нижней части экрана меню, падающее вниз, не помещается в окно
  //      (замер на окне 800: меню 584…818, пункт 778…812);
  //   2) у карточки, под которой есть соседняя, — карточка под курсором приподнята
  //      через transform, а transform создаёт стековый контекст, из которого меню с
  //      z-index:200 не может выйти: следующая по DOM карточка накрывает его нижние
  //      пункты, даже когда места в окне сколько угодно.
  // Первый случай чинится раскрытием вверх, второй — подъёмом самой карточки, и
  // проверять надо ОБА положения: правка одного не лечит другое.
  //
  // Меряем результат — «можно ли попасть в пункт» — через elementFromPoint: рамка
  // перекрытия чужим слоем не видит вовсе.
  await test("меню карточки: все пункты доступны и у края окна, и над соседней карточкой", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(250);

    const count = await page.evaluate(() => document.querySelectorAll("[data-deal-id]").length);
    assert(count >= 2, "на главной меньше двух карточек — случай «сосед снизу» не проверить");

    // "start" — карточка вверху, под ней остальные (перекрытие соседом);
    // "end"   — карточка прижата к нижнему краю (нехватка места в окне).
    for (const [where, idx] of [["start", 0], ["end", 1]]) {
      const id = await page.evaluate(({ w, i }) => {
        const els = [...document.querySelectorAll("[data-deal-id]")];
        const el = els[i] || els[0];
        el.scrollIntoView({ block: w });
        return el.getAttribute("data-deal-id");
      }, { w: where, i: idx });
      await page.waitForTimeout(150);

      // Кнопочный путь, а не app.toggleDealMenu(): позиционирование считается при
      // открытии, и клик вдобавок наводит курсор — без наведения карточка не имеет
      // transform, а значит и перекрытия, которое мы ловим, не возникает вовсе.
      await page.click(`[data-deal-id="${id}"] .deal-menu-btn`);
      await page.waitForTimeout(200);

      const items = await page.evaluate((v) => {
        const menu = document.getElementById("dcm-" + v);
        if (!menu) return null;
        return [...menu.querySelectorAll(".dcm-item")].map((b) => {
          const r = b.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            label: b.textContent.replace(/\s+/g, " ").trim(),
            out: r.bottom > window.innerHeight || r.top < 0,
            covered: !(hit && (hit === b || b.contains(hit))),
          };
        });
      }, id);

      assert(items && items.length >= 5, `меню карточки не открылось (${where})`);
      assert(
        items.some((i) => /архив/i.test(i.label)),
        `в меню нет пункта «В архив» (${where}): ` + items.map((i) => i.label).join(", ")
      );
      const bad = items
        .filter((i) => i.out || i.covered)
        .map((i) => `«${i.label}»${i.out ? " за краем окна" : ""}${i.covered ? " перекрыт" : ""}`);
      assertEqual(bad.length, 0, `пункты меню недоступны (карточка у края «${where}»): ` + bad.join(", "));
      await page.evaluate(() => window.app.closeDealMenu());
      await page.waitForTimeout(100);
    }
  });

  // Плитки KPI на главной выглядят одинаково — вид кликабельной даёт CSS по наличию
  // onclick, — но четыре из десяти (воронка, в работе, средний чек, прогноз) не вели
  // никуда: человек жал и ничего не происходило. Сторож требует, чтобы КАЖДАЯ плитка
  // что-то делала, и проверяет это результатом: после клика либо сменился раздел,
  // либо сменился активный фильтр сделок. Новую мёртвую плитку поймает сам.
  await test("главная: каждая KPI-плитка ведёт к своим сделкам или в раздел", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => { window.app.setCrmFilter("all"); window.app.go("home"); });
    await page.waitForTimeout(300);

    const tiles = await page.$$eval("#appContent .db-stat", (els) =>
      els.map((e, i) => ({
        i,
        label: (e.querySelector(".db-stat-label") || {}).textContent || "",
        clickable: e.hasAttribute("onclick"),
      }))
    );
    assert(tiles.length >= 8, "на главной меньше восьми KPI-плиток: " + tiles.length);
    const dead = tiles.filter((t) => !t.clickable).map((t) => `«${t.label.trim()}»`);
    assertEqual(dead.length, 0, "плитки выглядят кликабельными, но не ведут никуда: " + dead.join(", "));

    // Что человек видит после клика: сменился раздел, сменился подсвеченный фильтр
    // или страница уехала к списку сделок. Прокрутка — полноправный результат:
    // «Воронка» и «Прогноз» ведут к активным сделкам, а этот фильтр и так стоит по
    // умолчанию, поэтому единственное видимое действие у них — доводка до списка.
    const snapshot = () => page.evaluate(() => ({
      view: (document.querySelector("#appContent h1") || {}).textContent || "",
      active: (document.querySelector(".crm-home-funnel .funnel-stage.active h3") || {}).textContent || "",
      scroll: Math.round(window.scrollY),
    }));

    const stuck = [];
    for (const t of tiles) {
      await page.evaluate(() => { window.app.setCrmFilter("all"); window.app.go("home"); window.scrollTo(0, 0); });
      await page.waitForTimeout(200);
      const before = await snapshot();
      await page.$$eval("#appContent .db-stat", (els, i) => els[i].click(), t.i);
      // Прокрутка плавная — ждём, пока доедет.
      await page.waitForTimeout(600);
      const after = await snapshot();
      const moved = before.view !== after.view || before.active !== after.active || Math.abs(after.scroll - before.scroll) > 40;
      if (!moved) stuck.push(`«${t.label.trim()}»`);
    }
    assertEqual(stuck.length, 0, "клик по плитке ничего не меняет: " + stuck.join(", "));
    await page.evaluate(() => { window.app.setCrmFilter("all"); window.app.go("home"); });
  });

  // Порядок вкладок в «Финансах» — от повседневного к редкому. «Транзакции»
  // открываются по умолчанию, но кнопка стояла третьей: ряд читался как «выбрано
  // не то, что показано».
  await test("финансы: вкладки идут в порядке транзакции → задолженность → аналитика", async () => {
    await page.evaluate(() => window.app.go("global-finances"));
    await page.waitForTimeout(300);
    const tabs = await page.$$eval("#appContent .fin-subtab-bar .fin-subtab", (bs) =>
      bs.map((b) => ({ label: b.textContent.trim(), active: b.classList.contains("active") }))
    );
    assertEqual(
      tabs.map((t) => t.label).join(" → "),
      "Транзакции → Задолженность → Аналитика",
      "порядок вкладок в «Финансах» другой"
    );
    assertEqual(tabs[0].active, true, "по умолчанию подсвечена не первая вкладка — ряд снова врёт о том, что показано");
  });

  // Удаление сделки необратимо, а кнопка была серой с opacity .6 — тише «Отмены»
  // рядом. Меряем результат: цвет кнопки совпадает с опасным цветом темы.
  await test("модалка сделки: «Удалить сделку» помечена опасным цветом", async () => {
    const id = await dealId(page);
    assert(id, "нет сделок для проверки");
    await page.evaluate((v) => window.app.openDealModal(v), id);
    await page.waitForTimeout(300);

    const res = await page.evaluate(() => {
      const btn = [...document.querySelectorAll(".modal-box button")].find((b) => /Удалить сделку/.test(b.textContent));
      if (!btn) return null;
      const danger = getComputedStyle(document.documentElement).getPropertyValue("--text-danger").trim();
      const probe = document.createElement("span");
      probe.style.color = danger;
      document.body.appendChild(probe);
      const dangerRgb = getComputedStyle(probe).color;
      probe.remove();
      return { color: getComputedStyle(btn).color, dangerRgb, opacity: getComputedStyle(btn).opacity };
    });
    // Модалку закрываем ДО проверок: иначе упавший тест оставит её открытой, и
    // следующие начнут падать на перехваченных кликах — набор делит одну страницу.
    await page.evaluate(() => window.app.closeDealModal());
    await page.waitForTimeout(150);

    assert(res, "в модалке сделки нет кнопки «Удалить сделку»");
    assertEqual(res.color, res.dangerRgb, "кнопка удаления не опасного цвета");
    assert(Number(res.opacity) >= 0.9, `кнопка удаления приглушена (opacity ${res.opacity}) — снова тише «Отмены»`);
  });

  // Карточка сделки несла две кнопки-пилюли — «Открыть →» и следующий статус
  // («Сдать проект →» / «Завершено»). Владелец попросил убрать: карточка и так
  // кликабельна целиком. Важно проверить не только отсутствие кнопок, но и что
  // клик по карточке ВЕДЁТ в смету — раньше он лишь делал сделку активной, а в
  // смету уводила как раз убранная кнопка.
  await test("карточка сделки: без кнопок-пилюль, клик открывает смету", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(250);

    const pills = await page.evaluate(() => ({
      open: document.querySelectorAll(".deal-cards-grid .deal-open-btn").length,
      next: document.querySelectorAll(".deal-cards-grid .next-action-btn").length,
    }));
    assertEqual(pills.open, 0, "на карточке вернулась кнопка «Открыть →»");
    assertEqual(pills.next, 0, "на карточке вернулась кнопка следующего статуса");

    const card = await page.$(".deal-card");
    assert(card, "нет ни одной карточки сделки — проверять нечего");
    await card.click();
    await page.waitForTimeout(400);
    const opened = await page.evaluate(() => !!document.querySelector(".deal-layout"));
    assert(opened, "клик по карточке не открыл смету");
  });

  // Список сделок в «Смете» должен быть виден постоянно, без раскрытия по кнопке.
  // На узком экране места нет — там остаётся прежняя кнопка с выезжающей панелью.
  await test("«Смета»: список сделок открыт сбоку, на узком экране — кнопкой", async () => {
    await dismissStaleDialog(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(200);
    const card = await page.$(".deal-card");
    assert(card, "нет карточки сделки");
    await card.click();
    await page.waitForTimeout(400);

    const wide = await page.evaluate(() => {
      const rail = document.querySelector(".deal-rail");
      const sw = document.querySelector(".deal-switcher");
      return {
        rail: rail ? getComputedStyle(rail).display : "нет",
        btn: sw ? getComputedStyle(sw).display : "нет",
        items: document.querySelectorAll("#dealRailList .deal-switcher-item").length,
        search: !!document.getElementById("dealRailSearch"),
      };
    });
    assert(wide.rail !== "none" && wide.rail !== "нет", "на широком экране колонки сделок нет");
    assertEqual(wide.btn, "none", "на широком экране осталась кнопка-раскрывалка");
    assert(wide.items > 0, "колонка сделок пуста");
    assert(wide.search, "в колонке нет поля поиска");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const narrow = await page.evaluate(() => {
      const rail = document.querySelector(".deal-rail");
      const sw = document.querySelector(".deal-switcher");
      return {
        rail: rail ? getComputedStyle(rail).display : "нет",
        btn: sw ? getComputedStyle(sw).display : "нет",
        sideScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assertEqual(narrow.rail, "none", "на телефоне колонка сделок должна прятаться");
    assert(narrow.btn !== "none" && narrow.btn !== "нет", "на телефоне пропала кнопка выбора сделки");
    assert(narrow.sideScroll <= 1, "на телефоне появилась прокрутка вбок: " + narrow.sideScroll + "px");

    await page.setViewportSize({ width: 1280, height: 900 });
  });

  // Вкладка «Договор» в сделке: выбор шаблона на месте, договор сразу привязан к
  // сделке и клиенту. Раньше связку выставляли двумя селектами вручную, а до тех
  // пор «Подставить из сделки» не находило данных.
  await test("сделка: вкладка «Договор» заводит договор, привязанный к сделке", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(250);
    const card = await page.$(".deal-card");
    assert(card, "нет карточки сделки");
    await card.click();
    await page.waitForTimeout(400);

    const dealId = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (s.project && s.project.id) || s.activeProjectId || "";
    });
    assert(dealId, "не удалось определить открытую сделку");

    await page.evaluate(() => window.app.setDealView("contract"));
    await page.waitForTimeout(350);
    const tpls = await page.$$eval(".deal-contract-tpl", (els) => els.length);
    assert(tpls > 0, "на вкладке «Договор» нет ни одного шаблона");

    await page.click(".deal-contract-tpl");
    await page.waitForTimeout(600);

    const made = await page.evaluate((id) => {
      const s = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (s.contracts || [])[0];
      return c ? { dealId: c.dealId, hasBody: (c.body || "").length > 200, view: s.view, editing: !!s.contractEditId } : null;
    }, dealId);
    assert(made, "договор не создан");
    assert(made.dealId === dealId, "договор не привязан к сделке: " + made.dealId + " ≠ " + dealId);
    assert(made.hasBody, "тело договора пустое — шаблон не скопировался");
    assert(made.view === "contracts" && made.editing, "после создания не открылся редактор договора");

    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(200);
  });

  // ── Договор: мастер по полям, нумерация, статус подписания ────────────────

  // Номер — юридический реквизит: два документа с одним номером это ошибка в
  // бумагах. Считаем по МАКСИМУМУ выданных, а не по количеству договоров, иначе
  // после удаления среднего следующий номер повторит уже существующий.
  await test("договоры: номер не повторяется после удаления договора из середины", async () => {
    await dismissStaleDialog(page);
    const nums = await page.evaluate(() => {
      // Заводим три договора подряд и удаляем средний.
      window.app.go("contracts");
      window.app.createBlankContract();
      window.app.createBlankContract();
      window.app.createBlankContract();
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const three = (raw.contracts || []).slice(0, 3).map((c) => c.number);
      // unshift → [новейший, средний, старейший]; удаляем средний.
      const midId = (raw.contracts || [])[1].id;
      window.app.deleteContract(midId);
      const next = window.app.nextContractNumber();
      return { three, next };
    });

    const uniq = new Set(nums.three);
    assertEqual(uniq.size, 3, "три подряд созданных договора получили не три разных номера: " + nums.three.join(", "));
    assert(
      !nums.three.includes(nums.next),
      "следующий номер " + nums.next + " повторяет уже выданный (" + nums.three.join(", ") + ") — счёт идёт по количеству, а не по максимуму"
    );
  });

  // «{{срок}}» в отрыве от текста не значит ничего — мастер показывает фразу
  // вокруг токена. Но только СВОЮ строку: соседний пункт договора про другое.
  await test("договоры: подсказка мастера берёт фразу вокруг поля и не залезает в соседнюю строку", async () => {
    const ctx = await page.evaluate(() => {
      const body = "1.1. Первый пункт про совсем другое.\n2.1. Результат передаётся в срок до {{срок}} с момента подписания.\n3.1. Третий пункт.";
      return window.app.contractVarContext(body, "срок");
    });
    assert(ctx, "контекст поля не найден вовсе");
    assert(/Результат передаётся в срок до/.test(ctx.before), "перед полем не видно фразы: «" + ctx.before + "»");
    assert(/с момента подписания/.test(ctx.after), "после поля не видно фразы: «" + ctx.after + "»");
    assert(!/Первый пункт/.test(ctx.before), "подсказка затащила предыдущую строку договора: «" + ctx.before + "»");
    assert(!/Третий пункт/.test(ctx.after), "подсказка затащила следующую строку договора: «" + ctx.after + "»");
  });

  await test("договоры: мастер заполняет поле по Enter и сам переходит к следующему", async () => {
    await dismissStaleDialog(page);
    const start = await page.evaluate(() => {
      window.app.go("contracts");
      window.app.createContractFromTemplate("tpl_release");
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (raw.contracts || [])[0];
      window.app.openContractEdit(c.id);
      window.app.startContractWizard(0);
      return { id: c.id, vars: window.app.contractVars(c.body) };
    });
    assert(start.vars.length >= 2, "в шаблоне меньше двух полей — на нём мастер не проверить");
    await page.waitForTimeout(250);

    const input = await page.$("#contractWizardInput");
    assert(input, "мастер не показал поле ввода");
    const firstLabel = await page.$eval("#contractWizardInput", (el) => el.getAttribute("aria-label") || "");
    assert(firstLabel.includes(start.vars[0]), "мастер начал не с первого поля: " + firstLabel);

    await input.type("Проверочное значение");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);

    const after = await page.evaluate((id) => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (raw.contracts || []).find((x) => x.id === id);
      const el = document.getElementById("contractWizardInput");
      return {
        left: window.app.contractVars(c.body),
        body: c.body,
        label: el ? el.getAttribute("aria-label") || "" : ""
      };
    }, start.id);

    assert(!after.left.includes(start.vars[0]), "заполненное поле осталось в списке незаполненных");
    assert(after.body.includes("Проверочное значение"), "значение не подставилось в текст договора");
    assert(after.label.includes(start.vars[1]), "мастер не перешёл ко второму полю, показывает: " + after.label);

    // Фокус проверяем на КНОПОЧНОМ пути, а не на Enter. render() умеет сам вернуть
    // фокус по id, но только если в фокусе был input/textarea/select — при нажатии
    // Enter это так, и проверка через Enter проходила бы даже с вырезанным
    // возвратом фокуса (проверено). При клике по «Дальше» в фокусе кнопка,
    // восстановления не происходит, и работает только код мастера.
    await page.type("#contractWizardInput", "Второе значение");
    await page.click('button.primary[onclick*="contractWizardSubmit"]');
    await page.waitForTimeout(400);
    const focused = await page.evaluate(() => {
      const el = document.getElementById("contractWizardInput");
      return !!el && document.activeElement === el;
    });
    assert(focused, "после кнопки «Дальше» фокус не вернулся в поле ввода — набирать следующее значение придётся с мышкой");
  });

  await test("договоры: «Пропустить» не заполняет поле и идёт по кругу", async () => {
    const res = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (raw.contracts || []).find((x) => window.app.contractVars(x.body).length >= 2);
      if (!c) return null;
      window.app.openContractEdit(c.id);
      window.app.startContractWizard(0);
      const vars = window.app.contractVars(c.body);
      window.app.contractWizardSkip();
      const el = document.getElementById("contractWizardInput");
      const afterSkip = el ? el.getAttribute("aria-label") || "" : "";
      const raw2 = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c2 = (raw2.contracts || []).find((x) => x.id === c.id);
      return { vars, afterSkip, stillThere: window.app.contractVars(c2.body) };
    });
    assert(res, "не нашлось договора с двумя незаполненными полями");
    assert(res.afterSkip.includes(res.vars[1]), "после «Пропустить» мастер не перешёл ко второму полю: " + res.afterSkip);
    assert(res.stillThere.includes(res.vars[0]), "«Пропустить» удалило поле из договора — оно должно остаться незаполненным");
  });

  // Ради этого договоры и живут в CRM: воронка не должна врать. Но синхронизация
  // только вперёд — подписанный договор не откатывает сделку, уехавшую дальше.
  await test("договоры: статус «На подписи» двигает сделку на этап «Договор», но только вперёд", async () => {
    await dismissStaleDialog(page);
    const id = await dealId(page);
    assert(id, "нет сделки для проверки");

    // Этап меняем штатной функцией, а не правкой localStorage: статус сделки живёт
    // сразу в трёх местах (top-level, snapshot, state.project активной сделки), и
    // подмена одного из них проверяла бы не то поведение, а живучесть подмены.
    const cid = await page.evaluate((dealIdArg) => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (raw.contracts || [])[0];
      window.app.updateContractField(c.id, "dealId", dealIdArg);
      window.app.setKanbanStatus("crm", dealIdArg, "Лид");
      return c.id;
    }, id);
    await page.waitForTimeout(200);

    const moved = await page.evaluate((args) => {
      window.app.setContractStatus(args.cid, "sent");
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const d = (raw.savedProjects || []).find((p) => p.id === args.did);
      return d ? d.crmStatus : "";
    }, { cid, did: id });
    assertEqual(moved, "Договор", "сделка не переехала на этап «Договор» при отправке договора на подпись");

    await page.evaluate((args) => window.app.setKanbanStatus("crm", args.did, "В работе"), { did: id });
    await page.waitForTimeout(200);

    const kept = await page.evaluate((args) => {
      window.app.setContractStatus(args.cid, "signed");
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const d = (raw.savedProjects || []).find((p) => p.id === args.did);
      return d ? d.crmStatus : "";
    }, { cid, did: id });
    assertEqual(kept, "В работе", "подписание договора откатило сделку назад с «В работе» — синхронизация обязана быть только вперёд");
  });

  /* Договор без dealId существует, но на вкладку своей сделки не попадал, и человек
     видел только список шаблонов — будто договора нет вовсе. Такие заводит «Пустой
     договор» (привязку не ставит) и, до v221, кнопка «Договор» на карточке сделки. */
  await test("сделка: договор без привязки виден на вкладке и привязывается одной кнопкой", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => {
      window.app.go("contracts");
      window.app.closeContractEdit();
      window.app.createBlankContract();
    });
    await page.waitForTimeout(300);

    const orphanId = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (raw.contracts || []).find((x) => !x.dealId);
      return c ? c.id : "";
    });
    assert(orphanId, "не удалось завести договор без привязки");

    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(250);
    const card = await page.$(".deal-card");
    assert(card, "нет карточки сделки");
    await card.click();
    await page.waitForTimeout(400);
    await page.evaluate(() => window.app.setDealView("contract"));
    await page.waitForTimeout(400);

    const did = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (s.project && s.project.id) || s.activeProjectId || "";
    });
    assert(did, "не удалось определить открытую сделку");

    const btn = await page.$(`[onclick*="linkContractToDeal('${orphanId}')"]`);
    assert(btn, "договор без привязки не показан на вкладке «Договор» — человек снова увидит только шаблоны");

    await btn.click();
    await page.waitForTimeout(500);

    const after = await page.evaluate((args) => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (raw.contracts || []).find((x) => x.id === args.cid);
      return { dealId: c ? c.dealId : "", clientId: c ? c.clientId : "" };
    }, { cid: orphanId });
    assertEqual(after.dealId, did, "кнопка не привязала договор к сделке");

    // После привязки договор обязан появиться уже как «свой», а не остаться в
    // списке ничьих — иначе кнопка выглядит сработавшей вхолостую.
    const stillOrphan = await page.$(`[onclick*="linkContractToDeal('${orphanId}')"]`);
    assert(!stillOrphan, "привязанный договор остался в списке «без привязки»");

    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(200);
  });

  /* Печать и копирование — это момент отправки клиенту. Редактор пишет «9 полей
     не заполнено», но уйти документу это не мешало: в PDF попадало буквальное
     «{{срок}}». Спрашиваем один раз и называем поля поимённо. */
  await test("договоры: печать с незаполненными полями сначала переспрашивает", async () => {
    await dismissStaleDialog(page);
    const id = await page.evaluate(() => {
      window.app.go("contracts");
      window.app.closeContractEdit();
      window.app.createContractFromTemplate("tpl_release");
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (raw.contracts || [])[0];
      window.app.openContractEdit(c.id);
      return c.id;
    });
    await page.waitForTimeout(350);

    const left = await page.evaluate((cid) => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (raw.contracts || []).find((x) => x.id === cid);
      return window.app.contractVars(c.body);
    }, id);
    assert(left.length > 0, "в договоре из шаблона не осталось незаполненных полей — проверять нечего");

    // Печать не должна открыть окно, пока на вопрос не ответили.
    let popupOpened = false;
    const onPopup = () => { popupOpened = true; };
    page.on("popup", onPopup);
    await page.evaluate((cid) => window.app.printContract(cid), id);
    await page.waitForTimeout(400);

    const dialog = await page.$(".confirm-dialog-overlay");
    assert(dialog, "печать не переспросила про незаполненные поля — договор уйдёт клиенту с {{токенами}}");

    const msg = await page.$eval(".confirm-dialog-msg", (el) => el.textContent || "");
    assert(msg.includes(left[0]),
      `в вопросе не названы сами поля (искали «${left[0]}»): ${msg.slice(0, 90)}`);

    // «Вернуться и заполнить» — печати не происходит.
    const cancel = await page.$(".confirm-dialog-overlay button:not(.primary):not(.danger)");
    assert(cancel, "в диалоге нет кнопки отказа");
    await cancel.click();
    await page.waitForTimeout(300);
    assert(!popupOpened, "договор ушёл в печать, хотя нажали «Вернуться и заполнить»");
    page.off("popup", onPopup);

    // А когда полей не осталось — вопроса быть не должно.
    await page.evaluate((cid) => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (raw.contracts || []).find((x) => x.id === cid);
      window.app.contractVars(c.body).forEach((v) => window.app.fillContractVar(cid, v, "значение"));
    }, id);
    await page.waitForTimeout(400);
    const stillLeft = await page.evaluate((cid) => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (raw.contracts || []).find((x) => x.id === cid);
      return window.app.contractVars(c.body).length;
    }, id);
    assertEqual(stillLeft, 0, "не удалось заполнить все поля для проверки «вопроса быть не должно»");

    await page.evaluate((cid) => window.app.copyContractText(cid), id);
    await page.waitForTimeout(300);
    const dialog2 = await page.$(".confirm-dialog-overlay");
    assert(!dialog2, "у заполненного договора копирование всё равно переспрашивает — лишний шаг на каждом отправлении");

    await page.evaluate(() => window.app.closeContractEdit());
  });

  /* Список сделок слева — список ВЫБОРА: по нему переключаются между сделками.
     Статус-пилюля на краю строки читается как кнопка (тот же разбор, что при
     выборе клиента в мастере), а различают сделки по деньгам и сроку. */
  await test("«Смета»: в списке сделок нет статус-пилюли, зато видна сумма", async () => {
    await dismissStaleDialog(page);
    await page.setViewportSize({ width: 1500, height: 950 });
    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(250);
    const card = await page.$(".deal-card");
    assert(card, "нет карточки сделки");
    await card.click();
    await page.waitForTimeout(500);

    const rail = await page.evaluate(() => {
      const r = document.querySelector(".deal-rail");
      if (!r) return null;
      const item = r.querySelector(".deal-switcher-item");
      return {
        width: Math.round(r.getBoundingClientRect().width),
        pills: r.querySelectorAll(".status-pill").length,
        hasStageDot: !!(item && item.querySelector(".deal-switcher-item-stage i")),
        hasSum: !!(item && item.querySelector(".deal-switcher-item-sum")),
        items: r.querySelectorAll(".deal-switcher-item").length
      };
    });
    assert(rail, "колонка со сделками не отрисовалась на широком экране");
    assert(rail.items > 0, "в колонке нет ни одной сделки");
    assertEqual(rail.pills, 0, "в списке сделок вернулась статус-пилюля — она читается как кнопка");
    assert(rail.hasStageDot, "этап сделки не показан точкой цвета");
    assert(rail.hasSum, "в строке сделки не показана сумма — по ней сделки и различают");
    assert(rail.width >= 268, "колонка уже 268px — названия и клиент снова слипнутся: " + rail.width);

    await page.setViewportSize({ width: 1000, height: 820 });
  });

  /* Вкладка «КП»: в шапке только действия с готовым документом. Выгрузка в Excel
     отдаёт СМЕТУ, а не КП, и ей место в разделе «Смета»; «Сгенерировать с ИИ»
     заполняет три поля ниже, а не делает документ. */
  await test("КП: в шапке только документные действия, Excel и ИИ убраны оттуда", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => { window.app.go("deal"); window.app.setDealView("proposal"); });
    await page.waitForTimeout(700);

    const res = await page.evaluate(() => {
      const bar = document.querySelector(".section-title .toolbar");
      const btns = bar ? [...bar.querySelectorAll("button")] : [];
      const ai = document.getElementById("aiProposalBtn");
      return {
        labels: btns.map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()),
        primary: btns.filter((b) => b.classList.contains("primary")).length,
        xlsxInBar: bar ? bar.querySelectorAll(".xlsx-icon-btn").length : -1,
        aiExists: !!ai,
        aiInBar: !!(ai && bar && bar.contains(ai))
      };
    });

    assertEqual(res.xlsxInBar, 0, "выгрузка в Excel вернулась в шапку КП — она отдаёт смету, а не КП");
    assert(res.aiExists, "кнопка «Сгенерировать с ИИ» пропала вовсе");
    assert(!res.aiInBar, "кнопка ИИ снова в шапке — там она читается как действие с документом");
    assertEqual(res.primary, 1,
      "в шапке КП должна быть ровно одна главная кнопка, иначе они спорят: " + res.labels.join(" | "));
    assert(res.labels.length <= 3, "в шапке КП снова больше трёх кнопок: " + res.labels.join(" | "));
  });

  /* Простое ПЕРЕКЛЮЧЕНИЕ между сделками не должно считаться правкой.
     flushActiveProjectToSaved() вызывается и при переключении (сбрасывает туда
     предыдущую сделку) и раньше безусловно ставил новый updatedAt. Список
     отсортирован по updatedAt внутри этапа — и только что закрытая сделка
     прыгала наверх своей группы: карточки перетасовывались от клика, ничего не
     изменившего. Побочно врала подпись «изменён»: она показывала дату, когда
     сделку всего лишь открыли посмотреть. */
  await test("список сделок не перетасовывается от простого переключения", async () => {
    await dismissStaleDialog(page);
    /* Нужны ДВЕ сделки: сброс предыдущей происходит только при настоящем
       переключении. Открытие уже активной сделки уходит в раннюю ветку
       loadSavedProject и ничего не сбрасывает — на одной сделке проверка была бы
       зелёной и со сломанным кодом (проверено). */
    const ids = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const first = (raw.savedProjects || [])[0];
      if (!first) return null;
      window.app.duplicateSavedProject(first.id);
      const after = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const other = (after.savedProjects || []).find((p) => p.id !== first.id);
      return other ? { a: first.id, b: other.id } : null;
    });
    assert(ids, "не удалось получить две сделки для переключения");
    await page.waitForTimeout(400);

    // Прогрев: один круг переключений, чтобы нормализация домигрировала снимки.
    // Первая активация меняет сделку по-настоящему, и это законно.
    await page.evaluate((x) => window.app.openDeal(x.a), ids);
    await page.waitForTimeout(450);
    await page.evaluate((x) => window.app.openDeal(x.b), ids);
    await page.waitForTimeout(450);
    await page.evaluate((x) => window.app.openDeal(x.a), ids);
    await page.waitForTimeout(450);

    const before = await page.evaluate((x) => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const p = (raw.savedProjects || []).find((y) => y.id === x.a);
      return p ? p.updatedAt : null;
    }, ids);
    assert(before, "сделка А пропала из списка");

    // Уходим на другую сделку — здесь и сбрасывается предыдущая (А).
    await page.evaluate((x) => window.app.openDeal(x.b), ids);
    await page.waitForTimeout(600);

    const after = await page.evaluate((x) => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const p = (raw.savedProjects || []).find((y) => y.id === x.a);
      return p ? p.updatedAt : null;
    }, ids);

    assertEqual(after, before,
      "переключение на другую сделку поменяло «изменён» у предыдущей — список пересортируется, и карточки прыгают под курсором");
  });

  /* Наведение на сделку обязано давать видимый отклик. Дважды ломалось одинаково:
     у состояния (.active / .current) и у :hover одинаковая специфичность, а
     состояние объявлено ПОЗЖЕ — и открытая сделка переставала отзываться на
     курсор. В колонке «Сметы» было хуже: :hover красил строку в var(--panel2),
     а сама колонка уже этого цвета — подсветки не было ни у одной строки. */
  await test("сделка подсвечивается под курсором — и в списке, и в колонке «Сметы»", async () => {
    await dismissStaleDialog(page);
    await page.setViewportSize({ width: 1500, height: 950 });

    // Замер: стиль в покое против стиля под курсором. Сравниваем то, что видно
    // глазом — фон, сдвиг и тень; изменения хотя бы в одном достаточно.
    //
    // Фон читается ДВУМЯ свойствами. Тинт наведения может лежать слоем
    // background-image поверх заливки карточки (так сделано в колонке «Сметы»:
    // строка обязана остаться карточкой и под курсором), и тогда background-color
    // не меняется вовсе. Мерить только его — мерить способ, а не результат: замер
    // отчитается «подсветки нет» при полностью рабочей подсветке.
    const snap = (sel) => page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, img: cs.backgroundImage, bd: cs.borderColor, tr: cs.transform, sh: cs.boxShadow };
    }, sel);
    const changed = (a, b) => a && b &&
      (a.bg !== b.bg || a.img !== b.img || a.bd !== b.bd || a.tr !== b.tr || a.sh !== b.sh);

    /* Набор делит одну страницу: при падении посреди теста режим списка и узкий
       вьюпорт достались бы следующему тесту, и он упал бы «нет карточки сделки»
       уже не по своей вине. Возврат — только через finally. */
    try {
      // 1. Список сделок на главной (строка открытой сделки — та самая ловушка).
      await page.evaluate(() => { window.app.go("home"); window.app.setCrmView("list"); });
      await page.waitForTimeout(450);
      const rowSel = ".deal-list-row";
      const rowRest = await snap(rowSel);
      if (rowRest) {
        const row = await page.$(rowSel);
        await row.hover();
        await page.waitForTimeout(250);
        const rowHov = await snap(rowSel);
        assert(changed(rowRest, rowHov),
          `строка сделки не меняется под курсором: было ${JSON.stringify(rowRest)}, стало ${JSON.stringify(rowHov)}`);
      }

      // 2. Колонка сделок в «Смете».
      await page.evaluate(() => { window.app.go("deal"); window.app.setDealView("estimate"); });
      await page.waitForTimeout(550);
      const itemSel = ".deal-switcher-item";
      const itemRest = await snap(itemSel);
      assert(itemRest, "колонка сделок не отрисовалась — проверять нечего");
      const item = await page.$(itemSel);
      await item.hover();
      await page.waitForTimeout(250);
      const itemHov = await snap(itemSel);
      assert(changed(itemRest, itemHov),
        `строка в колонке «Сметы» не меняется под курсором: было ${JSON.stringify(itemRest)}, стало ${JSON.stringify(itemHov)}`);
    } finally {
      await page.evaluate(() => { window.app.setCrmView("grid"); window.app.go("home"); });
      await page.setViewportSize({ width: 1000, height: 820 });
      await page.waitForTimeout(200);
    }
  });

  /* В строке каталога было четыре неразличимые иконки подряд, последняя — скрытие
     позиции. На экране это два десятка деструктивных кнопок вплотную к безобидным,
     а что делает иконка, узнавалось только наведением — которого на телефоне нет.
     Редкие действия уехали под «⋯» с подписями. */
  await test("каталог: в строке нет деструктивных иконок, редкое — в подписанном меню", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => window.app.go("catalog"));
    await page.waitForTimeout(600);

    const row = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
      const icons = [...document.querySelectorAll("#appContent button")]
        .filter(vis).filter((b) => !(b.textContent || "").trim());
      return {
        danger: icons.filter((b) => /danger/.test((b.className || "") + "")).length,
        perRow: document.querySelectorAll(".item .catalog-action-btn").length,
        rows: document.querySelectorAll(".item").length
      };
    });
    assertEqual(row.danger, 0,
      "в каталоге снова деструктивные кнопки-иконки в ряду одинаковых — промах стоит скрытой позиции");
    assert(row.rows > 0, "каталог пуст, проверять нечего");
    const perItem = row.perRow / row.rows;
    assert(perItem <= 3.01, `в строке каталога снова ${perItem.toFixed(1)} иконок — было четыре, стало тесно`);

    // Меню: пункты обязаны быть ПОДПИСАНЫ, иначе смысла в переносе нет.
    const btn = await page.$('[onclick*="toggleDealMenu(\'cat-"]');
    assert(btn, "в строке каталога нет кнопки «Ещё действия»");
    await btn.click();
    await page.waitForTimeout(300);
    const items = await page.evaluate(() => {
      const m = [...document.querySelectorAll(".deal-ctx-menu")].find((x) => x.style.display === "block");
      return m ? [...m.querySelectorAll(".dcm-item")].map((i) => (i.textContent || "").replace(/\s+/g, " ").trim()) : null;
    });
    assert(items && items.length >= 2, "меню позиции не открылось или пусто");
    assert(items.every((t) => t.length > 3), "в меню есть пункт без подписи: " + JSON.stringify(items));
    assert(items.some((t) => /Скрыть/.test(t)), "«Скрыть из каталога» не переехало в меню: " + JSON.stringify(items));

    // Закрытие по клику вне — общий механизм, свой бы стал вторым таким же.
    await page.mouse.click(5, 5);
    await page.waitForTimeout(250);
    const closed = await page.evaluate(() =>
      ![...document.querySelectorAll(".deal-ctx-menu")].some((x) => x.style.display === "block"));
    assert(closed, "меню позиции не закрывается кликом мимо");
  });

  /* Выгрузку сметы в Excel владелец не нашёл после того, как её убрали с вкладки
     «КП». Причина: единственная кнопка раздела «Смета» стояла в шапке под
     `inDeal ? "" : …` — то есть показывалась, только когда смету открывают
     ОТДЕЛЬНО от сделки. Внутри сделки, где с ней и работают, кнопки не было
     вовсе, и живой оставалась лишь копия на «КП». Проверяем главный путь. */
  await test("смета: выгрузка в Excel доступна внутри сделки и не задвоена", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => window.app.go("home"));
    await page.waitForTimeout(250);
    const card = await page.$(".deal-card");
    assert(card, "нет карточки сделки");
    await card.click();
    await page.waitForTimeout(400);

    await page.evaluate(() => window.app.setDealView("estimate"));
    await page.waitForTimeout(500);

    /* Выгрузка переехала из панели сметы в меню «⋮» шапки (просьба владельца
       13.08). Держать её в панели было нельзя по той же причине, по которой она
       там когда-то появилась: панель рисуется только когда в смете есть позиции
       по этапам, поэтому у сделки с бюджетом «одним числом» кнопки не было вовсе.

       Проверяемое свойство прежнее и главное: выгрузка ДОСТИЖИМА изнутри сделки и
       на экране ровно одна. Где именно она лежит — тест не диктует. */
    const inDeal = await page.evaluate(() => {
      const btn = document.querySelector(".deal-tabs-menu .deal-menu-btn");
      if (btn) btn.click();
      const btns = [...document.querySelectorAll('[onclick*="exportXlsx"]')];
      const vis = btns.filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
      return { total: btns.length, visible: vis.length,
        label: vis.length ? (vis[0].textContent || "").replace(/\s+/g, " ").trim() : "" };
    });
    assert(inDeal.visible >= 1,
      "внутри сделки выгрузки в Excel не найти — за ней придётся уходить в другой раздел");
    assertEqual(inDeal.total, 1, "на экране сделки больше одной кнопки выгрузки");
    assert(inDeal.label.length > 0,
      "кнопка выгрузки без текстовой подписи — иконку среди подписанных пунктов не находят глазами");

    // Смета «одним числом» — тот самый случай, ради которого кнопка и переехала:
    // панели там нет, а выгрузка должна остаться доступной.
    const budgetOnly = await page.evaluate(() => {
      const btn = document.querySelector(".deal-tabs-menu .deal-menu-btn");
      if (btn) btn.click();
      return document.querySelectorAll('[onclick*="exportXlsx"]').length;
    });
    assertEqual(budgetOnly, 1, "выгрузка пропала из меню шапки");

    // На вкладке «КП» её быть не должно: она выгружает смету, а не КП. Меню шапки
    // живёт на всех вкладках, поэтому считаем только то, что вне него.
    await page.evaluate(() => window.app.setDealView("proposal"));
    await page.waitForTimeout(400);
    const inKp = await page.evaluate(() =>
      [...document.querySelectorAll('[onclick*="exportXlsx"]')]
        .filter((b) => !b.closest(".deal-tabs-menu")).length);
    assertEqual(inKp, 0, "выгрузка сметы вернулась на вкладку КП");
  });

  /* Договор печатался голым текстом в Arial — без логотипа, названия агентства и
     единого реквизита, тогда как КП уходило клиенту оформленным. Два документа
     одной студии выглядели как из разных контор. Бланк теперь общий. */
  await test("договор печатается на фирменном бланке: шапка, номер и реквизиты", async () => {
    await dismissStaleDialog(page);

    // Реквизиты компании — без них печатать в бланке нечего.
    await page.evaluate(() => { window.app.go("settings"); window.app._setSettingsTab("company"); });
    await page.waitForTimeout(600);
    const innSet = await page.evaluate(() => {
      const set = (key, val) => {
        const el = document.querySelector(`[data-scope="company"][data-key="${key}"]`);
        if (!el) return false;
        el.value = val;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      };
      return {
        ok: set("name", "Студия Пример") && set("inn", "590000000000") && set("address", "г. Пермь, ул. Примерная, 1"),
        scoped: document.querySelectorAll('[data-scope="company"]').length,
        view: (JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}")).view
      };
    });
    assert(innSet.ok, `не нашлись поля реквизитов компании: полей scope=company ${innSet.scoped}, вьюха «${innSet.view}»`);

    // Логотип студии. Раньше он подставлялся сам — но подставлялся логотип СЕРВИСА
    // (logo-icon.svg стоял значением по умолчанию), и тест на самом деле проверял,
    // что в договоре студии печатается чужая эмблема. Теперь логотип свой, как у
    // живого агентства: прозрачный PNG вместо картинки — нам важен факт вставки.
    await page.evaluate(() => window.app.updateCompany("logoUrl",
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="));
    await page.waitForTimeout(400);

    // Договор со всеми заполненными полями — иначе печать переспросит.
    const cid = await page.evaluate(() => {
      window.app.go("contracts");
      window.app.closeContractEdit();
      window.app.createContractFromTemplate("tpl_release");
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const c = (raw.contracts || [])[0];
      window.app.contractVars(c.body).forEach((v) => window.app.fillContractVar(c.id, v, "значение"));
      return c.id;
    });
    await page.waitForTimeout(500);

    const [popup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 15000 }),
      page.evaluate((id) => window.app.printContract(id), cid)
    ]);
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    await popup.waitForTimeout(500);

    const doc = await popup.evaluate(() => ({
      brand: !!document.querySelector(".proposal-brand"),
      brandName: (document.querySelector(".proposal-brand h1") || {}).textContent || "",
      logo: !!document.querySelector(".proposal-brand img"),
      hasBase: !!document.querySelector("base"),
      num: (document.querySelector(".doc-num") || {}).textContent || "",
      body: (document.querySelector(".doc-body") || {}).textContent || "",
      req: (document.querySelector(".doc-req") || {}).textContent || ""
    }));

    assert(doc.brand, "в печатном договоре нет фирменной шапки");
    assert(doc.brandName.trim().length > 0, "в шапке нет названия агентства");
    assert(doc.logo, "в шапке печатного договора нет логотипа");
    assert(doc.hasBase, "нет <base>: относительный путь логотипа не разрешится, картинка будет битой");
    assert(/\d{4}-\d{3}/.test(doc.num), "номер договора не напечатан: «" + doc.num + "»");
    assert(doc.body.length > 100, "тело договора не попало в печать");
    assert(/590000000000/.test(doc.req), "в печати нет ИНН — договор с такими реквизитами не подписывают");
    assert(/Пермь/.test(doc.req), "в печати нет адреса компании");

    await popup.close();
    await page.evaluate(() => window.app.closeContractEdit());
  });

  /* История сделки должна показывать изменения СМЕТЫ. Повод: по журналу нельзя
     было ответить, почему на завершённой сделке висит долг — платежи и смена
     статуса там были, а правки сметы нет, хотя двигают долг именно они.
     Записи склеиваются: смета правится очередями, и без склейки один сеанс
     редактирования оставлял бы десятки строк подряд. */
  await test("история сделки: правка сметы попадает в журнал и не плодит записи", async () => {
    await dismissStaleDialog(page);

    // Нужны ДВЕ сделки: сброс в сохранённую происходит при переключении между
    // ними. Уход на главную его не вызывает — на одной сделке проверка была бы
    // зелёной и с выключенным журналом.
    const ids = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const a = (raw.savedProjects || [])[0];
      if (!a) return null;
      window.app.duplicateSavedProject(a.id);
      const r2 = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const b = (r2.savedProjects || []).find((p) => p.id !== a.id);
      return b ? { a: a.id, b: b.id } : null;
    });
    assert(ids, "не удалось получить две сделки");
    await page.waitForTimeout(500);

    const logOf = (id) => page.evaluate((x) => {
      const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const d = (raw.savedProjects || []).find((p) => p.id === x);
      return { total: d ? d.total : null,
               estimateEntries: (d && d.activity || []).filter((a) => /^Смета:/.test(a.text || "")) };
    }, id);

    await page.evaluate((x) => window.app.openDeal(x.a), ids);
    await page.waitForTimeout(600);
    const before = await logOf(ids.a);

    // Услуга, которой в демо-смете заведомо нет, — иначе добавление ничего не меняет.
    await page.evaluate(() => { window.app.go("catalog"); window.app.catalogAddOne("subtitles"); });
    await page.waitForTimeout(700);
    await page.evaluate((x) => window.app.openDeal(x.b), ids);
    await page.waitForTimeout(800);

    const after = await logOf(ids.a);
    assert(after.total !== before.total, "сумма сметы не изменилась — проверять нечего");
    assertEqual(after.estimateEntries.length, before.estimateEntries.length + 1,
      "правка сметы не попала в историю сделки");
    const rec = after.estimateEntries[0].text;
    assert(rec.includes("→"), "запись о смете без перехода «было → стало»: " + rec);

    // Вторая правка подряд обязана обновить ту же запись, а не добавить новую.
    await page.evaluate((x) => window.app.openDeal(x.a), ids);
    await page.waitForTimeout(600);
    await page.evaluate(() => { window.app.go("catalog"); window.app.catalogAddOne("light_basic"); });
    await page.waitForTimeout(700);
    await page.evaluate((x) => window.app.openDeal(x.b), ids);
    await page.waitForTimeout(800);

    const third = await logOf(ids.a);
    assertEqual(third.estimateEntries.length, after.estimateEntries.length,
      "вторая правка подряд завела отдельную строку — журнал забьётся при обычном редактировании");
  });

  // ── Боковая колонка сделок и меню действий в шапке ──────────────────────────
  // Колонка показывается только от 1101px (ниже — кнопка с выезжающей панелью),
  // а общая страница набора шириной 1000 — поэтому здесь свой контекст.
  async function bootRail() {
    const { context: ctx, page: p } = await bootLocal(browser, baseUrl, { width: 1400, height: 900, seedDemo: true });
    const ids = await p.evaluate(() => {
      const read = () => JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const first = (read().savedProjects || [])[0];
      if (!first) return null;
      while ((read().savedProjects || []).length < 3) window.app.duplicateSavedProject(first.id);
      return (read().savedProjects || []).map((x) => x.id);
    });
    await p.evaluate((i) => window.app.openDeal(i), ids[0]);
    await p.waitForTimeout(600);
    return { ctx, p, ids };
  }

  await test("боковой список сделок: строки не слипаются", async () => {
    const { ctx, p } = await bootRail();
    const gap = await p.evaluate(() => {
      const it = [...document.querySelectorAll(".deal-rail .deal-switcher-item")];
      if (it.length < 2) return null;
      return Math.round(it[1].getBoundingClientRect().top - it[0].getBoundingClientRect().bottom);
    });
    await ctx.close();
    assert(gap !== null, "в колонке меньше двух сделок — мерить нечего");
    // Мерим РЕЗУЛЬТАТ (расстояние между строками), а не способ: переживёт замену
    // margin на gap у контейнера или на flex-раскладку.
    assert(gap >= 4, "между строками списка сделок нет зазора (" + gap + "px) — список читается сплошной простынёй");
  });

  await test("сделку можно перетащить из «Архива» обратно в работу", async () => {
    /* Раньше каждая секция бокового списка была замкнутой границей: уронить
       карточку в соседнюю было нельзя, чтобы случайный сброс не менял статус
       молча. По просьбе владельца граница открыта, но статус меняется явно —
       теми же функциями, что и меню сделки, с записью в историю.

       Мерим РЕЗУЛЬТАТ жеста: статус в состоянии, секция после перерисовки и след
       в истории. Проверять разметку тут бессмысленно — она и до правки была
       на месте, не работал сам перенос. */
    const { ctx, p, ids } = await bootRail();
    try {
      const victim = ids[ids.length - 1];
      await p.evaluate((i) => window.app.archiveDeal(i), victim);
      await p.waitForTimeout(500);

      const before = await p.evaluate((id) => {
        const row = document.querySelector(`.deal-rail [data-deal-id="${id}"]`);
        return row ? row.parentElement.dataset.section : null;
      }, victim);
      assertEqual(before, "archived",
        "секция карточки не читается (нет data-section) либо сделка не ушла в архив — " +
        "без пометки секции перенос между ними невозможен в принципе");

      const box = await p.evaluate((id) => {
        const row = document.querySelector(`.deal-rail [data-deal-id="${id}"]`);
        const active = document.querySelector('.deal-rail [data-drag-scope="rail"][data-section="active"]');
        if (!row || !active) return null;
        const r = row.getBoundingClientRect(), a = active.getBoundingClientRect();
        return { fx: r.left + 60, fy: r.top + 16, tx: a.left + 60, ty: a.top + 24 };
      }, victim);
      assert(box, "не нашлись карточка архива или секция «В работе»");

      await p.mouse.move(box.fx, box.fy);
      await p.mouse.down();
      await p.mouse.move(box.fx + 4, box.fy - 12, { steps: 3 });
      await p.waitForTimeout(140);
      await p.mouse.move(box.tx, box.ty, { steps: 14 });
      await p.waitForTimeout(180);
      await p.mouse.up();
      await p.waitForTimeout(700);

      const after = await p.evaluate((id) => {
        const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
        const deal = (st.savedProjects || []).find((x) => x.id === id);
        const row = document.querySelector(`.deal-rail [data-deal-id="${id}"]`);
        return {
          status: deal && deal.crmStatus,
          section: row ? row.parentElement.dataset.section : null,
          logged: ((deal && deal.activity) || []).some((a) => /Архив →/.test(a.text || "")),
        };
      }, victim);

      assert(after.status && after.status !== "Архив",
        `статус остался «${after.status}» — перенос между секциями не сработал`);
      assertEqual(after.section, "active", "после перерисовки карточка вернулась в архив");
      assert(after.logged, "смена статуса переносом не попала в историю сделки");
    } finally {
      await ctx.close();
    }
  });

  await test("перетаскивание выглядит одинаково везде", async () => {
    /* Было ЧЕТЫРЕ разных вида одного жеста: в смете пустой квадрат 26×26 с рамкой
       и без содержимого (читался как невыбранный чекбокс), в настройке меню
       текстовый глиф ⠿ (рисуется шрифтом ОС — у каждого свой), в боковом списке
       сделок свой инлайновый SVG, а карточки воронки и задач таскались вообще без
       ручки: о том, что их можно перенести, узнавали случайно.

       Мерим РЕЗУЛЬТАТ — что у всех ручек на экране один рисунок и один размер, —
       а не то, какой функцией они собраны. */
    const { ctx, p } = await bootRail();
    try {
      const res = await p.evaluate(() => {
        const out = { views: {}, kinds: new Set(), noSvg: 0, glyphs: 0 };
        return (async () => {
          for (const v of ["deal", "crm", "global-tasks"]) {
            window.app.go(v);
            await new Promise((r) => setTimeout(r, 450));
            const hs = [...document.querySelectorAll(".drag-handle")];
            out.views[v] = hs.length;
            hs.forEach((h) => {
              const r = h.getBoundingClientRect();
              const svg = h.querySelector("svg");
              if (!svg) out.noSvg++;
              // Глиф вместо иконки: текст внутри ручки — это ⠿ и его родня.
              if ((h.textContent || "").trim()) out.glyphs++;
              out.kinds.add(`${Math.round(r.width)}×${Math.round(r.height)}|${svg ? svg.innerHTML.length : 0}`);
            });
          }
          out.kinds = [...out.kinds];
          return out;
        })();
      });
      assert(res.views.deal > 0, "в смете не нашлось ни одной ручки перетаскивания");
      assertEqual(res.noSvg, 0, "ручка без иконки — пустая коробка читается как чекбокс, а не как «потяни меня»");
      assertEqual(res.glyphs, 0, "ручка нарисована текстовым глифом: шрифтом ОС, у каждого свой рисунок");
      assertEqual(res.kinds.length, 1,
        "ручки перетаскивания разного вида: " + res.kinds.join(" / ") + " — жест один, значит и вид один");
    } finally {
      await ctx.close();
    }
  });

  await test("описание пакета редактируется целиком, а не в одну строку", async () => {
    /* Описания пакетов длинные («Базовый корпоративный контент: фотосессия команды
       и короткое видео-приветствие»), а поле было однострочным: в модалке на 390px
       помещалась треть текста — ни прочитать, ни отредактировать. В карточке
       позиции каталога это же поле давно многострочное; расхождение видно только
       на телефоне, где строка узкая. */
    await dismissStaleDialog(page);
    await page.evaluate(() => window.app.go("packages"));
    await page.waitForTimeout(600);
    const opened = await page.evaluate(() => {
      const b = document.querySelector("[onclick*='openPackageEditModal']");
      const m = b && (b.getAttribute("onclick") || "").match(/openPackageEditModal\('([^']+)'/);
      if (!m) return false;
      window.app.openPackageEditModal(m[1]);
      return true;
    });
    assert(opened, "в разделе пакетов не нашлось ни одного пакета для правки");
    await page.waitForTimeout(500);
    const res = await page.evaluate(() => {
      const box = document.querySelector(".modal-box");
      if (!box) return null;
      const label = [...box.querySelectorAll("label")].find((l) => /Описание/.test(l.textContent || ""));
      const field = label && label.parentElement.querySelector("input, textarea");
      if (!field) return { нет: true };
      return {
        tag: field.tagName,
        // Многострочное поле не должно прятать текст по горизонтали.
        clipped: field.scrollWidth > field.clientWidth + 1,
      };
    });
    await page.evaluate(() => window.app.closePackageEditModal && window.app.closePackageEditModal());
    assert(res && !res.нет, "в модалке пакета не нашлось поля «Описание»");
    assertEqual(res.tag, "TEXTAREA", "поле описания снова однострочное — длинный текст не прочитать");
    assert(!res.clipped, "текст описания уходит вбок за край поля");
  });

  await test("«Обновить» на «Все КП» отвечает на нажатие даже без связи", async () => {
    /* Найдено обходом «нажми каждую кнопку и посмотри, изменилось ли хоть что-то».
       Без связи (местный режим, не выполнен вход) загрузка списка выходит первой
       же строкой, и кнопка не делала РОВНО НИЧЕГО: ни списка, ни скелета, ни
       сообщения — она выглядела сломанной. Нажатие обязано давать отклик, даже
       когда делать нечего. */
    await dismissStaleDialog(page);
    await page.evaluate(() => window.app.go("proposals"));
    await page.waitForTimeout(500);
    const res = await page.evaluate(() => {
      const b = [...document.querySelectorAll("#appContent button")].find((x) => /Обновить/.test(x.textContent || ""));
      if (!b) return null;
      b.click();
      return true;
    });
    assert(res, "на «Все КП» нет кнопки обновления");
    await page.waitForTimeout(400);
    const answer = await page.evaluate(() => ({
      toast: document.getElementById("toast")?.classList.contains("show") || false,
      text: (document.getElementById("toast")?.textContent || "").trim(),
      busy: !!document.querySelector("[aria-busy='true']"),
    }));
    assert(answer.toast || answer.busy,
      "нажатие «Обновить» не дало никакого отклика — ни сообщения, ни загрузки");
  });

  await test("секции списка сделок различаются иконкой, а не только подписью", async () => {
    /* Три состояния сделки — в работе, завершена, в архиве. Иконки берутся из общей
       базы ICON_PATHS: рисовать значок по месту нельзя, он неизбежно разъедется со
       вторым таким же (так уже случилось с ручкой переноса — четыре разных вида
       одного жеста). Цвет иконка наследует от секции, поэтому отдельного правила
       на цвет нет и быть не должно. */
    const { ctx, p, ids } = await bootRail();
    try {
      await p.evaluate((i) => window.app.archiveDeal(i), ids[ids.length - 1]);
      await p.evaluate((i) => window.app.finishDeal(i), ids[ids.length - 2]);
      await p.waitForTimeout(600);
      const res = await p.evaluate(() =>
        [...document.querySelectorAll(".deal-rail .deal-switcher-section-label")].map((b) => {
          const svg = b.querySelector(".deal-switcher-section-title svg");
          return {
            text: (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 20),
            hasIcon: !!svg,
            // Рисунок должен быть непустым: пустой <svg> проходит проверку «есть ли»
            // и при этом ничего не показывает.
            drawn: svg ? (svg.innerHTML || "").length > 20 : false,
          };
        }));
      assert(res.length >= 3, `секций на экране ${res.length}, ожидались три: ${JSON.stringify(res)}`);
      const noIcon = res.filter((r) => !r.hasIcon || !r.drawn);
      assertEqual(noIcon.length, 0, "у секции нет иконки: " + JSON.stringify(noIcon));
    } finally {
      await ctx.close();
    }
  });

  await test("строка сметы не повторяет капсулами то, что сказано рядом", async () => {
    /* Капсул было четыре, две ничего не добавляли. Замер на живой смете:
       «раздел» повторял ЗАГОЛОВОК ГРУППЫ, в которой строка лежит, 9 раз из 12
       (а в остальных трёх давал второй словарь для того же деления: группа
       «Съёмка» ↔ капсула «Техника»). «основная» совпадала с подписью «В итоге»
       у суммы 12 из 12; у опции то же самое сказано ещё и пунктирной рамкой всей
       карточки.

       Тест держит принцип, а не список: капсула не должна повторять ни заголовок
       своей группы, ни подпись у суммы. */
    await dismissStaleDialog(page);
    await page.evaluate(() => { window.app.go("deal"); window.app.setDealView("estimate"); });
    await page.waitForTimeout(700);
    const dupes = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll(".estimate-stage").forEach((st) => {
        const head = ((st.querySelector(".stage-header h2") || {}).textContent || "").trim().toLowerCase();
        st.querySelectorAll(".item").forEach((it) => {
          const note = ((it.querySelector(".line-total-note") || {}).textContent || "").trim().toLowerCase();
          [...it.querySelectorAll(".badges .badge, .badges .status-pill")].forEach((b) => {
            const t = (b.textContent || "").trim().toLowerCase();
            if (!t) return;
            if (head && t === head) bad.push(`капсула «${t}» повторяет заголовок группы`);
            // «основная» ↔ «в итоге», «опция» ↔ «не входит в итог»
            const saysSame = (t === "основная" && /в итоге/.test(note)) || (t === "опция" && /не входит/.test(note));
            if (saysSame) bad.push(`капсула «${t}» повторяет подпись «${note}» у суммы`);
          });
        });
      });
      return [...new Set(bad)];
    });
    assertEqual(dupes.length, 0, "в строке сметы повторы: " + dupes.join("; "));
  });

  await test("карточка сделки: имя не уходит под ручку переноса", async () => {
    /* Замер до правки на колонке 262px: у названия вроде «Реклама – База отдыха
       "Раздолье – Троица"» не влезало 59px, а ручка переноса начиналась на 12px
       РАНЬШЕ, чем кончалось имя — многоточие рисовалось прямо под точками.

       Мерим настоящие границы ТЕКСТА через Range, а не рамку элемента: у имени
       есть padding под ручку, поэтому коробка по-прежнему доходит до края
       карточки, и сравнение рамок ничего бы не показало. */
    const { ctx, p } = await bootRail();
    try {
      const res = await p.evaluate(() => {
        const row = document.querySelector(".deal-rail .deal-switcher-item");
        const name = row && row.querySelector(".deal-switcher-item-name");
        const grip = row && row.querySelector(".drag-handle--corner");
        if (!name || !grip) return null;
        const rng = document.createRange();
        rng.selectNodeContents(name);
        const rects = [...rng.getClientRects()];
        return {
          textRight: rects.length ? Math.max(...rects.map((r) => r.right)) : 0,
          gripLeft: grip.getBoundingClientRect().left,
          lines: rects.length,
          clipped: name.scrollHeight > name.clientHeight + 1,
        };
      });
      assert(res, "не нашлись строка сделки, её имя или ручка переноса");
      assert(res.textRight <= res.gripLeft + 0.5,
        `имя заходит под ручку переноса на ${Math.round(res.textRight - res.gripLeft)}px`);
      // Одна строка с многоточием резала именно то, что отличает сделку от соседней.
      assert(res.lines >= 1 && res.lines <= 2, `имя занимает ${res.lines} строк — ожидались одна или две`);
    } finally {
      await ctx.close();
    }
  });

  await test("боковой список сделок: у строки видимая обводка, а не только зазор", async () => {
    // Зазора оказалось мало: строки лежали прозрачными на фоне колонки, и границу
    // сделки приходилось угадывать по цветной полоске слева. Мерим РЕЗУЛЬТАТ —
    // что рамка ненулевая и её цвет отличается от того, на чём строка лежит;
    // способ (border, outline, box-shadow) тест не диктует, но border-цвет
    // «прозрачный» или в цвет фона поймает.
    const { ctx, p } = await bootRail();
    const res = await p.evaluate(() => {
      const it = document.querySelector(".deal-rail .deal-switcher-item");
      const rail = document.querySelector(".deal-rail");
      if (!it || !rail) return null;
      const cs = getComputedStyle(it);
      return {
        w: parseFloat(cs.borderTopWidth) || 0,
        color: cs.borderTopColor,
        shadow: cs.boxShadow,
        railBg: getComputedStyle(rail).backgroundColor,
        itemBg: cs.backgroundColor,
      };
    });
    await ctx.close();
    assert(res, "колонка сделок не отрисовалась — мерить нечего");
    const invisible = /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)|transparent/.test(res.color);
    assert(
      (res.w > 0 && !invisible) || (res.shadow && res.shadow !== "none"),
      "у строки сделки нет видимой обводки: " + JSON.stringify(res)
    );
    assert(res.itemBg !== res.railBg, "заливка строки совпала с фоном колонки — карточка сливается: " + JSON.stringify(res));
  });

  await test("боковой список сделок: строка переносится, порядок переживает перерисовку", async () => {
    const { ctx, p } = await bootRail();
    const sel = ".deal-rail .deal-switcher-item";
    const before = await p.$$eval(sel, (els) => els.map((e) => e.getAttribute("data-deal-id")));
    assert(before.length >= 3 && before.every(Boolean), "нужно три строки с data-deal-id: " + JSON.stringify(before));

    const box = await p.evaluate((s) => {
      const it = [...document.querySelectorAll(s)];
      const a = it[0].getBoundingClientRect(), b = it[1].getBoundingClientRect();
      return { fx: b.left + 40, fy: b.top + 14, tx: a.left + 40, ty: a.top + 6 };
    }, sel);
    await p.mouse.move(box.fx, box.fy);
    await p.mouse.down();
    await p.mouse.move(box.fx + 3, box.fy - 10, { steps: 3 });
    await p.waitForTimeout(120);
    const mid = await p.evaluate(() => ({
      placeholder: document.querySelectorAll(".deal-card-placeholder").length,
      flying: document.querySelectorAll(".deal-card-flying").length,
    }));
    assertEqual(mid.placeholder, 1, "на месте строки не появилось пятно");
    assertEqual(mid.flying, 1, "за указателем не поехал клон строки");

    await p.mouse.move(box.tx, box.ty, { steps: 10 });
    await p.waitForTimeout(150);
    await p.mouse.up();
    await p.waitForTimeout(400);

    const after = await p.$$eval(sel, (els) => els.map((e) => e.getAttribute("data-deal-id")));
    assert(JSON.stringify(after) !== JSON.stringify(before), "порядок не изменился после переноса");
    assertEqual(after.length, before.length, "перенос изменил число строк");

    // Главное в ручном порядке: автосортировка не должна вернуть всё назад на
    // следующем рендере — иначе перенос выглядит сломанным, хотя state правильный.
    await p.evaluate(() => window.app.go("deal"));
    await p.waitForTimeout(400);
    const afterRender = await p.$$eval(sel, (els) => els.map((e) => e.getAttribute("data-deal-id")));
    assertEqual(afterRender.join(","), after.join(","), "после перерисовки автосортировка вернула прежний порядок");
    const reset = await p.evaluate(() => !!document.querySelector(".deal-rail-order-reset"));
    const junk = await p.evaluate(() =>
      document.querySelectorAll(".deal-card-placeholder,.deal-card-flying").length +
      (document.body.classList.contains("is-dragging-card") ? 1 : 0));
    await ctx.close();
    assert(reset, "нет кнопки возврата к автосортировке — ручной порядок стал ловушкой без выхода");
    assertEqual(junk, 0, "после отпускания остался мусор в DOM");
  });

  await test("шапка сделки: кнопка «⋮» ВИДНА и её меню не обрезано", async () => {
    const { ctx, p } = await bootRail();
    const res = await p.evaluate(() => {
      const btn = document.querySelector(".deal-tabs-menu .deal-menu-btn");
      if (!btn) return { нет: true };
      // opacity наследуется, поэтому перемножаем по цепочке. Именно на этом
      // кнопка один раз уже оказалась КЛИКАБЕЛЬНОЙ, НО НЕВИДИМОЙ: базовое правило
      // .deal-menu-btn { opacity: 0 } проявляет её только внутри .deal-card, а в
      // шапке такого предка нет. Геометрия и elementFromPoint при этом врали, что
      // всё на месте, — проверять надо видимость.
      let opacity = 1;
      for (let e = btn; e && e !== document.body; e = e.parentElement) opacity *= parseFloat(getComputedStyle(e).opacity);
      const r = btn.getBoundingClientRect();
      btn.click();
      const m = document.querySelector(".deal-tabs-menu .deal-ctx-menu");
      if (!m) return { opacity, нетМеню: true };
      const mr = m.getBoundingClientRect();
      // Предок с overflow срезал бы выпадающее меню — ровно поэтому кнопка вынесена
      // из .deal-tabs, где overflow-x: auto для прокрутки вкладок.
      let clipped = null;
      for (let e = m.parentElement; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (/auto|hidden|scroll/.test(cs.overflowX + " " + cs.overflowY)) {
          const pr = e.getBoundingClientRect();
          if (mr.bottom > pr.bottom + 1 || mr.right > pr.right + 1 || mr.left < pr.left - 1) clipped = e.className || e.tagName;
          break;
        }
      }
      return {
        opacity,
        видна: r.width > 0 && r.height > 0 && r.right <= window.innerWidth + 1,
        пункты: [...m.querySelectorAll(".dcm-item")].map((b) => b.textContent.trim()),
        обрезано: clipped,
        вОкне: mr.bottom <= window.innerHeight + 1 && mr.right <= window.innerWidth + 1,
      };
    });
    await ctx.close();
    assert(!res.нет, "в шапке сделки нет кнопки действий «⋮»");
    assert(!res.нетМеню, "кнопка «⋮» есть, но меню не открылось");
    assertEqual(res.opacity, 1, "кнопка «⋮» прозрачна (" + res.opacity + ") — кликабельна, но невидима");
    assert(res.видна, "кнопка «⋮» вне окна");
    assert(!res.обрезано, "меню обрезано предком с overflow: " + res.обрезано);
    assert(res.вОкне, "меню вылезло за край окна");

    // Состав меню шапки НАМЕРЕННО не такой, как на плитке в «Проектах»: там оно
    // единственный способ что-то сделать со сделкой, не открывая её, а здесь
    // статус меняется шкалой этапов над вкладками, и вторая точка входа путала бы.
    const есть = (s) => res.пункты.some((x) => x.includes(s));
    assert(есть("Редактировать"), "в меню шапки нет «Редактировать»: " + JSON.stringify(res.пункты));
    assert(есть("Удалить"), "в меню шапки нет удаления — оно так и осталось спрятано ссылкой внизу модалки");
    assert(!есть("Выбрать"), "«Выбрать» — режим массового выделения в списке проектов, внутри открытой сделки он бессмыслен");
    /* «Завершить» здесь по-прежнему лишнее: «Завершённые» — обычный шаг воронки,
       он есть в шкале этапов прямо над вкладками.

       А вот «В архив» вернулся осознанно (решение владельца 13.08), и убирали его
       в v289 по неверной причине. Ссылка была на ту же шкалу — но «Архив»
       СПЕЦИАЛЬНО не входит в CRM_STATUSES: это не шаг воронки, а тупик, и шкала
       его поставить не может. Убрать открытую сделку в архив было нельзя вообще —
       приходилось выходить в «Проекты» и искать плитку. */
    assert(!есть("Завершить"),
      "«Завершить» вернулось в меню шапки, хотя этот статус есть в шкале этапов: " + JSON.stringify(res.пункты));
    assert(есть("архив") || есть("Вернуть в работу"),
      "из открытой сделки снова нельзя убрать её в архив: шкала этапов «Архив» не содержит — " + JSON.stringify(res.пункты));
  });

  await test("удаление открытой сделки уводит с её экрана, отмена возвращает", async () => {
    const { ctx, p, ids } = await bootRail();
    // Без этого удалённая сделка оставалась нарисованной целиком — со сметой,
    // суммами и полями ввода: activeProjectId обнулялся, но рабочая копия в
    // state.project переживала удаление, и её можно было продолжать «править».
    const read = () => p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return { view: st.view, active: st.activeProjectId, count: (st.savedProjects || []).length };
    });
    const before = await read();
    assertEqual(before.view, "deal", "тест начинается не с экрана сделки");

    await p.evaluate((i) => window.app.deleteSavedProject(i), ids[0]);
    await p.waitForTimeout(500);
    const afterDel = await read();
    assert(afterDel.view !== "deal", "после удаления открытой сделки остались на её экране — она всё ещё нарисована");
    assertEqual(afterDel.count, before.count - 1, "сделка не удалилась");

    // Отмена обязана вернуть и сделку, и экран: иначе «Отменить» возвращает данные,
    // а человек остаётся неизвестно где.
    await p.evaluate(() => window.app.undoLastDelete());
    await p.waitForTimeout(500);
    const afterUndo = await read();
    await ctx.close();
    assertEqual(afterUndo.count, before.count, "отмена не вернула сделку");
    assertEqual(afterUndo.view, "deal", "отмена вернула сделку, но не экран");
    assertEqual(afterUndo.active, ids[0], "отмена вернула экран, но сделка не стала активной");
  });

  await test("мастер сделки: поиск по пакетам сужает список и не теряет набранное", async () => {
    await dismissStaleDialog(page);
    const { ctx, p } = await (async () => {
      const b = await bootLocal(browser, baseUrl, { width: 1000, height: 820, seedDemo: true });
      return { ctx: b.context, p: b.page };
    })();

    await p.evaluate(() => { window.app.startWizard(); window.app.wizardSetData("step", 3); });
    await p.waitForTimeout(300);

    // «Пустая смета» — пунктирная карточка-действие, а не пакет: считаем только пакеты.
    const shot = () => p.evaluate(() => {
      const cards = [...document.querySelectorAll(".wizard-pkg-card")]
        .filter((c) => !/border-style:\s*dashed/.test(c.getAttribute("style") || ""));
      const note = [...document.querySelectorAll(".wizard-body .mini-note")]
        .map((n) => n.textContent.trim()).find((t) => /пакет|найдено/.test(t)) || "";
      return {
        cards: cards.length,
        note,
        found: (note.match(/найдено\s+(\d+)/) || [])[1],
        empty: !!document.querySelector(".wizard-pkg-empty"),
      };
    });

    const all = await shot();
    assert(all.cards > 10, "в мастере мало пакетов, тест не о том: " + all.cards);

    const input = await p.$("#wizardPkgSearch");
    assert(input, "в мастере нет поля поиска по пакетам — листать сорок с лишним пакетов приходится глазами");

    /* Печатаем посимвольно, а не через fill(): каждый символ перерисовывает мастер,
       и без восстановления фокуса в поле осталась бы одна буква. Проверяем именно
       набранное целиком — это и есть та часть, которая ломается молча. */
    await input.click();
    await p.keyboard.type("дрон", { delay: 60 });
    await p.waitForTimeout(300);

    const q = await shot();
    const live = await p.evaluate(() => ({
      value: (document.getElementById("wizardPkgSearch") || {}).value,
      focused: document.activeElement && document.activeElement.id,
    }));
    assertEqual(live.value, "дрон", "поле поиска не удержало набранное — перерисовка съедает символы");
    assertEqual(live.focused, "wizardPkgSearch", "после ввода фокус ушёл из поля поиска");
    assert(q.cards > 0 && q.cards < all.cards,
      `поиск не сузил список пакетов: было ${all.cards}, стало ${q.cards}`);
    assertEqual(Number(q.found), q.cards, "счётчик найденного не сходится с числом карточек: " + q.note);

    /* Совпадение может лежать в другой категории. Если выбранная вкладка молча
       победит запрос, человек увидит пустоту и решит, что пакета нет вовсе. */
    await p.evaluate(() => window.app.wizardSetData("pkgFilter", "photo"));
    await p.waitForTimeout(300);
    const crossCat = await shot();
    assert(crossCat.cards > 0,
      "запрос нашёл пакет, но выбранная категория показала пустоту — найденное недостижимо");

    await p.evaluate(() => window.app.wizardSetData("pkgSearch", "щщщ"));
    await p.waitForTimeout(300);
    const none = await shot();
    await ctx.close();
    assertEqual(none.cards, 0, "по бессмысленному запросу всё равно показаны пакеты");
    assert(none.empty, "пустой результат поиска ничем не объяснён — экран просто опустел");
  });

  await test("«Пакеты»: поиск сужает раздел и отвечает так же, как мастер сделки", async () => {
    await dismissStaleDialog(page);
    const b = await bootLocal(browser, baseUrl, { width: 1200, height: 900, seedDemo: true });
    const p = b.page;

    await p.evaluate(() => window.app.go("packages"));
    await p.waitForTimeout(400);

    const section = () => p.evaluate(() => ({
      cards: document.querySelectorAll(".package-card").length,
      cats: [...document.querySelectorAll(".catalog-cat-item")]
        .map((c) => c.textContent.trim().replace(/\s+/g, " ")),
      empty: !!document.querySelector(".empty"),
      screens: document.getElementById("appContent").scrollHeight / 900,
    }));

    const all = await section();
    assert(all.cards > 20, "в разделе мало пакетов, тест не о том: " + all.cards);

    const input = await p.$("#pkgSearchInput");
    assert(input, "в разделе «Пакеты» нет поиска — 43 карточки на десять экранов листаются глазами");

    await input.click();
    await p.keyboard.type("субтитры", { delay: 55 });
    await p.waitForTimeout(500);

    const found = await section();
    const live = await p.evaluate(() => ({
      v: (document.getElementById("pkgSearchInput") || {}).value,
      f: document.activeElement && document.activeElement.id,
    }));
    assertEqual(live.v, "субтитры", "поле поиска потеряло набранное");
    assertEqual(live.f, "pkgSearchInput", "после ввода фокус ушёл из поля поиска");
    assert(found.cards > 0 && found.cards < all.cards,
      `поиск не сузил раздел: было ${all.cards}, стало ${found.cards}`);
    assert(found.screens < all.screens / 2,
      `после поиска раздел всё ещё на ${found.screens.toFixed(1)} экрана — искать смысла нет`);

    /* Счётчики категорий сбоку обязаны показывать НАЙДЕННОЕ. Иначе «Фото 7» ведёт
       в категорию, где по запросу пусто, и цифра врёт. */
    const catNums = found.cats.map((t) => Number((t.match(/(\d+)\s*$/) || [])[1]) || 0);
    const catSum = catNums.reduce((a, x) => a + x, 0);
    assert(catSum <= found.cards * 2 && catSum > 0,
      "счётчики категорий не следуют за поиском: " + JSON.stringify(found.cats));

    /* Совпадение может лежать в другой категории — выбранная не должна молча
       победить запрос и показать пустоту. */
    await p.evaluate(() => { window.app.setPkgSearch(""); window.app.setPkgCatFilter("photo"); });
    await p.waitForTimeout(400);
    await p.evaluate(() => window.app.setPkgSearch("субтитры"));
    await p.waitForTimeout(500);
    const cross = await section();
    assert(cross.cards > 0, "найденное недостижимо: выбранная категория показала пустоту вместо совпадений");

    /* Раздел и мастер ищут по одним и тем же пакетам — расхождение означало бы, что
       на один запрос человек получает два разных ответа в зависимости от экрана. */
    await p.evaluate(() => window.app.setPkgSearch(""));
    await p.evaluate(() => { window.app.startWizard(); window.app.wizardSetData("step", 3); });
    await p.waitForTimeout(400);
    const wizardCards = await p.evaluate(() => {
      window.app.wizardSetData("pkgSearch", "субтитры");
      return [...document.querySelectorAll(".wizard-pkg-card")]
        .filter((c) => !/border-style:\s*dashed/.test(c.getAttribute("style") || "")).length;
    });
    await b.context.close();
    assertEqual(wizardCards, found.cards,
      "поиск по пакетам в мастере и в разделе дал разные ответы на один запрос");
  });

  /* Подсунуть объём: писать в localStorage и перезагружать НЕЛЬЗЯ — на выгрузке
     страница пишет свой снимок состояния поверх, и подсунутое молча пропадает.
     Открываем вторую вкладку: она читает хранилище заново. */
  async function bootWithState(mutate, size = { width: 1200, height: 900 }) {
    const b = await bootLocal(browser, baseUrl, { ...size, seedDemo: true });
    await b.page.waitForTimeout(300);
    await b.page.evaluate((src) => {
      const key = "adervis_pro_381_state";
      const st = JSON.parse(localStorage.getItem(key) || "{}");
      // eslint-disable-next-line no-new-func
      new Function("st", src)(st);
      localStorage.setItem(key, JSON.stringify(st));
      /* Снимаем «владение» хранилищем у этой вкладки: приложение пишет свой снимок
         на выгрузке и по save() только если ревизия в localStorage — его собственная
         (_ownsLsState). Без этого первая вкладка успевает затереть подсунутое своим
         состоянием из памяти, и вторая читает не то, что мы положили: у пакетов это
         выглядело как «слияние потеряло свой пакет пользователя». */
      localStorage.setItem("adervis_ls_rev", "seeded_by_test_" + Date.now());
    }, mutate);
    const p = await b.context.newPage();
    await p.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await p.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 15000 });
    await p.waitForTimeout(400);
    return { ctx: b.context, p };
  }

  await test("«Задачи»: поиск находит и то, что спрятано вкладкой состояния", async () => {
    await dismissStaleDialog(page);
    const { ctx, p } = await bootWithState(`
      st.globalTasks = [];
      for (let i = 0; i < 40; i++) {
        st.globalTasks.push({
          id: "t" + i, title: "Задача " + i + ": смонтировать ролик",
          status: i === 7 ? "Готово" : "Новая", priority: "Средний",
          assignee: i === 7 ? "Крылов" : "Иванов", comments: [],
        });
      }
      st.globalTasks[7].title = "Задача 7: цветокоррекция для Крылова";
    `);

    await p.evaluate(() => window.app.go("global-tasks"));
    await p.waitForTimeout(400);

    const shot = () => p.evaluate(() => ({
      rows: document.querySelectorAll(".gtask-row").length,
      screens: document.getElementById("appContent").scrollHeight / 900,
      empty: !!document.querySelector(".empty"),
    }));

    const all = await shot();
    assert(all.rows > 20, "мало задач для проверки, тест не о том: " + all.rows);

    const input = await p.$("#globalTaskSearch");
    assert(input, "в «Задачах» нет поиска — сорок строк на пять экранов листаются глазами");

    /* Задача 7 уже «Готово», а вкладка по умолчанию — «Активные». Если фильтр
       состояния победит запрос, человек получит пустой список при живом совпадении
       и решит, что задачи нет. */
    await input.click();
    await p.keyboard.type("Крылов", { delay: 50 });
    await p.waitForTimeout(500);

    const found = await shot();
    const live = await p.evaluate(() => ({
      v: (document.getElementById("globalTaskSearch") || {}).value,
      f: document.activeElement && document.activeElement.id,
    }));
    assertEqual(live.v, "Крылов", "поле поиска задач потеряло набранное");
    assertEqual(live.f, "globalTaskSearch", "после ввода фокус ушёл из поля поиска задач");
    assert(found.rows > 0, "готовая задача не найдена: вкладка состояния победила запрос");
    assert(found.rows < all.rows, `поиск не сузил список: было ${all.rows}, стало ${found.rows}`);

    await p.evaluate(() => window.app.setGlobalTaskSearch("щщщ"));
    await p.waitForTimeout(450);
    const none = await shot();
    await ctx.close();
    assertEqual(none.rows, 0, "по бессмысленному запросу всё равно показаны задачи");
    assert(none.empty, "пустой результат поиска задач ничем не объяснён");
  });

  await test("«Договоры»: поиск по номеру, клиенту и тексту договора", async () => {
    await dismissStaleDialog(page);
    const { ctx, p } = await bootWithState(`
      st.clients = [{ id: "cl1", name: "Пётр Крылов", company: "ООО Вектор", status: "new" }];
      st.contracts = [];
      for (let i = 0; i < 30; i++) {
        st.contracts.push({
          id: "c" + i, name: "Договор оказания услуг " + i, number: "ADV-" + (100 + i),
          category: i % 2 ? "Видео" : "Фото", status: "draft", body: "Общие условия. Предоплата 50%.",
          clientId: i === 5 ? "cl1" : "", updatedAt: new Date().toISOString(),
        });
      }
      st.contracts[9].body = "Особые условия: съёмка с квадрокоптера на объекте.";
    `);

    await p.evaluate(() => window.app.go("contracts"));
    await p.waitForTimeout(400);

    const cards = () => p.evaluate(() => document.querySelectorAll(".contract-card").length);
    // Считаем сами договоры, а не нарисованные карточки: список режется порциями,
    // и «сколько видно» про объём данных ничего не говорит.
    const all = await p.evaluate(() => JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}").contracts.length);
    assert(all >= 30, "мало договоров для проверки: " + all);

    const input = await p.$("#contractSearchInput");
    assert(input, "в «Договорах» нет поиска — тридцать карточек искать нечем");

    const probe = async (q) => {
      await p.evaluate((v) => window.app.setContractSearch(v), q);
      await p.waitForTimeout(450);
      return cards();
    };

    assertEqual(await probe("ADV-117"), 1, "поиск по номеру договора не нашёл ровно один");
    assertEqual(await probe("Крылов"), 1, "договор не находится по имени привязанного клиента");
    // Текст договора — то, что помнят лучше названия: условие, объект, оговорку.
    assertEqual(await probe("квадрокоптера"), 1, "поиск не заглядывает в текст договора");
    assertEqual(await probe("щщщ"), 0, "по бессмысленному запросу всё равно показаны договоры");
    const empty = await p.evaluate(() => !!document.querySelector(".empty"));
    await ctx.close();
    assert(empty, "пустой результат поиска договоров ничем не объяснён");
  });

  await test("доска CRM: поиск сужает колонки, и ни одна сделка не пропадает с доски", async () => {
    await dismissStaleDialog(page);
    /* Каждому этапу воронки — своя сделка, плюс одна в архиве. Так сумма счётчиков
       колонок обязана сойтись с числом неархивных сделок: если этап когда-нибудь
       переименуют без миграции, сделки со старым статусом исчезнут с доски молча —
       ни колонки, ни счётчика, ни следа. */
    const { ctx, p } = await bootWithState(`
      const base = (st.savedProjects || [])[0];
      const stages = ["Лид","Бриф","КП отправлено","Согласование","Договор","Предоплата","В работе","Сдано","Оплата","Завершённые"];
      st.savedProjects = [];
      stages.forEach((s, i) => {
        const c = JSON.parse(JSON.stringify(base));
        c.id = "p" + i; c.name = "Проект " + i + " для «Ромашки»"; c.client = "Ромашка"; c.crmStatus = s;
        st.savedProjects.push(c);
      });
      const arch = JSON.parse(JSON.stringify(base));
      arch.id = "pArch"; arch.name = "Отменённый проект"; arch.client = "Одуванчик"; arch.crmStatus = "Архив";
      st.savedProjects.push(arch);
      const other = JSON.parse(JSON.stringify(base));
      other.id = "pOther"; other.name = "Съёмка каталога"; other.client = "Василёк"; other.crmStatus = "Лид";
      st.savedProjects.push(other);
    `);

    await p.evaluate(() => window.app.go("crm"));
    await p.waitForTimeout(450);

    const board = () => p.evaluate(() => ({
      cards: document.querySelectorAll(".crm-card").length,
      colSum: [...document.querySelectorAll(".kanban-col h3 .pill-count")]
        .reduce((a, e) => a + (Number(e.textContent.trim()) || 0), 0),
      note: (document.querySelector(".catalog-found-count") || {}).textContent || "",
      empty: !!document.querySelector(".empty"),
      hasBoard: !!document.querySelector(".kanban"),
    }));

    const all = await board();
    // 10 этапов + ещё одна в «Лид»; архивная на доске не показывается.
    assertEqual(all.colSum, 11, "сумма счётчиков колонок не сошлась с числом сделок — часть исчезла с доски: " + all.colSum);
    assertEqual(all.cards, 11, "на доске нарисовано не столько карточек, сколько обещают счётчики: " + all.cards);

    const input = await p.$("#crmBoardSearch");
    assert(input, "на доске CRM нет поиска — сделку в воронке приходится искать глазами по колонкам");

    await input.click();
    await p.keyboard.type("Василёк", { delay: 50 });
    await p.waitForTimeout(500);
    const found = await board();
    const live = await p.evaluate(() => ({
      v: (document.getElementById("crmBoardSearch") || {}).value,
      f: document.activeElement && document.activeElement.id,
    }));
    assertEqual(live.v, "Василёк", "поле поиска на доске потеряло набранное");
    assertEqual(live.f, "crmBoardSearch", "после ввода фокус ушёл из поля поиска доски");
    assertEqual(found.cards, 1, "поиск по клиенту на доске не оставил ровно одну сделку: " + found.cards);
    assertEqual(found.colSum, 1, "счётчики колонок не следуют за поиском: " + found.colSum);
    assert(/найдено/i.test(found.note), "не сказано, сколько найдено из скольких: " + found.note);

    await p.evaluate(() => window.app.setCrmSearch("щщщ"));
    await p.waitForTimeout(450);
    const none = await board();
    await ctx.close();
    assert(none.empty && !none.hasBoard,
      "по пустому результату показана доска из пустых колонок вместо ответа «не нашлось»");
  });

  await test("длинные списки режутся порциями: клиенты, задачи, договоры", async () => {
    await dismissStaleDialog(page);
    const { ctx, p } = await bootWithState(`
      st.clients = [];
      for (let i = 0; i < 200; i++) {
        st.clients.push({ id: "cl" + i, name: "Клиент " + i, company: "ООО " + i,
          phone: "+79001112233", email: "c" + i + "@mail.ru", status: "new" });
      }
      st.clients[7].name = "Одинокий Уникум";
      st.globalTasks = [];
      for (let i = 0; i < 150; i++) {
        st.globalTasks.push({ id: "gt" + i, title: "Задача " + i, status: "Новая",
          priority: "Средний", assignee: "Иванов", comments: [] });
      }
      st.contracts = [];
      for (let i = 0; i < 120; i++) {
        st.contracts.push({ id: "ct" + i, name: "Договор " + i, number: "ADV-" + i,
          category: "Видео", status: "draft", body: "Условия", updatedAt: new Date().toISOString() });
      }
    `);

    const measure = (sel) => p.evaluate((s) => {
      const root = document.getElementById("appContent");
      return {
        rows: root.querySelectorAll(s).length,
        nodes: root.querySelectorAll("*").length,
        more: [...root.querySelectorAll("button")].find((b) => /показать ещё/i.test(b.textContent || ""))?.textContent.trim() || "",
      };
    }, sel);

    /* Порог — не «сколько именно», а «не всё разом»: страница на 25 экранов с
       четырьмя тысячами узлов пересобирается на КАЖДЫЙ render(), в том числе на
       каждый символ в поиске. */
    const cases = [
      { view: "clients", sel: ".client-card", total: 200 },
      { view: "global-tasks", sel: ".gtask-row", total: 150 },
      { view: "contracts", sel: ".contract-card", total: 120 },
    ];

    for (const c of cases) {
      await p.evaluate((v) => window.app.go(v), c.view);
      await p.waitForTimeout(400);
      const first = await measure(c.sel);
      assert(first.rows > 0, `${c.view}: список пуст, подсунутые данные не доехали`);
      assert(first.rows < c.total / 2,
        `${c.view}: нарисовано ${first.rows} из ${c.total} — список рисуется целиком`);
      assert(/показать ещё/i.test(first.more),
        `${c.view}: часть записей скрыта, но кнопки «Показать ещё» нет — до остальных не добраться`);
      assert(/осталось\s+\d+/.test(first.more),
        `${c.view}: не сказано, сколько записей осталось: «${first.more}»`);

      await p.evaluate(() => {
        const b = [...document.querySelectorAll("#appContent button")].find((x) => /показать ещё/i.test(x.textContent || ""));
        if (b) b.click();
      });
      await p.waitForTimeout(400);
      const second = await measure(c.sel);
      assert(second.rows > first.rows,
        `${c.view}: «Показать ещё» не добавила записей (${first.rows} → ${second.rows})`);
    }

    /* Поиск обязан сбросить доращённый лимит: иначе после «показать ещё» до сотни
       поиск по трём совпадениям оставит кнопку, обещающую несуществующий остаток. */
    await p.evaluate(() => window.app.go("clients"));
    await p.waitForTimeout(300);
    await p.evaluate(() => {
      const i = document.querySelector(".clients-search-input");
      i.value = "Одинокий";
      i.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await p.waitForTimeout(500);
    const searched = await measure(".client-card");
    await ctx.close();
    assertEqual(searched.rows, 1, "поиск по клиентам дал не одно совпадение: " + searched.rows);
    assertEqual(searched.more, "", "после поиска осталась кнопка «Показать ещё», хотя показывать нечего");
  });

  await test("финансы: строки режутся порциями, а итоги остаются по ВСЕМ операциям", async () => {
    await dismissStaleDialog(page);
    /* Суммы круглые нарочно: ожидаемый итог тогда не зависит от арифметики в уме —
       60 сделок × (10 000 + 10 000) = 1 200 000 получено и 60 × 5 000 = 300 000 расходов. */
    const { ctx, p } = await bootWithState(`
      const base = (st.savedProjects || [])[0];
      st.savedProjects = [];
      st.payments = [];
      st.expenses = [];
      for (let i = 0; i < 60; i++) {
        const d = JSON.parse(JSON.stringify(base));
        d.id = "fp" + i;
        d.name = "Проект " + i;
        d.crmStatus = "В работе";
        d.snapshot = d.snapshot || {};
        d.snapshot.payments = [
          { id: "pay_a" + i, amount: 10000, date: "2026-08-01", title: "Аванс", method: "Перевод" },
          { id: "pay_b" + i, amount: 10000, date: "2026-08-02", title: "Остаток", method: "Перевод" },
        ];
        d.snapshot.expenses = [
          { id: "exp_a" + i, amount: 5000, date: "2026-08-03", title: "Аренда", category: "Прочее" },
        ];
        st.savedProjects.push(d);
      }
    `);

    await p.evaluate(() => window.app.go("global-finances"));
    await p.waitForTimeout(500);

    const read = () => p.evaluate(() => {
      const root = document.getElementById("appContent");
      const norm = (s) => (s || "").replace(/[\s ]/g, "");
      return {
        rows: root.querySelectorAll(".fin-table tbody tr").length,
        moreBtn: [...root.querySelectorAll("button")].find((b) => /показать ещё/i.test(b.textContent || ""))?.textContent.trim().replace(/\s+/g, " ") || "",
        foot: [...root.querySelectorAll(".fin-table-footer .amount-cell")].map((e) => norm(e.textContent)),
        counter: norm((root.textContent.match(/\d[\d\s ]*операц\S+[^]{0,80}?расходов/) || [""])[0]),
        nodes: root.querySelectorAll("*").length,
      };
    });

    const first = await read();
    assert(first.rows > 0, "таблица финансов пуста — посеянные операции не доехали");
    assert(first.rows <= 45, `в таблице сразу ${first.rows} строк — список рисуется целиком`);
    assert(/показать ещё/i.test(first.moreBtn), "часть операций скрыта, но кнопки «Показать ещё» нет");
    assert(/осталось\s+\d+/.test(first.moreBtn), "не сказано, сколько операций осталось: «" + first.moreBtn + "»");

    /* Главное. Показать первые сорок операций законно; показать сумму первых сорока
       под подписью «Итого получено» — это соврать про деньги. */
    assert(first.foot.some((f) => f.includes("1200000")),
      "«Итого получено» считается не по всем операциям: " + JSON.stringify(first.foot));
    assert(first.foot.some((f) => f.includes("300000")),
      "«Итого расходов» считается не по всем операциям: " + JSON.stringify(first.foot));
    assert(first.counter.includes("180операц") || /^180/.test(first.counter),
      "счётчик над таблицей показывает не все операции: «" + first.counter + "»");

    await p.evaluate(() => {
      const b = [...document.querySelectorAll("#appContent button")].find((x) => /показать ещё/i.test(x.textContent || ""));
      if (b) b.click();
    });
    await p.waitForTimeout(450);
    const second = await read();
    await ctx.close();
    assert(second.rows > first.rows, `«Показать ещё» не добавила строк (${first.rows} → ${second.rows})`);
    assert(second.foot.some((f) => f.includes("1200000")),
      "после подгрузки итог изменился — значит, он считался по показанному: " + JSON.stringify(second.foot));
  });

  await test("цена пакета не зависит от того, какая сделка открыта", async () => {
    await dismissStaleDialog(page);
    const priceOf = (pid) => page.evaluate((id) => {
      window.app.go("packages");
      const card = [...document.querySelectorAll(".package-card")]
        .find((c) => (c.getAttribute("onclick") || "").includes(id));
      return card ? Number(((card.querySelector(".pkg-card-price") || {}).textContent || "").replace(/\D/g, "")) : null;
    }, pid);

    /* Цена считалась через defaultLineForItem, а тот берёт `days` из открытого
       проекта: витрина пакетов молча дорожала на многодневной сделке, а в мастере
       создания сделки считалась по дням ПРЕДЫДУЩЕГО проекта — сделки-то ещё нет. */
    await page.evaluate(() => { window.app.newProject(); });
    await page.waitForTimeout(250);
    const onEmpty = await priceOf("event_report_half");
    assert(onEmpty > 0, "цена пакета не прочиталась");

    // Дни меняем ТЕМ ЖЕ путём, что поле «Дней съёмки / проекта» в смете —
    // app.updateProject('days', …). Первая версия теста звала несуществующий
    // app.setDays, дни оставались единицей, и тест проходил даже со сломанным
    // кодом: проверял ровно ничего.
    await page.evaluate(() => window.app.updateProject("days", 3));
    await page.waitForTimeout(300);
    const daysNow = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return st.project && st.project.days;
    });
    assertEqual(Number(daysNow), 3, "тест не смог задать число дней — проверять нечего");

    const onThreeDays = await priceOf("event_report_half");
    assertEqual(onThreeDays, onEmpty,
      `цена пакета поехала за числом дней открытой сделки: ${onEmpty} → ${onThreeDays}`);
  });

  await test("витрина пакетов не врёт: карточка сходится с итогом сметы по ВСЕМ 45", async () => {
    await dismissStaleDialog(page);
    const { ctx, p } = await (async () => {
      const b = await bootLocal(browser, baseUrl, { width: 1300, height: 950, seedDemo: true });
      return { ctx: b.context, p: b.page };
    })();
    await p.waitForTimeout(400);

    const ids = await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st.packages || []).map((x) => ({ id: x.id, name: x.name }));
    });
    assert(ids.length > 40, "пакетов меньше, чем ожидалось: " + ids.length);

    const cards = await p.evaluate(() => {
      window.app.go("packages");
      const out = {};
      document.querySelectorAll(".package-card").forEach((c) => {
        const m = (c.getAttribute("onclick") || "").match(/'([^']+)'/);
        if (m) out[m[1]] = Number(((c.querySelector(".pkg-card-price") || {}).textContent || "").replace(/\D/g, ""));
      });
      return out;
    });

    /* Пакет применяем в ЧИСТУЮ односуточную сделку — в тех же условиях, в которых
       посчитана витрина. Расхождение здесь значит, что человеку показали одну сумму,
       а в смету легла другая: состав ссылается на несуществующую позицию, количество
       из состава не доехало или ставка считается иначе. */
    const bad = [];
    for (const { id, name } of ids) {
      const applied = await p.evaluate(async (pid) => {
        window.app.newProject();
        window.app.applyPackage(pid);
        window.app.go("deal");
        await new Promise((r) => setTimeout(r, 100));
        const t = document.getElementById("appContent").textContent.replace(/\s+/g, " ");
        const m = t.match(/([\d\s ]+)\s*₽\s*\d+ позиц/);
        return m ? Number(m[1].replace(/\D/g, "")) : null;
      }, id);
      if (cards[id] == null) { bad.push(`${name}: карточки нет на витрине`); continue; }
      if (applied == null) { bad.push(`${name}: итог сметы не прочитался`); continue; }
      if (cards[id] !== applied) bad.push(`${name}: на карточке ${cards[id]}, в смете ${applied}`);
    }
    await ctx.close();
    assert(!bad.length, "витрина пакетов расходится со сметой:\n  " + bad.join("\n  "));
  });

  await test("срок съёмки двигает смету — но только те строки, что не правили руками", async () => {
    await dismissStaleDialog(page);
    const b = await bootLocal(browser, baseUrl, { width: 1300, height: 950, seedDemo: true });
    const p = b.page;
    await p.waitForTimeout(300);

    const read = () => p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const l = st.selected || {};
      return {
        days: st.project && st.project.days,
        cam: l.camera_basic && Number(l.camera_basic.rentalDays),
        jib: l.jib_rent && Number(l.jib_rent.rentalDays),
        op: l.event_cameraman && Number(l.event_cameraman.days),
      };
    });

    await p.evaluate(() => {
      window.app.newProject();
      window.app.applyPackage("event_sde_day");
      window.app.catalogAddOne("jib_rent");
    });
    await p.waitForTimeout(400);
    // Кран правим руками: пять дней аренды при любом сроке проекта.
    await p.evaluate(() => window.app.updateLine("jib_rent", "rentalDays", 5));
    await p.waitForTimeout(300);
    const before = await read();
    assertEqual(before.cam, 1, "техника легла в смету не на один день");
    assertEqual(before.jib, 5, "ручная правка дней не применилась");

    /* Поле «Дней съёмки / проекта» меняло только значение по умолчанию для будущих
       позиций: собранная смета не двигалась вовсе, а следующая добавленная аренда
       приходила уже на новый срок — в одной смете строки с разным числом дней. */
    await p.evaluate(() => window.app.updateProject("days", 4));
    await p.waitForTimeout(400);
    const asked = await p.evaluate(() => {
      const o = document.querySelector(".confirm-dialog-overlay");
      return o ? o.textContent.replace(/\s+/g, " ") : "";
    });
    assert(/пересчитать/i.test(asked), "смена срока съёмки прошла молча, смету никто не предложил пересчитать");

    // Отказ обязан оставить всё как было — иначе вопрос декоративный.
    await p.evaluate(() => {
      const btn = [...document.querySelectorAll(".confirm-dialog-overlay button")].find((x) => !x.classList.contains("confirm-ok"));
      if (btn) btn.click();
    });
    await p.waitForTimeout(500);
    const declined = await read();
    assertEqual(declined.cam, 1, "после отказа техника всё равно пересчиталась");
    assertEqual(declined.jib, 5, "после отказа поехала ручная правка");
    assertEqual(declined.op, 1, "после отказа поехала смена оператора");

    /* И повторный заход обязан снова спросить: первая версия правки считала
       «нетронутой» строку по совпадению со старым сроком, и после одного отказа
       строки замирали навсегда. */
    await p.evaluate(() => window.app.updateProject("days", 6));
    await p.waitForTimeout(400);
    const askedAgain = await p.evaluate(() => !!document.querySelector(".confirm-dialog-overlay"));
    assert(askedAgain, "после отказа приложение больше не предлагает пересчёт — строки замерли навсегда");

    await p.evaluate(() => {
      const btn = document.querySelector(".confirm-dialog-overlay .confirm-ok");
      if (btn) btn.click();
    });
    await p.waitForTimeout(600);
    const applied = await read();
    await b.context.close();
    assertEqual(applied.cam, 6, "согласились на пересчёт, а техника осталась на старом сроке");
    assertEqual(applied.op, 6, "согласились на пересчёт, а смена оператора осталась на старом сроке");
    assertEqual(applied.jib, 5, "пересчёт затёр вручную заданные дни аренды");
  });

  await test("счёт на оплату содержит позиции сметы, а не заглушку", async () => {
    await dismissStaleDialog(page);
    const b = await bootLocal(browser, baseUrl, { width: 1300, height: 950, seedDemo: true });
    const p = b.page;
    await p.waitForTimeout(300);

    /* Печать счёта собирала строки из `state.items` — поля, которого на состоянии не
       существует (это уже находили в saveCurrentProject и починили ТАМ). Обход этапов
       был недописан и всегда возвращал пустой массив, поэтому клиент получал документ
       на оплату из одной строки «Услуги загружаются из текущей сметы» и итога. */
    const invoice = () => p.evaluate(() => {
      let html = "";
      const realOpen = window.open;
      window.open = () => ({ document: { write: (s) => { html += s; }, close() {} }, focus() {}, print() {}, close() {} });
      try { window.app.printInvoice(); } finally { window.open = realOpen; }
      const grab = (label) => {
        const m = html.match(new RegExp(label + "<\\/td>\\s*<td[^>]*>([^<]+)<"));
        return m ? Number(m[1].replace(/\D/g, "")) : null;
      };
      const rows = [...html.matchAll(/<td style="color:#888">(\d+)<\/td>[\s\S]*?<td>([\d\s ]+)<\/td>\s*<\/tr>/g)]
        .map((m) => Number(m[2].replace(/\D/g, "")));
      return {
        items: rows.length,
        rowsSum: rows.reduce((a, x) => a + x, 0),
        smeta: grab("Итого по смете"),
        discount: grab("Скидка"),
        paid: grab("Уже оплачено"),
        due: grab("К ОПЛАТЕ"),
        stub: /Услуги загружаются из текущей сметы/.test(html),
        names: /Оператор мероприятия/.test(html),
      };
    });

    const lines = await p.evaluate(async () => {
      window.app.newProject();
      window.app.updateProject("name", "Счёт");
      window.app.applyPackage("event_sde_day");
      window.app.catalogAddOne("jib_rent");
      await new Promise((r) => setTimeout(r, 250));
      // Скидка — в ПРОЦЕНТАХ (поле «Скидка, %», totals клампит 0..100). Ставим её
      // нарочно: без неё проверка «сумма строк = итог» верна случайно и ничего не
      // говорит про то, объяснён ли клиенту разрыв между строками и суммой внизу.
      window.app.updateProject("discount", 10);
      await new Promise((r) => setTimeout(r, 250));
      window.app.saveCurrentProject();
      await new Promise((r) => setTimeout(r, 400));
      return Object.keys(JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}").selected || {}).length;
    });

    const clean = await invoice();
    assert(!clean.stub, "в счёте по-прежнему заглушка вместо позиций");
    assert(clean.names, "в счёте нет названий услуг из сметы");
    assertEqual(clean.items, lines, `в счёте ${clean.items} позиций, а в смете ${lines}`);
    assert(clean.discount > 0, "скидка не показана в счёте отдельной строкой — сумма строк не сойдётся с итогом");
    assertEqual(clean.rowsSum - clean.discount, clean.smeta,
      `строки (${clean.rowsSum}) минус скидка (${clean.discount}) не дают «Итого по смете» (${clean.smeta})`);
    assertEqual(clean.due, clean.smeta, "без оплат «К ОПЛАТЕ» должно равняться смете");

    // Частичная оплата: остаток, а не полная сумма заново.
    await p.evaluate(async () => {
      window.app.createPayment();
      await new Promise((r) => setTimeout(r, 200));
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const pay = (st.payments || [])[0];
      if (pay) window.app.updatePayment(pay.id, "amount", 20000);
    });
    await p.waitForTimeout(400);
    const partly = await invoice();
    assertEqual(partly.paid, 20000, "в счёте не показано, что часть уже оплачена");
    assertEqual(partly.due, clean.smeta - 20000, "«К ОПЛАТЕ» не уменьшилось на внесённый платёж");

    /* Полная оплата: стояло `f.debt || t.total` — ноль ложен, и счёт требовал ВСЮ
       сумму заново, будто денег не платили. */
    await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const pay = (st.payments || [])[0];
      if (pay) window.app.updatePayment(pay.id, "amount", 999999);
    });
    await p.waitForTimeout(400);
    const overpaid = await invoice();
    await b.context.close();
    assertEqual(overpaid.due, 0, "по оплаченной сделке счёт снова требует денег: " + overpaid.due);
  });

  await test("общий поиск находит услуги и пакеты и открывает раздел уже отфильтрованным", async () => {
    await dismissStaleDialog(page);
    const b = await bootLocal(browser, baseUrl, { width: 1300, height: 950, seedDemo: true });
    const p = b.page;
    await p.waitForTimeout(300);

    const search = async (q) => {
      await p.evaluate(() => window.app.openSearch());
      await p.waitForTimeout(200);
      await p.evaluate((query) => {
        const i = document.getElementById("searchInput");
        i.value = query;
        i.dispatchEvent(new Event("input", { bubbles: true }));
      }, q);
      await p.waitForTimeout(350);
      return p.evaluate(() => ({
        sections: [...document.querySelectorAll(".search-section")].map((s) => s.textContent.trim().replace(/\s+/g, " ")),
        names: [...document.querySelectorAll(".search-result-name")].map((n) => n.textContent.trim()),
      }));
    };

    /* Каталог и пакеты — самое большое, что есть в приложении (127 позиций и 45
       пакетов против горстки сделок у нового пользователя), а общий поиск их не
       знал: на «дрон» человек получал пустоту при живой услуге и трёх пакетах. */
    const drone = await search("дрон");
    assert(drone.names.some((n) => /Пилот дрона|Дрон/i.test(n)),
      "общий поиск не находит услугу каталога: " + JSON.stringify(drone.names.slice(0, 5)));
    assert(drone.sections.some((s) => /Услуги каталога/i.test(s)), "в выдаче нет раздела услуг: " + JSON.stringify(drone.sections));

    // Пакеты ищутся и по СОСТАВУ — тем же матчером, что витрина и мастер.
    const subs = await search("субтитры");
    assert(subs.sections.some((s) => /Пакеты/i.test(s)),
      "пакеты не находятся по составу — а именно по нему их и помнят: " + JSON.stringify(subs.sections));

    /* Переход обязан открыть раздел С УЖЕ ВПИСАННЫМ запросом: иначе поиск отвечает
       «нашлось», а на странице снова весь список из сорока пяти. */
    await search("SDE");
    const jump = await p.evaluate(async () => {
      const row = [...document.querySelectorAll(".search-result")].find((r) => /packages/.test(r.getAttribute("onclick") || ""));
      if (!row) return null;
      row.click();
      await new Promise((r) => setTimeout(r, 600));
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return { view: st.view, query: st.pkgSearch || "", cards: document.querySelectorAll(".package-card").length };
    });
    await b.context.close();
    assert(jump, "в выдаче не оказалось пакета, хотя SDE-пакет существует");
    assert(/SDE/i.test(jump.query), "раздел открылся без запроса — искать придётся заново: " + JSON.stringify(jump));
    assertEqual(jump.cards, 1, "после перехода показан не один найденный пакет, а " + jump.cards);
  });

  await test("«Команда»: поиск и порции — карточка участника это форма, а не строка", async () => {
    await dismissStaleDialog(page);
    const { ctx, p } = await bootWithState(`
      st.companyTeam = [];
      for (let i = 0; i < 40; i++) {
        st.companyTeam.push({ id: "ct" + i, name: "Сотрудник " + i, role: i % 2 ? "Оператор" : "Монтажёр",
          rate: 5000 + i * 100, phone: "+79001112233", email: "x" + i + "@mail.ru" });
      }
      st.companyTeam[3].name = "Пётр Одиночкин";
      st.companyTeam[3].role = "Колорист";
    `, { width: 390, height: 780 });

    await p.evaluate(() => window.app.go("company-team"));
    await p.waitForTimeout(400);

    const read = () => p.evaluate(() => {
      const root = document.getElementById("appContent");
      return {
        cards: root.querySelectorAll("[data-scope='companyTeam'][data-key='name']").length,
        screens: +(root.scrollHeight / 780).toFixed(1),
        more: [...root.querySelectorAll("button")].find((b) => /показать ещё/i.test(b.textContent || ""))?.textContent.trim().replace(/\s+/g, " ") || "",
      };
    });

    /* Карточка участника — форма с шестью полями: сорок человек давали 27 экранов
       подряд на телефоне. Раздел единственный, где список рисовался целиком. */
    const first = await read();
    assert(first.cards > 0, "раздел «Команда» пуст — подсунутые сотрудники не доехали");
    assert(first.cards < 20, `нарисовано ${first.cards} карточек из 40 — список рисуется целиком`);
    assert(first.screens < 12, `раздел на телефоне занимает ${first.screens} экрана`);
    assert(/показать ещё/i.test(first.more), "часть команды скрыта, но кнопки «Показать ещё» нет");

    await p.evaluate(() => {
      const b = [...document.querySelectorAll("#appContent button")].find((x) => /показать ещё/i.test(x.textContent || ""));
      if (b) b.click();
    });
    await p.waitForTimeout(400);
    const second = await read();
    assert(second.cards > first.cards, `«Показать ещё» не добавила карточек (${first.cards} → ${second.cards})`);

    // Поиск: по имени и по роли, с очевидным пустым состоянием.
    const search = async (q) => {
      await p.evaluate((v) => window.app.setCompanyTeamSearch(v), q);
      await p.waitForTimeout(400);
      return p.evaluate(() => ({
        cards: document.querySelectorAll("[data-scope='companyTeam'][data-key='name']").length,
        empty: !!document.querySelector(".empty"),
      }));
    };
    assertEqual((await search("Одиночкин")).cards, 1, "поиск по имени не нашёл ровно одного");
    assertEqual((await search("Колорист")).cards, 1, "поиск по роли не сработал");
    const none = await search("щщщ");
    await ctx.close();
    assertEqual(none.cards, 0, "по бессмысленному запросу всё равно показаны участники");
    assert(none.empty, "пустой результат поиска по команде ничем не объяснён");
  });

  await test("новые пакеты из кода доезжают до аккаунта, где пакеты уже сохранены", async () => {
    await dismissStaleDialog(page);
    /* Пакеты хранятся в аккаунте целиком, и раньше сохранённый список полностью
       вытеснял значения из кода: у владельца на проде оказалось 39 пакетов из 45 —
       не хватало шести, включая заказанный им накануне SDE. Работа сделана,
       оттестирована, задеплоена и невидима. */
    const { ctx, p } = await bootWithState(`
      // Аккаунт «из прошлого»: два пакета, один свой и один правленый встроенный.
      st.packages = [
        { id: "social_start", name: "Соц. сети 1 — Старт (моя правка)", cat: "social", tier: 1,
          desc: "Правленое описание", goodFor: "мои клиенты", items: ["idea"], notes: [] },
        { id: "package_custom1", name: "Мой пакет", cat: "video", desc: "свой", goodFor: "себе", items: ["idea"], notes: [] },
      ];
    `);

    /* Читаем НАРИСОВАННОЕ, а не localStorage: слияние происходит в памяти при
       загрузке, а в хранилище состояние попадёт только со следующим сохранением.
       Первая версия теста читала хранилище и падала на исправном коде. */
    await p.evaluate(() => window.app.go("packages"));
    await p.waitForTimeout(400);
    const res = await p.evaluate(() => {
      const cards = [...document.querySelectorAll(".package-card")];
      const ids = cards.map((c) => ((c.getAttribute("onclick") || "").match(/'([^']+)'/) || [])[1]).filter(Boolean);
      const social = cards.find((c) => (c.getAttribute("onclick") || "").includes("social_start"));
      return {
        count: ids.length,
        hasSde: ids.includes("event_sde_day"),
        hasMarketplace: ids.includes("photo_marketplace"),
        keptCustom: ids.includes("package_custom1"),
        editedName: social ? (social.querySelector(".pkg-card-name") || {}).textContent.trim() : "",
        dupes: ids.length !== new Set(ids).size,
      };
    });
    await ctx.close();

    assert(res.hasSde, "пакет SDE из кода не доехал до аккаунта с сохранёнными пакетами");
    void 0;
    assert(res.hasMarketplace, "пакет предметной съёмки не доехал");
    assert(res.keptCustom, "свой пакет пользователя пропал при слиянии");
    assert(/моя правка/.test(res.editedName),
      "слияние затёрло правку пользователя во встроенном пакете: «" + res.editedName + "»");
    assert(!res.dupes, "после слияния в списке появились пакеты-двойники");
    assert(res.count > 40, "недостающие пакеты дописались не полностью: " + res.count);
  });

  await test("этапы и база знаний тоже догоняют код — но удалённое не воскресает", async () => {
    await dismissStaleDialog(page);
    /* Тот же класс, что и с пакетами: коллекция лежит в состоянии целиком, и всё
       добавленное в код после первого входа человека до него не доезжает. Разница в
       том, что встроенный документ базы знаний УДАЛИТЬ можно — значит, слияние обязано
       уважать удаление, иначе документ вернётся на следующей же загрузке. */
    const { ctx, p } = await bootWithState(`
      st.stages = [{ id: "pre", name: "Мой этап", color: "#000", desc: "правленый" }];
      const docs = JSON.parse(JSON.stringify(st.knowledgeDocs || []));
      // Аккаунт «из прошлого»: один документ остался, один удалён пользователем.
      const kept = docs[0];
      const deletedId = (docs[1] || {}).id || "kb_sales_2";
      st.knowledgeDocs = kept ? [kept] : [];
      st.deletedKbDocs = { [deletedId]: true };
      st._testDeletedId = deletedId;
    `);

    const res = await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      const deletedId = st._testDeletedId;
      // Читаем ПАМЯТЬ приложения через отрисовку: слияние попадёт в хранилище
      // только со следующим сохранением.
      window.app.go("knowledge");
      const kbTitles = [...document.querySelectorAll("#appContent .kb-card, #appContent [onclick*='kbOpen']")]
        .map((e) => (e.textContent || "").trim().slice(0, 40));
      window.app.go("deal");
      return { deletedId, kbCount: kbTitles.length, kbTitles: kbTitles.slice(0, 3) };
    });

    const stages = await p.evaluate(() => {
      // Этапы видны в смете как заголовки групп; берём их из состояния после render.
      window.app.go("catalog");
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st.stages || []).map((x) => x.id);
    });
    void stages;

    const inMemory = await p.evaluate(() => {
      // Единственный честный способ увидеть память — заставить приложение сохранить.
      window.app.updateProject("name", "проверка слияния");
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return {
        stageIds: (st.stages || []).map((x) => x.id),
        stageFirstName: ((st.stages || [])[0] || {}).name,
        kbIds: (st.knowledgeDocs || []).map((d) => d.id),
        deletedId: st._testDeletedId,
      };
    });
    await ctx.close();

    assert(inMemory.stageIds.length > 1,
      "этапы не догнали код: осталось " + inMemory.stageIds.length + " из пяти");
    assertEqual(inMemory.stageFirstName, "Мой этап", "слияние затёрло правку пользователя в этапе");
    assert(inMemory.kbIds.length > 1, "новые статьи базы знаний не доехали: " + inMemory.kbIds.length);
    assert(!inMemory.kbIds.includes(inMemory.deletedId),
      "удалённый документ базы знаний вернулся после слияния: " + inMemory.deletedId);
    void res;
  });

  await test("поддержка: предложение сделать CRM под клиента ведёт в Telegram с заготовкой", async () => {
    await dismissStaleDialog(page);
    await page.evaluate(() => window.app.go("support"));
    await page.waitForTimeout(350);
    const card = await page.evaluate(() => {
      const c = [...document.querySelectorAll(".support-card")]
        .find((x) => /Сделаем CRM под вас/i.test(x.textContent || ""));
      if (!c) return null;
      const b = c.getBoundingClientRect();
      return {
        href: c.getAttribute("href") || "",
        target: c.getAttribute("target") || "",
        rel: c.getAttribute("rel") || "",
        h: Math.round(b.height),
        text: (c.textContent || "").replace(/\s+/g, " ").trim(),
      };
    });

    assert(card, "в поддержке нет предложения сделать CRM под клиента");
    assert(/t\.me\//.test(card.href), "карточка не ведёт в Telegram: " + card.href);
    // Заготовка письма: первый ответ должен уже содержать суть задачи.
    const text = decodeURIComponent((card.href.split("text=")[1] || ""));
    assert(/Чем занимаемся/.test(text) && /автоматизировать/.test(text),
      "письмо не заготовлено вопросами — придётся выспрашивать вручную: " + text.slice(0, 80));
    assertEqual(card.target, "_blank", "ссылка открывается в том же окне — человек уйдёт из приложения");
    assert(/noopener/.test(card.rel), "внешняя ссылка без rel=noopener");
    assert(card.h >= 44, "карточка ниже 44px — на телефоне в неё трудно попасть: " + card.h);
  });

  await test("демо-сделка пересобирается под тип съёмок и убирается начисто", async () => {
    await dismissStaleDialog(page);
    const b = await bootLocal(browser, baseUrl, { width: 1300, height: 950, seedDemo: true });
    const p = b.page;
    await p.waitForTimeout(400);
    await p.evaluate(() => window.app.go("home"));
    await p.waitForTimeout(350);

    const read = () => p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return {
        name: (st.project && st.project.name) || "",
        kind: (st.project && st.project.demoKind) || "",
        items: Object.keys(st.selected || {}).length,
        deals: (st.savedProjects || []).length,
        chips: document.querySelectorAll(".demo-kind-strip .chip").length,
      };
    });

    /* Абстрактное «демо: рекламный ролик» одинаково для всех, а смету человек
       оценивает по тому, узнаёт ли он в ней свою работу. Полоса выбора живёт, только
       пока настоящих сделок нет. */
    const start = await read();
    assert(start.chips >= 5, "на главной нет выбора типа демо: " + start.chips);
    assert(start.items > 2, "демо-сделка собралась пустой");

    await p.evaluate(() => window.app.reseedDemo("wedding"));
    await p.waitForTimeout(500);
    const wedding = await read();
    assertEqual(wedding.kind, "wedding", "тип демо не переключился");
    assert(/свадьб/i.test(wedding.name), "название демо не поменялось: " + wedding.name);
    assert(wedding.items > 2, "после смены типа смета пустая");
    assertEqual(wedding.deals, 1, "смена типа наплодила сделок: " + wedding.deals);

    // Настоящая сделка отменяет подсказку: она нужна ровно до первого своего проекта.
    await p.evaluate(() => {
      window.app.newProject();
      window.app.updateProject("name", "Моя первая сделка");
      window.app.saveCurrentProject();
    });
    await p.waitForTimeout(600);
    await p.evaluate(() => window.app.go("home"));
    await p.waitForTimeout(400);
    const withReal = await p.evaluate(() => document.querySelectorAll(".demo-kind-strip").length);
    await b.context.close();
    assertEqual(withReal, 0, "подсказка про демо осталась, хотя у человека уже есть своя сделка");
  });

  /* Тур подсвечивает пункты БОКОВОГО меню, которого на телефоне нет: разделы
     живут в листе снизу. Функция это знала и просто выходила — а пункт «Тур по
     интерфейсу» в меню помощи рисуется без всякой проверки ширины. С телефона
     нажатие закрывало меню и не делало ничего: молчаливая кнопка читается как
     «приложение сломалось», а не как «эта возможность не для телефона».

     Проверяем ОБА направления, потому что легко перестараться: непрошеный тур
     после регистрации (silent) обязан молчать — иначе новичок на телефоне
     получит тост-объяснение про возможность, которую не звал. */
  await test("тур на телефоне объясняет себя, а не молчит — но только когда его позвали", async () => {
    await dismissStaleDialog(page);
    const b = await bootLocal(browser, baseUrl, { width: 390, height: 844, touch: true });
    const p = b.page;
    await p.waitForTimeout(300);

    const toastAfter = async (fn) => {
      await p.evaluate(() => { const el = document.getElementById("toast"); if (el) { el.classList.remove("show"); el.textContent = ""; } });
      await p.evaluate(fn);
      await p.waitForTimeout(250);
      return p.evaluate(() => {
        const el = document.getElementById("toast");
        return { shown: !!el && el.classList.contains("show"), text: el ? el.textContent.trim() : "" };
      });
    };

    const asked = await toastAfter(() => window.app.startTour());
    assert(asked.shown, "с телефона тур позвали руками — и не сказали ни слова");
    assert(
      /компьютер/i.test(asked.text),
      "объяснение не говорит, где тур доступен: «" + asked.text.slice(0, 80) + "»"
    );

    const auto = await toastAfter(() => window.app.startTour({ silent: true }));
    assert(!auto.shown, "непрошеный тур после регистрации поздоровался тостом: «" + auto.text.slice(0, 80) + "»");

    await b.context.close();
  });

  await context.close();
};
