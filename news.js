/* Новости CRM — тихая строка по центру верхней панели (только десктоп).
   Новость добавляется сверху списка: id должен быть новым, тогда её увидят даже те,
   кто закрывал прошлые. Закрытые id хранятся в localStorage у каждого пользователя.
   Старые новости (старше 45 дней) не показываются сами.
   open — необязательно: что сделать по клику на текст (открыть раздел, вкладку, ссылку).
   Без open новость просто читается. Текст держим до ~70 знаков, чтобы влезал целиком. */
(function () {
  "use strict";

  const app = () => window.app || {};
  const NEWS = [
    { id: "crm-domain-2026-10", date: "2026-10-27", text: "CRM переехала на crm.adervis.ru, старые ссылки тоже работают" },
    { id: "timing-2026-10", date: "2026-10-23", text: "Новое в смете: тайминг съёмки по минутам, клиенту уходит ссылкой",
      label: "Открыть тайминг в сделке",
      open: () => { app().setDealView?.("timing"); app().go?.("deal"); } },
  ];

  const KEY = "adervis_news_closed";
  const MAX_AGE_DAYS = 45, EVERY_MS = 7000;
  const PUBLIC_PARAMS = ["portal", "timing", "calc", "brief"];
  const chev = (d) => `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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
    box.setAttribute("role", "region");
    box.setAttribute("aria-label", "Новости ADERVIS CRM");
    box.innerHTML = '<span class="crm-news-dot" aria-hidden="true"></span>'
      + '<span class="crm-news-track" aria-live="polite"><button type="button" class="crm-news-text"></button></span>'
      + '<span class="crm-news-pager">'
      + `<button type="button" class="crm-news-nav" data-step="-1" aria-label="Предыдущая новость" title="Предыдущая">${chev("M6.5 2L3.5 5l3 3")}</button>`
      + '<span class="crm-news-count"></span>'
      + `<button type="button" class="crm-news-nav" data-step="1" aria-label="Следующая новость" title="Следующая">${chev("M3.5 2l3 3-3 3")}</button>`
      + '</span>'
      + '<button type="button" class="crm-news-close" aria-label="Закрыть новость" title="Закрыть">'
      + '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7m0-7l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>';
    bar.insertBefore(box, actions);

    const text = box.querySelector(".crm-news-text"), count = box.querySelector(".crm-news-count"), pager = box.querySelector(".crm-news-pager");
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let i = 0, timer = 0, paused = false, swap = 0;

    function put(k) {
      const n = list[k];
      text.textContent = n.text;
      text.classList.toggle("link", !!n.open);
      text.disabled = !n.open;
      text.title = n.open ? `${n.text}\n${n.label || "Открыть"}` : n.text;
      if (n.open) text.setAttribute("aria-label", `${n.text}. ${n.label || "Открыть"}`); else text.removeAttribute("aria-label");
      pager.hidden = list.length < 2;
      count.textContent = `${k + 1}/${list.length}`;
    }
    // dir: 1 — новость уезжает вверх (вперёд), -1 — вниз (назад)
    function show(k, dir) {
      clearTimeout(swap);
      if (!dir || calm) { put(k); return; }
      text.classList.remove("in", "in-back");
      text.classList.add(dir > 0 ? "out" : "out-back");
      swap = setTimeout(() => {
        put(k);
        text.classList.remove("out", "out-back");
        text.classList.add(dir > 0 ? "in" : "in-back");
        requestAnimationFrame(() => requestAnimationFrame(() => text.classList.remove("in", "in-back")));
      }, 200);
    }
    function step(d) { i = (i + d + list.length) % list.length; show(i, d); }
    function tick() {
      clearInterval(timer);
      if (list.length > 1) timer = setInterval(() => { if (!paused && !document.hidden) step(1); }, EVERY_MS);
    }

    box.addEventListener("mouseenter", () => { paused = true; });
    box.addEventListener("mouseleave", () => { paused = false; });
    box.addEventListener("focusin", () => { paused = true; });
    box.addEventListener("focusout", (e) => { if (!box.contains(e.relatedTarget)) paused = false; });
    box.addEventListener("keydown", (e) => {
      if (list.length < 2 || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      e.preventDefault(); step(e.key === "ArrowRight" ? 1 : -1); tick();
    });
    pager.addEventListener("click", (e) => {
      const b = e.target.closest(".crm-news-nav");
      if (b) { step(Number(b.dataset.step)); tick(); }
    });
    text.addEventListener("click", () => {
      const n = list[i];
      if (!n || !n.open) return;
      try { n.open(); } catch (err) { console.warn("Новость: не удалось открыть", err); }
    });
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
      show(i, 1);
      tick();
    });

    show(0, 0);
    tick();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
