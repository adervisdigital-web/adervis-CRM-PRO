/* Новости CRM — тихая строка по центру верхней панели (только десктоп).
   Новость добавляется сверху списка: id должен быть новым, тогда её увидят даже те,
   кто закрывал прошлые. Закрытые id хранятся в localStorage у каждого пользователя.
   Старые новости (старше 45 дней) не показываются сами. */
(function () {
  "use strict";

  const NEWS = [
    { id: "crm-domain-2026-10", date: "2026-10-27", text: "CRM переехала на crm.adervis.ru, старые ссылки тоже работают" },
    { id: "timing-2026-10", date: "2026-10-23", text: "Новое в смете: тайминг съёмки по минутам, клиенту уходит ссылкой" },
  ];

  const KEY = "adervis_news_closed";
  const MAX_AGE_DAYS = 45, EVERY_MS = 7000;
  const PUBLIC_PARAMS = ["portal", "timing", "calc", "brief"];

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
  const write = (ids) => { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch {} };
  const fresh = (n) => (Date.now() - new Date(n.date + "T00:00:00").getTime()) / 864e5 <= MAX_AGE_DAYS;

  function mount() {
    const q = new URLSearchParams(location.search);
    if (PUBLIC_PARAMS.some((p) => q.has(p))) return;           // страницы для клиентов — без новостей
    const bar = document.querySelector(".topbar"), actions = bar && bar.querySelector(".top-actions");
    if (!bar || !actions || bar.querySelector(".crm-news")) return;

    let list = NEWS.filter((n) => fresh(n) && !read().includes(n.id));
    if (!list.length) return;

    const box = document.createElement("div");
    box.className = "crm-news";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    box.innerHTML = '<span class="crm-news-dot" aria-hidden="true"></span>'
      + '<span class="crm-news-track"><span class="crm-news-text"></span></span>'
      + '<span class="crm-news-count" aria-hidden="true"></span>'
      + '<button type="button" class="crm-news-close" aria-label="Закрыть новость" title="Закрыть">'
      + '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7m0-7l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>';
    bar.insertBefore(box, actions);

    const text = box.querySelector(".crm-news-text"), count = box.querySelector(".crm-news-count");
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let i = 0, timer = 0, paused = false;

    function show(k, animate) {
      const n = list[k];
      const put = () => {
        text.textContent = n.text;
        box.title = n.text;
        count.textContent = list.length > 1 ? `${k + 1}/${list.length}` : "";
      };
      if (!animate || calm) { put(); return; }
      text.classList.add("out");
      setTimeout(() => { put(); text.classList.remove("out"); text.classList.add("in"); requestAnimationFrame(() => requestAnimationFrame(() => text.classList.remove("in"))); }, 260);
    }
    function tick() {
      clearInterval(timer);
      if (list.length > 1) timer = setInterval(() => { if (!paused && !document.hidden) { i = (i + 1) % list.length; show(i, true); } }, EVERY_MS);
    }

    box.addEventListener("mouseenter", () => { paused = true; });
    box.addEventListener("mouseleave", () => { paused = false; });
    box.querySelector(".crm-news-close").addEventListener("click", () => {
      write([...new Set([...read(), list[i].id])]);
      list.splice(i, 1);
      if (!list.length) {
        clearInterval(timer);
        box.classList.add("gone");
        setTimeout(() => box.remove(), calm ? 0 : 300);
        return;
      }
      i = i % list.length;
      show(i, true);
      tick();
    });

    show(0, false);
    tick();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
