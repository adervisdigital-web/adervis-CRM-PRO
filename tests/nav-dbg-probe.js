const { loadPlaywright, bootLocal, REPO_ROOT } = require("./harness.js");
const { startServer } = require("./server.js");
(async () => {
  const { chromium } = loadPlaywright();
  const server = await startServer(REPO_ROOT, 0);
  const browser = await chromium.launch();
  const { context, page } = await bootLocal(browser, server.url, { width: 1440, height: 950, seedDemo: true });
  await page.waitForTimeout(700);
  const info = await page.evaluate(() => {
    const sb = document.querySelector(".sidebar") || document.getElementById("sidebar");
    const items = [...document.querySelectorAll(".sidebar-nav-item")];
    return {
      sidebar: !!sb,
      sidebarDisplay: sb ? getComputedStyle(sb).display : "",
      navItems: items.length,
      firstHtml: items[0] ? items[0].outerHTML.slice(0, 160) : "",
      dataTour: document.querySelectorAll("[data-tour]").length,
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await context.close(); await browser.close(); await server.close();
})().catch(e => { console.error(e); process.exit(1); });
