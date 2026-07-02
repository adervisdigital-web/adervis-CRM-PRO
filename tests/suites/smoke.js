// Смоук: приложение вообще поднимается — и в local mode, и на auth gate.
const { bootLocal, assert } = require("../harness");

module.exports = async function ({ browser, baseUrl, test }) {
  await test("local mode: #appContent наполняется без pageerror", async () => {
    const { context, page, errors } = await bootLocal(browser, baseUrl);
    const len = await page.$eval("#appContent", (el) => el.innerHTML.trim().length);
    assert(len > 0, "#appContent пуст");
    assert(errors.length === 0, "консольные ошибки: " + errors.join(" | "));
    await context.close();
  });

  await test("local mode: рендерится топбар (кнопка добавления)", async () => {
    const { context, page } = await bootLocal(browser, baseUrl);
    const addBtn = await page.$("#globalAddBtn");
    assert(addBtn, "нет #globalAddBtn — топбар не отрисовался");
    await context.close();
  });

  await test("без local mode: показан auth gate с CTA", async () => {
    const { context, page } = await bootLocal(browser, baseUrl, { localMode: false });
    await page.waitForFunction(
      () => {
        const g = document.getElementById("authGateContainer");
        return g && g.innerHTML.trim().length > 0;
      },
      { timeout: 12000 }
    );
    const txt = await page.$eval("#authGateContainer", (el) => el.textContent);
    assert(
      /войти|регистр|бесплат|7 дней|попроб/i.test(txt),
      "нет ожидаемого CTA в auth gate: " + txt.slice(0, 100)
    );
    await context.close();
  });
};
