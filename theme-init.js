// Framebuster: предотвращает кликджекинг
if (window.top !== window.self) { window.top.location = window.self.location; }

// Theme init: применяем до загрузки CSS чтобы избежать мигания
(function () {
  var t = localStorage.getItem('adervis_pro_theme');
  var theme = (t === 'light' || t === 'dark') ? t :
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', theme);
})();
