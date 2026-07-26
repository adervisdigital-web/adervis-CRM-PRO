#!/usr/bin/env node
// Оркестратор локальных Playwright-тестов ADERVIS CRM.
//
//   node tests/run.js            — все наборы
//   node tests/run.js modals     — только один набор
//
// Поднимает статический сервер над репозиторием, запускает Chromium,
// прогоняет наборы из tests/suites/, печатает сводку, exit code = число падений.

const path = require("path");
const fs = require("fs");
const { startServer } = require("./server");
const { loadPlaywright, Suite, REPO_ROOT } = require("./harness");

const SUITES = ["smoke", "responsive", "modals", "interactions", "assets", "a11y", "money"];

(async () => {
  const filter = process.argv[2] || null;
  if (filter && !SUITES.includes(filter)) {
    console.error(`Неизвестный набор «${filter}». Доступны: ${SUITES.join(", ")}`);
    process.exit(2);
  }

  const pw = loadPlaywright();
  const server = await startServer(REPO_ROOT, 0);
  const browser = await pw.chromium.launch();
  const shotDir = path.join(__dirname, "screenshots");
  fs.mkdirSync(shotDir, { recursive: true });

  console.log(`Сервер: ${server.url}  •  Playwright ${pw._version || ""}`.trim());

  let totalPass = 0;
  let totalFail = 0;
  const ctxBase = { browser, baseUrl: server.url, shotDir, pw };

  for (const name of SUITES) {
    if (filter && filter !== name) continue;
    const suite = new Suite(name);
    try {
      const mod = require("./suites/" + name);
      await mod({ ...ctxBase, test: suite.test.bind(suite) });
    } catch (e) {
      suite.results.push({ name: "(набор упал целиком)", ok: false, err: e && e.stack ? e.stack : String(e) });
    }
    console.log(`\n▶ ${name}`);
    for (const r of suite.results) {
      console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : "  — " + r.err}`);
    }
    totalPass += suite.passed;
    totalFail += suite.failed;
  }

  await browser.close();
  await server.close();

  console.log("\n" + "─".repeat(48));
  console.log(`Итог: ${totalPass} passed, ${totalFail} failed`);
  process.exit(totalFail ? 1 : 0);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
