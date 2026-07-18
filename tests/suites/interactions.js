// Ключевые UX-паттерны Фаз I/H: undo-тост вместо confirm() и смена этапа
// на канбан-карточке через нативный select (тач-фолбэк вместо HTML5 DnD).
const { bootLocal, assert, assertEqual } = require("../harness");

async function homeDealCount(page) {
  await page.evaluate(() => window.app.go("home"));
  await page.waitForTimeout(80);
  return page.evaluate(() => {
    let n = 0;
    for (const el of document.querySelectorAll("[onclick]")) {
      if (/openDeal\('/.test(el.getAttribute("onclick") || "")) n++;
    }
    return n;
  });
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

  await test("настройки рендерятся с вынесенной секцией Telegram", async () => {
    await page.evaluate(() => window.app.go("settings"));
    await page.waitForTimeout(150);
    const ok = await page.evaluate(() => {
      const root = document.getElementById("appContent");
      return {
        hasCompany: /Компания/.test(root.textContent),
        hasTelegram: /Уведомления \(Telegram\)/.test(root.textContent),
        hasDanger: /Опасная зона/.test(root.textContent),
      };
    });
    assert(ok.hasCompany, "нет секции «Компания» в настройках");
    assert(ok.hasTelegram, "нет вынесенной секции Telegram (renderSettingsTelegram)");
    assert(ok.hasDanger, "нет секции «Опасная зона»");
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

  await context.close();
};
