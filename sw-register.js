if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    // .catch() обязателен: без него отказ регистрации уходит в unhandledrejection,
    // и телеметрия писала его как ошибку приложения («Error: Rejected at
    // navigator.serviceWorker.register») — 5 записей в client_errors ни о чём.
    // Регистрация SW законно отказывает в приватном окне, при отключённых куках и
    // на части корпоративных политик; приложение при этом работает, просто без
    // офлайн-кэша. Это повод для строчки в консоли, а не для тревоги.
    navigator.serviceWorker.register('./sw.js').catch(function (e) {
      console.warn('Service Worker не зарегистрирован — офлайн-режим недоступен:', e);
    });
  });
}
