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
  return page.evaluate(() => {
    for (const el of document.querySelectorAll("[onclick]")) {
      const m = (el.getAttribute("onclick") || "").match(/openDeal\('([^']+)'\)/);
      if (m) return m[1];
    }
    return null;
  });
}

module.exports = async function ({ browser, baseUrl, test }) {
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
    const before = await page.evaluate(() => {
      localStorage.removeItem("sidebar_nav_config");
      let n = 0;
      window.prompt = () => (++n === 1 ? "Наш Drive" : "drive.google.com/x");
      window.app.addCustomNavItem();
      return JSON.parse(localStorage.getItem("sidebar_nav_config") || "[]")
        .filter((x) => String(x.id).startsWith("custom:"));
    });
    assertEqual(before.length, 1, "свой раздел не сохранился");
    assertEqual(before[0].url, "https://drive.google.com/x", "ссылка без схемы не нормализовалась в https");

    const after = await page.evaluate(() => {
      let n = 0;
      window.prompt = () => (++n === 1 ? "Злой" : "javascript:alert(1)");
      window.app.addCustomNavItem();
      return JSON.parse(localStorage.getItem("sidebar_nav_config") || "[]")
        .filter((x) => String(x.id).startsWith("custom:"));
    });
    assertEqual(after.length, 1, "javascript:-ссылка попала в меню");
  });

  await context.close();
};
