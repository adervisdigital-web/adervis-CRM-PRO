// Общий харнесс для локальных Playwright-тестов ADERVIS CRM.
//
// Правило проекта — «без package.json / без node_modules в репо» (CLAUDE.md §8).
// Поэтому Playwright НЕ устанавливается в репозиторий: loadPlaywright() сам
// находит уже установленный (глобальный / из npx-кэша) модуль. Это оставляет
// репо чистым, но `node tests/run.js` работает из коробки на машине, где
// Playwright хоть раз запускался (`npx playwright ...`).

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

// ── Поиск установленного Playwright без локального node_modules ───────────────
function loadPlaywright() {
  const tried = [];

  // 1) Обычный require (сработает, если задан NODE_PATH или playwright установлен рядом)
  try {
    return require("playwright");
  } catch (e) {
    tried.push("require('playwright')");
  }

  const candidates = [];

  // 2) npx-кэш (`npx playwright ...` кладёт модуль сюда) — хэш-папки, не хардкодим
  const npxRoots = [
    path.join(os.homedir(), "AppData/Local/npm-cache/_npx"), // Windows
    path.join(os.homedir(), ".npm/_npx"), // Linux/macOS
  ];
  for (const root of npxRoots) {
    try {
      for (const hash of fs.readdirSync(root)) {
        candidates.push(path.join(root, hash, "node_modules/playwright"));
      }
    } catch {}
  }

  // 3) Глобальный npm root
  try {
    const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    if (gRoot) candidates.push(path.join(gRoot, "playwright"));
  } catch {}

  for (const c of candidates) {
    tried.push(c);
    try {
      if (fs.existsSync(path.join(c, "package.json"))) return require(c);
    } catch {}
  }

  throw new Error(
    "Playwright не найден. Установите его один раз (в репо специально нет node_modules):\n" +
      "  npx playwright install chromium\n" +
      "или укажите путь через NODE_PATH.\n" +
      "Искал в:\n  " + tried.join("\n  ")
  );
}

const REPO_ROOT = path.resolve(__dirname, "..");

// ── Поднять приложение в local mode (минует auth/subscription gate) ───────────
// Возвращает { context, page, errors[] }. errors — консольные ошибки страницы,
// чтобы тесты могли ассертить «рендер без исключений».
async function bootLocal(browser, baseUrl, opts = {}) {
  const { width = 1200, height = 800, localMode = true, seedDemo = false } = opts;
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  if (localMode) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("adervis_local_mode", "1");
        // не показывать тур/онбординг поверх UI во время тестов
        localStorage.setItem("adervis_tour_done", "1");
        localStorage.setItem("adervis_onboarded", "1");
      } catch (e) {}
    });
  }

  await page.goto(baseUrl + "/index.html", { waitUntil: "load" });

  if (localMode) {
    // Дождаться, пока render() наполнит #appContent основным UI
    await page.waitForFunction(
      () => {
        const el = document.getElementById("appContent");
        return el && el.innerHTML.trim().length > 0;
      },
      { timeout: 10000 }
    );
  }

  if (seedDemo) {
    await page.evaluate(() => window.app && window.app.seedDemoDeal && window.app.seedDemoDeal());
    await page.waitForTimeout(150);
  }

  return { context, page, errors };
}

// ── Мини-фреймворк (без зависимостей) ────────────────────────────────────────
class Suite {
  constructor(name) {
    this.name = name;
    this.results = []; // { name, ok, err }
  }
  async test(name, fn) {
    // Результаты печатаются пачкой в конце набора, поэтому зависший тест выглядит
    // как «ничего не происходит вообще». TESTS_TRACE=1 печатает имя ДО запуска —
    // видно, на каком именно встало. Держим в харнессе, а не в разовом скрипте:
    // это первое, что понадобится в следующий раз.
    if (process.env.TESTS_TRACE) process.stdout.write("   … " + name + "\n");
    const t0 = Date.now();
    try {
      await fn();
      this.results.push({ name, ok: true, ms: Date.now() - t0 });
    } catch (e) {
      this.results.push({ name, ok: false, ms: Date.now() - t0, err: e && e.message ? e.message : String(e) });
    }
  }
  get passed() {
    return this.results.filter((r) => r.ok).length;
  }
  get failed() {
    return this.results.filter((r) => !r.ok).length;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || "not equal") + ` (ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)})`);
  }
}

module.exports = { loadPlaywright, bootLocal, Suite, assert, assertEqual, REPO_ROOT };
