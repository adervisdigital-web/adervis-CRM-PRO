// Разовый скрипт: кадры для баннера. Не тест — в CI не участвует.
const path = require("path");
const { loadPlaywright, bootLocal } = require("./harness");
const { startServer } = require("./server");

const OUT = "C:/Users/MSI/Desktop/ADERVIS-CRM-banner";
const KEY = "adervis_pro_381_state";

// Выдуманные студии и проекты — намеренно не существующие бренды.
const DEALS = [
  // payAgo — сколько дней назад пришли деньги. Разносим по месяцам, иначе весь
  // доход падает в один столбец и график показывает обвал вместо роста.
  { name: "Рекламный ролик для сети кофеен",    client: "Кофейни «Зерно»",    stage: "В работе",      total: 385000, paid: 192500, exp: 64000, payAgo: 62, prio: "Высокий", dl: 9  },
  { name: "Корпоративный фильм к юбилею",       client: "ГК «Метизъ»",        stage: "Договор",       total: 640000, paid: 0,      exp: 0,     payAgo: 0,  prio: "Высокий", dl: 21 },
  { name: "Съёмка конференции «Восход»",        client: "IT-парк «Восход»",   stage: "Сдано",         total: 275000, paid: 275000, exp: 82000, payAgo: 31, prio: "Средний", dl: -3 },
  { name: "Клип для музыкального лейбла",       client: "Лейбл «Сигнал»",     stage: "Согласование",  total: 520000, paid: 0,      exp: 0,     payAgo: 0,  prio: "Высокий", dl: 16 },
  { name: "Продуктовая съёмка для маркетплейса",client: "Маркет «Полка»",     stage: "КП отправлено", total: 180000, paid: 0,      exp: 0,     payAgo: 0,  prio: "Средний", dl: 12 },
  { name: "Имиджевый ролик автоцентра",         client: "Автоцентр «Драйв»",  stage: "Предоплата",    total: 430000, paid: 215000, exp: 71000, payAgo: 2,  prio: "Высокий", dl: 27 },
  { name: "Серия Reels для косметики",          client: "Бренд «Лёгкость»",   stage: "Лид",           total: 95000,  paid: 0,      exp: 0,     payAgo: 0,  prio: "Низкий",  dl: 34 },
  { name: "Фильм о производстве",               client: "Агрохолдинг «Поле»", stage: "Оплата",        total: 780000, paid: 780000, exp: 246000,payAgo: 1,  prio: "Средний", dl: -11 },
  // Две закрытые сделки: без них этап «Завершённые» пуст, а плитка «Ср. чек»
  // показывает прочерк — на баннере это читается как незаполненный продукт.
  { name: "Ролик для строительной компании",    client: "СК «Основа»",        stage: "Завершённые",   total: 340000, paid: 340000, exp: 110000,payAgo: 95, prio: "Средний", dl: -88 },
  { name: "Видео для медицинского центра",      client: "Клиника «Верис»",    stage: "Завершённые",   total: 265000, paid: 265000, exp: 88000, payAgo: 128,prio: "Низкий",  dl: -120 },
];

const THEME = (page) => page.addInitScript(() => {
  localStorage.setItem("adervis_pro_theme_mode", "dark");
  localStorage.setItem("adervis_pro_theme", "dark");
  localStorage.setItem("adervis_tour_done", "1");
  localStorage.setItem("adervis_onboarded", "1");
});

function buildState(raw, deals) {
  const tpl = (raw.savedProjects || [])[0];
  if (!tpl) throw new Error("нет образца сделки — демо-сеялка не отработала");
  const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const clients = [];

  raw.savedProjects = deals.map((d, i) => {
    const c = JSON.parse(JSON.stringify(tpl));
    const cid = "client_demo_" + i;
    clients.push({ id: cid, name: d.client, company: d.client, phone: "+7 900 000-00-0" + i,
      email: "hello@example.com", note: "", status: "active" });

    c.id = "proj_demo_" + i;
    delete c.__demo;
    c.name = d.name; c.client = d.client; c.clientId = cid;
    c.crmStatus = d.stage; c.priority = d.prio; c.deadline = iso(d.dl);
    c.total = d.total; c.paid = d.paid; c.debt = d.total - d.paid;
    c.revenue = d.paid; c.expensesTotal = d.exp; c.profit = d.paid - d.exp;
    c.createdAt = new Date(Date.now() - (40 - i * 4) * 86400000).toISOString();
    c.updatedAt = new Date(Date.now() - i * 3600000).toISOString();

    const payDate = iso(-d.payAgo);
    const pay = d.paid ? [{ id: "pay_demo_" + i, title: d.paid === d.total ? "Оплата 100%" : "Аванс 50%",
      amount: d.paid, date: payDate, method: "Счёт", note: "" }] : [];
    const exps = d.exp ? [{ id: "exp_demo_" + i, title: "Съёмочная группа и техника",
      amount: d.exp, date: payDate, category: "Продакшн", note: "" }] : [];

    if (c.snapshot) {
      Object.assign(c.snapshot, { total: d.total, paid: d.paid, debt: d.total - d.paid,
        revenue: d.paid, profit: d.paid - d.exp, expensesTotal: d.exp,
        payments: pay, expenses: exps });
      if (c.snapshot.project) Object.assign(c.snapshot.project, {
        id: c.id, name: d.name, client: d.client, clientId: cid,
        crmStatus: d.stage, priority: d.prio, deadline: iso(d.dl) });
    }
    return c;
  });

  raw.clients = clients;
  // Живое состояние держим в согласии с активной сделкой: иначе её суммы
  // задваиваются (учитываются и в live-state, и в снапшоте).
  const first = raw.savedProjects[0];
  raw.activeProjectId = first.id;
  raw.project = JSON.parse(JSON.stringify(first.snapshot.project));
  raw.selected = JSON.parse(JSON.stringify(first.snapshot.selected || {}));
  raw.estimateOrder = JSON.parse(JSON.stringify(first.snapshot.estimateOrder || []));
  raw.payments = JSON.parse(JSON.stringify(first.snapshot.payments || []));
  raw.expenses = JSON.parse(JSON.stringify(first.snapshot.expenses || []));
  raw.view = "home";
  raw.company = Object.assign({}, raw.company, { name: "ADERVIS", city: "Пермь" });
  return raw;
}

// Чеклист «Начало работы» занимает пол-экрана и читается как пустой аккаунт.
const hideChecklist = async (page) => {
  await page.evaluate(() => {
    const b = document.querySelector('[aria-label="Скрыть чеклист первых шагов"], [title="Скрыть чеклист первых шагов"]');
    if (b) b.click();
  });
  await page.waitForTimeout(700);
};

// Ставим первую карточку сразу под липкую шапку: фиксированный отступ оставлял
// под ней наполовину срезанную строку поиска — читается как брак вёрстки.
const scrollToCards = async (page) => {
  const y = await page.evaluate(() => {
    const c = document.querySelector(".deal-card");
    if (!c) return 0;
    const bar = document.querySelector(".topbar");
    const h = bar ? bar.getBoundingClientRect().height : 60;
    return Math.max(0, Math.round(c.getBoundingClientRect().top + window.scrollY - h - 14));
  });
  if (y) await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(600);
};

(async () => {
  const pw = loadPlaywright();
  const server = await startServer(process.cwd(), 0);
  const browser = await pw.chromium.launch();

  // ── 1. Экран авторизации (без local mode — рисуется настоящий вход) ──
  const authCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const authPage = await authCtx.newPage();
  await THEME(authPage);
  await authPage.goto(server.url + "/index.html", { waitUntil: "load" });
  await authPage.waitForTimeout(3500);
  await authPage.screenshot({ path: path.join(OUT, "1-auth-4k.png") });
  const authInfo = await authPage.evaluate(() => ({
    gate: !!document.querySelector("#authGateContainer") && document.querySelector("#authGateContainer").innerHTML.trim().length > 0,
    text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 160)
  }));
  console.log("АВТОРИЗАЦИЯ:", JSON.stringify(authInfo));
  await authCtx.close();

  // ── 2. Заполненный главный экран, 4K ──
  // Состояние подставляем ДО загрузки (addInitScript), а не записью в живую
  // страницу: у приложения есть отложенное автосохранение, и оно перезаписывало
  // localStorage своим состоянием сразу после нашей записи.
  const seedCtx = await bootLocal(browser, server.url, { width: 1280, height: 800, seedDemo: true });
  const rawState = await seedCtx.page.evaluate((k) => localStorage.getItem(k), KEY);
  await seedCtx.context.close();
  const next = buildState(JSON.parse(rawState), DEALS);
  const PAYLOAD = JSON.stringify(next);

  const prep = (page) => page.addInitScript(([k, v]) => {
    localStorage.setItem("adervis_local_mode", "1");
    localStorage.setItem("adervis_tour_done", "1");
    localStorage.setItem("adervis_onboarded", "1");
    localStorage.setItem("adervis_pro_theme_mode", "dark");
    localStorage.setItem("adervis_pro_theme", "dark");
    localStorage.setItem("adervis_checklist_hidden", "1");
    localStorage.setItem(k, v);
  }, [KEY, PAYLOAD]);

  const deskCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const dPage = await deskCtx.newPage();
  await prep(dPage);
  await dPage.goto(server.url + "/index.html", { waitUntil: "load" });
  await dPage.waitForTimeout(2500);
  await dPage.evaluate(() => window.app.go("home"));
  await dPage.waitForTimeout(1000);
  await hideChecklist(dPage);
  const dInfo = await dPage.evaluate(() => {
    const cards = document.querySelectorAll(".deal-card");
    const first = cards[0] ? cards[0].getBoundingClientRect().top : -1;
    return { count: cards.length, firstCardTop: Math.round(first),
             checklist: !!document.querySelector(".checklist, [class*=checklist]") };
  });
  console.log("ДАШБОРД:", JSON.stringify(dInfo));
  await dPage.screenshot({ path: path.join(OUT, "2-dashboard-4k.png") });
  await dPage.screenshot({ path: path.join(OUT, "2-dashboard-full.png"), fullPage: true });
  await scrollToCards(dPage);
  await dPage.waitForTimeout(600);
  await dPage.screenshot({ path: path.join(OUT, "2-dashboard-deals-4k.png") });
  await deskCtx.close();

  // ── 3. Мобильный экран ──
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 },
    hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const mPage = await mCtx.newPage();
  await prep(mPage);
  await mPage.goto(server.url + "/index.html", { waitUntil: "load" });
  await mPage.waitForTimeout(2500);
  await mPage.evaluate(() => window.app.go("home"));
  await mPage.waitForTimeout(1200);
  await hideChecklist(mPage);
  await mPage.screenshot({ path: path.join(OUT, "3-mobile.png") });
  // Второй мобильный кадр — на карточках проектов: для баннера они выразительнее
  // плиток с цифрами.
  await scrollToCards(mPage);
  await mPage.waitForTimeout(600);
  await mPage.screenshot({ path: path.join(OUT, "3-mobile-deals.png") });
  console.log("МОБИЛЬНЫЙ: карточек =", await mPage.evaluate(() => document.querySelectorAll(".deal-card").length));
  await mCtx.close();

  await browser.close(); await server.close();
  console.log("Готово →", OUT);
})();
