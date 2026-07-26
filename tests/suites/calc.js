// Публичный калькулятор сметы (?calc=…) — вход без регистрации (PLAN.md §4, P0).
// Это не UI-каталог — это отдельный незалогиненный контур со своими рисками:
//   • не должен требовать auth gate / показывать сайдбар обычного приложения;
//   • НЕ должен трогать localStorage обычного приложения (визитёр может быть
//     залогинен в свой настоящий аккаунт в этом же браузере — см. app.js, save()
//     содержит явный guard `if (_calcMode) return;`);
//   • ссылка-шеринг должна кодировать смету в URL и восстанавливаться из него.
const { assert, assertEqual } = require("../harness");

async function bootCalc(browser, baseUrl, query = "calc=1") {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${baseUrl}/index.html?${query}`, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const el = document.getElementById("appContent");
    return el && el.innerHTML.trim().length > 0;
  }, { timeout: 10000 });
  return { context, page, errors };
}

module.exports = async function ({ browser, baseUrl, test }) {
  await test("?calc=1 рендерит калькулятор без auth gate и без сайдбара", async () => {
    const { context, page, errors } = await bootCalc(browser, baseUrl, "calc=1");
    const state = await page.evaluate(() => ({
      hasCalcPage: !!document.querySelector(".calc-page"),
      sidebarEmpty: (document.getElementById("appSidebar") || {}).innerHTML === "",
      authGateEmpty: (document.getElementById("authGateContainer") || {}).innerHTML === "",
      bodyClass: document.body.className,
    }));
    assert(state.hasCalcPage, "не отрисован .calc-page");
    assert(state.sidebarEmpty, "сайдбар обычного приложения виден в публичном калькуляторе");
    assert(state.authGateEmpty, "auth gate показан поверх калькулятора — регистрация не должна требоваться");
    assert(state.bodyClass.includes("calc-mode"), "body не получил класс calc-mode");
    assertEqual(errors.length, 0, "ошибки консоли: " + errors.slice(0, 3).join(" | "));
    await context.close();
  });

  await test("добавление позиции меняет итог и счётчик", async () => {
    const { context, page } = await bootCalc(browser, baseUrl, "calc=1");
    const before = await page.evaluate(() => ({
      hasEmpty: !!document.querySelector(".calc-sum-empty"),
    }));
    assert(before.hasEmpty, "итог не пуст при заходе без параметров сметы");

    const firstId = await page.evaluate(() => {
      const btn = document.querySelector(".calc-add-btn");
      const m = (btn.getAttribute("onclick") || "").match(/calcToggle\('([^']+)'\)/);
      return m ? m[1] : null;
    });
    assert(firstId, "не нашёл кнопку добавления позиции");

    await page.evaluate((id) => window.app.calcToggle(id), firstId);
    await page.waitForTimeout(120);
    const after = await page.evaluate(() => ({
      rows: document.querySelectorAll(".calc-sum-row").length,
      hasTotal: !!document.querySelector(".calc-total strong"),
      totalText: (document.querySelector(".calc-total strong") || {}).textContent || "",
    }));
    assertEqual(after.rows, 1, "в сводке должна появиться одна строка");
    assert(after.hasTotal, "итог не появился после добавления позиции");
    assert(/\d/.test(after.totalText), "итог не содержит суммы: " + after.totalText);
    await context.close();
  });

  await test("ссылка «Ссылка клиенту» кодирует смету — round-trip через новую вкладку", async () => {
    const { context, page } = await bootCalc(browser, baseUrl, "calc=1");
    const firstId = await page.evaluate(() => {
      const btn = document.querySelector(".calc-add-btn");
      const m = (btn.getAttribute("onclick") || "").match(/calcToggle\('([^']+)'\)/);
      return m ? m[1] : null;
    });
    await page.evaluate((id) => window.app.calcToggle(id), firstId);
    await page.waitForTimeout(100);

    // Подменяем clipboard, чтобы поймать сгенерированную ссылку без реального доступа
    // к системному буферу (в headless Chromium он недоступен без спец-разрешений).
    await page.evaluate(() => {
      window.__copied = null;
      navigator.clipboard.writeText = (text) => { window.__copied = text; return Promise.resolve(); };
    });
    await page.evaluate(() => window.app.calcShare());
    await page.waitForTimeout(80);
    const url = await page.evaluate(() => window.__copied);
    assert(url && url.includes("calc="), "скопированная ссылка не содержит ?calc=: " + url);

    const query = new URL(url).search.slice(1);
    const { context: c2, page: p2 } = await bootCalc(browser, baseUrl, query);
    const restored = await p2.evaluate(() => document.querySelectorAll(".calc-sum-row").length);
    assertEqual(restored, 1, "смета не восстановилась из ссылки-шеринга");
    await c2.close();
    await context.close();
  });

  await test("калькулятор не трогает состояние обычного приложения в том же браузере", async () => {
    // Сценарий риска: посетитель уже «залогинен» (local mode) в этом браузере,
    // у него есть реальная смета. Открывает ?calc=1, играет с калькулятором,
    // закрывает вкладку. localStorage обычного приложения должен остаться нетронут —
    // это и есть заявленное поведение save()/_flushStateOnUnload в calc-режиме.
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();

    // 1. Обычный вход (local mode) с демо-сделкой — как в остальных наборах.
    await page.addInitScript(() => {
      localStorage.setItem("adervis_local_mode", "1");
      localStorage.setItem("adervis_tour_done", "1");
      localStorage.setItem("adervis_onboarded", "1");
    });
    await page.goto(baseUrl + "/index.html", { waitUntil: "load" });
    await page.waitForFunction(() => {
      const el = document.getElementById("appContent");
      return el && el.innerHTML.trim().length > 0;
    }, { timeout: 10000 });
    await page.evaluate(() => window.app.seedDemoDeal());
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => localStorage.getItem("adervis_pro_381_state"));
    assert(before && before.includes('"savedProjects"'), "не удалось засеять исходное состояние");

    // 2. Переход на ?calc=1 В ТОЙ ЖЕ вкладке (тот же localStorage) — играем с калькулятором.
    await page.goto(baseUrl + "/index.html?calc=1", { waitUntil: "load" });
    await page.waitForFunction(() => !!document.querySelector(".calc-page"), { timeout: 10000 });
    const firstId = await page.evaluate(() => {
      const btn = document.querySelector(".calc-add-btn");
      const m = (btn.getAttribute("onclick") || "").match(/calcToggle\('([^']+)'\)/);
      return m ? m[1] : null;
    });
    await page.evaluate((id) => window.app.calcToggle(id), firstId);
    await page.waitForTimeout(100);

    // 3. Уходим со страницы (триггерит pagehide) и проверяем localStorage.
    await page.goto(baseUrl + "/index.html", { waitUntil: "load" });
    const after = await page.evaluate(() => localStorage.getItem("adervis_pro_381_state"));
    assertEqual(after, before, "состояние обычного приложения изменилось после игры в калькуляторе");

    await context.close();
  });

  await test("?calc=… грузится в iframe (framebuster исключает только калькулятор)", async () => {
    // theme-init.js бастит фреймы для обычного приложения (защита от кликджекинга
    // сессии), но калькулятор целенаправленно встраивается в iframe на сайте
    // (adervis.ru/pro/smeta/) — у него нет ни сессии, ни данных для угона.
    // Хост — фикстура на реальном http-origin (data:/about:blank не грузят http-iframe).
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const page = await context.newPage();
    const src = encodeURIComponent("/index.html?calc=1");
    await page.goto(`${baseUrl}/tests/fixtures/iframe-host.html?src=${src}`, { waitUntil: "load" });
    const frame = page.frames().find(f => f.url().includes("calc=1"));
    assert(frame, "iframe не создался/не загрузился");
    await frame.waitForFunction(() => !!document.querySelector(".calc-page"), { timeout: 10000 });
    // Если бы фреймбастер сработал, top.location сменился бы на URL приложения —
    // проверяем, что верхняя страница осталась хост-фикстурой.
    const topUrl = page.url();
    assert(topUrl.includes("iframe-host.html"), "framebuster сработал и для калькулятора — верхнее окно перешло на " + topUrl);
    await context.close();
  });

  await test("обычный вход (без ?calc=) framebuster НЕ отключён", async () => {
    // Инвариант в обратную сторону: правка не должна была ослабить защиту для
    // всего остального приложения — только для параметра ?calc=.
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const page = await context.newPage();
    const src = encodeURIComponent("/index.html");
    await page.goto(`${baseUrl}/tests/fixtures/iframe-host.html?src=${src}`, { waitUntil: "load" });
    // Framebuster переводит ВЕРХНЕЕ окно на URL приложения — ждём именно это.
    await page.waitForFunction(() => location.href.includes("index.html"), { timeout: 5000 })
      .catch(() => { throw new Error("framebuster не сработал для обычного входа без ?calc="); });
    await context.close();
  });

  await test("публичный калькулятор проходит замер a11y-минимума: кнопки и поля подписаны", async () => {
    const { context, page } = await bootCalc(browser, baseUrl, "calc=1");
    const nameless = await page.evaluate(() =>
      [...document.querySelectorAll(".calc-page button, .calc-page input")]
        .filter(el => el.offsetParent !== null)
        .filter(el => !((el.textContent || "").trim() || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("title")))
        .map(el => el.outerHTML.slice(0, 60))
    );
    assertEqual(nameless.length, 0, "элементы без доступного имени: " + nameless.join(" | "));
    await context.close();
  });
};
