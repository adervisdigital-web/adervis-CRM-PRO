const { loadPlaywright, bootLocal } = require("./harness");
const { startServer } = require("./server");
(async () => {
  const pw = loadPlaywright();
  const server = await startServer(process.cwd(), 0);
  const browser = await pw.chromium.launch();
  const { context, page } = await bootLocal(browser, server.url, { width: 1600, height: 1000, seedDemo: true });
  await page.waitForTimeout(800);
  const out = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("adervis_pro_381_state") || "{}");
    const p = (raw.savedProjects || [])[0] || {};
    return {
      topKeys: Object.keys(raw),
      projKeys: Object.keys(p),
      proj: { id: p.id, name: p.name, client: p.client, crmStatus: p.crmStatus, total: p.total, deadline: p.deadline, days: p.days, priority: p.priority },
      snapKeys: p.snapshot ? Object.keys(p.snapshot) : null,
      clients: (raw.clients || []).map(c => ({ id: c.id, name: c.name, company: c.company })),
      payments: (raw.payments || []).length
    };
  });
  console.log(JSON.stringify(out, null, 2));
  await context.close(); await browser.close(); await server.close();
})();
