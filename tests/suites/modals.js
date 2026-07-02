// п.20 (Фаза F): визуальный обход модалок + гарантия диалоговой семантики.
// Каждая модалка при открытии обязана получить role=dialog, aria-modal=true,
// aria-label (из заголовка), фокус внутри бокса и кнопку закрытия — это
// централизовано в _enhanceModalA11y(), поэтому регрессия ловится одним набором.
const path = require("path");
const { bootLocal, assert, assertEqual } = require("../harness");

// Список close-методов — чистим слот модалки перед каждым открытием, чтобы
// modalKey менялся с null (иначе фокус не переносится: он двигается только на
// «свежее» открытие, а не на re-render — см. _enhanceModalA11y).
const CLOSERS = [
  "closeClientModal", "closeFinanceModal", "closeHelpModal", "closeMainMenu",
  "closeAdminModal", "closeDealModal", "closeCatalogEdit", "closePackageEditModal",
  "closeTaskModal", "closeEditTransactionModal",
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
  await page.evaluate(() => window.app.go("home"));

  const modals = [
    { key: "client", open: () => page.evaluate(() => window.app.openClientModal()) },
    { key: "finance", open: () => page.evaluate(() => window.app.openFinanceModal("payment")) },
    { key: "help", open: () => page.evaluate(() => window.app.openHelpModal()) },
    { key: "mainMenu", open: () => page.evaluate(() => window.app.openMainMenu()) },
    { key: "admin", open: () => page.evaluate(() => window.app.openAdminModal()) },
  ];
  if (dealId) modals.push({ key: "deal", open: () => page.evaluate((id) => window.app.openDealModal(id), dealId) });
  if (catId) modals.push({ key: "catalog", open: () => page.evaluate((id) => window.app.openCatalogEdit(id), catId) });
  if (pkgId) modals.push({ key: "package", open: () => page.evaluate((id) => window.app.openPackageEditModal(id), pkgId) });

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

  await context.close();
};
