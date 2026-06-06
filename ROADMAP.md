# Adervis CRM PRO — Roadmap

## Статус: В работе
Последнее обновление: 2026-06-06

---

## ✅ Выполнено

### Инфраструктура
- ЮKassa интеграция (Edge Functions задеплоены, вебхук настроен)
- Super-admin bypass для adervis.digital@gmail.com
- Supabase блок в настройках скрыт от обычных пользователей
- Google Fonts Inter, Open Graph теги, Yandex.Metrica заглушка
- Автоопределение темы (prefers-color-scheme)
- Error boundary — try/catch в render()
- Service Worker v2 — кеш статики, PWA

### UI/UX
- Красивый экран входа — лендинг слева, форма справа
- Страница поддержки / Контакты
- Интерактивный тур (6 слайдов)
- Скелетон-анимации загрузки

### Функции продукта
- [x] 11. Онлайн-бриф для клиентов (?brief=UUID → форма → автосоздание сделки)
- [x] 12. Клиентский портал (?portal=UUID → read-only КП, кнопка утверждения)
  - SQL миграция: migrations/client_portals_rls.sql ✅ уже запущена в Supabase
- [x] Drag-and-Drop Kanban — HTML5 DnD для CRM и Tasks
- [x] AI-помощник для КП — mock (2.4с задержка, премиум-текст, кнопка ✨)
- [x] Swipe-to-delete — мобильный свайп влево для удаления задач
- [x] 17. VK ID OAuth — кнопка "Продолжить как [Имя]" через VK ID SDK
  - Edge Function: supabase/functions/vk-auth/index.ts (задеплоена)
  - VK App ID: 54626328 (захардкожен в app.js как _DEFAULT_VK_APP_ID)
  - Synthetic email если VK не передаёт: vk{userId}@vk.adervis

---

## ⚠️ Требует внимания (баги/незавершённое)

- **Google OAuth** — опубликовано в Google Console 2026-06-06, ждём пока заработает (до нескольких часов)
  - Authorized redirect URI: https://qzeylogyledmhjpzvgkk.supabase.co/auth/v1/callback ✅
  - JS Origin: https://app.adervis.ru ✅
  - Publishing status: Production ✅
- **Service Worker ошибка** — `sw.js:54 Response body is already used` (не критично, не мешает работе)
- **Yandex.Metrica** — заменить 99999999 на реальный ID счётчика в index.html строка ~55

---

## 🔄 В приоритете (следующие сессии)

### БЛОК A — Уведомления
- [ ] A1. Telegram-бот уведомления (оплата, просроченные задачи, статус сделки)
  - Edge Function: telegram-notify/index.ts
  - Нужен Telegram Bot Token (BotFather)
  - Триггеры: смена статуса сделки, дедлайн задачи, оплата ЮKassa

### БЛОК B — Продуктивность
- [ ] B1. Учёт времени на задачах (таймер старт/стоп, ставка в час, итого по проекту)
- [ ] B2. Web Push уведомления о дедлайнах (браузерные, без Telegram)
- [ ] B3. AI КП с реальным Claude API (сейчас mock — заменить на настоящий запрос)
  - Нужен ANTHROPIC_API_KEY в Supabase Secrets
  - Edge Function: ai-proposal/index.ts

### БЛОК C — Монетизация / Клиентская часть
- [ ] C1. Автоматический триал без ручного редактирования в Supabase (регистрация → сразу 14 дней)
- [ ] C2. Email уведомления об окончании подписки (через Supabase emails + edge function)
- [ ] C3. Промокоды / реферальная система

### БЛОК D — UX улучшения
- [ ] D1. Массовые действия в CRM (выбрать несколько → переместить / удалить)
- [ ] D2. Фильтры и поиск в финансах
- [ ] D3. Экспорт КП в PDF (html-to-pdf через edge function)

---

## Контекст проекта

| Параметр | Значение |
|----------|----------|
| Приложение | https://app.adervis.ru |
| Supabase | qzeylogyledmhjpzvgkk.supabase.co |
| GitHub | adervisdigital-web/adervis-CRM-PRO |
| Super-admin | adervis.digital@gmail.com |
| ЮKassa shopId | 1375529 |
| VK App ID | 54626328 |
| Google Client ID | 665927609977-e70dar6ljomoe8sto5na64j80uirgcqe.apps.googleusercontent.com |
| Деплой | GitHub Pages (push в main → автодеплой) |
| Edge Functions | create-payment, yookassa-webhook, vk-auth |
| Стек | Vanilla JS (app.js ~10 800 строк), style.css, Supabase, ЮKassa |
