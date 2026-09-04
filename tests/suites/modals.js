// п.20 (Фаза F): визуальный обход модалок + гарантия диалоговой семантики.
// Каждая модалка при открытии обязана получить role=dialog, aria-modal=true,
// aria-label (из заголовка), фокус внутри бокса и кнопку закрытия — это
// централизовано в _enhanceModalA11y(), поэтому регрессия ловится одним набором.
const path = require("path");
const { bootLocal, assert, assertEqual } = require("../harness");

// Список close-методов — чистим слот модалки перед каждым открытием, чтобы
// modalKey менялся с null (иначе фокус не переносится: он двигается только на
// «свежее» открытие, а не на re-render — см. _enhanceModalA11y).
// Должен покрывать ВСЕ ветки if-цепочки в renderModal(): незакрытая модалка, стоящая
// в цепочке раньше, перехватит рендер следующей, modalKey не сменится — и тест упадёт
// с невнятным «фокус не внутри модалки». closeDocsModal/closeBriefEditor тут не хватало.
// Вызываем БЕЗ await намеренно: часть закрывашек async и при «грязной» модалке показывает
// confirmDialog, который ждёт клика → await повесил бы тест намертво (см. память,
// gotcha-playwright-evaluate-async-deadlock). Для чистой модалки состояние очищается
// на ближайшем микротаске, чего с запасом хватает паузе в 40мс ниже.
const CLOSERS = [
  "closeClientModal", "closeFinanceModal", "closeHelpModal", "closeMobileNavSheet",
  "closeAdminModal", "closeDealModal", "closeCatalogEdit", "closePackageEditModal",
  "closeTaskModal", "closeEditTransactionModal", "closeDocsModal", "closeBriefEditor",
];

// Достаёт первый id из onclick-разметки (напр. openDeal('proj_..') → proj_..).
async function grabId(page, view, fnName) {
  await page.evaluate((v) => window.app.go(v), view);
  await page.waitForTimeout(80);
  return page.evaluate((fn) => {
    const re = new RegExp(fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\((?:event,)?\\s*'([^']+)'");
    for (const el of document.querySelectorAll("[onclick]")) {
      const m = el.getAttribute("onclick").match(re);
      if (m) return m[1];
    }
    return null;
  }, fnName);
}

async function inspectModal(page) {
  return page.evaluate(() => {
    const o = document.querySelector("#modalContainer .modal-overlay");
    if (!o) return { overlay: false };
    return {
      overlay: true,
      role: o.getAttribute("role"),
      modal: o.getAttribute("aria-modal"),
      label: o.getAttribute("aria-label") || "",
      focusInside: o.contains(document.activeElement),
      hasControl: !!o.querySelector("button, a[href]"),
    };
  });
}

module.exports = async function ({ browser, baseUrl, test, shotDir }) {
  const { context, page } = await bootLocal(browser, baseUrl, { width: 900, height: 820, seedDemo: true });

  // Данные-зависимые id (из демо-сделки / каталога / пакетов).
  // Демо-сделка рендерит карточку с onclick="…openDeal('id')" на главной (renderHome);
  // в CRM-канбане карточки другой разметки, поэтому id берём с home.
  const dealId = (await grabId(page, "home", "openDeal")) || (await grabId(page, "crm", "openDeal"));
  const catId = await grabId(page, "catalog", "_onCatalogCardClick");
  const pkgId = await grabId(page, "packages", "openPackageEditModal");
  // Личная задача: создаём свою (в демо-сделке задач нет). Карточка личной задачи —
  // НЕ renderTaskCard, у неё нет .task-title-input; id берём из onclick, как у остальных.
  await page.evaluate(() => { window.app.go("global-tasks"); window.app.createGlobalTask(); window.app.closeTaskModal(); });
  await page.waitForTimeout(150);
  const taskId = await grabId(page, "global-tasks", "openGlobalTaskModal");
  await page.evaluate(() => window.app.go("home"));

  const modals = [
    { key: "client", open: () => page.evaluate(() => window.app.openClientModal()) },
    { key: "finance", open: () => page.evaluate(() => window.app.openFinanceModal("payment")) },
    { key: "help", open: () => page.evaluate(() => window.app.openHelpModal()) },
    { key: "admin", open: () => page.evaluate(() => window.app.openAdminModal()) },
    { key: "docs", open: () => page.evaluate(() => window.app.openDocsModal()) },
  ];
  // Модалка задачи — самая частая в работе, но до 26.07.2026 её оверлей назывался только
  // .task-modal-overlay, а _enhanceModalA11y() ищет .modal-overlay → она не получала ни
  // role=dialog, ни переноса фокуса, ни ловушки Tab. Держим в наборе, чтобы не повторилось.
  if (taskId) modals.push({ key: "task", open: () => page.evaluate((id) => window.app.openGlobalTaskModal(id), taskId) });
  if (dealId) modals.push({ key: "deal", open: () => page.evaluate((id) => window.app.openDealModal(id), dealId) });
  if (catId) modals.push({ key: "catalog", open: () => page.evaluate((id) => window.app.openCatalogEdit(id), catId) });
  /* Редактор пакета из этого обхода УБРАН 04.09.2026: на широком экране он
     больше не модалка, а колонка раздела рядом с живым списком (просьба
     владельца «не поверх открытое окно, а сбоку как меню»). Требовать от неё
     role=dialog и ловушку Tab неправильно — она никого не блокирует, и ловушка
     заперла бы человека в панели при работающем списке.

     Модалкой она остаётся на узком экране, и ровно там её диалоговые свойства
     проверяет тест «редактор пакета: панель справа на десктопе, окно на
     телефоне» в наборе responsive. Прогон этот обход не потерял — проверка
     переехала, а не исчезла. */

  // Демо-сделка обязана дать id — иначе обход неполон
  await test("демо-данные дают id для deal/catalog модалок", () => {
    assert(dealId, "не найден id демо-сделки (openDeal) — seedDemo не отработал");
    assert(catId, "не найден id элемента каталога (_onCatalogCardClick)");
  });

  for (const m of modals) {
    await test(`модалка «${m.key}»: role=dialog + aria-modal + фокус + закрытие`, async () => {
      await page.evaluate((closers) => {
        closers.forEach((fn) => { try { window.app[fn] && window.app[fn](); } catch (e) {} });
      }, CLOSERS);
      await page.waitForTimeout(40);

      await m.open();
      await page.waitForTimeout(90);

      const r = await inspectModal(page);
      assert(r.overlay, "не открылась (.modal-overlay отсутствует)");
      assertEqual(r.role, "dialog", "role");
      assertEqual(r.modal, "true", "aria-modal");
      assert(r.label.trim().length > 0, "пустой aria-label");
      assert(r.focusInside, "фокус не внутри модалки при открытии");
      assert(r.hasControl, "нет ни одной кнопки/ссылки (нечем закрыть/действовать)");

      await page.screenshot({ path: path.join(shotDir, `modal-${m.key}.png`) });
    });
  }

  // Esc / клик по оверлею — фокус возвращается на открывашку (проверяем возврат фокуса)
  await test("закрытие модалки возвращает фокус в документ (не теряется)", async () => {
    await page.evaluate((closers) => {
      closers.forEach((fn) => { try { window.app[fn] && window.app[fn](); } catch (e) {} });
    }, CLOSERS);
    await page.evaluate(() => window.app.openClientModal());
    await page.waitForTimeout(60);
    await page.evaluate(() => window.app.closeClientModal());
    await page.waitForTimeout(60);
    const stillOpen = await page.$("#modalContainer .modal-overlay");
    assert(!stillOpen, "модалка не закрылась");
    const bodyFocused = await page.evaluate(() => document.activeElement && document.body.contains(document.activeElement));
    assert(bodyFocused, "фокус потерян после закрытия");
  });


  // Оферта и Политика раньше грузились в iframe с https://adervis.ru/docs, а CSP
  // приложения не содержит adervis.ru в frame-src — пользователь видел
  // «ERR_BLOCKED_BY_CSP» вместо документов. Текст встроен: работает офлайн и не
  // требует дырки в CSP. Тест ловит и возврат iframe, и пустой текст.
  await test("документы: оферта и политика показываются текстом, а не iframe", async () => {
    await page.evaluate(() => window.app.openDocsModal());
    await page.waitForTimeout(400);

    const iframe = await page.evaluate(() => !!document.querySelector(".modal-overlay iframe"));
    assertEqual(iframe, false, "документы снова грузятся через iframe — их заблокирует CSP");

    const priv = await page.evaluate(() => {
      const el = document.querySelector(".docs-modal-body");
      return { len: (el?.textContent || "").trim().length, txt: (el?.textContent || "") };
    });
    assert(priv.len > 1500, `текст политики подозрительно короткий: ${priv.len} симв.`);
    assert(/персональных данных/i.test(priv.txt), "в политике нет упоминания персональных данных");

    await page.evaluate(() => window.app.setDocsTab("offer"));
    await page.waitForTimeout(300);
    const offer = await page.evaluate(() => {
      const el = document.querySelector(".docs-modal-body");
      return { len: (el?.textContent || "").trim().length, txt: (el?.textContent || "") };
    });
    assert(offer.len > 1200, `текст оферты подозрительно короткий: ${offer.len} симв.`);
    assert(/оферта/i.test(offer.txt), "во вкладке оферты нет самой оферты");
    assert(offer.txt !== priv.txt, "вкладки показывают один и тот же документ");

    await page.evaluate(() => window.app.closeDocsModal());
    await page.waitForTimeout(200);
  });

  await context.close();
};
