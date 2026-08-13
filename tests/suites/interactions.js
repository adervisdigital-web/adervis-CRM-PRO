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

    const cg = await page.evaluate(() => {
      window.prompt = () => "Мои хиты";
      window.app.addCustomCatalogGroup();
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
    const created = await page.evaluate(() => {
      window.prompt = () => "Свадьба";
      window.app.addCustomBriefType();
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
    const added = await page.evaluate(() => {
      window.prompt = () => "Ретейнер";
      window.app.addFinanceArticle("payment");
      const st = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
      return (st.financeArticles || {}).payment || [];
    });
    assert(added.includes("Ретейнер"), "своя статья не добавилась: " + JSON.stringify(added));
    assert(added.includes("Предоплата"), "встроенные статьи пропали при добавлении своей");

    const renamed = await page.evaluate(() => {
      window.prompt = () => "Аванс";
      window.app.renameFinanceArticle("payment", 0);
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
    const inDeal = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('[onclick*="exportXlsx"]')];
      const vis = btns.filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
      return { total: btns.length, visible: vis.length,
        label: vis.length ? (vis[0].textContent || "").replace(/\s+/g, " ").trim() : "" };
    });
    assert(inDeal.visible >= 1,
      "внутри сделки в «Смете» нет кнопки выгрузки в Excel — за ней придётся уходить в другой раздел");
    assertEqual(inDeal.total, 1, "на экране сметы больше одной кнопки выгрузки");
    assert(inDeal.label.length > 0,
      "кнопка выгрузки без текстовой подписи — иконку среди подписанных кнопок не находят глазами");

    // На вкладке «КП» её быть не должно: она выгружает смету, а не КП.
    await page.evaluate(() => window.app.setDealView("proposal"));
    await page.waitForTimeout(400);
    const inKp = await page.evaluate(() =>
      document.querySelectorAll('[onclick*="exportXlsx"]').length);
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
        ok: set("inn", "590000000000") && set("address", "г. Пермь, ул. Примерная, 1"),
        scoped: document.querySelectorAll('[data-scope="company"]').length,
        view: (JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}")).view
      };
    });
    assert(innSet.ok, `не нашлись поля реквизитов компании: полей scope=company ${innSet.scoped}, вьюха «${innSet.view}»`);
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
    assert(!есть("Завершить") && !есть("архив"),
      "смена статуса вернулась в меню шапки, хотя шкала этапов стоит прямо над вкладками: " + JSON.stringify(res.пункты));
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

  await context.close();
};
