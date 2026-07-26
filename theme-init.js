// Framebuster: предотвращает кликджекинг обычного приложения (кто-то встраивает
// вход/данные пользователя в скрытый iframe поверх своей страницы).
// Исключение — публичный калькулятор (?calc=…): у него нет ни сессии, ни данных,
// которые можно угнать кликджекингом, и он ЦЕЛЕНАПРАВЛЕННО встраивается в iframe
// на adervis.ru (страница /pro/smeta/). Проверяем сам URL, а не флаг из app.js —
// этот скрипт грузится и выполняется раньше него.
var _isCalcMode = /(^|[?&])calc(=|&|$)/.test(location.search);
if (window.top !== window.self && !_isCalcMode) { window.top.location = window.self.location; }

// Theme init: применяем до загрузки CSS чтобы избежать мигания
(function () {
  var t = localStorage.getItem('adervis_pro_theme');
  var theme = (t === 'light' || t === 'dark') ? t :
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', theme);
})();
