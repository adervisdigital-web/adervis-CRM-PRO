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
  // Режим важнее сохранённой темы: при 'system' пользователь просил следовать ОС,
  // и старое разрешённое значение в adervis_pro_theme использовать нельзя.
  var mode = localStorage.getItem('adervis_pro_theme_mode');
  var t = localStorage.getItem('adervis_pro_theme');
  var sysLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  var theme;
  if (mode === 'light' || mode === 'dark') theme = mode;
  else if (mode === 'system') theme = sysLight ? 'light' : 'dark';
  else theme = (t === 'light' || t === 'dark') ? t : (sysLight ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', theme);

  // Цветовая схема — здесь же, иначе первый кадр рисуется базовым фиолетовым
  // и на глазах перекрашивается. 'violet' — базовые значения :root, без атрибута.
  var accent = localStorage.getItem('adervis_pro_accent');
  if (accent && /^(indigo|emerald|amber|teal|graphite)$/.test(accent)) {
    document.documentElement.setAttribute('data-accent', accent);
  }
})();
