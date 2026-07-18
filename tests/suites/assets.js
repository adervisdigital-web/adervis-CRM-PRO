// Регресс инвариантов Фазы G (скорость/безопасность первого впечатления).
// Чистые статические проверки index.html/style.css — браузер не нужен.
const fs = require("fs");
const path = require("path");
const { assert, REPO_ROOT } = require("../harness");

module.exports = async function ({ test }) {
  const index = fs.readFileSync(path.join(REPO_ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(REPO_ROOT, "style.css"), "utf8");
  const app = fs.readFileSync(path.join(REPO_ROOT, "app.js"), "utf8");
  const head = index.slice(0, index.indexOf("</head>"));

  await test("нет Google Fonts (шрифты self-hosted)", () => {
    assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(index), "остался линк Google Fonts в index.html");
    assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(css), "остался @import Google Fonts в style.css");
  });

  await test("@font-face ссылается на локальные fonts/*.woff2", () => {
    assert(/@font-face/.test(css), "нет @font-face в style.css");
    assert(/url\(\s*["']?fonts\/[^)]*\.woff2/.test(css), "нет ссылки на локальный fonts/*.woff2");
  });

  await test("supabase-js self-hosted; vkid SDK — self-hosted и грузится лениво", () => {
    // Раньше оба грузились с jsdelivr (внешний CDN = точка отказа + утечка приватности).
    assert(/<script\b[^>]*\bsrc="vendor\/supabase\.min\.js"/.test(index), "supabase-js не self-hosted (vendor/supabase.min.js)");
    assert(fs.existsSync(path.join(REPO_ROOT, "vendor/supabase.min.js")), "нет файла vendor/supabase.min.js");
    // vkid SDK убран из статических <script> — грузится лениво из app.js только на экране входа.
    assert(!/<script\b[^>]*\bsrc="vendor\/vkid-sdk\.min\.js"/.test(index), "vkid SDK не должен быть статическим <script> — он ленивый");
    assert(fs.existsSync(path.join(REPO_ROOT, "vendor/vkid-sdk.min.js")), "нет файла vendor/vkid-sdk.min.js");
    assert(/_ensureVKIDSDK[\s\S]*vendor\/vkid-sdk\.min\.js/.test(app), "app.js не грузит vkid SDK лениво через _ensureVKIDSDK");
    // В <head> не должно остаться всегда-загружаемых внешних скриптов (xlsx грузится лениво).
    const externalInHead = [...head.matchAll(/<script\b[^>]*\bsrc="https?:\/\/[^"]+"[^>]*>/g)].map((m) => m[0])
      .filter((s) => !/mc\.yandex\.ru|metrika/.test(s)); // Метрика — легитимный внешний скрипт
    assert(externalInHead.length === 0, "в <head> остались внешние CDN-скрипты:\n" + externalInHead.join("\n"));
  });

  await test("xlsx не в статичном <head> (ленивая загрузка)", () => {
    assert(!/<script[^>]*xlsx/i.test(head), "xlsx-скрипт найден в <head> — должен грузиться лениво");
  });

  await test("defer на статических скриптах (app.js / supabase / metrika)", () => {
    // vkid здесь нет намеренно — он грузится лениво из app.js, а не статическим тегом.
    for (const name of ["app\\.js", "supabase", "metrika"]) {
      const m = index.match(new RegExp("<script\\b[^>]*" + name + "[^>]*>"));
      assert(m, "нет скрипта " + name);
      assert(/\bdefer\b/.test(m[0]), name + ": тег без defer → " + m[0]);
    }
  });

  await test("CSP: font-src 'self' без Google Fonts, script-src пиннит cdn.jsdelivr", () => {
    const csp = (index.match(/Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || "";
    assert(csp, "нет CSP meta");
    // generativelanguage.googleapis.com в connect-src — легитимен (Gemini), проверяем
    // именно отсутствие Google Fonts и что font-src ограничен 'self'.
    assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(csp), "Google Fonts остался в CSP");
    const fontSrc = (csp.match(/font-src([^;]*)/) || [])[1] || "";
    assert(/'self'/.test(fontSrc) && !/https?:/.test(fontSrc), "font-src не ограничен 'self': " + fontSrc);
    assert(/script-src[^;]*cdn\.jsdelivr\.net/.test(csp), "script-src не пиннит cdn.jsdelivr.net");
  });
};
